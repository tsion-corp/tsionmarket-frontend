import {
  pubsub
} from "./lib.QPQZCXK2.js";
import {
  url
} from "./lib.TT4QSUKQ.js";
import {
  deleteObjectStorage,
  objectStorage,
  once,
  storage
} from "./lib.NFSQQWN5.js";
import {
  defined,
  myUserId
} from "./lib.GMEH5BEF.js";

// ../lib/src/permalog.ts
var log = makeLog(
  {
    db: "log--db",
    store: "log",
    version: 3,
    upgrade: (_, store) => store == null ? void 0 : store.clear()
    // blow it all away when we rev version
  },
  parseInt(localStorage.getItem("log.window") || "100")
);
function makeLog(dbInfo, windowSize) {
  var _a, _b;
  let store;
  let resolveReady;
  let lastKey = 0;
  let drift = 1e-3;
  const ready = new Promise((resolve) => resolveReady = resolve);
  (_b = (_a = Error.prototype).toJSON) != null ? _b : _a.toJSON = function() {
    return { [this.name]: this.message, stack: this.stack };
  };
  objectStorage(dbInfo).then(async (s) => {
    store = s;
    resolveReady();
  }).catch((e) => {
    console.error(e);
    deleteObjectStorage(dbInfo);
    resolveReady();
  });
  function stringify(val) {
    return !val || typeof val === "string" ? String(val) : JSON.stringify(val);
  }
  const log2 = (...args) => {
    if (dbInfo.store === "log") console.log(...args);
    const msg = (dbInfo.store === "log" && site.info ? `#${site.info.commit.substring(0, 7)} - ` : "") + args.map(stringify).join(" ");
    let nextKey = Date.now();
    if (nextKey === lastKey) {
      nextKey += drift;
      drift += 1e-3;
    } else {
      drift = 1e-3;
      lastKey = nextKey;
    }
    return ready.then(() => store == null ? void 0 : store.put(nextKey, msg)).catch(console.error);
  };
  log2.clear = async () => {
    await ready;
    await (store == null ? void 0 : store.clear());
    lastKey = 0;
  };
  log2.get = async () => {
    await ready;
    if (!store) return "";
    try {
      const keys2 = await store.list();
      if (windowSize >= 0 && keys2.length > windowSize)
        await store.remove(IDBKeyRange.upperBound(keys2[keys2.length - windowSize], true));
    } catch (e) {
      console.error(e);
      store.clear();
      deleteObjectStorage(dbInfo);
      return "";
    }
    const [keys, vals] = await Promise.all([store.list(), store.getMany()]);
    return keys.map((k, i) => `${new Date(k).toISOString().replace(/[TZ]/g, " ")}${vals[i]}`).join("\n");
  };
  return log2;
}

// ../lib/src/event.ts
function idleTimer(delay, onIdle, onWakeUp) {
  const events = ["mousemove", "touchstart"];
  let listening = false, active = true, lastSeenActive = performance.now();
  const onActivity = () => {
    if (!active) {
      onWakeUp();
    }
    active = true;
    lastSeenActive = performance.now();
    stopListening();
  };
  const startListening = () => {
    if (!listening) {
      events.forEach((e) => document.addEventListener(e, onActivity));
      listening = true;
    }
  };
  const stopListening = () => {
    if (listening) {
      events.forEach((e) => document.removeEventListener(e, onActivity));
      listening = false;
    }
  };
  setInterval(() => {
    if (active && performance.now() - lastSeenActive > delay) {
      onIdle();
      active = false;
    }
    startListening();
  }, 1e4);
}
var Janitor = class {
  constructor() {
    this.cleanupTasks = [];
  }
  addListener(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    this.cleanupTasks.push(() => target.removeEventListener(type, listener, options));
  }
  addCleanupTask(task) {
    this.cleanupTasks.push(task);
  }
  cleanup() {
    for (const task of this.cleanupTasks) task();
    this.cleanupTasks.length = 0;
  }
};

// ../lib/src/socket.ts
var siteSocket;
function eventuallySetupDefaultConnection() {
  setTimeout(() => {
    if (!siteSocket) wsConnect("/socket/v5", false);
  }, 500);
}
function wsConnect(url2, version, settings = {}) {
  return siteSocket = new WsSocket(url2, version, settings);
}
function wsDestroy() {
  siteSocket == null ? void 0 : siteSocket.destroy();
  siteSocket = void 0;
}
function wsSend(t, d, o, noRetry) {
  siteSocket == null ? void 0 : siteSocket.send(t, d, o, noRetry);
}
function wsSign(s) {
  siteSocket == null ? void 0 : siteSocket.sign(s);
}
function wsVersion() {
  var _a;
  return (_a = siteSocket == null ? void 0 : siteSocket.getVersion()) != null ? _a : false;
}
function wsPingInterval() {
  var _a;
  return (_a = siteSocket == null ? void 0 : siteSocket.pingInterval()) != null ? _a : 0;
}
function wsAverageLag() {
  var _a;
  return (_a = siteSocket == null ? void 0 : siteSocket.averageLag) != null ? _a : 0;
}
var isOnline = () => !("onLine" in navigator) || navigator.onLine;
var WsSocket = class {
  constructor(url2, version, settings = {}) {
    this.url = url2;
    this.averageLag = 0;
    this.ackable = new Ackable((t, d, o) => this.send(t, d, o));
    this.lastPingTime = performance.now();
    this.pongCount = 0;
    this.tryOtherUrl = false;
    this.storage = storage.make("surl18", 30 * 60 * 1e3);
    this.resendWhenOpen = [];
    this.baseUrls = document.body.dataset.socketDomains.split(",");
    this.sign = (s) => {
      this._sign = s;
      this.ackable.sign(s);
    };
    this.connect = () => {
      this.destroy();
      this.lastUrl = url(this.options.protocol + "//" + this.nextBaseUrl() + this.url, {
        ...this.settings.params,
        v: this.version === false ? void 0 : this.version
      });
      this.debug("connection attempt to " + this.lastUrl);
      try {
        const ws = this.ws = new WebSocket(this.lastUrl);
        ws.onerror = (e) => this.onError(e);
        ws.onclose = this.onClose;
        ws.onopen = () => {
          this.lastUrl = ws.url;
          this.debug("connected to " + this.lastUrl);
          const cl = document.body.classList;
          if (pubsub.past("socket.hasConnected")) cl.add("reconnected");
          cl.remove("offline");
          cl.add("online");
          this.onSuccess();
          this.pingNow();
          this.resendWhenOpen.forEach(([t, d, o]) => this.send(t, d, o));
          this.resendWhenOpen = [];
          pubsub.emit("socket.open");
          this.ackable.resend();
        };
        ws.onmessage = (e) => {
          if (e.data === "0") return this.pong();
          const m = JSON.parse(e.data);
          if (m.t === "n") this.pong();
          this.handle(m);
        };
      } catch (e) {
        this.onClose({ code: 4e3, reason: String(e) });
      }
      this.scheduleConnect();
    };
    this.send = (t, d, o = {}, noRetry = false) => {
      const msg = { t };
      if (d !== void 0) {
        if (o.withLag) d.l = Math.round(this.averageLag);
        if (defined(o.millis) && o.millis >= 0) d.s = Math.round(o.millis * 0.1).toString(36);
        msg.d = d;
      }
      if (o.ackable) {
        msg.d = msg.d || {};
        this.ackable.register(t, msg.d);
      }
      const message = JSON.stringify(msg);
      if (t === "racerScore" && o.sign !== this._sign) return;
      if (t === "move" && o.sign !== this._sign) {
        let stack;
        try {
          stack = new Error("Move error").stack.split("\n").join(" / ").replace(/\s+/g, " ");
        } catch (e) {
          stack = `${e.message} ${navigator.userAgent}`;
        }
        if (!stack.includes("round.nvui")) {
          setTimeout(() => {
            if (once(`socket.rep.${Math.round(Date.now() / 1e3 / 3600 / 3)}`))
              this.send("rep", { n: `soc: ${message} ${stack}` });
            else wsDestroy();
          }, 1e4);
        }
      }
      this.debug("send " + message);
      if (!this.ws || this.ws.readyState === WebSocket.CONNECTING) {
        if (!noRetry) this.resendWhenOpen.push([t, msg.d, o]);
      } else this.ws.send(message);
    };
    this.scheduleConnect = (delay = this.options.pongTimeout) => {
      if (this.options.idle) delay = 10 * 1e3 + Math.random() * 10 * 1e3;
      clearTimeout(this.pingSchedule);
      clearTimeout(this.connectSchedule);
      this.connectSchedule = setTimeout(() => {
        var _a, _b, _c, _d;
        document.body.classList.add("offline");
        document.body.classList.remove("online");
        if (isOnline()) $("#network-status").text((_b = (_a = i18n == null ? void 0 : i18n.site) == null ? void 0 : _a.reconnecting) != null ? _b : "Reconnecting");
        else $("#network-status").text((_d = (_c = i18n == null ? void 0 : i18n.site) == null ? void 0 : _c.noNetwork) != null ? _d : "Offline");
        this.tryOtherUrl = true;
        this.connect();
      }, delay);
    };
    this.schedulePing = (delay) => {
      clearTimeout(this.pingSchedule);
      this.pingSchedule = setTimeout(this.pingNow, delay);
    };
    this.pingNow = () => {
      clearTimeout(this.pingSchedule);
      clearTimeout(this.connectSchedule);
      const pingData = this.options.isAuth && this.pongCount % 10 === 2 ? JSON.stringify({
        t: "p",
        l: Math.round(0.1 * this.averageLag)
      }) : "p";
      try {
        this.ws.send(pingData);
        this.lastPingTime = performance.now();
      } catch (e) {
        this.debug(e, true);
      }
      this.scheduleConnect();
    };
    this.computePingDelay = () => this.options.pingDelay + (this.options.idle ? 1e3 : 0);
    this.pong = () => {
      clearTimeout(this.connectSchedule);
      this.schedulePing(this.computePingDelay());
      const currentLag = Math.min(performance.now() - this.lastPingTime, 1e4);
      this.pongCount++;
      const mix = this.pongCount > 4 ? 0.1 : 1 / this.pongCount;
      this.averageLag += mix * (currentLag - this.averageLag);
      pubsub.emit("socket.lag", this.averageLag);
    };
    this.handle = (m, retries = 10) => {
      var _a, _b;
      if (m.v && this.version !== false) {
        if (m.v <= this.version) {
          this.debug("already has event " + m.v);
          return;
        }
        if (m.v > this.version + 1) {
          if (retries > 0) {
            console.debug("version gap, retrying", m.v, this.version, retries);
            setTimeout(() => this.handle(m, retries - 1), 200);
          } else {
            log(`${window.location.pathname}: version incoming ${m.v} vs current ${this.version}`);
            site.reload();
          }
          return;
        }
        this.version = m.v;
      }
      switch (m.t || false) {
        case false:
          break;
        case "resync":
          setTimeout(() => site.reload("lila-ws resync"), 500);
          break;
        case "ack":
          this.ackable.onServerAck(m.d);
          break;
        case "batch":
          m.d.forEach(this.handle);
          break;
        default:
          if (!((_b = (_a = this.settings).receive) == null ? void 0 : _b.call(_a, m.t, m.d))) {
            if (this.settings.events[m.t]) {
              if (this.settings.events[m.t](m.d || null, m)) {
                return;
              }
            }
            pubsub.emit("socket.in." + m.t, m.d, m);
          }
      }
    };
    this.debug = (msg, always = false) => {
      if (always || this.options.debug) console.debug(msg);
    };
    this.destroy = () => {
      clearTimeout(this.pingSchedule);
      clearTimeout(this.connectSchedule);
      this.disconnect();
      this.ws = void 0;
    };
    this.disconnect = () => {
      const ws = this.ws;
      if (ws) {
        this.debug("Disconnect");
        ws.onerror = ws.onclose = ws.onopen = ws.onmessage = () => {
        };
        ws.close();
      }
    };
    this.onError = (e) => {
      this.options.debug = true;
      this.debug(`error: ${e} ${JSON.stringify(e)}`);
    };
    this.onClose = (e) => {
      pubsub.emit("socket.close");
      if (this.ws) {
        this.debug("Will autoreconnect in " + this.options.autoReconnectDelay);
        this.scheduleConnect(this.options.autoReconnectDelay);
      }
      if (e.wasClean && e.code < 1002) return;
      if (isOnline()) this.tryOtherUrl = true;
      clearTimeout(this.pingSchedule);
    };
    this.onSuccess = () => {
      if (pubsub.past("socket.hasConnected")) return;
      pubsub.complete("socket.hasConnected");
      let disconnectTimeout;
      idleTimer(
        10 * 60 * 1e3,
        () => {
          this.options.idle = true;
          disconnectTimeout = setTimeout(this.destroy, 2 * 60 * 60 * 1e3);
        },
        () => {
          this.options.idle = false;
          if (this.ws) clearTimeout(disconnectTimeout);
          else if (this.options.reloadOnResume) location.reload();
        }
      );
    };
    this.nextBaseUrl = () => {
      let url2 = this.storage.get();
      if (!url2 || !this.baseUrls.includes(url2)) {
        url2 = this.baseUrls[Math.floor(Math.random() * this.baseUrls.length)];
        this.storage.set(url2);
      } else if (this.tryOtherUrl) {
        const i = this.baseUrls.findIndex((u) => u === url2);
        url2 = this.baseUrls[(i + 1) % this.baseUrls.length];
        this.storage.set(url2);
      }
      this.tryOtherUrl = false;
      return url2;
    };
    this.pingInterval = () => this.computePingDelay() + this.averageLag;
    this.getVersion = () => this.version;
    this.options = {
      idle: false,
      debug: false,
      pongTimeout: 9e3,
      autoReconnectDelay: 3500,
      protocol: location.protocol === "https:" ? "wss:" : "ws:",
      isAuth: !!myUserId(),
      ...settings.options,
      pingDelay: 2500
    };
    this.settings = {
      receive: settings.receive,
      events: settings.events || {},
      params: {
        sri: site.sri,
        from: "website",
        ...settings.params
      }
    };
    this.version = version;
    pubsub.on("socket.send", this.send);
    this.connect();
  }
};
var Ackable = class {
  constructor(send) {
    this.send = send;
    this.currentId = 1;
    // increment with each ackable message sent
    this.messages = [];
    this.sign = (s) => this._sign = s;
    this.resend = () => {
      const resendCutoff = performance.now() - 2500;
      this.messages.forEach((m) => {
        if (m.at < resendCutoff) this.send(m.t, m.d, { sign: this._sign });
      });
    };
    this.register = (t, d) => {
      d.a = this.currentId++;
      this.messages.push({
        t,
        d,
        at: performance.now()
      });
    };
    this.onServerAck = (id) => {
      this.messages = this.messages.filter((m) => m.d.a !== id);
    };
    setInterval(this.resend, 1200);
  }
};

export {
  idleTimer,
  Janitor,
  log,
  makeLog,
  eventuallySetupDefaultConnection,
  wsConnect,
  wsDestroy,
  wsSend,
  wsSign,
  wsVersion,
  wsPingInterval,
  wsAverageLag
};
//# sourceMappingURL=lib.PNHYIP7B.js.map
