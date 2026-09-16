import {
  notification_default
} from "./lib.IKPBOCUL.js";
import {
  boardOrientation,
  firstPly,
  init as init2,
  lastPly,
  lastStep,
  next,
  parsePossibleMoves,
  plyStep,
  prev,
  reload,
  render as render2,
  renderTable,
  sync,
  upgradeServerData,
  userTxt,
  view
} from "./lib.LHNTP3YL.js?ark-spectator-betting=2";
import {
  standaloneChat
} from "./lib.KOFCUIJ3.js";
import {
  shiftRangeAfter
} from "./lib.OGKZ2C6M.js";
import {
  makeVoiceMove,
  renderVoiceBar
} from "./lib.ZW2QUNR4.js";
import "./lib.WB3RHOLH.js";
import "./lib.E2LEIDPC.js";
import {
  toggleZenMode
} from "./lib.ZROMAH7X.js";
import {
  ClockCtrl
} from "./lib.QZCV27CJ.js";
import {
  renderBlindfoldToggle
} from "./lib.2CE2G4BN.js";
import {
  game
} from "./lib.GIUNMRJU.js";
import "./lib.LARLSDYI.js";
import {
  ctrl,
  render
} from "./lib.YN2PHZNI.js";
import {
  menuHover_default
} from "./lib.2OVDXZTI.js";
import {
  PromotionCtrl,
  promote
} from "./lib.QGZVCTIP.js";
import "./lib.OY6DQ2TE.js";
import {
  renderMaterialDiffs
} from "./lib.LG7MGGUH.js";
import {
  status
} from "./lib.5Q3MW527.js";
import "./lib.SPSB7AAJ.js";
import {
  Replay
} from "./lib.CHCAIC5O.js";
import {
  aborted,
  berserkableBy,
  bothPlayersHavePlayed,
  drawable,
  finished,
  isPlayerPlaying,
  isPlayerTurn,
  isSwitchable,
  playable,
  playedTurns,
  playing,
  rematchable,
  resignable,
  setGone,
  setOnGame
} from "./lib.67VUYMDO.js";
import {
  almostSanOf,
  readFen,
  speakable
} from "./lib.GD6YSPBF.js";
import "./lib.BMKV23O2.js";
import {
  stepwiseScroll
} from "./lib.MFOXABY3.js";
import "./lib.EAANXKAK.js";
import {
  alert,
  domDialog,
  setClockWidget
} from "./lib.MYPIOGN5.js";
import {
  plyColor,
  plyOpponentColor,
  plyToTurn
} from "./lib.LRP46MC3.js";
import "./lib.HMFK7OOB.js";
import {
  cancelDropMode,
  dragNewPiece,
  setDropMode
} from "./lib.AEOHBIQD.js";
import {
  key2pos,
  opposite,
  pos2key,
  uciToMove
} from "./lib.RPQH5UYI.js";
import "./lib.XAEDCBGD.js";
import "./lib.X7H2PLEK.js";
import {
  COLORS,
  roleToChar
} from "./lib.53PYQRAK.js";
import "./lib.CAO7TYYH.js";
import {
  wsConnect,
  wsDestroy,
  wsSign,
  wsVersion
} from "./lib.PNHYIP7B.js";
import {
  bind,
  dataIcon,
  displayColumns,
  hl,
  isTouchDevice,
  onInsert
} from "./lib.S3TIZ2HQ.js";
import {
  attributesModule,
  classModule,
  h,
  init
} from "./lib.LWF5S4ZV.js";
import {
  pubsub
} from "./lib.QPQZCXK2.js";
import {
  licon
} from "./lib.5I4BSVKX.js";
import {
  json,
  text
} from "./lib.TT4QSUKQ.js";
import {
  once,
  storage,
  storedBooleanProp,
  throttle
} from "./lib.NFSQQWN5.js";
import {
  defined,
  memoize,
  myUserId,
  requestIdleCallbackSafe,
  toggle
} from "./lib.GMEH5BEF.js";
import "./lib.KO2KTNGK.js";

// ../../../../../node_modules/.pnpm/ab@https+++codeload.github.com+lichess-org+ab-stub+tar.gz+e391b56a82b7c71e7663082a797f6fc21b18776d/node_modules/ab/round.js
function init3(round) {
}
function move(round, meta, emit) {
}

// ../lib/src/wakeLock.ts
var primerEvents = ["touchend", "pointerup", "pointerdown", "mousedown", "keydown"];
var wakeLock = null;
var keepScreenAwake = false;
function request() {
  keepScreenAwake = true;
  acquire();
}
function release() {
  keepScreenAwake = false;
  wakeLock == null ? void 0 : wakeLock.release().catch(() => {
  });
  wakeLock = null;
}
function primer() {
  if (!wakeLock && keepScreenAwake) acquire();
}
function acquire() {
  var _a;
  if ("wakeLock" in navigator)
    (_a = navigator.wakeLock) == null ? void 0 : _a.request("screen").then((sentinel) => {
      wakeLock = sentinel;
      primerEvents.forEach((e) => window.removeEventListener(e, primer, { capture: true }));
      primerEvents = [];
    }).catch(() => wakeLock = null);
}
primerEvents.forEach((e) => window.addEventListener(e, primer, { capture: true }));
document.addEventListener("visibilitychange", () => {
  if (keepScreenAwake && (!wakeLock || wakeLock.released) && !document.hidden) acquire();
  else if (document.hidden) {
    wakeLock == null ? void 0 : wakeLock.release().catch(() => {
    });
    wakeLock = null;
  }
});

// ../round/src/atomic.ts
function capture(ctrl2, key) {
  const exploding = [], diff = /* @__PURE__ */ new Map(), orig = key2pos(key), minX = Math.max(0, orig[0] - 1), maxX = Math.min(7, orig[0] + 1), minY = Math.max(0, orig[1] - 1), maxY = Math.min(7, orig[1] + 1);
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const k = pos2key([x, y]);
      if (k) {
        exploding.push(k);
        const p = ctrl2.chessground.state.pieces.get(k);
        const explodes = p && (k === key || p.role !== "pawn");
        if (explodes) diff.set(k, void 0);
      }
    }
  }
  ctrl2.chessground.setPieces(diff);
  ctrl2.chessground.explode(exploding);
}

// ../round/src/blur.ts
var lastFocus = 0;
var focusCutoff = 0;
function init4(withBlur) {
  if (!withBlur) focusCutoff = Date.now() + 1e4;
  window.addEventListener("focus", () => lastFocus = Date.now());
}
var get = () => lastFocus >= focusCutoff;
var onMove = () => focusCutoff = Date.now() + 1e3;

// ../round/src/cevalSub.ts
var found = false;
var truncateFen = (fen) => fen.split(" ")[0];
function subscribe(ctrl2) {
  var _a;
  if (ctrl2.data.opponent.ai) return;
  if (((_a = ctrl2.data.player.user) == null ? void 0 : _a.title) === "BOT") return;
  storage.fire("ceval.disable");
  storage.make("ceval.fen").listen((e) => {
    const d = ctrl2.data, step = lastStep(ctrl2.data);
    if (!found && step.ply > 14 && playedTurns(ctrl2.data) > 5 && ctrl2.isPlaying() && e.value && truncateFen(step.fen) === truncateFen(e.value)) {
      text(`/jslog/${d.game.id}${d.player.id}?n=ceval`, { method: "post" });
      found = true;
    }
  });
}
function publish(d, move2) {
  if (d.opponent.ai) storage.fire("ceval.fen", move2.fen);
}

// ../round/src/corresClock/corresClockCtrl.ts
var CorresClockController = class {
  constructor(root, data, onFlag) {
    this.root = root;
    this.data = data;
    this.onFlag = onFlag;
    this.timePercent = (color) => Math.max(0, Math.min(100, this.times[color] * this.timePercentDivisor));
    this.update = (white, black) => {
      this.times = {
        white: white * 1e3,
        black: black * 1e3,
        lastUpdate: performance.now()
      };
    };
    this.tick = (color) => {
      const now = performance.now();
      this.times[color] -= now - this.times.lastUpdate;
      this.times.lastUpdate = now;
      if (this.times[color] <= 0) this.onFlag();
    };
    this.millisOf = (color) => Math.max(0, this.times[color]);
    this.timePercentDivisor = 0.1 / data.increment;
    this.update(data.white, data.black);
    this.ticker = setInterval(() => {
      if (!root.data.correspondence || !root.corresClock) return clearInterval(this.ticker);
      this.tick(root.data.game.player);
      root.redraw();
    }, 1e3);
  }
};

// ../round/src/crazy/crazyCtrl.ts
var pieceRoles = ["pawn", "knight", "bishop", "rook", "queen"];
function drag(ctrl2, e) {
  if (e.button !== void 0 && e.button !== 0) return;
  if (ctrl2.replaying() || !ctrl2.isPlaying()) return;
  const el = e.target, role = el.getAttribute("data-role"), color = el.getAttribute("data-color"), number = el.getAttribute("data-nb");
  if (!role || !color || number === "0") return;
  e.stopPropagation();
  e.preventDefault();
  dragNewPiece(ctrl2.chessground.state, { color, role }, e);
}
var dropWithKey = false;
var dropWithDrag = false;
var mouseIconsLoaded = false;
function valid(data, role, key) {
  if (crazyKeys.length === 0) dropWithDrag = true;
  else {
    dropWithKey = true;
    if (!mouseIconsLoaded) preloadMouseIcons(data);
  }
  if (!isPlayerTurn(data)) return false;
  if (role === "pawn" && (key[1] === "1" || key[1] === "8")) return false;
  const dropStr = data.possibleDrops;
  if (typeof dropStr === "undefined" || dropStr === null) return true;
  const drops = dropStr.match(/.{2}/g);
  return !!(drops == null ? void 0 : drops.includes(key));
}
function onEnd() {
  const store = storage.make("crazyKeyHist");
  if (dropWithKey) store.set(10);
  else if (dropWithDrag) {
    const cur = parseInt(store.get());
    if (cur > 0 && cur <= 10) store.set(cur - 1);
    else if (cur !== 0) store.set(3);
  }
}
var crazyKeys = [];
function init5(ctrl2) {
  const k = site.mousetrap;
  let activeCursor;
  const setDrop = () => {
    if (activeCursor) document.body.classList.remove(activeCursor);
    if (crazyKeys.length > 0) {
      const role = pieceRoles[crazyKeys[crazyKeys.length - 1] - 1], color = ctrl2.data.player.color, crazyData = ctrl2.data.crazyhouse;
      if (!crazyData) return;
      const nb = crazyData.pockets[color === "white" ? 0 : 1][role];
      setDropMode(ctrl2.chessground.state, nb ? { color, role } : void 0);
      activeCursor = `cursor-${color}-${role}`;
      document.body.classList.add(activeCursor);
    } else {
      cancelDropMode(ctrl2.chessground.state);
      activeCursor = void 0;
    }
  };
  pubsub.on("ply", () => {
    if (crazyKeys.length > 0) setDrop();
  });
  for (let i = 1; i <= 5; i++) {
    const iStr = i.toString();
    k.bind(iStr, () => {
      if (!crazyKeys.includes(i)) {
        crazyKeys.push(i);
        setDrop();
      }
    }).bind(
      iStr,
      () => {
        const idx = crazyKeys.indexOf(i);
        if (idx !== -1) {
          crazyKeys.splice(idx, 1);
          if (idx === crazyKeys.length) {
            setDrop();
          }
        }
      },
      "keyup"
    );
  }
  const resetKeys = () => {
    if (crazyKeys.length > 0) {
      crazyKeys.length = 0;
      setDrop();
    }
  };
  window.addEventListener("blur", resetKeys);
  window.addEventListener(
    "focus",
    (e) => {
      if (e.target.localName === "input") resetKeys();
    },
    { capture: true }
  );
  if (storage.get("crazyKeyHist") !== "0") preloadMouseIcons(ctrl2.data);
}
function preloadMouseIcons(data) {
  const colorKey = data.player.color[0];
  for (const pKey of "PNBRQ") fetch(site.asset.url(`piece/cburnett/${colorKey}${pKey}.svg`));
  mouseIconsLoaded = true;
}

// ../round/src/xhr.ts
var reload2 = (d) => {
  const url = d.player.spectator ? `/${d.game.id}/${d.player.color}` : `/${d.game.id}${d.player.id}`;
  return json(url);
};
var whatsNext = (ctrl2) => json(`/whats-next/${ctrl2.data.game.id}${ctrl2.data.player.id}`);
var challengeRematch = (gameId) => json("/challenge/rematch-of/" + gameId, {
  method: "post"
});

// ../round/src/moveOn.ts
var MoveOn = class {
  constructor(ctrl2, key) {
    this.ctrl = ctrl2;
    this.key = key;
    this.storage = storage.boolean(this.key);
    this.toggle = () => {
      this.storage.toggle();
      this.next(true);
    };
    this.get = this.storage.get;
    this.redirect = (href) => {
      this.ctrl.setRedirecting();
      window.location.href = href;
    };
    this.next = (force) => {
      const d = this.ctrl.data;
      if (d.player.spectator || !isSwitchable(d) || isPlayerTurn(d) || !this.get()) return;
      if (force) this.redirect("/round-next/" + d.game.id);
      else if (d.simul) {
        if (d.simul.hostId === this.ctrl.opts.userId && d.simul.nbPlaying > 1)
          this.redirect("/round-next/" + d.game.id);
      } else
        whatsNext(this.ctrl).then((data) => {
          if (data.next) this.redirect("/" + data.next);
        });
    };
  }
};

// ../round/src/server.ts
var Server = class {
  constructor(getData) {
    this.getData = getData;
    this.alive = () => {
      if (this.scheduledCheck) {
        clearTimeout(this.scheduledCheck);
        this.scheduledCheck = void 0;
      }
    };
    this.onServerRestart = () => {
      const wait = (12 + Math.random() * 15) * 1e3;
      this.scheduledCheck = setTimeout(this.checkForDesync, wait);
    };
    this.checkForDesync = () => {
      const d = this.getData();
      if (d.game.player !== d.player.color) {
        reload2(d).then((n) => {
          if (isPlayerTurn(n)) site.reload("Server desync detected");
        }, this.onServerRestart);
      }
    };
    if (isPlayerPlaying(this.getData())) pubsub.on("socket.in.serverRestart", this.onServerRestart);
  }
};

// ../round/src/socket.ts
function backoff(delay, factor, callback) {
  let timer;
  let lastExec = 0;
  return function(...args) {
    const self = this;
    const elapsed = performance.now() - lastExec;
    const exec = () => {
      timer = void 0;
      lastExec = performance.now();
      delay *= factor;
      callback.apply(self, args);
    };
    if (timer) clearTimeout(timer);
    if (elapsed > delay) exec();
    else timer = setTimeout(exec, delay - elapsed);
  };
}
function make(send, ctrl2) {
  wsSign(ctrl2.sign);
  const reload3 = (o, isRetry) => {
    if (o == null ? void 0 : o.t) {
      ctrl2.setLoading(false);
      handlers[o.t](o.d);
    } else
      reload2(ctrl2.data).then((data) => {
        const version = wsVersion();
        if (version !== false && version > data.player.version) {
          if (isRetry) site.reload();
          else reload3(o, true);
        } else ctrl2.reload(data);
      }, site.reload);
  };
  const handlers = {
    takebackOffers(o) {
      ctrl2.data.player.proposingTakeback = o[ctrl2.data.player.color];
      const fromOp = ctrl2.data.opponent.proposingTakeback = o[ctrl2.data.opponent.color];
      if (fromOp) ctrl2.opponentRequest("takeback", i18n.site.yourOpponentProposesATakeback);
      ctrl2.redraw();
    },
    move: ctrl2.apiMove,
    drop: ctrl2.apiMove,
    reload: reload3,
    redirect: ctrl2.setRedirecting,
    clockInc(o) {
      if (ctrl2.clock) {
        ctrl2.clock.addTime(o.color, o.time);
        ctrl2.redraw();
      }
    },
    cclock(o) {
      if (ctrl2.corresClock) {
        ctrl2.data.correspondence.white = o.white;
        ctrl2.data.correspondence.black = o.black;
        ctrl2.corresClock.update(o.white, o.black);
        ctrl2.redraw();
      }
    },
    crowd(o) {
      COLORS.forEach((c) => {
        if (defined(o[c])) setOnGame(ctrl2.data, c, o[c]);
      });
      ctrl2.redraw();
    },
    endData: ctrl2.endWithData,
    rematchOffer(by) {
      ctrl2.data.player.offeringRematch = by === ctrl2.data.player.color;
      if (ctrl2.data.opponent.offeringRematch = by === ctrl2.data.opponent.color)
        ctrl2.opponentRequest("rematch", i18n.site.yourOpponentWantsToPlayANewGameWithYou);
      ctrl2.redraw();
    },
    rematchTaken(nextId) {
      ctrl2.data.game.rematch = nextId;
      if (!ctrl2.data.player.spectator) ctrl2.setLoading(true);
      else ctrl2.redraw();
    },
    drawOffer(by) {
      if (ctrl2.isPlaying()) {
        ctrl2.data.player.offeringDraw = by === ctrl2.data.player.color;
        const fromOp = ctrl2.data.opponent.offeringDraw = by === ctrl2.data.opponent.color;
        if (fromOp) ctrl2.opponentRequest("draw", i18n.site.yourOpponentOffersADraw);
      }
      if (by) {
        let ply = ctrl2.lastPly();
        if (by === plyColor(ply)) ply++;
        ctrl2.data.game.drawOffers = (ctrl2.data.game.drawOffers || []).concat([ply]);
      }
      ctrl2.redraw();
    },
    berserk(color) {
      ctrl2.setBerserk(color);
    },
    gone: ctrl2.setGone,
    goneIn: ctrl2.setGone,
    checkCount(e) {
      ctrl2.data.player.checks = ctrl2.data.player.color === "white" ? e.white : e.black;
      ctrl2.data.opponent.checks = ctrl2.data.opponent.color === "white" ? e.white : e.black;
      ctrl2.redraw();
    },
    simulPlayerMove(gameId) {
      if (ctrl2.opts.userId && ctrl2.data.simul && ctrl2.opts.userId === ctrl2.data.simul.hostId && gameId !== ctrl2.data.game.id && ctrl2.moveOn.get() && !isPlayerTurn(ctrl2.data)) {
        ctrl2.setRedirecting();
        site.sound.play("move");
        location.href = "/" + gameId;
      }
    },
    simulEnd(simul) {
      domDialog({
        easyClose: "clickOutside",
        htmlText: `<div><p>Simul complete!</p><br /><br /><a class="button" href="/simul/${simul.id}">Back to ${simul.name} simul</a></div>`
      });
    }
  };
  pubsub.on("ab.rep", (n) => send("rep", { n }));
  return {
    send,
    handlers,
    moreTime: throttle(300, () => send("moretime")),
    outoftime: backoff(500, 1.1, () => send("flag", ctrl2.data.game.player)),
    berserk: throttle(200, () => send("berserk", void 0, { ackable: true })),
    sendLoading(typ) {
      ctrl2.setLoading(true);
      send(typ);
    },
    receive(typ, data) {
      const handler = handlers[typ];
      if (handler) {
        handler(data);
        return true;
      }
      return false;
    },
    reload: reload3
  };
}

// ../round/src/title.ts
var initialTitle = document.title;
var curFaviconIdx = 0;
var F = ["/assets/logo/lichess-favicon.svg", "/assets/logo/lichess-favicon-invert.svg"].map(
  (path, i) => () => {
    if (curFaviconIdx !== i) {
      document.getElementById("favicon").href = path;
      curFaviconIdx = i;
    }
  }
);
var tickerTimer;
function resetTicker() {
  if (tickerTimer) clearTimeout(tickerTimer);
  tickerTimer = void 0;
  F[0]();
}
function startTicker() {
  function tick() {
    if (!document.hasFocus()) {
      F[1 - curFaviconIdx]();
      tickerTimer = setTimeout(tick, 1e3);
    }
  }
  if (!tickerTimer) tickerTimer = setTimeout(tick, 200);
}
var init6 = () => window.addEventListener("focus", resetTicker);
function set(ctrl2) {
  if (ctrl2.data.player.spectator) return;
  let text2 = "";
  if (aborted(ctrl2.data) || finished(ctrl2.data)) {
    text2 = i18n.site.gameOver;
  } else if (isPlayerTurn(ctrl2.data)) {
    text2 = i18n.site.yourTurn;
    if (!document.hasFocus()) startTicker();
  } else {
    text2 = i18n.site.waitingForOpponent;
    resetTicker();
  }
  document.title = `${text2} - ${initialTitle}`;
}

// ../round/src/transientMove.ts
var TransientMove = class {
  constructor(socket) {
    this.socket = socket;
    this.current = void 0;
    this.register = () => {
      this.current = setTimeout(this.expire, 1e4);
    };
    this.clear = () => {
      if (this.current) clearTimeout(this.current);
    };
    this.expire = () => {
      this.socket.reload();
    };
  }
};

// ../round/src/crazy/crazyView.ts
var eventNames = ["mousedown", "touchstart"];
function pocket(ctrl2, color, position) {
  const step = plyStep(ctrl2.data, ctrl2.ply);
  if (!step.crazy) return void 0;
  const droppedRole = ctrl2.justDropped, preDropRole = ctrl2.preDrop, pocket2 = step.crazy.pockets[color === "white" ? 0 : 1], usablePos = position === (ctrl2.flip ? "top" : "bottom"), usable = usablePos && !ctrl2.replaying() && ctrl2.isPlaying(), activeColor = color === ctrl2.data.player.color;
  const capturedPiece = ctrl2.justCaptured;
  const captured = capturedPiece && (capturedPiece.promoted ? "pawn" : capturedPiece.role);
  return h(
    "div.pocket.is2d.pocket-" + position,
    {
      class: { usable },
      hook: onInsert(
        (el) => eventNames.forEach(
          (name) => el.addEventListener(name, (e) => {
            if (position === (ctrl2.flip ? "top" : "bottom") && crazyKeys.length === 0) drag(ctrl2, e);
          })
        )
      )
    },
    pieceRoles.map((role) => {
      let nb = pocket2[role] || 0;
      if (activeColor) {
        if (droppedRole === role) nb--;
        if (captured === role) nb++;
      }
      return h(
        "div.pocket-c1",
        h(
          "div.pocket-c2",
          h("piece." + role + "." + color, {
            class: { premove: activeColor && preDropRole === role },
            attrs: { "data-role": role, "data-color": color, "data-nb": nb }
          })
        )
      );
    })
  );
}

// ../round/src/view/main.ts
function main(ctrl2) {
  const d = ctrl2.data, topColor = d[ctrl2.flip ? "player" : "opponent"].color, bottomColor = d[ctrl2.flip ? "opponent" : "player"].color, pending = ctrl2.pendingStep(), materialDiffs = renderMaterialDiffs(
    ctrl2.data.pref.showCaptured,
    ctrl2.flip ? ctrl2.data.opponent.color : ctrl2.data.player.color,
    pending ? pending.fen : ctrl2.stepAt(ctrl2.ply).fen,
    !!(ctrl2.data.player.checks || ctrl2.data.opponent.checks),
    // showChecks
    ctrl2.data.steps,
    ctrl2.ply
  );
  const hideBoard = ctrl2.data.player.blindfold && playable(ctrl2.data);
  return ctrl2.nvui ? ctrl2.nvui.render() : hl(
    "div.round__app.variant-" + d.game.variant.key,
    {
      class: {
        "swap-clock": isTouchDevice() && displayColumns() === 1 && storage.boolean("swapClock").get()
      }
    },
    [
      renderBlindfoldToggle(ctrl2.blindfold),
      hl(
        "div.round__app__board.main-board" + (hideBoard ? ".blindfold" : ""),
        {
          hook: "ontouchstart" in window || !storage.boolean("scrollMoves").getOrDefault(true) ? void 0 : bind(
            "wheel",
            stepwiseScroll(
              (e) => {
                if (e.deltaY > 0) next(ctrl2);
                else if (e.deltaY < 0) prev(ctrl2);
                ctrl2.redraw();
              },
              () => ctrl2.isPlaying()
            ),
            void 0,
            false
          )
        },
        [render2(ctrl2), ctrl2.promotion.view(ctrl2.data.game.variant.key === "antichess")]
      ),
      ctrl2.voiceMove && renderVoiceBar(ctrl2.voiceMove.ctrl, ctrl2.redraw),
      ctrl2.keyboardHelp && view(ctrl2),
      pocket(ctrl2, topColor, "top") || materialDiffs[0],
      renderTable(ctrl2),
      pocket(ctrl2, bottomColor, "bottom") || materialDiffs[1],
      ctrl2.keyboardMove && render(ctrl2.keyboardMove)
    ]
  );
}
function endGameView() {
  const $body = $("body");
  if ($body.hasClass("zen-auto") && $body.hasClass("zen")) {
    $body.toggleClass("zen");
    window.dispatchEvent(new Event("resize"));
  }
}

// ../round/src/ctrl.ts
var RoundController = class {
  constructor(opts, redraw) {
    this.opts = opts;
    this.redraw = redraw;
    this.firstSeconds = true;
    this.flip = false;
    this.loading = false;
    this.redirecting = false;
    this.goneBerserk = {};
    this.resignConfirm = void 0;
    this.drawConfirm = void 0;
    this.preventDrawOffer = void 0;
    // will be replaced by view layer
    this.autoScroll = () => {
    };
    this.shouldSendMoveTime = false;
    this.sign = Math.random().toString(36);
    this.keyboardHelp = location.hash === "#keyboard";
    this.vibration = storedBooleanProp("vibration", false);
    this.showExpiration = () => {
      if (!this.data.expiration) return;
      this.redraw();
      setTimeout(this.showExpiration, 250);
    };
    this.onUserMove = (orig, dest, meta) => {
      var _a;
      if (!((_a = this.keyboardMove) == null ? void 0 : _a.usedSan) && !this.opts.noab) move(this, meta, pubsub.emit);
      if (!this.startPromotion(orig, dest, meta)) this.sendMove(orig, dest, void 0, meta);
    };
    this.onUserNewPiece = (role, key, meta) => {
      if (!this.replaying() && valid(this.data, role, key)) {
        this.sendNewPiece(role, key, !!meta.predrop);
      } else this.jump(this.ply);
    };
    this.onMove = (orig, dest, captured) => {
      if (captured || this.enpassant(orig, dest)) {
        if (this.data.game.variant.key === "atomic") {
          site.sound.play("explosion");
          capture(this, dest);
        } else site.sound.move({ name: "capture", filter: "game" });
      } else site.sound.move({ name: "move", filter: "game" });
    };
    this.startPromotion = (orig, dest, meta) => {
      var _a, _b;
      return this.promotion.start(
        orig,
        dest,
        {
          submit: (orig2, dest2, role) => this.sendMove(orig2, dest2, role, meta),
          show: (_a = this.voiceMove) == null ? void 0 : _a.promotionHook()
        },
        meta,
        (_b = this.keyboardMove) == null ? void 0 : _b.justSelected()
      );
    };
    this.onPremove = (orig, dest, meta) => this.startPromotion(orig, dest, meta);
    this.onCancelPremove = () => this.promotion.cancelPrePromotion();
    this.onNewPiece = (piece, key) => {
      if (piece.role === "pawn" && (key[1] === "1" || key[1] === "8")) return;
      site.sound.move();
    };
    this.onPredrop = (role) => {
      this.preDrop = role;
      this.redraw();
    };
    this.isSimulHost = () => this.data.simul && this.data.simul.hostId === this.opts.userId;
    this.enpassant = (orig, dest) => {
      var _a;
      if (dest.startsWith(orig[0]) || ((_a = this.chessground.state.pieces.get(dest)) == null ? void 0 : _a.role) !== "pawn") return false;
      const pos = dest[0] + orig[1];
      this.chessground.setPieces(/* @__PURE__ */ new Map([[pos, void 0]]));
      return true;
    };
    this.lastPly = () => lastPly(this.data);
    this.makeCgHooks = () => ({
      onUserMove: this.onUserMove,
      onUserNewPiece: this.onUserNewPiece,
      onMove: this.data.local ? void 0 : this.onMove,
      onNewPiece: this.onNewPiece,
      onPremove: this.onPremove,
      onCancelPremove: this.onCancelPremove,
      onPredrop: this.onPredrop
    });
    this.replaying = () => this.ply !== this.lastPly() && !this.data.local;
    this.userJump = (ply) => {
      this.toSubmit = void 0;
      this.promotion.dismiss();
      this.chessground.selectSquare(null);
      if (ply !== this.ply && this.jump(ply)) site.sound.saySan(this.stepAt(this.ply).san, true);
      else this.redraw();
    };
    this.userJumpPlyDelta = (plyDelta) => this.userJump(this.ply + plyDelta);
    this.isPlaying = () => isPlayerPlaying(this.data);
    this.jump = (ply) => {
      ply = Math.max(firstPly(this.data), Math.min(this.lastPly(), ply));
      const isForwardStep = ply === this.ply + 1;
      this.ply = ply;
      this.justDropped = void 0;
      this.preDrop = void 0;
      const s = this.stepAt(ply), config = {
        fen: s.fen,
        lastMove: uciToMove(s.uci),
        check: !!s.check,
        turnColor: plyColor(this.ply)
      };
      this.promotion.dismiss();
      if (this.replaying()) this.chessground.stop();
      else
        config.movable = {
          color: this.isPlaying() ? this.data.player.color : void 0,
          dests: parsePossibleMoves(this.data.possibleMoves)
        };
      this.chessground.cancelMove();
      this.chessground.set(config);
      if (s.san && isForwardStep) site.sound.move(s);
      this.autoScroll();
      pubsub.emit("ply", ply);
      this.pluginUpdate(s.fen);
      return true;
    };
    this.canMove = () => !this.replaying() && this.data.player.color === this.chessground.state.turnColor;
    this.replayEnabledByPref = () => {
      const d = this.data;
      return d.pref.replay === Replay.Always || d.pref.replay === Replay.OnlySlowGames && (d.game.speed === "classical" || d.game.speed === "correspondence");
    };
    this.isLate = () => this.replaying() && playing(this.data);
    this.playerAt = (position) => this.flip !== (position === "top") ? this.data.opponent : this.data.player;
    this.flipNow = () => {
      this.flip = !this.nvui && !this.flip;
      this.chessground.set({
        orientation: boardOrientation(this.data, this.flip)
      });
      pubsub.emit("flip", this.flip);
      this.redraw();
    };
    this.setTitle = () => set(this);
    this.actualSendMove = (tpe, data, meta = { premove: false }) => {
      var _a;
      const socketOpts = {
        sign: this.sign,
        ackable: true
      };
      if (this.clock) {
        socketOpts.withLag = !this.shouldSendMoveTime || !this.clock.isRunning();
        if (meta.premove && this.shouldSendMoveTime) {
          this.clock.hardStopClock();
          socketOpts.millis = 0;
        } else {
          const moveMillis = this.clock.stopClock();
          if (moveMillis !== void 0 && this.shouldSendMoveTime) {
            socketOpts.millis = moveMillis;
          }
        }
      }
      this.socket.send(tpe, data, socketOpts);
      this.justDropped = meta.justDropped;
      this.justCaptured = meta.justCaptured;
      this.preDrop = void 0;
      (_a = this.transientMove) == null ? void 0 : _a.register();
      this.redraw();
    };
    this.pluginMove = (orig, dest, role, preConfirmed) => {
      if (!role) {
        this.chessground.move(orig, dest);
        this.chessground.state.movable.dests = void 0;
        this.chessground.state.turnColor = opposite(this.chessground.state.turnColor);
        if (this.startPromotion(orig, dest, { premove: false })) return;
      }
      this.sendMove(orig, dest, role, { premove: false, preConfirmed });
    };
    this.pluginUpdate = (fen) => {
      var _a, _b;
      (_a = this.voiceMove) == null ? void 0 : _a.update({ fen, canMove: this.canMove() });
      (_b = this.keyboardMove) == null ? void 0 : _b.update({ fen, canMove: this.canMove() });
    };
    this.sendMove = (orig, dest, prom, meta) => {
      const move2 = { u: orig + dest };
      if (prom) move2.u += prom === "knight" ? "n" : prom[0];
      if (get()) move2.b = 1;
      this.resign(false);
      if (!meta.preConfirmed && this.confirmMoveToggle() && !meta.premove) {
        if (site.sound.speech()) {
          const spoken = `${speakable(almostSanOf(readFen(this.stepAt(this.ply).fen), move2.u))}. confirm?`;
          site.sound.say(spoken, false, true);
        }
        this.toSubmit = move2;
        this.redraw();
        return;
      }
      this.actualSendMove("move", move2, { justCaptured: meta.captured, premove: meta.premove });
    };
    this.sendNewPiece = (role, key, isPredrop) => {
      const drop = { role, pos: key };
      if (get()) drop.b = 1;
      this.resign(false);
      if (this.confirmMoveToggle() && !isPredrop) {
        this.toSubmit = drop;
        this.redraw();
      } else {
        this.actualSendMove("drop", drop, {
          justDropped: role,
          premove: isPredrop
        });
      }
    };
    this.showYourMoveNotification = () => {
      if (this.data.local) return;
      const d = this.data;
      const opponent = $("body").hasClass("zen") ? "Your opponent" : userTxt(d.opponent);
      const joined = `${opponent}
joined the game.`;
      if (isPlayerTurn(d))
        notification_default(() => {
          let txt = i18n.site.yourTurn;
          if (this.ply < 1) txt = `${joined}
${txt}`;
          else {
            let move2 = lastStep(this.data).san;
            const turn = plyToTurn(this.ply);
            move2 = `${turn}${this.ply % 2 === 1 ? "." : "..."} ${move2}`;
            txt = `${opponent}
played ${move2}.
${txt}`;
          }
          return txt;
        });
      else if (this.isPlaying() && this.ply < 1) notification_default(joined);
    };
    this.playerByColor = (c) => this.data[c === this.data.player.color ? "player" : "opponent"];
    this.apiMove = (o) => {
      var _a, _b, _c, _d;
      const d = this.data;
      const playing2 = this.isPlaying();
      d.game.turns = o.ply;
      d.game.player = plyColor(o.ply);
      const playedColor = plyOpponentColor(o.ply);
      const activeColor = d.player.color === d.game.player;
      if (o.status) d.game.status = o.status;
      if (o.winner) d.game.winner = o.winner;
      this.playerByColor("white").offeringDraw = o.wDraw;
      this.playerByColor("black").offeringDraw = o.bDraw;
      d.possibleMoves = activeColor ? o.dests : void 0;
      d.possibleDrops = activeColor ? o.drops : void 0;
      d.crazyhouse = o.crazyhouse;
      this.setTitle();
      if (!this.replaying()) {
        this.ply++;
        if (o.role)
          this.chessground.newPiece(
            {
              role: o.role,
              color: playedColor
            },
            o.uci.slice(2, 4)
          );
        else {
          const keys = uciToMove(o.uci), pieces = this.chessground.state.pieces;
          if (!o.castle || ((_a = pieces.get(o.castle.king[0])) == null ? void 0 : _a.role) === "king" && ((_b = pieces.get(o.castle.rook[0])) == null ? void 0 : _b.role) === "rook") {
            this.chessground.move(keys[0], keys[1]);
          }
        }
        if (o.promotion) promote(this.chessground, o.promotion.key, o.promotion.pieceClass);
        this.chessground.set({
          turnColor: d.game.player,
          movable: {
            dests: playing2 ? parsePossibleMoves(d.possibleMoves) : /* @__PURE__ */ new Map()
          },
          check: !!o.check
        });
        if (this.googlyEyes) this.chessground.setAutoShapes(this.googlyEyes());
        if (((_c = o.status) == null ? void 0 : _c.name) === "mate") {
          site.sound.play("checkmate", o.volume);
        } else if (o.check) {
          site.sound.play("check", o.volume);
        }
        onMove();
        pubsub.emit("ply", this.ply);
      }
      d.game.threefold = !!o.threefold;
      d.game.fiftyMoves = !!o.fiftyMoves;
      const step = {
        ply: this.lastPly() + 1,
        fen: o.fen,
        san: o.san,
        uci: o.uci,
        check: o.check,
        crazy: o.crazyhouse
      };
      d.steps.push(step);
      if (this.ply === step.ply && this.chessground.getFen() !== step.fen) sync(this, step, playing2);
      this.justDropped = void 0;
      this.justCaptured = void 0;
      setOnGame(d, playedColor, true);
      this.data.forecastCount = void 0;
      if (o.clock) {
        this.shouldSendMoveTime = true;
        const oc = o.clock, delay = playing2 && activeColor ? 0 : oc.lag || 1;
        if (this.clock)
          this.clock.setClock({
            white: oc.white,
            black: oc.black,
            ticking: this.tickingClockColor(),
            delay
          });
        else if (this.corresClock) this.corresClock.update(oc.white, oc.black);
      }
      if (this.data.expiration) {
        if (this.data.steps.length > 2) this.data.expiration = void 0;
        else this.data.expiration.movedAt = Date.now();
      }
      this.redraw();
      if (playing2 && playedColor === d.player.color) {
        (_d = this.transientMove) == null ? void 0 : _d.clear();
        this.moveOn.next();
        publish(d, o);
      }
      if (!this.replaying() && playedColor !== d.player.color) {
        if (this.vibration() && "vibrate" in navigator) navigator.vibrate(100);
        const premoveDelay = d.game.variant.key === "atomic" ? 100 : 1;
        const premovePly = this.ply;
        const premoveFen = step.fen;
        setTimeout(() => {
          if (this.ply !== premovePly || this.stepAt(this.ply).fen !== premoveFen) return;
          if (this.nvui) this.nvui.playPremove();
          else if (!this.chessground.playPremove() && !this.playPredrop()) {
            this.promotion.cancel();
            this.showYourMoveNotification();
          }
        }, premoveDelay);
      }
      this.autoScroll();
      this.onChange();
      this.pluginUpdate(step.fen);
      if (!this.data.local) site.sound.move({ ...o, filter: "music" });
      site.sound.saySan(step.san);
      this.server.alive();
      return true;
    };
    this.crazyValid = (role, key) => valid(this.data, role, key);
    this.getCrazyhousePockets = () => {
      var _a;
      return (_a = this.data.crazyhouse) == null ? void 0 : _a.pockets;
    };
    this.playPredrop = () => {
      return this.chessground.playPredrop((drop) => {
        return valid(this.data, drop.role, drop.key);
      });
    };
    this.reload = (d) => {
      const posChanged = d.steps.length !== this.data.steps.length;
      if (posChanged) this.ply = lastPly(d);
      upgradeServerData(d);
      this.data = d;
      this.clearJust();
      this.shouldSendMoveTime = false;
      this.updateClockCtrl();
      if (this.clock)
        this.clock.setClock({
          white: d.clock.white,
          black: d.clock.black,
          ticking: this.tickingClockColor()
        });
      if (this.corresClock) this.corresClock.update(d.correspondence.white, d.correspondence.black);
      if (posChanged || !this.replaying()) reload(this);
      if (posChanged) this.chessground.cancelPremove();
      this.setTitle();
      this.moveOn.next();
      this.setQuietMode();
      this.redraw();
      this.autoScroll();
      this.onChange();
      this.setLoading(false);
      this.pluginUpdate(lastStep(this.data).fen);
    };
    this.endWithData = (o) => {
      const d = this.data;
      d.game.winner = o.winner;
      d.game.status = o.status;
      d.game.abortedBy = o.abortedBy;
      d.game.boosted = o.boosted;
      d.player.blindfold = false;
      this.userJump(this.lastPly());
      d.game.fen = lastStep(this.data).fen;
      if (o.status.name === "outoftime" && d.player.color !== o.winner && this.chessground.state.turnColor === d.opponent.color) {
        this.reload(d);
      }
      this.promotion.cancel();
      this.chessground.stop();
      if (o.ratingDiff) {
        d.player.ratingDiff = o.ratingDiff[d.player.color];
        d.opponent.ratingDiff = o.ratingDiff[d.opponent.color];
      }
      if (!d.player.spectator && d.game.turns > 1) {
        shiftRangeAfter(d);
        const key = o.winner ? d.player.color === o.winner ? "victory" : "defeat" : "draw";
        if (o.status.name === "mate") site.sound.playAndDelayMateResultIfNecessary(key);
        else site.sound.play(key);
      }
      this.onTimeTrouble(false);
      endGameView();
      if (d.crazyhouse) onEnd();
      this.clearJust();
      this.setTitle();
      this.moveOn.next();
      this.setQuietMode();
      this.setLoading(false);
      if (this.clock && o.clock)
        this.clock.setClock({
          white: o.clock.wc * 0.01,
          black: o.clock.bc * 0.01,
          ticking: void 0
        });
      this.redraw();
      this.autoScroll();
      this.onChange();
      if (d.tv) setTimeout(site.reload, 1e4);
      release();
      if (this.data.game.status.name === "started") site.sound.saySan(this.stepAt(this.ply).san, false);
      else site.sound.say(status(this.data), false, false, true);
      this.server.alive();
      if (!d.player.spectator && o.status.name === "outoftime" && this.chessground.state.turnColor === d.opponent.color) {
        notification_default(status(this.data));
      }
    };
    this.challengeRematch = async () => {
      if (this.data.game.id !== "synthetic") await challengeRematch(this.data.game.id);
      pubsub.emit("challenge-app.open");
      if (once("rematch-challenge")) {
        setTimeout(async () => {
          const [tour] = await Promise.all([
            site.asset.loadEsm("round.tour"),
            site.asset.loadCssPath("bits.shepherd")
          ]);
          tour.corresRematchOffline();
        }, 1e3);
      }
    };
    this.makeClockOpts = () => ({
      onFlag: this.socket.outoftime,
      bothPlayersHavePlayed: () => bothPlayersHavePlayed(this.data),
      hasGoneBerserk: this.hasGoneBerserk,
      alarmColor: this.data.simul || this.data.player.spectator || !this.data.pref.clockSound ? void 0 : this.data.player.color
    });
    this.tickingClockColor = () => {
      var _a;
      return playable(this.data) && (playedTurns(this.data) > 1 || ((_a = this.data.clock) == null ? void 0 : _a.running)) ? this.data.game.player : void 0;
    };
    this.setQuietMode = () => {
      const was = site.quietMode;
      const is = this.isPlaying();
      if (was !== is) {
        site.quietMode = is;
        $("body").toggleClass(
          "no-select",
          is && this.clock && this.clock.millisOf(this.data.player.color) <= 3e5
        );
      }
    };
    this.question = () => {
      var _a;
      if (this.toSubmit) {
        setTimeout(() => {
          var _a2;
          return (_a2 = this.voiceMove) == null ? void 0 : _a2.listenForResponse("submitMove", this.submitMove);
        });
        return {
          prompt: i18n.site.confirmMove,
          yes: { action: () => this.submitMove(true) },
          no: { action: () => this.submitMove(false), text: i18n.site.cancel }
        };
      } else if (this.data.player.proposingTakeback) {
        (_a = this.voiceMove) == null ? void 0 : _a.listenForResponse("cancelTakeback", this.cancelTakebackPreventDraws);
        return {
          prompt: i18n.site.takebackPropositionSent,
          no: { action: this.cancelTakebackPreventDraws, text: i18n.site.cancel }
        };
      } else if (this.data.player.offeringDraw) return { prompt: i18n.site.drawOfferSent };
      else if (this.data.opponent.offeringDraw)
        return {
          prompt: i18n.site.yourOpponentOffersADraw,
          yes: { action: () => this.socket.send("draw-yes"), icon: licon.OneHalf },
          no: { action: () => this.socket.send("draw-no") }
        };
      else if (this.data.opponent.proposingTakeback)
        return {
          prompt: i18n.site.yourOpponentProposesATakeback,
          yes: { action: this.takebackYes, icon: licon.Back },
          no: { action: () => this.socket.send("takeback-no") }
        };
      else if (this.voiceMove) return this.voiceMove.question();
      else return false;
    };
    this.takebackYes = () => {
      this.socket.sendLoading("takeback-yes");
      this.chessground.cancelPremove();
      this.promotion.cancel();
    };
    this.resign = (v, immediately) => {
      if (v) {
        if (this.resignConfirm || !this.data.pref.confirmResign || immediately) {
          this.socket.sendLoading("resign");
          clearTimeout(this.resignConfirm);
        } else {
          this.resignConfirm = setTimeout(() => this.resign(false), 3e3);
        }
        this.redraw();
      } else if (this.resignConfirm) {
        clearTimeout(this.resignConfirm);
        this.resignConfirm = void 0;
        this.redraw();
      }
    };
    this.hasGoneBerserk = (color) => !!this.goneBerserk[color];
    this.goBerserk = () => {
      if (berserkableBy(this.data) && !this.hasGoneBerserk(this.data.player.color)) {
        this.socket.berserk();
        site.sound.play("berserk");
      }
    };
    this.setBerserk = (color) => {
      if (this.goneBerserk[color]) return;
      this.goneBerserk[color] = true;
      if (color !== this.data.player.color) site.sound.play("berserk");
      this.redraw();
      $(`<icon data-icon="${licon.Berserk}">`).appendTo($(`.game__meta .player.${color} .user-link`));
    };
    this.setLoading = (v, duration = 1500) => {
      clearTimeout(this.loadingTimeout);
      if (v) {
        this.loading = true;
        this.loadingTimeout = setTimeout(() => {
          this.loading = false;
          this.redraw();
        }, duration);
        this.redraw();
      } else if (this.loading) {
        this.loading = false;
        this.redraw();
      }
    };
    this.setRedirecting = () => {
      this.redirecting = true;
      site.unload.expected = true;
      setTimeout(() => {
        this.redirecting = false;
        this.redraw();
      }, 2500);
      this.redraw();
    };
    this.submitMove = (v) => {
      if (!this.toSubmit) return;
      const submit = this.toSubmit;
      this.toSubmit = void 0;
      this.setLoading(true, 300);
      if (v) {
        this.actualSendMove("u" in submit ? "move" : "drop", submit);
        site.sound.play("confirmation");
      } else this.jump(this.ply);
    };
    this.onChange = () => {
      if (this.opts.onChange) setTimeout(() => this.opts.onChange(this.data), 150);
    };
    this.setGone = (gone) => {
      setGone(this.data, this.data.opponent.color, gone);
      clearTimeout(this.goneTick);
      if (Number(gone) > 1)
        this.goneTick = setTimeout(() => {
          const g = Number(this.opponentGone());
          if (g > 1) this.setGone(g - 1);
        }, 1e3);
      this.redraw();
    };
    this.opponentGone = () => {
      const d = this.data;
      return defined(d.opponent.isGone) && d.opponent.isGone !== false && !isPlayerTurn(d) && resignable(d) && d.opponent.isGone;
    };
    this.canOfferDraw = () => !this.preventDrawOffer && drawable(this.data) && (this.data.player.lastDrawOfferAtPly || -99) < this.lastPly() - 20;
    this.cancelTakebackPreventDraws = () => {
      this.socket.sendLoading("takeback-no");
      clearTimeout(this.preventDrawOffer);
      this.preventDrawOffer = setTimeout(() => {
        this.preventDrawOffer = void 0;
        this.redraw();
      }, 4e3);
    };
    this.offerDraw = (v, immediately) => {
      if (this.canOfferDraw()) {
        if (this.drawConfirm) {
          if (v) this.doOfferDraw();
          clearTimeout(this.drawConfirm);
          this.drawConfirm = void 0;
        } else if (v) {
          if (this.data.pref.confirmResign && !immediately)
            this.drawConfirm = setTimeout(() => {
              this.offerDraw(false);
            }, 3e3);
          else this.doOfferDraw();
        }
      }
      this.redraw();
    };
    this.doOfferDraw = () => {
      this.data.player.lastDrawOfferAtPly = this.lastPly();
      this.socket.sendLoading("draw-yes");
    };
    this.setChessground = (cg) => {
      this.chessground = cg;
      const up = { fen: this.stepAt(this.ply).fen, canMove: this.canMove(), cg };
      pubsub.on("board.change", (is3d) => {
        this.chessground.state.addPieceZIndex = is3d;
        this.chessground.redrawAll();
      });
      if (!this.isPlaying()) return;
      if (this.data.pref.keyboardMove) {
        if (!this.keyboardMove) this.keyboardMove = ctrl(this);
        this.keyboardMove.update(up);
      }
      if (this.data.pref.voiceMove) {
        if (this.voiceMove) this.voiceMove.update(up);
        else this.voiceMove = makeVoiceMove(this, up);
      }
      if (this.keyboardMove || this.voiceMove) requestAnimationFrame(() => this.redraw());
    };
    this.stepAt = (ply) => plyStep(this.data, ply);
    this.pendingStep = () => {
      const submit = this.toSubmit;
      if (!submit) return void 0;
      const uci = "u" in submit ? submit.u : `${roleToChar(submit.role).toUpperCase()}@${submit.pos}`;
      return {
        ply: this.ply + 1,
        fen: this.chessground.getFen(),
        san: almostSanOf(readFen(this.stepAt(this.ply).fen), uci),
        uci
      };
    };
    this.speakClock = () => {
      var _a;
      (_a = this.clock) == null ? void 0 : _a.speak();
    };
    this.blindfold = (v) => {
      var _a, _b, _c;
      (_b = (_a = this.data.player).blindfold) != null ? _b : _a.blindfold = false;
      if (v === void 0 || v === this.data.player.blindfold) return (_c = this.data.player.blindfold) != null ? _c : false;
      this.blindfoldStorage.set(v);
      this.data.player.blindfold = v;
      this.socket.send(`blindfold-${v ? "yes" : "no"}`);
      this.redraw();
      return v;
    };
    this.onTimeTrouble = (t) => {
      if (this.data.player.spectator) return;
      site.powertip.forcePlacementHook = t ? (el) => el.closest(".crosstable") && "s" : void 0;
      this.chessground.state.touchIgnoreRadius = t ? Math.SQRT2 : 1;
    };
    this.yeet = () => {
      if (!this.data.player.spectator) this.doYeet();
    };
    this.doYeet = memoize(() => {
      this.chessground.stop();
      site.asset.loadEsm("round.yeet");
    });
    this.googlyEyesStart = memoize(async () => {
      const redraw = () => this.googlyEyes && this.chessground.setAutoShapes(this.googlyEyes());
      const { makeGooglyShapes } = await site.asset.loadEsm("bits.googlyHorsey", {
        init: { cg: this.chessground, redraw }
      });
      this.googlyEyes = makeGooglyShapes;
      redraw();
    });
    this.delayedInit = () => requestIdleCallbackSafe(
      () => {
        const d = this.data;
        if (this.isPlaying()) {
          if (!d.simul) init4(d.steps.length > 2);
          init6();
          this.setTitle();
          if (d.crazyhouse) init5(this);
          if (!this.nvui && d.clock && !d.opponent.ai && !this.isSimulHost() && !d.local)
            window.addEventListener("beforeunload", (e) => {
              if (site.unload.expected || !this.isPlaying()) return;
              this.socket.send("bye2");
              e.preventDefault();
            });
          if (!this.nvui && d.pref.submitMove) {
            site.mousetrap.bind("esc", () => {
              this.submitMove(false);
              this.chessground.cancelMove();
            }).bind("return", () => this.submitMove(true));
          }
          subscribe(this);
        }
        if (!this.nvui) init2(this);
        if (this.isPlaying() && d.steps.length === 1) {
          this.blindfold(this.blindfoldStorage.get());
        }
        if (!d.local && d.game.speed !== "correspondence") request();
      },
      800
    );
    var _a, _b, _c, _d;
    upgradeServerData(opts.data);
    const d = this.data = opts.data;
    this.ply = lastPly(d);
    this.goneBerserk[d.player.color] = d.player.berserk;
    this.goneBerserk[d.opponent.color] = d.opponent.berserk;
    setTimeout(() => {
      this.firstSeconds = false;
      this.redraw();
    }, 3e3);
    this.socket = (_a = d.local) != null ? _a : make(opts.socketSend, this);
    this.blindfoldStorage = storage.boolean(`blindfold.${(_c = (_b = this.data.player.user) == null ? void 0 : _b.id) != null ? _c : "anon"}`);
    this.updateClockCtrl();
    this.promotion = new PromotionCtrl(
      (f) => f(this.chessground),
      () => {
        this.chessground.cancelPremove();
        reload2(this.data).then(this.reload, site.reload);
      },
      this.redraw,
      d.pref.autoQueen
    );
    this.setQuietMode();
    this.confirmMoveToggle = toggle(d.pref.submitMove);
    this.moveOn = new MoveOn(this, "move-on");
    if (!d.local) this.transientMove = new TransientMove(this.socket);
    this.server = new Server(() => this.data);
    this.menu = toggle(false, redraw);
    const nvuiPromise = site.blindMode && site.asset.loadEsm("round.nvui", { init: this });
    setTimeout(async () => {
      if (nvuiPromise) this.nvui = await nvuiPromise;
      this.delayedInit();
    }, 200);
    setTimeout(this.showExpiration, 350);
    if (!((_d = document.referrer) == null ? void 0 : _d.includes("/serviceWorker."))) setTimeout(this.showYourMoveNotification, 500);
    pubsub.on("jump", (ply) => {
      this.jump(parseInt(ply));
      this.redraw();
    });
    pubsub.on("zen", toggleZenMode);
    if (!this.opts.noab && this.isPlaying()) init3(this);
  }
  clearJust() {
    this.justDropped = void 0;
    this.justCaptured = void 0;
    this.preDrop = void 0;
  }
  updateClockCtrl() {
    var _a, _b;
    const d = this.data;
    if (d.clock) {
      this.corresClock = void 0;
      (_a = this.clock) != null ? _a : this.clock = new ClockCtrl(d.clock, d.pref, this.tickingClockColor(), this.makeClockOpts());
      this.clock.alarmAction = {
        seconds: 60,
        fire: () => this.onTimeTrouble(true)
      };
    } else {
      this.clock = void 0;
      if (d.correspondence)
        (_b = this.corresClock) != null ? _b : this.corresClock = new CorresClockController(this, d.correspondence, this.socket.outoftime);
    }
  }
  opponentRequest(req, text2) {
    var _a;
    (_a = this.voiceMove) == null ? void 0 : _a.listenForResponse(
      req,
      (v) => this.socket.sendLoading(`${req}-${v ? "yes" : "no"}`)
    );
    notification_default(text2);
  }
  rematch(accept) {
    if (accept === void 0)
      return !!this.data.opponent.offeringRematch || !!this.data.player.offeringRematch;
    else if (accept) {
      if (this.data.game.rematch) location.href = game(this.data.game.rematch, this.data.opponent.color);
      if (!rematchable(this.data)) return false;
      if (!this.data.opponent.offeringRematch) this.data.player.offeringRematch = true;
      this.socket.send("rematch-yes");
    } else {
      if (!this.data.opponent.offeringRematch) return false;
      this.socket.send("rematch-no");
    }
    this.redraw();
    return true;
  }
};

// ../round/src/tourStanding.ts
var tourStandingCtrl = (players, team, name) => ({
  set(d) {
    players = d;
  },
  key: "tourStanding",
  name,
  view() {
    return h("div", { hook: onInsert((_) => site.asset.loadCssPath("round.tour-standing")) }, [
      team ? h("h3.text", { attrs: dataIcon(licon.Group) }, team.name) : null,
      h("table.slist", [
        h(
          "tbody",
          players.map(
            (p, i) => h("tr." + p.n, [
              h("td.name", [
                h("span.rank", i + 1),
                h("a.user-link.ulpt", { attrs: { href: `/@/${p.n}` } }, (p.t ? p.t + " " : "") + p.n)
              ]),
              h("td.total", p.f ? { class: { "is-gold": true }, attrs: dataIcon(licon.Fire) } : {}, p.s)
            ])
          )
        )
      ])
    ]);
  }
});

// ../round/src/round.ts
var patch = init([classModule, attributesModule]);
async function initModule(opts) {
  await site.asset.loadPieces;
  return opts.data.local ? app(opts) : boot(opts, app);
}
async function app(opts) {
  var _a;
  const ctrl2 = new RoundController(opts, redraw);
  const blueprint = main(ctrl2);
  const el = (_a = opts.element) != null ? _a : document.querySelector(".round__app");
  let vnode = patch(el, blueprint);
  function redraw() {
    vnode = patch(vnode, main(ctrl2));
  }
  window.addEventListener("resize", () => {
    redraw();
    ctrl2.autoScroll();
  });
  if (ctrl2.isPlaying()) menuHover_default();
  site.sound.preloadBoardSounds();
  return ctrl2;
}
async function boot(opts, roundMain) {
  var _a, _b;
  const { data, chat } = opts;
  if (data.tournament) document.body.dataset.tournamentId = data.tournament.id;
  const socketUrl = data.player.spectator ? `/watch/${data.game.id}/${data.player.color}/v6` : `/play/${data.game.id}${data.player.id}/v6`;
  opts.socketSend = wsConnect(socketUrl, data.player.version, {
    options: { reloadOnResume: true },
    params: { userTv: (_a = data.userTv) == null ? void 0 : _a.id },
    receive(t, d) {
      round.socketReceive(t, d);
    },
    events: {
      tvSelect({ channel, player }) {
        var _a2;
        if (((_a2 = data.tv) == null ? void 0 : _a2.channel) === channel) site.reload();
        else
          $(`.tv-channels .${channel} .champion`).html(
            player ? [player.title, player.name, data.pref.ratings ? player.rating : ""].filter(Boolean).join("&nbsp") : "Anonymous"
          );
      },
      endData() {
        text(`${data.tv ? "/tv" : ""}/${data.game.id}/${data.player.color}/sides`).then((html) => {
          const $html = $(html), $meta = $html.find(".game__meta");
          $meta.length && $(".game__meta").replaceWith($meta);
          $(".crosstable").replaceWith($html.find(".crosstable"));
          startTournamentClock();
          pubsub.emit("content-loaded");
        });
      },
      tourStanding(s) {
        const chatInstance = (chat == null ? void 0 : chat.plugin) && (chat == null ? void 0 : chat.instance);
        if (chatInstance) {
          chat.plugin.set(s);
          chatInstance.redraw();
        }
      }
    }
  }).send;
  const startTournamentClock = () => {
    if (data.tournament)
      $(".game__tournament .clock").each(function() {
        setClockWidget(this, {
          time: parseFloat(this.dataset.time)
        });
      });
  };
  const getPresetGroup = (d) => {
    if (d.player.spectator) return void 0;
    if (finished(d)) return "end";
    if (d.steps.length < 6) return "start";
    return void 0;
  };
  const ctrl2 = await roundMain(opts);
  const round = { socketReceive: ctrl2.socket.receive, moveOn: ctrl2.moveOn };
  if (chat) {
    if ((_b = data.tournament) == null ? void 0 : _b.top) {
      chat.plugin = tourStandingCtrl(data.tournament.top, data.tournament.team, i18n.site.standings);
    } else if (!data.simul && !data.swiss) {
      chat.preset = getPresetGroup(data);
      chat.enhance = { plies: true };
    }
    if (chat.noteId && (chat.noteAge || 0) < 10) chat.noteText = "";
    chat.instance = standaloneChat(chat);
    if (!data.tournament && !data.simul && !data.swiss) {
      opts.onChange = (d) => chat.instance.preset.setGroup(getPresetGroup(d));
      if (myUserId())
        chat.instance.listenToIncoming((line) => {
          if (line.u === "lichess" && (startsWithPrefix(line.t, "warning") || startsWithPrefix(line.t, "reminder")))
            alert(line.t);
        });
    }
  }
  startTournamentClock();
  $("#round-toggle-autoswitch").on("change", round.moveOn.toggle).prop("checked", round.moveOn.get()).on("click", "a", () => {
    site.unload.expected = true;
    return true;
  });
  if (location.pathname.lastIndexOf("/round-next/", 0) === 0) {
    history.replaceState(null, "", "/" + data.game.id);
  }
  $("#zentog").on("click", () => pubsub.emit("zen"));
  storage.make("reload-round-tabs").listen(site.reload);
  if (!data.player.spectator && location.hostname !== document["Location".toLowerCase()].hostname) {
    alert(`Games cannot be played through a web proxy. Please use ${location.hostname} instead.`);
    wsDestroy();
  }
  return ctrl2;
}
var startsWithPrefix = (t, prefix) => t.toLowerCase().startsWith(`${prefix}, ${myUserId()}`);
export {
  initModule
};
//# sourceMappingURL=round.DDOZHOU5.js.map
