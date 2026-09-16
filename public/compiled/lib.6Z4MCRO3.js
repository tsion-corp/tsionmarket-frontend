import {
  stepwiseScroll
} from "./lib.MFOXABY3.js";
import {
  cmnToggle,
  confirm,
  domDialog,
  icon,
  rangeConfig
} from "./lib.MYPIOGN5.js";
import {
  clamp,
  randomToken
} from "./lib.HMFK7OOB.js";
import {
  Chessground
} from "./lib.AEOHBIQD.js";
import {
  uciToMove
} from "./lib.RPQH5UYI.js";
import {
  lichessRules,
  makeBoardFen,
  makeSanAndPlay,
  parseFen,
  setupPosition
} from "./lib.X7H2PLEK.js";
import {
  opposite,
  parseUci
} from "./lib.53PYQRAK.js";
import {
  log
} from "./lib.PNHYIP7B.js";
import {
  bind,
  dataIcon,
  features,
  hl,
  isAndroid,
  isChrome,
  isIPad,
  isIos,
  isMobile,
  isTouchDevice,
  onInsert
} from "./lib.S3TIZ2HQ.js";
import {
  h
} from "./lib.LWF5S4ZV.js";
import {
  pubsub
} from "./lib.QPQZCXK2.js";
import {
  licon
} from "./lib.5I4BSVKX.js";
import {
  readNdJson,
  xhrHeader
} from "./lib.TT4QSUKQ.js";
import {
  objectStorage,
  storage,
  storedIntProp,
  storedStringProp,
  throttle,
  throttleWithFlush
} from "./lib.NFSQQWN5.js";
import {
  blurIfPrimaryClick,
  defined,
  escapeHtml,
  memoize,
  notNull,
  onClickAway,
  prop,
  requestIdleCallbackSafe,
  toggle
} from "./lib.GMEH5BEF.js";
import {
  __export
} from "./lib.KO2KTNGK.js";

// ../lib/src/ceval/util.ts
var isFirstEvalBetter = (a, b, desiredPvs) => a.pvs.length >= desiredPvs !== b.pvs.length >= desiredPvs ? a.pvs.length >= desiredPvs : a.depth > b.depth || a.depth === b.depth && a.nodes > b.nodes;
function renderEval(e) {
  e = Math.max(Math.min(Math.round(e / 10) / 10, 99), -99);
  return (e > 0 ? "+" : "") + e.toFixed(1);
}
function sanIrreversible(variant, san) {
  if (san.startsWith("O-O")) return true;
  if (variant === "crazyhouse") return false;
  if (san.includes("x")) return true;
  if (san[0].toLowerCase() === san[0]) return true;
  return variant === "threeCheck" && san.includes("+");
}
var fewerCores = memoize(
  () => isMobile() || navigator.userAgent.includes("CrOS")
);
var sharedWasmMemory = (lo, hi = 32767) => {
  let shrink = 4;
  while (true) {
    try {
      return new WebAssembly.Memory({ shared: true, initial: lo, maximum: hi });
    } catch (e) {
      if (hi <= lo || !(e instanceof RangeError)) throw e;
      hi = Math.max(lo, Math.ceil(hi - hi / shrink));
      shrink = shrink === 4 ? 3 : 4;
    }
  }
};
function showEngineError(engine, error) {
  domDialog({
    class: "engine-error",
    modal: true,
    easyClose: "clickOutside",
    htmlText: `<h2>${escapeHtml(engine)} <bad>error</bad></h2>` + (error.includes("Status 503") ? `<p>Your external engine does not appear to be connected.</p><p>Please check the network and restart your provider if possible.</p>` : `<pre>${escapeHtml(error)}</pre><h2>Things to try</h2><ul><li>Decrease memory slider in engine settings</li><li>Clear site data for lichess.org</li><li>Select another engine</li><li>Update your browser</li></ul>`)
  }).then((dlg) => {
    var _a;
    const select = () => setTimeout(() => {
      var _a2, _b;
      const range = document.createRange();
      range.selectNodeContents(dlg.view.querySelector(".err"));
      (_a2 = window.getSelection()) == null ? void 0 : _a2.removeAllRanges();
      (_b = window.getSelection()) == null ? void 0 : _b.addRange(range);
    }, 0);
    (_a = dlg.view.querySelector(".err")) == null ? void 0 : _a.addEventListener("focus", select);
    dlg.show();
  });
}

// ../lib/src/ceval/winningChances.ts
var winningChances_exports = {};
__export(winningChances_exports, {
  areSimilarEvals: () => areSimilarEvals,
  hasMultipleSolutions: () => hasMultipleSolutions,
  povChances: () => povChances,
  povDiff: () => povDiff
});
var toPov = (color, diff) => color === "white" ? diff : -diff;
var rawWinningChances = (cp) => {
  const MULTIPLIER = -368208e-8;
  return 2 / (1 + Math.exp(MULTIPLIER * cp)) - 1;
};
var cpWinningChances = (cp) => rawWinningChances(Math.min(Math.max(-1e3, cp), 1e3));
var mateWinningChances = (mate) => {
  const cp = (21 - Math.min(10, Math.abs(mate))) * 100;
  const signed = cp * (mate > 0 ? 1 : -1);
  return rawWinningChances(signed);
};
var evalWinningChances = (ev) => typeof ev.mate !== "undefined" ? mateWinningChances(ev.mate) : cpWinningChances(ev.cp);
var povChances = (color, ev) => toPov(color, evalWinningChances(ev));
var povDiff = (color, e1, e2) => (povChances(color, e1) - povChances(color, e2)) / 2;
var areSimilarEvals = (pov, bestEval, secondBestEval) => {
  return povDiff(pov, bestEval, secondBestEval) < 0.14;
};
var hasMultipleSolutions = (color, bestEval, secondBestEval) => {
  return (
    // if secondbest eval equivalent of cp is >= 200
    povChances(color, secondBestEval) >= 0.3524 || areSimilarEvals(color, bestEval, secondBestEval)
  );
};

// ../lib/src/ceval/engines/externalEngine.ts
var ExternalEngine = class {
  constructor(opts, status) {
    this.opts = opts;
    this.status = status;
    this.state = 0 /* Initial */;
    this.sessionId = randomToken();
    this.process = throttle(700, (work) => {
      this.req = new AbortController();
      this.analyse(work, this.req.signal);
    });
  }
  getState() {
    return this.state;
  }
  getInfo() {
    return this.opts;
  }
  start(work) {
    this.stop();
    this.state = 1 /* Loading */;
    this.process(work);
  }
  async analyse(work, signal) {
    var _a, _b;
    try {
      const url = new URL(`${this.opts.endpoint}/api/external-engine/${this.opts.id}/analyse`);
      const res = await fetch(url.href, {
        signal,
        method: "post",
        cache: "default",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "omit",
        body: JSON.stringify({
          clientSecret: this.opts.clientSecret,
          work: {
            sessionId: this.sessionId,
            threads: work.threads,
            hash: work.hashSize || 16,
            multiPv: work.multiPv,
            variant: work.variant,
            initialFen: work.initialFen,
            moves: work.moves,
            ...work.search
          }
        })
      });
      await readNdJson(res, (line) => {
        var _a2, _b2, _c;
        this.state = 3 /* Computing */;
        work.emit(
          {
            bestmove: line.bestmove,
            ponder: line.ponder,
            fen: work.currentFen,
            depth: ((_a2 = line.pvs[0]) == null ? void 0 : _a2.depth) || 0,
            millis: Math.max(line.time, 1),
            nodes: line.nodes,
            cp: (_b2 = line.pvs[0]) == null ? void 0 : _b2.cp,
            mate: (_c = line.pvs[0]) == null ? void 0 : _c.mate,
            pvs: line.pvs
          },
          { threatMode: work.threatMode, path: work.path, ply: work.ply }
        );
      });
      this.state = 0 /* Initial */;
      (_a = this.status) == null ? void 0 : _a.call(this);
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error(err);
        this.state = 4 /* Failed */;
        (_b = this.status) == null ? void 0 : _b.call(this, { error: String(err) });
      } else this.state = 0 /* Initial */;
    }
  }
  stop() {
    var _a;
    (_a = this.req) == null ? void 0 : _a.abort();
  }
  engineName() {
    return this.opts.name;
  }
  destroy() {
    this.stop();
  }
};

// ../lib/src/ceval/protocol.ts
var Protocol = class {
  constructor(variantMap) {
    this.variantMap = variantMap;
    this.expectedPvs = 1;
    this.options = /* @__PURE__ */ new Map();
  }
  connected(send) {
    this.send = send;
    this.options = /* @__PURE__ */ new Map([
      ["Threads", "1"],
      ["Hash", "16"],
      ["MultiPV", "1"],
      ["UCI_Variant", "chess"]
    ]);
    this.send("uci");
  }
  setOption(name, value) {
    value = value.toString();
    if (this.send && this.options.get(name) !== value) {
      this.send(`setoption name ${name} value ${value}`);
      this.options.set(name, value);
    }
  }
  disconnected() {
    var _a, _b;
    if (this.work && this.currentEval) {
      (_b = (_a = this.currentEval).bestmove) != null ? _b : _a.bestmove = "(none)";
      this.emit();
    }
    this.work = void 0;
    this.send = void 0;
  }
  received(command) {
    var _a, _b, _c, _d, _e;
    const parts = command.trim().split(/\s+/g);
    if (parts[0] === "uciok") {
      this.setOption("UCI_AnalyseMode", "true");
      this.setOption("Analysis Contempt", "Off");
      this.setOption("UCI_Chess960", "true");
      (_a = this.send) == null ? void 0 : _a.call(this, "ucinewgame");
      (_b = this.send) == null ? void 0 : _b.call(this, "isready");
    } else if (parts[0] === "readyok") this.swapWork();
    else if (parts[0] === "id" && parts[1] === "name") this.engineName = parts.slice(2).join(" ");
    else if (parts[0] === "bestmove") {
      const work = this.work;
      this.work = void 0;
      if (work) {
        const ceval = (_c = this.currentEval) != null ? _c : { millis: 0, fen: work.currentFen, depth: 0, nodes: 0, pvs: [] };
        ceval.bestmove = parts[1];
        if (parts[2] === "ponder") ceval.ponder = parts[3];
        if (!work.stopRequested) work.emit(ceval, work);
      }
      this.swapWork();
    } else if (this.work && !this.work.stopRequested && parts[0] === "info") {
      this.throwOnFatalError(parts);
      let depth = 0, nodes, multiPv = 1, millis, evalType, isMate = false, povEv, moves = [];
      for (let i = 1; i < parts.length; i++) {
        switch (parts[i]) {
          case "depth":
            depth = parseInt(parts[++i]);
            break;
          case "nodes":
            nodes = parseInt(parts[++i]);
            break;
          case "multipv":
            multiPv = parseInt(parts[++i]);
            break;
          case "time":
            millis = parseInt(parts[++i]);
            break;
          case "score":
            isMate = parts[++i] === "mate";
            povEv = parseInt(parts[++i]);
            if (parts[i + 1] === "lowerbound" || parts[i + 1] === "upperbound") evalType = parts[++i];
            break;
          case "pv":
            moves = parts.slice(++i);
            i = parts.length;
            break;
        }
      }
      if (isMate && !povEv) return;
      if (this.expectedPvs < multiPv) this.expectedPvs = multiPv;
      if (!defined(nodes) || !defined(millis) || !defined(isMate) || !defined(povEv)) return;
      const pivot = this.work.threatMode ? 0 : 1;
      const ev = this.work.ply % 2 === pivot ? -povEv : povEv;
      if (evalType && multiPv === 1) return;
      const pvData = {
        moves,
        cp: isMate ? void 0 : ev,
        mate: isMate ? ev : void 0,
        depth
      };
      if (multiPv === 1) {
        if (depth === ((_e = (_d = this.currentEval) == null ? void 0 : _d.depth) != null ? _e : 0) + 1) {
          this.currentEval = {
            fen: this.work.currentFen,
            depth,
            nodes,
            millis,
            cp: isMate ? void 0 : ev,
            mate: isMate ? ev : void 0,
            pvs: [pvData]
          };
        }
      } else if (this.currentEval) {
        if (this.currentEval.pvs.length < multiPv) this.currentEval.pvs.push(pvData);
        else this.currentEval.pvs[multiPv - 1] = pvData;
        this.currentEval.depth = Math.min(this.currentEval.depth, depth);
      }
      if (multiPv === this.expectedPvs) this.emit();
    } else if (command && !["Stockfish", "id", "option", "info"].includes(parts[0]) && !["Analysis Contempt", "UCI_Variant", "UCI_AnalyseMode"].includes(command.split(": ")[1]))
      console.warn(`SF: ${command}`);
  }
  uciVariant(key) {
    var _a, _b;
    return (_b = (_a = this.variantMap) == null ? void 0 : _a.call(this, key)) != null ? _b : key === "threeCheck" ? "3check" : key.toLowerCase();
  }
  emit(ev = this.currentEval, work = this.work) {
    if (ev && work)
      work.emit(structuredClone(ev), { threatMode: work.threatMode, path: work.path, ply: work.ply });
  }
  stop() {
    var _a;
    if (this.work && !this.work.stopRequested) {
      this.work.stopRequested = true;
      (_a = this.send) == null ? void 0 : _a.call(this, "stop");
    }
  }
  swapWork() {
    if (!this.send || this.work) return;
    this.work = this.nextWork;
    this.nextWork = void 0;
    if (this.work) {
      this.currentEval = void 0;
      this.expectedPvs = 1;
      this.setOption("UCI_Variant", this.uciVariant(this.work.variant));
      this.setOption("Threads", this.work.threads);
      this.setOption("Hash", this.work.hashSize || 16);
      this.setOption("MultiPV", Math.max(1, this.work.multiPv));
      if (this.gameId && this.gameId !== this.work.gameId) this.send("ucinewgame");
      this.gameId = this.work.gameId;
      this.send(["position fen", this.work.initialFen, "moves", ...this.work.moves].join(" "));
      const [by, value] = Object.entries(this.work.search)[0];
      this.send(`go ${by} ${value}`);
    }
  }
  compute(nextWork) {
    this.nextWork = nextWork;
    this.stop();
    this.swapWork();
  }
  isComputing() {
    return !!this.work && !this.work.stopRequested;
  }
  throwOnFatalError(info) {
    if (info[1] !== "string" || !info.slice(2, 4).some((e) => e.toLowerCase().startsWith("error"))) return;
    if (this.currentEval) this.currentEval.bestmove = "(none)";
    if (this.work)
      this.work.emit(void 0, {
        threatMode: false,
        path: this.work.path,
        ply: this.work.ply,
        error: info.slice(2).join(" ")
      });
    this.disconnected();
    throw new Error(info.slice(2).join(" "));
  }
};

// ../lib/src/ceval/engines/simpleEngine.ts
var SimpleEngine = class {
  constructor(info) {
    this.info = info;
    this.protocol = new Protocol();
    this.url = `${info.assets.root}/${info.assets.js}`;
  }
  getInfo() {
    return this.info;
  }
  getState() {
    return !this.worker ? 0 /* Initial */ : this.failed ? 4 /* Failed */ : !this.protocol.engineName ? 1 /* Loading */ : this.protocol.isComputing() ? 3 /* Computing */ : 2 /* Idle */;
  }
  start(work) {
    this.protocol.compute(work);
    if (!this.worker) {
      this.worker = new Worker(site.asset.url(this.url, { pathVersion: true, pathOnly: true }));
      this.worker.addEventListener("message", (e) => this.protocol.received(e.data), true);
      this.worker.addEventListener(
        "error",
        (err) => {
          console.error(err);
          this.failed = err.error;
        },
        true
      );
      this.protocol.connected((cmd) => {
        var _a;
        return (_a = this.worker) == null ? void 0 : _a.postMessage(cmd);
      });
    }
  }
  stop() {
    this.protocol.compute(void 0);
  }
  engineName() {
    return this.protocol.engineName;
  }
  destroy() {
    var _a;
    (_a = this.worker) == null ? void 0 : _a.terminate();
    this.worker = void 0;
  }
};

// ../lib/src/bigFileStorage.ts
var bigFileStorage = memoize(() => new BigFileStorage());
var BigFileStorage = class {
  constructor() {
    this.idb = memoize(() => objectStorage({ store: "big-file" }));
    this.opfs = memoize(() => directoryHandleIfAvailable());
  }
  async get(assetUrl, onProgress) {
    const stored = await this.readFile(assetUrl).catch(() => void 0);
    if (stored) return stored;
    const fetched = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", assetUrl, true);
      xhr.responseType = "arraybuffer";
      if (onProgress) xhr.onprogress = (e) => onProgress(e.loaded, e.total);
      xhr.onerror = () => reject(new Error(`fetch '${assetUrl}' failed: ${xhr.status}`));
      xhr.onload = () => {
        if (Math.floor(xhr.status / 100) === 2) resolve(new Uint8Array(xhr.response));
        else reject(new Error(`fetch '${assetUrl}' failed: ${xhr.status}`));
      };
      xhr.send();
    });
    await this.writeFile(assetUrl, fetched);
    return fetched;
  }
  async delete(assetUrl) {
    const opfs = await this.opfs();
    if (opfs) await opfs.removeEntry(opfsName(assetUrl)).catch(() => {
    });
    else await this.idb().then((idb) => idb.remove(assetUrl));
  }
  async readFile(assetUrl) {
    const opfs = await this.opfs();
    if (!opfs) return this.idb().then((idb) => idb.get(assetUrl));
    const file = await opfs.getFileHandle(opfsName(assetUrl), { create: false }).then((fh) => fh.getFile());
    const u8 = new Uint8Array(new ArrayBuffer(file.size));
    const reader = file.stream().getReader();
    let offset = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      u8.set(value, offset);
      offset += value.length;
    }
    return offset && offset === file.size ? u8 : void 0;
  }
  async writeFile(assetUrl, u8) {
    var _a;
    const out = await ((_a = this.opfs()) == null ? void 0 : _a.then((f) => f == null ? void 0 : f.getFileHandle(opfsName(assetUrl), { create: true }).then((fh) => fh.createWritable())).catch(() => void 0));
    return (out ? out.write(u8).then(() => out.close()) : this.idb().then((idb) => idb.put(assetUrl, u8))).catch((e) => log(e));
  }
};
function opfsName(assetUrl) {
  return new URL(assetUrl).pathname.replaceAll("/", "_");
}
async function directoryHandleIfAvailable() {
  var _a, _b;
  if (!("storage" in navigator)) return void 0;
  try {
    const dirHandle = await ((_b = (_a = navigator.storage) == null ? void 0 : _a.getDirectory) == null ? void 0 : _b.call(_a));
    const filename = `_${randomToken()}`;
    const out = await dirHandle.getFileHandle(filename, { create: true }).then((f) => f.createWritable());
    await out.write(new Uint8Array(1));
    await out.close();
    await dirHandle.removeEntry(filename);
    return dirHandle;
  } catch (e) {
    return void 0;
  }
}

// ../lib/src/ceval/engines/stockfishWebEngine.ts
var StockfishWebEngine = class {
  constructor(info, status) {
    this.info = info;
    this.status = status;
    this.start = (work) => this.protocol.compute(work);
    this.stop = () => this.protocol.compute(void 0);
    this.engineName = () => this.protocol.engineName;
    this.destroy = () => {
      var _a;
      (_a = this.module) == null ? void 0 : _a.uci("quit");
      this.module = void 0;
    };
    this.protocol = new Protocol();
    this.boot().catch((e) => {
      var _a;
      this.failed = e;
      (_a = this.status) == null ? void 0 : _a.call(this, { error: String(e) });
    });
  }
  getInfo() {
    return this.info;
  }
  async boot() {
    var _a, _b;
    const [root, js] = [this.info.assets.root, this.info.assets.js];
    const scriptUrl = site.asset.url(`${root}/${js}`, { documentOrigin: true });
    const makeModule = await import(scriptUrl);
    const module = await makeModule.default({
      wasmMemory: sharedWasmMemory(this.info.minMem),
      locateFile: (file) => site.asset.url(`${root}/${file}`),
      mainScriptUrlOrBlob: scriptUrl
    });
    if (this.info.tech === "NNUE") {
      if (((_a = this.info.variants) == null ? void 0 : _a.length) === 1) {
        module.uci(`setoption name UCI_Variant value ${this.protocol.uciVariant(this.info.variants[0])}`);
      }
      module.onError = this.makeErrorHandler(module);
      const nnueFilenames = (_b = this.info.assets.nnue) != null ? _b : [];
      if (!nnueFilenames.length)
        for (let i = 0; ; i++) {
          const nnueFilename = module.getRecommendedNnue(i);
          if (!nnueFilename) break;
          nnueFilenames.push(nnueFilename);
        }
      await Promise.all(
        nnueFilenames.map(async (name, index) => {
          module.setNnueBuffer(
            await bigFileStorage().get(
              site.asset.url(`lifat/nnue/${name}`),
              (bytes, total) => {
                var _a2;
                return (_a2 = this.status) == null ? void 0 : _a2.call(this, { download: { bytes, total } });
              }
            ),
            index
          );
        })
      );
    }
    module.listen = (data) => {
      var _a2;
      try {
        this.protocol.received(data);
      } catch (e) {
        this.failed = e;
        (_a2 = this.status) == null ? void 0 : _a2.call(this, { error: String(e) });
      }
    };
    this.protocol.connected((cmd) => module.uci(cmd));
    this.module = module;
  }
  makeErrorHandler(module) {
    return (msg) => {
      var _a, _b;
      if (msg.startsWith("BAD_NNUE")) {
        const index = Math.max(0, Number(msg.slice(9)));
        const nnueFilename = (_a = this.info.assets.nnue) != null ? _a : module.getRecommendedNnue(index);
        setTimeout(() => {
          console.warn(`Corrupt NNUE file, removing ${nnueFilename} from OPFS/IDB`);
          bigFileStorage().delete(site.asset.url(`lifat/nnue/${nnueFilename}`));
        }, 2e3);
      } else (_b = this.status) == null ? void 0 : _b.call(this, { error: msg });
    };
  }
  getState() {
    return this.failed ? 4 /* Failed */ : !this.module ? 1 /* Loading */ : this.protocol.isComputing() ? 3 /* Computing */ : 2 /* Idle */;
  }
};

// ../../../../../node_modules/.pnpm/idb-keyval@6.3.0/node_modules/idb-keyval/dist/index.js
function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.oncomplete = request.onsuccess = () => resolve(request.result);
    request.onabort = request.onerror = () => reject(request.error);
  });
}
function createStore(dbName, storeName) {
  let dbp;
  const getDB = () => {
    if (dbp)
      return dbp;
    const request = indexedDB.open(dbName);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    dbp = promisifyRequest(request);
    dbp.then((db) => {
      db.onclose = () => dbp = void 0;
    }, () => {
      dbp = void 0;
    });
    return dbp;
  };
  return (txMode, callback) => getDB().then((db) => callback(db.transaction(storeName, txMode).objectStore(storeName)));
}
var defaultGetStoreFunc;
function defaultGetStore() {
  if (!defaultGetStoreFunc) {
    defaultGetStoreFunc = createStore("keyval-store", "keyval");
  }
  return defaultGetStoreFunc;
}
function get(key, customStore = defaultGetStore()) {
  return customStore("readonly", (store) => promisifyRequest(store.get(key)));
}
function set(key, value, customStore = defaultGetStore()) {
  return customStore("readwrite", (store) => {
    store.put(value, key);
    return promisifyRequest(store.transaction);
  });
}
function del(key, customStore = defaultGetStore()) {
  return customStore("readwrite", (store) => {
    store.delete(key);
    return promisifyRequest(store.transaction);
  });
}

// ../lib/src/ceval/cache.ts
var Cache = class {
  constructor(name) {
    this.store = createStore(`${name}--db`, `${name}--store`);
  }
  async get(key, version) {
    const cachedVersion = await get(`${key}--version`, this.store);
    if (cachedVersion !== version) return [false, void 0];
    const data = await get(`${key}--data`, this.store);
    return [true, data];
  }
  async set(key, version, data) {
    const cachedVersion = await get(`${key}--version`, this.store);
    if (cachedVersion === version) return;
    await del(`${key}--version`, this.store);
    await set(`${key}--data`, data, this.store);
    await set(`${key}--version`, version, this.store);
  }
};

// ../lib/src/ceval/engines/threadedEngine.ts
var ThreadedEngine = class {
  constructor(info, status, variantMap) {
    this.info = info;
    this.status = status;
    this.variantMap = variantMap;
    this.onError = (err) => {
      var _a;
      console.error(err);
      this.failed = err;
      (_a = this.status) == null ? void 0 : _a.call(this, { error: String(err) });
    };
  }
  getInfo() {
    return this.info;
  }
  getState() {
    return !this.protocol ? 0 /* Initial */ : this.failed ? 4 /* Failed */ : !this.protocol.engineName ? 1 /* Loading */ : this.protocol.isComputing() ? 3 /* Computing */ : 2 /* Idle */;
  }
  async boot() {
    var _a;
    const [root, js, wasm, pathVersion] = [
      this.info.assets.root,
      this.info.assets.js,
      this.info.assets.wasm,
      this.info.assets.version
    ], wasmPath = `${root}/${wasm}`;
    let wasmBinary;
    if (this.info.id === "__sf14nnue") {
      const cache = window.indexedDB && new Cache("ceval-wasm-cache");
      try {
        if (cache) {
          const [found, data] = await cache.get(wasmPath, pathVersion);
          if (found) wasmBinary = data;
        }
      } catch (e) {
        console.log("ceval: idb cache load failed:", e);
      }
      if (!wasmBinary) {
        wasmBinary = await new Promise((resolve, reject) => {
          const req = new XMLHttpRequest();
          req.open("GET", site.asset.url(wasmPath, { pathVersion }), true);
          req.responseType = "arraybuffer";
          req.onerror = (event) => reject(event);
          req.onprogress = (event) => {
            var _a2;
            return (_a2 = this.status) == null ? void 0 : _a2.call(this, { download: { bytes: event.loaded, total: event.total } });
          };
          req.onload = (_) => {
            var _a2;
            (_a2 = this.status) == null ? void 0 : _a2.call(this);
            resolve(req.response);
          };
          req.send();
        });
      }
      try {
        await cache.set(wasmPath, pathVersion, wasmBinary);
      } catch (e) {
        console.log("ceval: idb cache store failed:", e);
      }
    }
    await site.asset.loadIife(`${root}/${js}`, { pathVersion });
    const sf = await window[this.info.id === "__sf11mv" ? "StockfishMv" : "Stockfish"]({
      wasmBinary,
      printErr: (msg) => this.onError(new Error(msg)),
      onError: this.onError,
      locateFile: (path) => site.asset.url(`${root}/${path}`, { pathVersion, pathOnly: path.endsWith(".worker.js") }),
      wasmMemory: sharedWasmMemory(this.info.minMem)
    });
    sf.addMessageListener((data) => {
      var _a2;
      return (_a2 = this.protocol) == null ? void 0 : _a2.received(data);
    });
    (_a = this.protocol) == null ? void 0 : _a.connected((msg) => sf.postMessage(msg));
    this.module = sf;
  }
  async start(work) {
    if (!this.protocol) {
      this.protocol = new Protocol(this.variantMap);
      this.boot().catch(this.onError);
    }
    this.protocol.compute(work);
  }
  stop() {
    var _a;
    (_a = this.protocol) == null ? void 0 : _a.compute(void 0);
  }
  destroy() {
    var _a;
    (_a = this.module) == null ? void 0 : _a.postMessage("quit");
    this.module = void 0;
  }
};

// ../lib/src/ceval/engines/engines.ts
var Engines = class {
  constructor(ctrl) {
    this.ctrl = ctrl;
    this.activeEngine = void 0;
    this.statusCallback = (status = {}) => {
      if (this.ctrl.available()) this.ctrl.download = status.download;
      if (status.error) {
        log(status.error);
        this.ctrl.engineFailed(status.error);
      }
      this.ctrl.opts.redraw();
    };
    var _a, _b;
    const variants = [
      { key: "antichess", nnue: "antichess-dd3cbe53cd4e" },
      { key: "atomic", nnue: "atomic-2cf13ff256cc" },
      { key: "crazyhouse", nnue: "crazyhouse-8ebf84784ad2" },
      { key: "horde", nnue: "horde-28173ddccabe" },
      { key: "kingOfTheHill", nnue: "kingofthehill-978b86d0e6a4" },
      { key: "threeCheck", nnue: "3check-cb5f517c228b" },
      { key: "racingKings", nnue: "racingkings-636b95f085e3" }
    ];
    const relaxedSimdPair = (base) => {
      var _a2;
      return [
        {
          ...base,
          info: {
            ...base.info,
            requires: [...base.info.requires, "relaxedSimd"],
            assets: { ...base.info.assets, js: (_a2 = base.info.assets.js) == null ? void 0 : _a2.replace(".js", "_relaxed-simd.js") }
          }
        },
        { ...base, info: { ...base.info, obsoletedBy: "relaxedSimd" } }
      ];
    };
    const browserEngines = [
      ...relaxedSimdPair({
        info: {
          id: "__sf_dev",
          name: "Stockfish 18 dev \xB7 85MB",
          short: "SF 18 dev 85MB",
          url: "https://github.com/lichess-org/stockfish-web#sf_dev-stockfish-dev-20260609-415ff793",
          tech: "NNUE",
          requires: ["sharedMem", "simd", "dynamicImportFromWorker"],
          minMem: 2560,
          capabilities: ["cloudEval", "staticAnalysis", "puzzleReport"],
          assets: {
            root: "npm/stockfish-web",
            js: "sf_dev.js"
          }
        },
        make: (e) => new StockfishWebEngine(e, this.statusCallback)
      }),
      ...relaxedSimdPair({
        info: {
          id: "__sf_18",
          name: "Stockfish 18 \xB7 108MB",
          short: "SF 18 108MB",
          url: "https://github.com/lichess-org/stockfish-web#sf_18-stockfish-18",
          tech: "NNUE",
          requires: ["sharedMem", "simd", "dynamicImportFromWorker"],
          minMem: 2560,
          capabilities: ["cloudEval", "puzzleReport"],
          assets: {
            root: "npm/stockfish-web",
            js: "sf_18.js"
          }
        },
        make: (e) => new StockfishWebEngine(e, this.statusCallback)
      }),
      ...relaxedSimdPair({
        info: {
          id: "__sf_18_smallnet",
          name: "Stockfish 18 \xB7 15MB",
          short: "SF 18 15MB",
          url: "https://github.com/lichess-org/stockfish-web#sf_18_smallnet-stockfish-18-with-sscg13threat-small",
          tech: "NNUE",
          requires: ["sharedMem", "simd", "dynamicImportFromWorker"],
          minMem: 1536,
          capabilities: ["cloudEval", "puzzleReport"],
          assets: {
            root: "npm/stockfish-web",
            nnue: ["nn-4ca89e4b3abf.nnue"],
            js: "sf_18_smallnet.js"
          }
        },
        make: (e) => new StockfishWebEngine(e, this.statusCallback)
      }),
      {
        info: {
          id: "__sf14nnue",
          name: "Stockfish 14 NNUE",
          short: "SF 14",
          url: "https://github.com/lichess-org/stockfish-nnue.wasm",
          tech: "NNUE",
          obsoletedBy: "dynamicImportFromWorker",
          requires: ["sharedMem", "simd"],
          minMem: 2048,
          assets: {
            version: "b6939d",
            root: "npm/stockfish-nnue.wasm",
            js: "stockfish.js",
            wasm: "stockfish.wasm"
          }
        },
        make: (e) => new ThreadedEngine(e, this.statusCallback)
      },
      ...variants.map(
        ({ key, nnue }) => ({
          info: {
            id: `__fsfnnue-${key}`,
            name: "Fairy Stockfish 14+ NNUE",
            short: "FSF 14+",
            url: "https://github.com/lichess-org/stockfish-web#fsf_14-fairy-stockfish-14",
            tech: "NNUE",
            requires: ["sharedMem", "simd", "dynamicImportFromWorker"],
            variants: [key],
            capabilities: ["cloudEval", "staticAnalysis"],
            assets: {
              root: "npm/stockfish-web",
              nnue: [`${nnue}.nnue`],
              js: "fsf_14.js"
            }
          },
          make: (e) => new StockfishWebEngine(e, this.statusCallback)
        })
      ),
      {
        info: {
          id: "__fsfhce",
          name: "Fairy Stockfish 14+ HCE",
          short: "FSF 14+",
          url: "https://github.com/lichess-org/stockfish-web#fsf_14-fairy-stockfish-14",
          tech: "HCE",
          requires: ["sharedMem", "simd", "dynamicImportFromWorker"],
          variants: variants.map((v) => v.key),
          assets: {
            root: "npm/stockfish-web",
            js: "fsf_14.js"
          }
        },
        make: (e) => new StockfishWebEngine(e, this.statusCallback)
      },
      {
        info: {
          id: "__sf11mv",
          name: "Stockfish 11 Multi-Variant",
          short: "SF 11 MV",
          tech: "HCE",
          requires: ["sharedMem"],
          minThreads: 1,
          variants: variants.map((v) => v.key),
          assets: {
            version: "a022fa",
            root: "npm/stockfish-mv.wasm",
            js: "stockfish.js",
            wasm: "stockfish.wasm"
          }
        },
        make: (e) => new ThreadedEngine(
          e,
          void 0,
          (v) => v === "antichess" ? "giveaway" : lichessRules(v)
        )
      },
      {
        info: {
          id: "__sf11hce",
          name: "Stockfish 11 HCE",
          short: "SF 11",
          url: "https://github.com/lichess-org/stockfish.wasm",
          tech: "HCE",
          requires: ["sharedMem"],
          minThreads: 1,
          assets: {
            version: "a022fa",
            root: "npm/stockfish.wasm",
            js: "stockfish.js",
            wasm: "stockfish.wasm"
          }
        },
        make: (e) => new ThreadedEngine(e, void 0)
      },
      {
        info: {
          id: "__sfwasm",
          name: "Stockfish WASM",
          short: "Stockfish",
          url: "https://github.com/lichess-org/stockfish.js",
          tech: "HCE",
          minThreads: 1,
          maxThreads: 1,
          requires: ["wasm"],
          obsoletedBy: "sharedMem",
          assets: {
            version: "a022fa",
            root: "npm/stockfish.js",
            js: "stockfish.wasm.js"
          }
        },
        make: (e) => new SimpleEngine(e)
      },
      {
        info: {
          id: "__sfjs",
          name: "Stockfish JS",
          short: "Stockfish",
          url: "https://github.com/lichess-org/stockfish.js",
          tech: "HCE",
          minThreads: 1,
          maxThreads: 1,
          requires: [],
          obsoletedBy: "wasm",
          assets: {
            version: "a022fa",
            root: "npm/stockfish.js",
            js: "stockfish.js"
          }
        },
        make: (e) => new SimpleEngine(e)
      }
    ];
    this.localEngineMap = new Map(
      browserEngines.filter(
        (e) => e.info.requires.every((req) => features().includes(req)) && !(e.info.obsoletedBy && features().includes(e.info.obsoletedBy))
      ).map((e) => [e.info.id, { info: withDefaults(e.info), make: e.make }])
    );
    this.externalEngines = (_b = (_a = this.ctrl.opts.externalEngines) == null ? void 0 : _a.map((e) => ({
      tech: "EXTERNAL",
      maxMovetime: 30 * 1e3,
      // broker timeouts prevent long search
      ...e
    }))) != null ? _b : [];
  }
  getEngine(selector) {
    var _a, _b, _c, _d, _e;
    const id = (_b = selector == null ? void 0 : selector.id) != null ? _b : (_a = this.activeEngine) == null ? void 0 : _a.id;
    const variant = (selector == null ? void 0 : selector.variant) || "standard";
    const localEngines = [...this.localEngineMap.values()].filter((e) => {
      var _a2;
      return !(selector == null ? void 0 : selector.capability) || ((_a2 = e.info.capabilities) == null ? void 0 : _a2.includes(selector.capability));
    }).map((e) => e.info);
    return (_e = (_d = (_c = this.externalEngines.find((e) => e.id === id && externalEngineSupports(e, variant))) != null ? _c : localEngines.find((e) => {
      var _a2;
      return e.id === id && ((_a2 = e.variants) == null ? void 0 : _a2.includes(variant));
    })) != null ? _d : localEngines.find((e) => {
      var _a2;
      return (_a2 = e.variants) == null ? void 0 : _a2.includes(variant);
    })) != null ? _e : this.externalEngines.find((e) => externalEngineSupports(e, variant));
  }
  active() {
    var _a;
    (_a = this.activeEngine) != null ? _a : this.activeEngine = this.getEngine({ variant: this.ctrl.opts.variant.key });
    return this.activeEngine;
  }
  setActive(id) {
    if (!this.activeEngine || id !== this.activeEngine.id) {
      this.activeEngine = this.getEngine({ id, variant: this.ctrl.opts.variant.key });
    }
    return this.activeEngine;
  }
  get defaultId() {
    return this.localEngineMap.values().next().value.info.id;
  }
  get external() {
    var _a;
    return ((_a = this.activeEngine) == null ? void 0 : _a.tech) === "EXTERNAL" ? this.activeEngine : void 0;
  }
  async deleteExternal(id) {
    if (this.externalEngines.every((e) => e.id !== id)) return false;
    const r = await fetch(`/api/external-engine/${id}`, { method: "DELETE", headers: xhrHeader });
    if (!r.ok) return false;
    this.externalEngines = this.externalEngines.filter((e) => e.id !== id);
    this.active();
    return true;
  }
  supporting(variant, capability, filter = "all") {
    var _a, _b;
    const engines = [];
    if (filter !== "browser") {
      engines.push(...this.externalEngines.filter((e) => externalEngineSupports(e, variant)));
    }
    if (filter !== "external") {
      for (const { info } of this.localEngineMap.values()) {
        if (!((_a = info.variants) == null ? void 0 : _a.includes(variant))) continue;
        if (capability && !((_b = info.capabilities) == null ? void 0 : _b.includes(capability))) continue;
        engines.push(info);
      }
    }
    return engines;
  }
  makeEngine(selector) {
    var _a;
    const e = this.activeEngine = this.getEngine(selector);
    if (!e) throw Error(`Engine not found ${(_a = selector == null ? void 0 : selector.id) != null ? _a : selector == null ? void 0 : selector.variant}`);
    return e.tech === "EXTERNAL" ? new ExternalEngine(e, this.statusCallback) : this.localEngineMap.get(e.id).make(e);
  }
};
function externalEngineSupports(e, v) {
  var _a;
  const names = [v.toLowerCase()];
  if (v === "standard" || v === "fromPosition" || v === "chess960") names.push("chess");
  if (v === "threeCheck") names.push("3check");
  if (v === "antichess") names.push("giveaway");
  return ((_a = e.variants) != null ? _a : []).filter((v2) => names.includes(v2.toLowerCase())).length;
}
function maxHashMB() {
  if (isAndroid())
    return 64;
  else if (isIPad())
    return 64;
  else if (isIos()) return 32;
  return 512;
}
var maxHash = maxHashMB();
var withDefaults = (engine) => ({
  variants: ["standard", "chess960", "fromPosition"],
  minMem: 1024,
  maxHash,
  minThreads: 2,
  maxThreads: 32,
  ...engine
});

// ../lib/src/ceval/ctrl.ts
var CevalCtrl = class {
  constructor(opts) {
    this.opts = opts;
    this.storedPv = storedIntProp("ceval.multipv", 1);
    this.storedMovetime = storedIntProp("ceval.search-ms", 8e3);
    this.hovering = prop(null);
    this.pvBoard = prop(null);
    this.isDeeper = toggle(false);
    this.curEval = null;
    this.showEnginePrefs = toggle(false);
    this.goDeeper = () => {
      if (!this.lastStarted) return;
      this.isDeeper(true);
      this.doStart(this.lastStarted);
    };
    this.reset = () => {
      var _a;
      (_a = this.worker) == null ? void 0 : _a.stop();
      this.curEval = null;
      this.lastStarted = void 0;
      this.download = void 0;
    };
    this.start = (path, steps, gameId, threatMode = false) => {
      if (!this.available() || this.wasUnloaded) return false;
      this.isDeeper(false);
      this.doStart({ path, steps, gameId, threatMode });
      return true;
    };
    this.setThreads = (threads) => storage.set("ceval.threads", threads.toString());
    this.setHashSize = (hash) => storage.set("ceval.hash-size", hash.toString());
    this.selectEngine = (id) => {
      var _a, _b;
      this.storedEngine(id);
      this.engines.setActive(id);
      (_b = (_a = this.opts).onSelectEngine) == null ? void 0 : _b.call(_a);
    };
    this.setPvBoard = (pvBoard) => {
      this.pvBoard(pvBoard);
      this.opts.redraw();
    };
    this.doStart = (s) => {
      var _a, _b, _c, _d;
      this.lastStarted = s;
      const step = s.steps[s.steps.length - 1];
      const { search, threads, hashSize, engine } = this.info(this.opts.custom);
      const lastEvalMillis = (_b = (_a = s.threatMode ? step.threat : step.ceval) == null ? void 0 : _a.millis) != null ? _b : 0;
      if (!this.isDeeper() && "movetime" in search.by && lastEvalMillis >= search.by.movetime) {
        return;
      }
      const work = {
        variant: this.opts.variant.key,
        threads,
        hashSize,
        gameId: s.gameId,
        stopRequested: false,
        initialFen: s.steps[0].fen,
        moves: [],
        currentFen: step.fen,
        path: s.path,
        ply: step.ply,
        search: search.by,
        multiPv: search.multiPv,
        threatMode: s.threatMode,
        emit: this.makeThrottledEmitter()
      };
      if (s.threatMode) {
        const c = step.ply % 2 === 1 ? "w" : "b";
        const fen = step.fen.replace(/ (w|b) /, " " + c + " ");
        work.currentFen = fen;
        work.initialFen = fen;
      } else {
        for (let i = 1; i < s.steps.length; i++) {
          const step2 = s.steps[i];
          if (sanIrreversible(this.opts.variant.key, step2.san)) {
            work.moves = [];
            work.initialFen = step2.fen;
          } else work.moves.push(step2.uci);
        }
      }
      if (((_c = this.worker) == null ? void 0 : _c.getInfo().id) !== engine.id) this.unload();
      (_d = this.worker) != null ? _d : this.worker = this.engines.makeEngine({ id: engine.id, variant: this.opts.variant.key });
      this.worker.start(work);
    };
    this.engines = new Engines(this);
    this.storedEngine = storedStringProp(`ceval.engine.${opts.variant.key}`, this.engines.defaultId);
    this.init();
    storage.make("ceval.fen").listen(() => {
      var _a;
      (_a = this.worker) == null ? void 0 : _a.destroy();
      this.worker = void 0;
      this.opts.redraw();
    });
    document.addEventListener("visibilitychange", () => {
      var _a, _b;
      if (this.engines.external) return;
      if ((_a = this.curEval) == null ? void 0 : _a.bestmove) return;
      if (!this.lastStarted) return;
      if (!this.analysable) return;
      if (document.hidden) (_b = this.worker) == null ? void 0 : _b.stop();
      else if (this.curEval) this.doStart(this.lastStarted);
    });
  }
  init(opts) {
    var _a, _b, _c, _d, _e;
    if (opts) this.opts = opts;
    this.reset();
    this.analysable = Boolean(this.engines.getEngine({ variant: this.opts.variant.key }));
    this.rules = lichessRules(this.opts.variant.key);
    if (this.analysable && this.opts.initialFen)
      this.analysable = parseFen(this.opts.initialFen).chain((x) => setupPosition(this.rules, x)).isOk;
    this.engines.setActive((_c = (_b = (_a = this.opts.custom) == null ? void 0 : _a.engine) == null ? void 0 : _b.id) != null ? _c : this.storedEngine());
    if (((_d = this.worker) == null ? void 0 : _d.getInfo().id) !== ((_e = this.engines.active()) == null ? void 0 : _e.id)) this.unload();
  }
  available() {
    return !document.hidden && this.analysable;
  }
  info(custom) {
    var _a, _b, _c, _d, _e;
    const maybeSearch = (_a = custom == null ? void 0 : custom.search) == null ? void 0 : _a.call(custom);
    const active = this.engines.active();
    if (!active) return void 0;
    const maxTime = Number(maybeSearch) || active.maxMovetime;
    return {
      threads: clamp(
        (_c = (_b = custom == null ? void 0 : custom.engine) == null ? void 0 : _b.threads) != null ? _c : Number(storage.get("ceval.threads")) || this.recommendedThreads,
        { min: active.minThreads, max: this.maxThreads }
      ),
      hashSize: clamp((_e = (_d = custom == null ? void 0 : custom.engine) == null ? void 0 : _d.hashSize) != null ? _e : Number(storage.get("ceval.hash-size")), {
        min: 16,
        max: active.maxHash
      }),
      engine: (custom == null ? void 0 : custom.engine) && this.engines.getEngine({ id: custom.engine.id }) || active,
      search: typeof maybeSearch === "object" ? maybeSearch : {
        multiPv: this.storedPv(),
        by: { movetime: clamp(this.isDeeper() ? Infinity : this.storedMovetime(), { max: maxTime }) }
      }
    };
  }
  get search() {
    var _a, _b;
    return (_b = (_a = this.info(this.opts.custom)) == null ? void 0 : _a.search) != null ? _b : { by: { movetime: 0 }, multiPv: 0 };
  }
  get recommendedThreads() {
    var _a, _b, _c, _d;
    return (_d = (_a = this.engines.external) == null ? void 0 : _a.maxThreads) != null ? _d : clamp(navigator.hardwareConcurrency - (navigator.hardwareConcurrency % 2 ? 0 : 1), {
      min: (_c = (_b = this.engines.active()) == null ? void 0 : _b.minThreads) != null ? _c : 1,
      max: this.maxThreads
    });
  }
  get maxThreads() {
    var _a, _b, _c, _d, _e, _f;
    return (_f = (_a = this.engines.external) == null ? void 0 : _a.maxThreads) != null ? _f : fewerCores() ? Math.min((_c = (_b = this.engines.active()) == null ? void 0 : _b.maxThreads) != null ? _c : 32, navigator.hardwareConcurrency) : (_e = (_d = this.engines.active()) == null ? void 0 : _d.maxThreads) != null ? _e : 32;
  }
  get isInfinite() {
    var _a;
    return this.storedMovetime() === Number.POSITIVE_INFINITY && !Number.isFinite((_a = this.engines.active()) == null ? void 0 : _a.maxMovetime);
  }
  get state() {
    var _a, _b;
    return (_b = (_a = this.worker) == null ? void 0 : _a.getState()) != null ? _b : 0 /* Initial */;
  }
  get canGoDeeper() {
    var _a, _b;
    return this.state !== 3 /* Computing */ && ((_b = (_a = this.curEval) == null ? void 0 : _a.depth) != null ? _b : 0) < 99;
  }
  get isComputing() {
    return this.state === 3 /* Computing */;
  }
  get isCacheable() {
    var _a, _b;
    return Boolean((_b = (_a = this.engines.active()) == null ? void 0 : _a.capabilities) == null ? void 0 : _b.includes("cloudEval"));
  }
  get wasUnloaded() {
    return !this.worker && Boolean(this.lastStarted);
  }
  get showingCloud() {
    var _a;
    if (!this.lastStarted) return false;
    const curr = this.lastStarted.steps[this.lastStarted.steps.length - 1];
    return Boolean((_a = curr.ceval) == null ? void 0 : _a.cloud);
  }
  engineFailed(msg) {
    var _a;
    if (msg.includes("Blocking on the main thread")) return;
    if (!this.opts.hideErrors) showEngineError(String((_a = this.engines.active()) == null ? void 0 : _a.name), msg);
    this.reset();
    this.unload();
  }
  unload() {
    var _a, _b;
    (_a = this.worker) == null ? void 0 : _a.stop();
    (_b = this.worker) == null ? void 0 : _b.destroy();
    this.worker = void 0;
  }
  makeThrottledEmitter() {
    const working = {
      started: this.lastStarted,
      fen: void 0,
      emit: this.opts.emit,
      movetime: "movetime" in this.search.by && this.search.by.movetime,
      dontStop: Boolean(this.engines.external || this.opts.custom || this.isDeeper() || this.isInfinite)
    };
    const emitter = throttleWithFlush(125, (ev, meta) => {
      var _a, _b;
      this.curEval = ev;
      if (!working.fen) {
        working.fen = this.curEval.fen;
        storage.fire("ceval.fen", this.curEval.fen);
      }
      const color = meta.ply % 2 === (meta.threatMode ? 1 : 0) ? "white" : "black";
      this.curEval.pvs.sort((a, b) => povChances(color, b) - povChances(color, a));
      if (this.lastStarted && !working.dontStop) {
        const evNode = working.started.steps[working.started.steps.length - 1];
        if (working.movetime && ((_a = evNode.ceval) == null ? void 0 : _a.cloud) && ev.millis > 500) {
          const targetNodes = evNode.ceval.nodes;
          const likelyNodes = Math.round(working.movetime * ev.nodes / ev.millis);
          if (likelyNodes < targetNodes) (_b = this.worker) == null ? void 0 : _b.stop();
        }
      }
      working.emit(this.curEval, meta);
    });
    return (ev, meta) => {
      if (!ev) {
        working.emit(void 0, meta);
      } else if (working.started === this.lastStarted && (!working.fen || working.fen === ev.fen)) {
        pubsub.emit("analysis.eval", structuredClone(ev), meta);
        if (ev.bestmove) emitter.flush(ev, meta);
        else emitter(ev, meta);
      } else {
        emitter.clear();
      }
    };
  }
};

// ../lib/src/ceval/view/main.ts
var main_exports = {};
__export(main_exports, {
  getBestEval: () => getBestEval,
  renderCeval: () => renderCeval,
  renderCevalSwitch: () => renderCevalSwitch,
  renderGauge: () => renderGauge,
  renderPvs: () => renderPvs
});

// ../lib/src/ceval/view/settings.ts
var allSearchTicks = [2, 4, 6, 8, 10, 12, 15, 20, 30, Number.POSITIVE_INFINITY];
function renderCevalSettings(ctrl) {
  var _a, _b, _c, _d, _e, _f;
  const ceval = ctrl.ceval;
  if (!ceval.showEnginePrefs()) {
    return null;
  }
  const minThreads = (_b = (_a = ceval.engines.active()) == null ? void 0 : _a.minThreads) != null ? _b : 1;
  const maxThreads = ceval.maxThreads;
  const threads = (_d = (_c = ceval.info()) == null ? void 0 : _c.threads) != null ? _d : 1;
  const hashSize = (_f = (_e = ceval.info()) == null ? void 0 : _e.hashSize) != null ? _f : 4;
  const searchTicks = allSearchTicks.filter(
    (x) => {
      var _a2, _b2;
      return x * 1e3 <= ((_b2 = (_a2 = ceval.engines.active()) == null ? void 0 : _a2.maxMovetime) != null ? _b2 : Infinity);
    }
  );
  let observer;
  function clickThreads(x = ceval.recommendedThreads) {
    ceval.setThreads(x);
    ctrl.startCeval();
    ceval.opts.redraw();
  }
  function threadsTick(dir) {
    return hl(`div.arrow-${dir}`, { hook: bind("click", () => clickThreads()) });
  }
  function searchTick() {
    return clamp(
      allSearchTicks.findIndex((tickSecs) => tickSecs * 1e3 >= ceval.storedMovetime()),
      { min: 0, max: searchTicks.length - 1 }
    );
  }
  return hl(
    "div#ceval-settings-anchor",
    hl(
      "div#ceval-settings",
      {
        hook: onInsert(
          onClickAway(() => {
            ceval.showEnginePrefs(false);
            ceval.opts.redraw();
          })
        )
      },
      [
        engineSelection(ctrl),
        ((id) => {
          return hl("div.setting", { attrs: { title: i18n.site.searchTimeDescription } }, [
            hl("label", { attrs: { for: id } }, i18n.site.searchTime),
            hl("input#" + id, {
              attrs: {
                type: "range",
                min: 0,
                max: searchTicks.length - 1,
                step: 1,
                "aria-valuetext": i18n.site.nbSeconds(searchTicks[searchTick()])
              },
              hook: rangeConfig(searchTick, (n) => {
                ceval.storedMovetime(searchTicks[n] * 1e3);
                ctrl.startCeval();
                ceval.opts.redraw();
              })
            }),
            hl(
              "div.range_value",
              isFinite(searchTicks[searchTick()]) ? `${searchTicks[searchTick()]}s` : "\u221E"
            )
          ]);
        })("engine-search-ms"),
        ((id) => {
          const max = 5;
          return hl("div.setting", { attrs: { title: i18n.site.multipleLinesDescription } }, [
            hl("label", { attrs: { for: id } }, i18n.site.multipleLines),
            hl("input#" + id, {
              attrs: { type: "range", min: 0, max, step: 1 },
              hook: rangeConfig(
                () => ceval.storedPv(),
                (pvs) => {
                  var _a2;
                  ceval.storedPv(pvs);
                  (_a2 = ctrl.clearCeval) == null ? void 0 : _a2.call(ctrl);
                  ceval.opts.redraw();
                }
              )
            }),
            hl("div.range_value", `${ceval.storedPv()} / ${max}`)
          ]);
        })("analyse-multipv"),
        maxThreads > minThreads && ((id) => {
          return hl(
            "div.setting",
            {
              attrs: {
                title: fewerCores() && !ceval.engines.external ? i18n.site.threadsDescriptionMobile : i18n.site.threadsDescription
              }
            },
            [
              hl("label", { attrs: { for: id } }, i18n.site.threads),
              hl("span", [
                hl("input#" + id, {
                  attrs: {
                    type: "range",
                    min: minThreads,
                    max: maxThreads,
                    step: 1
                  },
                  hook: rangeConfig(() => threads, clickThreads)
                }),
                hl(
                  "div.tick",
                  {
                    hook: {
                      update: (_, v) => setupTick(v, ceval),
                      insert: (v) => {
                        setupTick(v, ceval);
                        let animationFrameRequestId;
                        observer = new ResizeObserver(() => {
                          cancelAnimationFrame(animationFrameRequestId);
                          animationFrameRequestId = requestAnimationFrame(() => setupTick(v, ceval));
                        });
                        observer.observe(v.elm.parentElement);
                      },
                      destroy: () => observer == null ? void 0 : observer.disconnect()
                    }
                  },
                  !ceval.engines.external && [threadsTick("up"), threadsTick("down")]
                )
              ]),
              hl("div.range_value", `${threads} / ${maxThreads}`)
            ]
          );
        })("analyse-threads"),
        ((id) => {
          var _a2, _b2;
          return hl("div.setting", { attrs: { title: i18n.site.memoryDescription } }, [
            hl("label", { attrs: { for: id } }, i18n.site.memory),
            hl("input#" + id, {
              attrs: {
                type: "range",
                min: 4,
                max: Math.floor(Math.log2((_b2 = (_a2 = ceval.engines.active()) == null ? void 0 : _a2.maxHash) != null ? _b2 : 4)),
                step: 1,
                "aria-valuetext": formatHashSize(hashSize)
              },
              hook: rangeConfig(
                () => Math.floor(Math.log2(hashSize)),
                (v) => {
                  ceval.setHashSize(Math.pow(2, v));
                  ctrl.startCeval();
                  ceval.opts.redraw();
                }
              )
            }),
            hl("div.range_value", formatHashSize(hashSize))
          ]);
        })("analyse-memory")
      ]
    )
  );
}
function formatHashSize(v) {
  return v < 1e3 ? v + "MB" : Math.round(v / 1024) + "GB";
}
function setupTick(v, ceval) {
  var _a, _b, _c;
  const tick = v.elm;
  const parentSpan = tick.parentElement;
  const minThreads = (_b = (_a = ceval.engines.active()) == null ? void 0 : _a.minThreads) != null ? _b : 1;
  const thumbWidth = isChrome() ? 17 : 19;
  const trackWidth = parentSpan.querySelector("input").offsetWidth - thumbWidth;
  const tickRatio = (ceval.recommendedThreads - minThreads) / (ceval.maxThreads - minThreads);
  const tickLeft = Math.floor(thumbWidth / 2 + trackWidth * tickRatio);
  tick.style.left = `${tickLeft}px`;
  $(tick).toggleClass("recommended", ((_c = ceval.info()) == null ? void 0 : _c.threads) === ceval.recommendedThreads);
}
function engineSelection({ ceval }) {
  const active = ceval.engines.active();
  const engines = ceval.engines.supporting(ceval.opts.variant.key);
  const external = ceval.engines.external;
  return hl("div.setting", [
    hl("label", { attrs: { for: "select-engine" } }, "Engine:"),
    hl(
      "select#select-engine",
      {
        hook: bind("change", (e) => {
          ceval.selectEngine(e.target.value);
          ceval.opts.redraw();
        })
      },
      engines.map(
        ({ id, name }) => hl("option", { attrs: { value: id, selected: (active == null ? void 0 : active.id) === id } }, name)
      )
    ),
    external && hl("button.button.button-red.button-empty", {
      attrs: { ...dataIcon(licon.Trash), title: "Delete external engine" },
      hook: bind("click", async (e) => {
        e.currentTarget.blur();
        if (await confirm("Remove external engine?"))
          ceval.engines.deleteExternal(external.id).then((ok) => ok && ceval.opts.redraw());
      })
    }),
    hl("button.engine-info-button", {
      attrs: { ...dataIcon(licon.InfoCircle), title: "Engine information" },
      on: { click: () => engineInfo(ceval.engines.supporting(ceval.opts.variant.key, void 0, "browser")) }
    })
  ]);
}
function engineInfo(engines) {
  if (document.querySelector(".engine-info")) return;
  const engineHtml = (e) => `<li>${e.name} ${e.url ? `<a href="${e.url}" target="_blank">source</a>` : ""}</li>`;
  domDialog({
    class: "engine-info-popup",
    easyClose: "clickOutside",
    htmlText: `<div><p>Engines from strongest to weakest</p><ol>${engines.map(engineHtml).join("")}</ol></div>`,
    show: true
  });
}

// ../lib/src/ceval/view/main.ts
function localEvalNodes(ctrl, evs) {
  var _a, _b;
  const ceval = ctrl.ceval, state = ceval.state, status = (_b = (_a = ceval.opts.custom) == null ? void 0 : _a.statusNode) == null ? void 0 : _b.call(_a);
  if (status) return [status];
  if (!evs.client) {
    if (!ceval.analysable) return ["Engine cannot analyze this position"];
    if (state === 4 /* Failed */) return [i18n.site.engineFailed];
    const localEvalText = state === 1 /* Loading */ ? loadingText(ctrl) : i18n.site.calculatingMoves;
    return [evs.server && ctrl.nextNodeBest() ? i18n.site.usingServerAnalysis : localEvalText];
  }
  const t = [];
  if (!ceval.opts.custom && ceval.canGoDeeper)
    t.push(
      hl("a.deeper", {
        attrs: { title: i18n.site.goDeeper, "data-icon": licon.PlusButton },
        hook: bind("click", ceval.goDeeper)
      })
    );
  const { depthText, npsText } = localInfo(ctrl, evs.client);
  t.push(depthText);
  if (evs.client.cloud && !ceval.isComputing)
    t.push(hl("span.cloud", { attrs: { title: i18n.site.cloudAnalysis } }, "Cloud"));
  if (ceval.isInfinite) t.push(hl("span.infinite", { attrs: { title: i18n.site.infiniteAnalysis } }, "\u221E"));
  if (npsText) t.push(" \xB7 " + npsText);
  return t;
}
function threatInfo(ctrl, threat) {
  const info = localInfo(ctrl, threat);
  return info.depthText + (info.knps ? " \xB7 " + info.npsText : "");
}
function localInfo(ctrl, ev) {
  var _a;
  const info = {
    npsText: "",
    knps: 0,
    depthText: i18n.site.calculatingMoves
  };
  if (!ev) return info;
  const ceval = ctrl.ceval;
  info.depthText = i18n.site.depthX(ev.depth || 0) + (ceval.isDeeper() || ceval.isInfinite ? "/99" : "");
  if (!ceval.isComputing) return info;
  const knps = ev.nodes / ((_a = ev == null ? void 0 : ev.millis) != null ? _a : Number.POSITIVE_INFINITY);
  if (knps > 0) {
    info.npsText = knps > 1e3 ? (knps / 1e3).toFixed(knps > 1e4 ? 0 : 1) + " Mn/s" : Math.round(knps) + " kn/s";
    info.knps = knps;
  }
  return info;
}
var threatButton = (ctrl) => ctrl.ceval.download ? null : hl("button.show-threat", {
  class: { active: ctrl.threatMode(), hidden: ctrl.getNode().check() },
  attrs: { "data-icon": licon.Target, title: i18n.site.showThreat + " (x)" },
  hook: bind("click", (e) => {
    ctrl.toggleThreatMode();
    blurIfPrimaryClick(e);
  })
});
function engineName(ctrl) {
  var _a;
  const engine = ctrl.engines.active();
  if (!engine) return [];
  const [good, title] = engine.tech === "EXTERNAL" ? [true, "Engine running outside of the browser"] : engine.requires.includes("relaxedSimd") ? [true, "Multi-threaded WebAssembly with relaxed SIMD"] : engine.requires.includes("simd") ? [true, "Multi-threaded WebAssembly with SIMD"] : engine.requires.includes("sharedMem") ? [true, "Multi-threaded WebAssembly"] : engine.requires.includes("wasm") ? [false, "Single-threaded WebAssembly"] : [false, "Single-threaded JavaScript"];
  return [
    hl("span", { attrs: { title: engine.name } }, (_a = engine.short) != null ? _a : engine.name),
    hl(`span.technology${good ? ".good" : ""}`, { attrs: { title } }, engine.tech)
  ];
}
var getBestEval = (ctrl) => {
  var _a, _b;
  return (_b = ctrl.getNode().ceval) != null ? _b : ((_a = ctrl.showEvaluation) == null ? void 0 : _a.call(ctrl)) ? ctrl.getNode().eval : void 0;
};
var gaugeLast = 0;
var gaugeTicks;
function renderGauge(ctrl) {
  if (ctrl.ongoing || !ctrl.showEvalGauge()) return void 0;
  gaugeTicks != null ? gaugeTicks : gaugeTicks = [...Array(7).keys()].map(
    (i) => hl(i === 3 ? "tick.zero" : "tick", { attrs: { style: `height: ${(i + 1) * 12.5}%` } })
  );
  const bestEv = getBestEval(ctrl);
  let ev;
  if (bestEv) {
    ev = povChances("white", bestEv);
    gaugeLast = ev;
  } else ev = gaugeLast;
  return hl(
    "div.eval-gauge",
    { class: { empty: !defined(bestEv), reverse: ctrl.getOrientation() === "black" } },
    [hl("div.black", { attrs: { style: `height: ${100 - (ev + 1) * 50}%` } }), gaugeTicks]
  );
}
function renderCeval(ctrl) {
  var _a, _b, _c;
  const ceval = ctrl.ceval;
  const node = ctrl.getNode(), enabled = !ceval.wasUnloaded && ctrl.cevalEnabled(), client = node.ceval, server = node.eval, threatMode = ctrl.threatMode(), threat = threatMode ? node.threat : void 0, bestEv = threat || getBestEval(ctrl), search = ceval.search, download = ceval.download;
  let pearl, percent = 0;
  if (client) {
    if (client.cloud && !threatMode) percent = 100;
    else if (ceval.isDeeper() || ceval.isInfinite) percent = Math.min(100, 100 * client.depth / 99);
    else if ("movetime" in search.by)
      percent = Math.min(100, 100 * ((_b = (_a = threat != null ? threat : client) == null ? void 0 : _a.millis) != null ? _b : 0) / search.by.movetime);
    else if ("depth" in search.by) percent = Math.min(100, 100 * client.depth / search.by.depth);
    else if ("nodes" in search.by) percent = Math.min(100, 100 * client.nodes / search.by.nodes);
  }
  if ((_c = ceval.opts.custom) == null ? void 0 : _c.pearlNode) {
    pearl = ceval.opts.custom.pearlNode();
  } else if (typeof (bestEv == null ? void 0 : bestEv.cp) !== "undefined") {
    pearl = h("pearl", renderEval(bestEv.cp));
  } else if (bestEv && defined(bestEv.mate)) {
    pearl = h("pearl", "#" + bestEv.mate);
    percent = 100;
  } else {
    if (!enabled) pearl = h("pearl", h("icon"));
    else if (node.outcome() || node.threefold) pearl = h("pearl", "-");
    else if (ceval.state === 4 /* Failed */) pearl = h("pearl", icon(licon.CautionCircle)(".is-red"));
    else pearl = h("pearl", h("icon.ddloader"));
    percent = node.outcome() ? 100 : 0;
  }
  if (download) percent = Math.min(100, Math.round(100 * download.bytes / download.total));
  else if (ceval.search.indeterminate || percent > 0 && !ceval.isComputing) percent = 100;
  const progressBar = (enabled || download) && h(
    "div.bar",
    h("span", {
      class: { threat: enabled && threatMode },
      attrs: { style: `width: ${percent}%` },
      hook: {
        postpatch: (old, vnode) => {
          if (old.data.percent > percent || !!old.data.threatMode !== threatMode) {
            const el = vnode.elm;
            const p = el.parentNode;
            p.removeChild(el);
            p.appendChild(el);
          }
          vnode.data.percent = percent;
          vnode.data.threatMode = threatMode;
        }
      }
    })
  );
  const body = enabled ? [
    pearl,
    hl("div.engine", [
      threatMode ? [i18n.site.showThreat] : engineName(ceval),
      hl(
        "span.info",
        node.outcome() ? [i18n.site.gameOver] : node.threefold ? [i18n.site.threefoldRepetition] : threatMode ? [threatInfo(ctrl, threat)] : localEvalNodes(ctrl, { client, server })
      )
    ])
  ] : [
    pearl,
    hl("div.engine", [
      engineName(ceval),
      hl("br"),
      ceval.analysable ? i18n.site.inLocalBrowser : "Illegal positions cannot be analyzed"
    ])
  ];
  const settingsGear = hl("button.settings-gear", {
    attrs: { role: "button", "data-icon": licon.Gear, title: "Engine settings" },
    class: { active: ceval.showEnginePrefs() },
    hook: bind(
      "click",
      (e) => {
        e.stopPropagation();
        ceval.showEnginePrefs.toggle();
        if (ceval.showEnginePrefs())
          setTimeout(() => {
            var _a2;
            return (_a2 = document.querySelector("#select-engine")) == null ? void 0 : _a2.focus();
          });
        else blurIfPrimaryClick(e);
      },
      () => ceval.opts.redraw(),
      false
    )
  });
  return [
    hl("div.ceval" + (enabled ? ".enabled" : ""), { class: { computing: ceval.isComputing } }, [
      renderCevalSwitch(ctrl),
      body,
      !ceval.opts.custom && threatButton(ctrl),
      settingsGear,
      progressBar
    ]),
    renderCevalSettings(ctrl)
  ].filter((v) => v != null);
}
var renderCevalSwitch = (ctrl) => ctrl.cevalEnabled() !== "force" && cmnToggle({
  id: "analyse-toggle-ceval",
  title: i18n.site.toggleLocalEvaluation + " (L)",
  checked: !!ctrl.cevalEnabled(),
  propsChecked: !ctrl.ceval.wasUnloaded && !!ctrl.cevalEnabled(),
  change: ctrl.cevalEnabled,
  disabled: !ctrl.ceval.analysable
});
function getElFen(el) {
  return el.getAttribute("data-fen");
}
function getElUci(e) {
  return $(e.target).closest("div.pv").attr("data-uci") || void 0;
}
function getElPvIndex(e) {
  const moveIndex = e.target.dataset.moveIndex;
  return moveIndex === void 0 ? null : Number(moveIndex);
}
function getElUciList(e) {
  return getElPvMoves(e).filter(notNull).map((move) => move.split("|")[1]);
}
function getElPvMoves(e) {
  const pvMoves = [];
  $(e.target).closest("div.pv").children().filter("span.pv-san").each(function() {
    pvMoves.push($(this).attr("data-board"));
  });
  return pvMoves;
}
function checkHover(el, ceval) {
  requestIdleCallbackSafe(
    () => setHovering(ceval, getElFen(el), $(el).find("div.pv:hover").attr("data-uci") || void 0),
    500
  );
}
function setHovering(ceval, fen, uci) {
  ceval.hovering(fen && uci ? { fen, uci } : null);
  ceval.opts.onUciHover(ceval.hovering());
}
function renderPvs(ctrl) {
  if (!ctrl.cevalEnabled()) return void 0;
  const ceval = ctrl.ceval;
  const multiPv = ceval.search.multiPv, node = ctrl.getNode(), setup = parseFen(node.fen).unwrap();
  let pvs, threat = false, pvMoves, pvIndex = null;
  if (ctrl.threatMode() && node.threat) {
    pvs = node.threat.pvs;
    threat = true;
  } else if (node.ceval) pvs = node.ceval.pvs;
  else pvs = [];
  if (threat) {
    setup.turn = opposite(setup.turn);
    if (setup.turn === "white") setup.fullmoves += 1;
  }
  const pos = setupPosition(lichessRules(ceval.opts.variant.key), setup);
  const resetPvIndexAndBoard = () => {
    ceval.setPvBoard(null);
    pvIndex = null;
  };
  return hl(
    "div.pv_box",
    {
      attrs: { "data-fen": node.fen },
      hook: {
        ...onInsert((el) => {
          el.addEventListener("pointerdown", (e) => {
            const uciList = getElUciList(e);
            if (e.target.closest(".pv-wrap-toggle")) return;
            if (isTouchDevice()) pvIndex = getElPvIndex(e);
            if (uciList.length > (pvIndex != null ? pvIndex : 0) && !ctrl.threatMode()) {
              try {
                el.setPointerCapture(e.pointerId);
              } catch (e2) {
              }
              ctrl.playUciList(uciList.slice(0, (pvIndex != null ? pvIndex : 0) + 1));
              resetPvIndexAndBoard();
              e.preventDefault();
            }
          });
          if (isTouchDevice()) return;
          el.addEventListener("mouseover", (e) => {
            setHovering(ceval, getElFen(el), getElUci(e));
            const pvBoard = e.target.dataset.board;
            if (pvBoard) {
              pvIndex = getElPvIndex(e);
              pvMoves = getElPvMoves(e);
              const [fen, uci] = pvBoard.split("|");
              ceval.setPvBoard({ fen, uci });
            }
          });
          el.addEventListener(
            "wheel",
            stepwiseScroll(
              (e) => {
                if (pvIndex === null) return;
                if (e.deltaY < 0 && pvIndex > 0) pvIndex -= 1;
                else if (e.deltaY > 0 && pvIndex < pvMoves.length - 1) pvIndex += 1;
                const pvBoard = pvMoves[pvIndex];
                if (pvBoard) {
                  const [fen, uci] = pvBoard.split("|");
                  ceval.setPvBoard({ fen, uci });
                }
              },
              () => pvIndex === null,
              true
            )
          );
          el.addEventListener("mouseout", () => setHovering(ceval, null));
          el.addEventListener("mouseleave", resetPvIndexAndBoard);
          checkHover(el, ceval);
        }),
        postpatch: (_, vnode) => !isTouchDevice() && checkHover(vnode.elm, ceval)
      }
    },
    [
      [...Array(multiPv).keys()].map(
        (i) => renderPv(threat, multiPv, pvs[i], pos.isOk ? pos.value : void 0)
      ),
      renderPvBoard(ctrl)
    ]
  );
}
var MAX_NUM_MOVES = 16;
function renderPv(threat, multiPv, pv, pos) {
  const data = {};
  const children = [renderPvWrapToggle()];
  if (pv) {
    if (!threat) data.attrs = { "data-uci": pv.moves[0] };
    if (multiPv > 1) children.push(hl("strong", defined(pv.mate) ? "#" + pv.mate : renderEval(pv.cp)));
    if (pos) children.push(...renderPvMoves(pos.clone(), pv.moves.slice(0, MAX_NUM_MOVES)));
  }
  return hl("div.pv.pv--nowrap", data, children);
}
function renderPvWrapToggle() {
  return hl("span.pv-wrap-toggle", {
    hook: onInsert((el) => {
      for (const event of ["touchstart", "mousedown"]) {
        el.addEventListener(event, (e) => {
          e.stopPropagation();
          e.preventDefault();
          $(el).closest(".pv").toggleClass("pv--nowrap");
        });
      }
    })
  });
}
function renderPvMoves(pos, pv) {
  const vnodes = [];
  let key = makeBoardFen(pos.board);
  for (let i = 0; i < pv.length; i++) {
    let text;
    if (pos.turn === "white") text = `${pos.fullmoves}.`;
    else if (i === 0) text = `${pos.fullmoves}...`;
    if (text) vnodes.push(hl("span", { key: text }, text));
    const uci = pv[i];
    const san = makeSanAndPlay(pos, parseUci(uci));
    const fen = makeBoardFen(pos.board);
    if (san === "--") break;
    key += "|" + uci;
    vnodes.push(
      hl("span.pv-san", { key, attrs: { "data-move-index": i, "data-board": `${fen}|${uci}` } }, san)
    );
  }
  return vnodes;
}
function renderPvBoard(ctrl) {
  const ceval = ctrl.ceval;
  const pvBoard = ceval.pvBoard();
  if (!pvBoard) return void 0;
  const { fen, uci } = pvBoard;
  const orientation = ctrl.getOrientation();
  const cgConfig = {
    fen,
    lastMove: uciToMove(uci),
    orientation,
    coordinates: false,
    viewOnly: true,
    drawable: {
      enabled: false,
      visible: false
    }
  };
  const cgVNode = hl("div.cg-wrap.is2d", {
    hook: {
      insert: (vnode) => vnode.elm._cg = Chessground(vnode.elm, cgConfig),
      update: (vnode) => {
        var _a;
        return (_a = vnode.elm._cg) == null ? void 0 : _a.set(cgConfig);
      },
      destroy: (vnode) => {
        var _a;
        return (_a = vnode.elm._cg) == null ? void 0 : _a.destroy();
      }
    }
  });
  return hl("div.pv-board", hl("div.pv-board-square", cgVNode));
}
function loadingText(ctrl) {
  const d = ctrl.ceval.download;
  return (d == null ? void 0 : d.total) ? `Downloaded ${Math.round(d.bytes * 100 / d.total)}% of ${Math.round(d.total / 1e3 / 1e3)}MB` : i18n.site.loadingEngine;
}

export {
  isFirstEvalBetter,
  renderEval,
  sanIrreversible,
  povChances,
  winningChances_exports,
  CevalCtrl,
  main_exports
};
//# sourceMappingURL=lib.6Z4MCRO3.js.map
