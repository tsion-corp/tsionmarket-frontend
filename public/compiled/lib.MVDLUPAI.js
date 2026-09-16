import {
  cont,
  game
} from "./lib.GIUNMRJU.js";
import {
  ChatCtrl
} from "./lib.LARLSDYI.js";
import {
  analysisGlyphs,
  annotationShapes
} from "./lib.CJXBWL7W.js";
import {
  ctrl,
  render
} from "./lib.YN2PHZNI.js";
import {
  apiArgs,
  transformWikiHtml,
  wikiBooksUrl
} from "./lib.TRB3Z2N6.js";
import {
  menuHover_default
} from "./lib.2OVDXZTI.js";
import {
  PromotionCtrl
} from "./lib.QGZVCTIP.js";
import {
  api
} from "./lib.EN3TWOBW.js";
import {
  flairPickerLoader
} from "./lib.PQMRP22H.js";
import {
  ExplorerConfigCtrl,
  MAX_ANALYSE_DEPTH,
  addChapterId,
  allowVideo,
  baseUrl,
  clearLastShow,
  emptyRedButton,
  explorerView_default,
  findTag,
  glyphs,
  looksLikeLichessGame,
  nodeFullName,
  option,
  patch,
  pgnImport_default,
  plural,
  relayIframe,
  renderBoard,
  renderFullTxt,
  renderIndex,
  renderIndexAndMove,
  renderMain,
  renderMoveNodes,
  renderNodesHtml,
  renderNodesPgn,
  renderRelayTour,
  renderResult,
  renderUnderboard,
  stockfishName,
  titleNameToId,
  tourSide,
  verticalResize,
  view,
  view2,
  view3,
  view4,
  viewContext,
  winnerOf
} from "./lib.UZWUG6PB.js";
import {
  renderChat
} from "./lib.OY6DQ2TE.js";
import {
  watchers
} from "./lib.2NHX5WHM.js";
import {
  completeNode,
  hasBranching,
  makeTree,
  ops_exports,
  path_exports,
  structuredCloneLite
} from "./lib.NPW3BL7S.js";
import {
  getPlayer,
  playable,
  playedTurns,
  replayable
} from "./lib.67VUYMDO.js";
import {
  ratingDiff,
  userLink
} from "./lib.BMKV23O2.js";
import {
  CevalCtrl,
  isFirstEvalBetter,
  main_exports,
  povChances,
  renderEval,
  sanIrreversible,
  winningChances_exports
} from "./lib.6Z4MCRO3.js";
import {
  userComplete
} from "./lib.D6AFQ4TK.js";
import {
  addPointerListeners,
  button,
  cmnToggleProp,
  cmnToggleWrap,
  cmnToggleWrapProp,
  confirm,
  copyMeInput,
  domDialog,
  enter,
  icon,
  prompt,
  snabDialog,
  spinnerVdom
} from "./lib.MYPIOGN5.js";
import {
  fenColor,
  fenToEpd,
  fixCrazySan,
  isUci,
  pieceCount,
  plyColor,
  validUci
} from "./lib.LRP46MC3.js";
import {
  zip
} from "./lib.HMFK7OOB.js";
import {
  dragNewPiece
} from "./lib.AEOHBIQD.js";
import {
  opposite as opposite2,
  uciToMove
} from "./lib.RPQH5UYI.js";
import {
  Chess,
  Result,
  attacks,
  between,
  bishopAttacks,
  chessgroundDests,
  kingAttacks,
  knightAttacks,
  makeFen,
  makeSan,
  makeSanAndPlay,
  normalizeMove,
  parseFen,
  pawnAttacks,
  ray,
  rookAttacks
} from "./lib.X7H2PLEK.js";
import {
  COLORS,
  isDrop,
  isNormal,
  makeSquare,
  makeUci,
  opposite,
  parseSquare,
  parseUci,
  roleToChar,
  squareFile,
  squareFromCoords,
  squareRank
} from "./lib.53PYQRAK.js";
import {
  bind,
  bindNonPassive,
  bindSubmit,
  dataIcon,
  displayColumns,
  hl,
  isSafari,
  isTouchDevice,
  onInsert,
  shareIcon
} from "./lib.S3TIZ2HQ.js";
import {
  h,
  thunk
} from "./lib.LWF5S4ZV.js";
import {
  pubsub
} from "./lib.QPQZCXK2.js";
import {
  licon
} from "./lib.5I4BSVKX.js";
import {
  json,
  readNdJson,
  textRaw,
  url,
  writeTextClipboard
} from "./lib.TT4QSUKQ.js";
import {
  debounce,
  defer,
  objectStorage,
  once,
  storage,
  storedBooleanProp,
  storedBooleanPropWithEffect,
  storedSet,
  sync,
  throttle
} from "./lib.NFSQQWN5.js";
import {
  blurIfPrimaryClick,
  blurOnEscape,
  defined,
  enrichText,
  escapeHtml,
  frag,
  innerHTML,
  isEmpty,
  memoize,
  myUserId,
  notEmpty,
  prop,
  propWithEffect,
  repeater,
  requestIdleCallbackSafe,
  richHTML,
  scrollTo,
  toggle
} from "./lib.GMEH5BEF.js";
import {
  __export
} from "./lib.KO2KTNGK.js";

// ../analyse/src/autoplay.ts
var Autoplay = class {
  constructor(ctrl2) {
    this.ctrl = ctrl2;
    this.active = (delay) => (!delay || delay === this.delay) && !!this.timeout;
    this.getDelay = () => this.delay;
  }
  move() {
    var _a;
    const child = this.ctrl.node.children[0];
    if (child && !((_a = this.ctrl.retro) == null ? void 0 : _a.preventGoingToNextMove())) {
      const path = this.ctrl.path + child.id;
      if (this.ctrl.canJumpTo(path)) {
        this.ctrl.jump(path);
        this.lastMoveAt = Date.now();
        this.ctrl.redraw();
        return true;
      }
    }
    this.stop();
    this.ctrl.redraw();
    return false;
  }
  evalToCp(node) {
    if (!node.eval) return node.ply % 2 ? 990 : -990;
    if (node.eval.mate) return node.eval.mate > 0 ? 990 : -990;
    return node.eval.cp;
  }
  nextDelay() {
    if (typeof this.delay === "string" && !this.ctrl.onMainline) return 1500;
    else if (this.delay === "realtime") {
      if (this.ctrl.node.ply < 2) return 1e3;
      const centis = this.ctrl.data.game.moveCentis;
      if (!centis) return 1500;
      const time = centis[this.ctrl.node.ply - this.ctrl.tree.root.ply];
      return time * 10 + 130 || 2e3;
    } else if (this.delay === "cpl") {
      const slowDown = 30;
      if (this.ctrl.node.ply >= this.ctrl.mainline.length - 1) return 0;
      const currPlyCp = this.evalToCp(this.ctrl.node);
      const nextPlyCp = this.evalToCp(this.ctrl.node.children[0]);
      return Math.max(500, Math.min(1e4, Math.abs(currPlyCp - nextPlyCp) * slowDown));
    } else return this.delay;
  }
  schedule() {
    this.timeout = setTimeout(() => {
      if (this.move()) this.schedule();
    }, this.nextDelay());
  }
  start(delay) {
    this.stop();
    this.delay = delay;
    this.schedule();
    if (delay === "realtime") this.redrawInterval = setInterval(this.ctrl.redraw, 100);
  }
  stop() {
    this.delay = void 0;
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = void 0;
    }
    if (this.redrawInterval) {
      clearInterval(this.redrawInterval);
      this.redrawInterval = void 0;
    }
    this.lastMoveAt = void 0;
  }
  toggle(delay) {
    if (this.active(delay)) this.stop();
    else {
      if (!this.active() && !this.move()) this.ctrl.jump("");
      this.start(delay);
    }
  }
};

// ../analyse/src/autoShape.ts
var pieceDrop = (key, role, color) => ({
  orig: key,
  piece: {
    color,
    role,
    scale: 0.8
  },
  brush: "green"
});
var MAX_MANEUVER_ARROWS = 3;
function interferingArrow(from, to, occupied) {
  if (from === to) return true;
  occupied[from] = 1;
  if (knightAttacks(from).has(to)) {
    if (occupied[to]) return true;
    occupied[to] = 1;
    return false;
  }
  const line = ray(from, to);
  if (line.has(to)) {
    for (const sq of between(from, to)) {
      if (occupied[sq]) return true;
      occupied[sq] = 1;
    }
    if (occupied[to]) return true;
    occupied[to] = 1;
    return false;
  }
  return true;
}
function drawManeuver(ctrl2, color, moves, brush, shapes) {
  if (ctrl2.settings.showManeuverMoveArrows) {
    const maxPairs = Math.min(moves.length, MAX_MANEUVER_ARROWS * 2);
    const occupied = new Uint8Array(64);
    for (let i = 0; i < maxPairs; i += 2) {
      const uci = moves[i];
      const move = parseUci(uci);
      if (!move) break;
      if (i > 0) {
        const prevMove = parseUci(moves[i - 2]);
        if (prevMove.to !== (isDrop(move) ? -1 : move.from)) break;
      }
      if (isDrop(move)) {
        if (occupied[move.to]) break;
        occupied[move.to] = 1;
      } else if (interferingArrow(move.from, move.to, occupied)) break;
      makeShapesFromUci(color, uci, brush).forEach((s) => shapes.push(s));
    }
  } else if (moves[0]) makeShapesFromUci(color, moves[0], brush).forEach((s) => shapes.push(s));
}
function makeShapesFromUci(color, uci, brush, modifiers) {
  if (!uci || uci === "Current Position") return [];
  const move = parseUci(uci);
  const to = makeSquare(move.to);
  if (isDrop(move)) return [{ orig: to, brush }, pieceDrop(to, move.role, color)];
  const shapes = [{ orig: makeSquare(move.from), dest: to, brush, modifiers }];
  if (move.promotion) shapes.push(pieceDrop(to, move.promotion, color));
  return shapes;
}
function compute(ctrl2) {
  var _a, _b, _c, _d;
  const color = fenColor(ctrl2.node.fen);
  const rcolor = opposite2(color);
  if (ctrl2.practice) {
    const hovering2 = ctrl2.practice.hovering();
    if (hovering2) return makeShapesFromUci(color, hovering2.uci, "green");
    const hint = ctrl2.practice.hinting();
    if (hint) {
      if (hint.mode === "move") return makeShapesFromUci(color, hint.uci, "paleBlue");
      else
        return [
          {
            orig: hint.uci[1] === "@" ? hint.uci.slice(2, 4) : hint.uci.slice(0, 2),
            brush: "paleBlue"
          }
        ];
    }
    return [];
  }
  const { eval: nEval = {}, fen: nFen, ceval: nCeval, threat: nThreat } = ctrl2.node;
  let hovering = ctrl2.explorer.hovering();
  if (!hovering || hovering.fen !== nFen) {
    ctrl2.explorer.hovering(null);
    hovering = ctrl2.ceval.hovering();
  }
  let shapes = [];
  let badNode;
  if ((badNode = (_a = ctrl2.retro) == null ? void 0 : _a.showBadNode()) && badNode.uci) {
    return makeShapesFromUci(color, badNode.uci, "paleRed", { lineWidth: 8 });
  }
  if ((hovering == null ? void 0 : hovering.fen) === nFen) shapes = shapes.concat(makeShapesFromUci(color, hovering.uci, "paleBlue"));
  ctrl2.fork.hover(hovering == null ? void 0 : hovering.uci);
  if (ctrl2.isCevalAllowed() && ctrl2.showBestMoveArrows() && ctrl2.showEvaluation()) {
    if (isUci(nEval.best)) shapes = shapes.concat(makeShapesFromUci(rcolor, nEval.best, "paleGreen"));
    if (!hovering && ctrl2.ceval.search.multiPv) {
      const bestPvMoves = nCeval ? (_b = nCeval.pvs[0]) == null ? void 0 : _b.moves : void 0;
      const nextBest = (bestPvMoves == null ? void 0 : bestPvMoves[0]) || ctrl2.nextNodeBest();
      if (nextBest) {
        drawManeuver(ctrl2, color, bestPvMoves || [nextBest], "paleBlue", shapes);
      }
      if ((nCeval == null ? void 0 : nCeval.pvs[1]) && !(ctrl2.threatMode() && nThreat && nThreat.pvs.length > 2)) {
        nCeval.pvs.forEach(function(pv) {
          if (pv.moves[0] === nextBest) return;
          const shift = winningChances_exports.povDiff(color, nCeval.pvs[0], pv);
          if (shift >= 0 && shift < 0.2) {
            shapes = shapes.concat(
              makeShapesFromUci(color, pv.moves[0], "paleGrey", {
                lineWidth: Math.round(12 - shift * 50)
                // 12 to 2
              })
            );
          }
        });
      }
    }
  }
  if (ctrl2.isCevalAllowed() && ctrl2.threatMode() && nThreat) {
    const [pv0, ...pv1s] = nThreat.pvs;
    const brush = pv1s.length > 0 ? "paleRed" : "red";
    drawManeuver(ctrl2, rcolor, pv0.moves, brush, shapes);
    pv1s.forEach(function(pv) {
      const shift = winningChances_exports.povDiff(rcolor, pv0, pv);
      if (shift >= 0 && shift < 0.2) {
        shapes = shapes.concat(
          makeShapesFromUci(rcolor, pv.moves[0], "paleRed", {
            lineWidth: Math.round(11 - shift * 45)
            // 11 to 2
          })
        );
      }
    });
  }
  if (ctrl2.showMoveAnnotations()) {
    const glyphs3 = [...(_c = ctrl2.node.glyphs) != null ? _c : []];
    const liveGlyph = (_d = ctrl2.liveAnnotate) == null ? void 0 : _d.get(ctrl2.path);
    if (liveGlyph && ctrl2.settings.showLiveAnnotations && !glyphs3.some((g) => g.id <= 6))
      glyphs3.push(liveGlyph);
    shapes = shapes.concat(annotationShapes({ ...ctrl2.node, glyphs: glyphs3 }));
  }
  if (ctrl2.showVariationArrows()) hiliteVariations(ctrl2, shapes);
  if (ctrl2.isCevalAllowed()) {
    const parsed = parseFen(nFen);
    if ("error" in parsed) return shapes;
    const { board, epSquare, castlingRights } = parsed.value;
    const addAnalysis = (orig, type) => {
      const idx = shapes.filter((s) => s.orig === orig && s.customSvg).length;
      shapes.push({
        orig,
        customSvg: { html: analysisGlyphs[type](idx) }
      });
    };
    if (ctrl2.motifEnabled()) {
      ctrl2.motif.detectPins(board).forEach((p) => addAnalysis(makeSquare(p.pinned), "pin"));
      ctrl2.motif.detectUndefended(board, epSquare).forEach((u) => addAnalysis(makeSquare(u.square), "undefended"));
      ctrl2.motif.detectCheckable(board, epSquare, castlingRights).forEach((s) => addAnalysis(makeSquare(s.king), "checkable"));
    }
  }
  return shapes;
}
function hiliteVariations(ctrl2, autoShapes) {
  var _a, _b, _c;
  const visible = ctrl2.visibleChildren();
  if (visible.length < 2) return;
  ctrl2.chessground.state.drawable.brushes["variation"] = {
    key: "variation",
    color: "white",
    opacity: 0.5,
    lineWidth: 12
  };
  const chap = (_a = ctrl2.study) == null ? void 0 : _a.data.chapter;
  const isGamebookEditor = (chap == null ? void 0 : chap.gamebook) && !((_b = ctrl2.study) == null ? void 0 : _b.gamebookPlay);
  for (const [i, node] of visible.entries()) {
    const existing = autoShapes.find((s) => s.orig + s.dest === node.uci);
    if (existing) existing.modifiers = { hilite: i === ctrl2.fork.selectedIndex ? "white" : void 0 };
    else
      autoShapes.push({
        orig: node.uci.slice(0, 2),
        dest: (_c = node.uci) == null ? void 0 : _c.slice(2, 4),
        brush: !isGamebookEditor ? "variation" : i === 0 ? "paleGreen" : "paleRed",
        modifiers: { hilite: i === ctrl2.fork.selectedIndex ? "#3291ff" : "#aaa" },
        below: true
      });
  }
}

// ../analyse/src/crazy/crazyCtrl.ts
function drag({ chessground }, color, e) {
  if (e.button !== void 0 && e.button !== 0) return;
  if (chessground.state.movable.color !== color) return;
  const el = e.target;
  const role = el.getAttribute("data-role"), number = el.getAttribute("data-nb");
  if (!role || !color || number === "0") return;
  e.stopPropagation();
  e.preventDefault();
  dragNewPiece(chessground.state, { color, role }, e);
}
function valid(chessground, possibleDrops, piece, pos) {
  if (piece.color !== chessground.state.movable.color) return false;
  if (piece.role === "pawn" && (pos[1] === "1" || pos[1] === "8")) return false;
  return !possibleDrops || possibleDrops.includes(pos);
}

// ../analyse/src/evalCache.ts
var evalPutMinDepth = 20;
var evalPutMinNodes = 3e6;
var evalPutMaxMoves = 10;
function qualityCheck(ev) {
  var _a;
  if (Math.abs((_a = ev.mate) != null ? _a : 99) < 15) return true;
  return ev.nodes > 5e5 && (ev.depth >= evalPutMinDepth || ev.nodes > evalPutMinNodes);
}
function toPutData(variant, ev) {
  const data = {
    fen: ev.fen,
    knodes: Math.round(ev.nodes / 1e3),
    depth: ev.depth,
    pvs: ev.pvs.map((pv) => {
      return {
        cp: pv.cp,
        mate: pv.mate,
        moves: pv.moves.slice(0, evalPutMaxMoves).join(" ")
      };
    })
  };
  if (variant !== "standard") data.variant = variant;
  return data;
}
function toCeval(e) {
  const res = {
    fen: e.fen,
    nodes: e.knodes * 1e3,
    depth: e.depth,
    pvs: e.pvs.map((from) => {
      const to = {
        moves: from.moves.split(" ")
        // moves come from the server as a single string
      };
      if (defined(from.cp)) to.cp = from.cp;
      else to.mate = from.mate;
      return to;
    }),
    cloud: true
  };
  if (defined(res.pvs[0].cp)) res.cp = res.pvs[0].cp;
  else res.mate = res.pvs[0].mate;
  res.cloud = true;
  return res;
}
var awaitingEval = null;
var EvalCache = class {
  constructor(opts) {
    this.opts = opts;
    this.fetchedByFen = /* @__PURE__ */ new Map();
    this.upgradable = prop(false);
    this.destroy = () => pubsub.off("socket.in.crowd", this.onCrowd);
    this.onCrowd = (d) => this.upgradable(d.nb > 2 && d.nb < 99999);
    this.onLocalCeval = throttle(500, () => {
      const node = this.opts.getNode(), ev = node.ceval;
      const fetched = this.fetchedByFen.get(node.fen);
      if (ev && !ev.cloud && this.fetchedByFen.has(node.fen) && fetched !== void 0 && (fetched === awaitingEval || fetched.depth < ev.depth) && ev.fen === node.fen && qualityCheck(ev) && this.opts.canPut()) {
        this.opts.send("evalPut", toPutData(this.opts.variant, ev));
      }
    });
    this.fetch = (path, multiPv) => {
      var _a;
      if (document.hidden) return;
      const node = this.opts.getNode();
      if (((_a = node.ceval) == null ? void 0 : _a.cloud) || !this.opts.canGet()) return;
      const fetched = this.fetchedByFen.get(node.fen);
      if (fetched) return this.opts.receive(toCeval(fetched), path);
      else if (fetched === awaitingEval) return;
      const obj = {
        fen: node.fen,
        path
      };
      if (this.opts.variant !== "standard") obj.variant = this.opts.variant;
      if (multiPv > 1) obj.mpv = multiPv;
      if (this.upgradable()) obj.up = true;
      this.fetchThrottled(obj);
    };
    this.onCloudEval = (ev) => {
      this.fetchedByFen.set(ev.fen, ev);
      this.opts.receive(toCeval(ev), ev.path);
    };
    this.clear = () => this.fetchedByFen.clear();
    this.fetchThrottled = throttle(700, (obj) => {
      this.fetchedByFen.set(obj.fen, awaitingEval);
      this.opts.send("evalGet", obj);
    });
    this.upgradable(opts.upgradable);
    pubsub.on("socket.in.crowd", this.onCrowd);
  }
};

// ../analyse/src/explorer/explorerXhr.ts
async function opening(opts, processData, signal) {
  const conf = opts.config;
  const confByDb = conf.byDb();
  const url2 = new URL(`./${opts.db}`, opts.endpoint);
  const params = url2.searchParams;
  params.set("variant", opts.variant || "standard");
  params.set("fen", opts.rootFen);
  params.set("play", opts.play.join(","));
  if (opts.db === "masters") {
    if (confByDb.since()) params.set("since", confByDb.since().split("-")[0]);
    if (confByDb.until()) params.set("until", confByDb.until().split("-")[0]);
  } else {
    if (confByDb.since()) params.set("since", confByDb.since());
    if (confByDb.until()) params.set("until", confByDb.until());
    params.set("speeds", conf.speed().join(","));
  }
  if (opts.db === "lichess") {
    params.set("ratings", conf.rating().join(","));
  }
  if (opts.db === "player") {
    const playerName = conf.playerName.value();
    if (!playerName) throw new Error("Missing player name");
    params.set("player", playerName);
    params.set("color", conf.color());
    params.set("modes", conf.mode().join(","));
  }
  if (!opts.withGames) {
    params.set("topGames", "0");
    params.set("recentGames", "0");
  }
  params.set("source", "analysis");
  const res = await fetch(url2.href, {
    cache: "default",
    headers: {},
    // avoid default headers for cors
    credentials: "include",
    signal
  });
  await readNdJson(res, (data) => {
    data.isOpening = true;
    data.fen = opts.fen;
    processData(data);
  });
}
async function tablebase(endpoint, variant, fen, signal) {
  const effectiveVariant = variant === "fromPosition" || variant === "chess960" ? "standard" : variant;
  const data = await json(url(`${endpoint}/${effectiveVariant}`, { fen }), {
    cache: "default",
    headers: {},
    // avoid default headers for cors
    credentials: "omit",
    signal
  });
  data.tablebase = true;
  data.fen = fen;
  return data;
}

// ../analyse/src/explorer/explorerCtrl.ts
function tablebasePieces(variant) {
  switch (variant) {
    case "standard":
    case "fromPosition":
    case "chess960":
      return 8;
    case "atomic":
    case "antichess":
      return 6;
    default:
      return 0;
  }
}
var tablebaseGuaranteed = (variant, fen) => pieceCount(fen) <= tablebasePieces(variant);
var ExplorerCtrl = class {
  constructor(root, opts, previous) {
    this.root = root;
    this.opts = opts;
    this.loading = prop(true);
    this.failing = prop(null);
    this.hovering = prop(null);
    this.movesAway = prop(0);
    this.gameMenu = prop(null);
    this.cache = {};
    this.destroy = () => {
      clearLastShow();
      window.removeEventListener("hashchange", this.checkHash, false);
    };
    this.checkHash = (e) => {
      var _a;
      const parts = location.hash.split("/");
      if (parts[0] === "#explorer" || parts[0] === "#opening") {
        this.enabled(true);
        if (parts[1] === "lichess" || parts[1] === "masters") this.config.data.db(parts[1]);
        else if ((_a = parts[1]) == null ? void 0 : _a.match(/[A-Za-z0-9_-]{2,30}/)) {
          this.config.selectPlayer(parts[1]);
          this.config.data.color(parts[2] === "black" ? "black" : "white");
        }
        if (e) this.reload();
      }
    };
    this.isAuth = () => defined(myUserId());
    this.reload = () => {
      this.cache = {};
      this.setNode();
      this.root.redraw();
    };
    this.baseXhrOpening = () => ({
      endpoint: this.opts.endpoint,
      config: this.config.data
    });
    this.fetch = debounce(
      () => {
        var _a;
        const fen = this.root.node.fen;
        const processData = (res) => {
          this.cache[fen] = res;
          this.movesAway(res.moves.length ? 0 : this.movesAway() + 1);
          this.loading(false);
          this.failing(null);
          this.root.redraw();
        };
        const onError = (err) => {
          if (err.name !== "AbortError") {
            this.loading(false);
            this.failing(err);
            this.root.redraw();
          }
        };
        (_a = this.abortController) == null ? void 0 : _a.abort();
        this.abortController = new AbortController();
        if (this.withGames && this.tablebaseRelevant(this.effectiveVariant, fen))
          tablebase(this.opts.tablebaseEndpoint, this.effectiveVariant, fen, this.abortController.signal).then(processData, onError);
        else {
          this.lastStream = sync(
            opening(
              {
                ...this.baseXhrOpening(),
                db: this.db(),
                variant: this.effectiveVariant,
                rootFen: this.root.nodeList[0].fen,
                play: this.root.nodeList.slice(1).map((s) => s.uci),
                fen,
                withGames: this.withGames
              },
              processData,
              this.abortController.signal
            ).catch(onError).then((_) => true)
          );
          if (this.db() === "player") this.lastStream.promise.then(() => this.root.redraw());
        }
      },
      250,
      true
    );
    this.empty = {
      white: 0,
      black: 0,
      draws: 0,
      isOpening: true,
      moves: [],
      fen: "",
      opening: this.root.data.game.opening
    };
    this.tablebaseRelevant = (variant, fen) => pieceCount(fen) - 1 <= tablebasePieces(variant) && this.root.isCevalAllowed();
    this.setNode = () => {
      if (!this.enabled()) return;
      this.gameMenu(null);
      const node = this.root.node;
      if ((!this.isAuth() || node.ply >= MAX_ANALYSE_DEPTH) && !this.tablebaseRelevant(this.effectiveVariant, node.fen))
        this.cache[node.fen] = this.empty;
      const cached = this.cache[node.fen];
      if (cached) {
        this.movesAway(cached.moves.length ? 0 : this.movesAway() + 1);
        this.loading(false);
        this.failing(null);
      } else {
        this.loading(true);
        this.fetch();
      }
    };
    this.db = () => this.config.data.db();
    this.current = () => this.cache[this.root.node.fen];
    this.toggle = () => {
      this.movesAway(0);
      this.enabled(!this.enabled());
      this.setNode();
    };
    this.disable = () => {
      if (this.enabled()) {
        this.enabled(false);
        this.gameMenu(null);
      }
    };
    this.setHovering = (fen, uci) => {
      this.root.fork.hover(uci);
      this.hovering(uci ? { fen, uci } : null);
      this.root.setAutoShapes();
    };
    this.onFlip = () => {
      if (this.db() === "player") {
        this.cache = {};
        this.setNode();
      }
    };
    this.isIndexing = () => !!this.lastStream && !defined(this.lastStream.sync);
    this.fetchMasterOpening = async (fen) => {
      const deferred = defer();
      await opening(
        {
          ...this.baseXhrOpening(),
          db: "masters",
          rootFen: fen,
          play: [],
          fen
        },
        deferred.resolve
      );
      return await deferred.promise;
    };
    this.fetchTablebaseHit = async (fen) => {
      const res = await tablebase(this.opts.tablebaseEndpoint, this.effectiveVariant, fen);
      const move = res.moves[0];
      if ((move == null ? void 0 : move.dtz) === null) throw "unknown tablebase position";
      return {
        fen,
        best: move.uci,
        winner: res.checkmate ? opposite2(fenColor(fen)) : res.stalemate ? void 0 : winnerOf(fen, move)
      };
    };
    this.allowed = prop(previous ? previous.allowed() : !root.isEmbed);
    this.enabled = storedBooleanProp("analyse.explorer.enabled", false);
    this.withGames = root.synthetic || replayable(root.data) || !!root.data.opponent.ai;
    this.effectiveVariant = root.data.game.variant.key === "fromPosition" ? "standard" : root.data.game.variant.key;
    this.config = new ExplorerConfigCtrl(root, this.effectiveVariant, this.reload, previous == null ? void 0 : previous.config);
    window.addEventListener("hashchange", this.checkHash, false);
    this.checkHash();
  }
};

// ../analyse/src/forecast/forecastCtrl.ts
var ForecastCtrl = class {
  constructor(cfg, data, redraw) {
    this.cfg = cfg;
    this.data = data;
    this.redraw = redraw;
    this.forecasts = prop([]);
    this.loading = prop(false);
    this.saveUrl = () => `/${this.data.game.id}${this.data.player.id}/forecasts`;
    this.keyOf = (fc) => fc.map((node) => node.ply + ":" + node.uci).join(",");
    this.update = (f) => this.forecasts(f(this.forecasts()));
    this.contains = (fc1, fc2) => fc1.length >= fc2.length && this.keyOf(fc1).startsWith(this.keyOf(fc2));
    this.findStartingWithNode = (node) => this.update((fc) => fc.filter((fc2) => this.contains(fc2, [node])));
    this.collides = (fc1, fc2) => {
      for (let i = 0, max = Math.min(fc1.length, fc2.length); i < max; i++) {
        if (fc1[i].uci !== fc2[i].uci) return this.cfg.onMyTurn ? i !== 0 && i % 2 === 0 : i % 2 === 1;
      }
      return true;
    };
    this.truncate = (fc) => this.cfg.onMyTurn ? (fc.length % 2 !== 1 ? fc.slice(0, -1) : fc).slice(0, 30) : (
      // must end with player move
      (fc.length % 2 !== 0 ? fc.slice(0, -1) : fc).slice(0, 30)
    );
    this.isLongEnough = (fc) => fc.length >= (this.cfg.onMyTurn ? 1 : 2);
    this.fixAll = () => {
      this.update(
        (fcs) => fcs.filter((fc, i) => fcs.filter((f, j) => i !== j && this.contains(f, fc)).length === 0)
      );
      this.update(
        (fcs) => fcs.filter((fc, i) => fcs.filter((f, j) => i < j && this.collides(f, fc)).length === 0)
      );
    };
    this.reloadToLastPly = () => {
      this.loading(true);
      this.redraw();
      history.replaceState(null, "", "#last");
      site.reload();
    };
    this.isCandidate = (fc) => {
      const truncatedStep = this.truncate(fc);
      if (!this.isLongEnough(truncatedStep)) return false;
      return !this.forecasts().some((f) => this.contains(f, truncatedStep));
    };
    this.save = () => {
      if (this.cfg.onMyTurn) return;
      this.loading(true);
      this.redraw();
      json(this.saveUrl(), {
        method: "POST",
        body: JSON.stringify(this.forecasts()),
        headers: { "Content-Type": "application/json" }
      }).then((data) => {
        if (data.reload) this.reloadToLastPly();
        else {
          this.loading(false);
          this.forecasts(data.steps || []);
        }
        this.redraw();
      });
    };
    this.playAndSave = (node) => {
      if (!this.cfg.onMyTurn) return;
      this.loading(true);
      this.redraw();
      json(`${this.saveUrl()}/${node.uci}`, {
        method: "POST",
        body: JSON.stringify(
          this.findStartingWithNode(node).filter(notEmpty).map((fc) => fc.slice(1))
        ),
        headers: { "Content-Type": "application/json" }
      }).then((data) => {
        if (data.reload) this.reloadToLastPly();
        else {
          this.loading(false);
          this.forecasts(data.steps || []);
        }
        this.redraw();
      });
    };
    this.showForecast = (variant, path, tree, steps) => {
      steps.forEach(({ ply, fen, uci, san }) => {
        const node = completeNode(variant)({ ply, fen, uci, san });
        tree.addNode(node, path);
        path += node.id;
      });
      return path;
    };
    this.addNodes = (fc) => {
      const truncatedStep = this.truncate(fc);
      if (!this.isCandidate(truncatedStep)) return;
      this.update((fcs) => [...fcs, truncatedStep]);
      this.fixAll();
      this.save();
    };
    this.removeIndex = (index) => {
      this.update((fcs) => fcs.filter((_, i) => i !== index));
      this.save();
    };
    this.onMyTurn = () => !!this.cfg.onMyTurn;
    this.forecasts(cfg.steps || []);
    this.fixAll();
  }
};

// ../analyse/src/fork.ts
var ForkCtrl = class {
  constructor(ctrl2) {
    this.ctrl = ctrl2;
    this.selectedIndex = 0;
  }
  get forks() {
    return this.ctrl.visibleChildren();
  }
  get isVisible() {
    return this.forks.length > 1;
  }
  get selected() {
    var _a;
    return this.forks[(_a = this.hoveringIndex) != null ? _a : this.selectedIndex];
  }
  update() {
    if (this.mostRecent && this.mostRecent.id === this.ctrl.node.id) return;
    this.mostRecent = this.ctrl.node;
    this.selectedIndex = 0;
    this.hoveringIndex = void 0;
  }
  select(which) {
    if (!this.isVisible) return false;
    const numKids = this.forks.length;
    this.selectedIndex = (numKids + this.selectedIndex + (which === "next" ? 1 : -1)) % numKids;
    return true;
  }
  hover(uci) {
    this.hoveringIndex = this.forks.findIndex((n) => n.uci === uci);
    if (isTouchDevice() || this.hoveringIndex < 0) this.hoveringIndex = void 0;
  }
  highlight(it) {
    var _a;
    if (!this.isVisible || !defined(it)) {
      this.ctrl.explorer.setHovering(this.ctrl.node.fen, null);
      return;
    }
    const nodeUci = (_a = this.forks[it]) == null ? void 0 : _a.uci;
    const uci = defined(nodeUci) ? nodeUci : null;
    this.ctrl.explorer.setHovering(this.ctrl.node.fen, uci);
  }
  proceed(it) {
    var _a;
    if (this.isVisible) {
      it = (_a = it != null ? it : this.hoveringIndex) != null ? _a : this.selectedIndex;
      const childNode = this.forks[it];
      if (defined(childNode)) {
        this.ctrl.userJumpIfCan(this.ctrl.path + childNode.id);
        return true;
      }
    }
    return void 0;
  }
};
var eventToIndex = (e) => {
  const target = e.target;
  return parseInt(
    target.parentNode.getAttribute("data-it") || target.getAttribute("data-it") || ""
  );
};
function view5(ctrl2, concealOf) {
  var _a, _b;
  if (((_a = ctrl2.retro) == null ? void 0 : _a.isSolving()) || ((_b = ctrl2.study) == null ? void 0 : _b.hideMoves())) return void 0;
  ctrl2.fork.update();
  if (!ctrl2.fork.isVisible) return void 0;
  const isMainline = concealOf && ctrl2.onMainline;
  return hl(
    "div.analyse__fork",
    {
      hook: onInsert((el) => {
        addPointerListeners(el, {
          click: (e) => {
            ctrl2.fork.proceed(eventToIndex(e));
            ctrl2.redraw();
          }
        });
        if (isTouchDevice()) return;
        el.addEventListener("mouseover", (e) => ctrl2.fork.highlight(eventToIndex(e)));
        el.addEventListener("mouseout", () => ctrl2.fork.highlight());
      })
    },
    ctrl2.visibleChildren().map((node, it) => {
      const conceal = isMainline && concealOf(true)(ctrl2.path + node.id, node);
      if (conceal) return void 0;
      return hl(
        "move",
        {
          class: {
            selected: it === ctrl2.fork.selectedIndex && !isTouchDevice(),
            correct: ctrl2.isGamebook() && it === 0,
            wrong: ctrl2.isGamebook() && it > 0
          },
          attrs: { "data-it": it }
        },
        renderIndexAndMove(node, ctrl2.settings.showStaticAnalysis, ctrl2.settings.showStaticAnalysis)
      );
    })
  );
}

// ../analyse/src/idbTree.ts
var IdbTree = class {
  constructor(ctrl2) {
    this.ctrl = ctrl2;
    this.cacheMap = /* @__PURE__ */ new Map();
    this.collapseDb = memoize(() => objectStorage({ store: "analyse-collapse" }));
    this.moveDb = memoize(
      () => objectStorage({ store: "analyse-state", db: "lichess" })
    );
    this.clear = async (what) => {
      if (this.noop) return;
      await Promise.all([
        (!what || what === "collapse") && this.collapseDb().then((db) => db.remove(this.id)),
        !this.ctrl.study && (!what || what === "moves") && this.moveDb().then((db) => db.remove(this.id))
      ]);
      site.reload();
    };
  }
  someCollapsedOf(collapsed, path = "") {
    return this.ctrl.settings.disclosureMode && this.ctrl.tree.walkUntilTrue(
      (n, m) => this.isCollapsible(n, m) && collapsed === Boolean(n.collapsed),
      path,
      path !== ""
    );
  }
  stepLine(fromPath = this.ctrl.path, which = "next") {
    var _a, _b;
    let [path, kids] = this.familyOf(fromPath);
    while (path && kids.length < 2 && !this.ctrl.tree.pathIsMainline(path)) {
      [path, kids] = this.familyOf(path);
    }
    const i = kids.findIndex((k) => fromPath.slice(path.length).startsWith(k.id));
    const stepTo = which === "next" ? (_a = kids[i + 1]) != null ? _a : kids[0] : (_b = kids[i - 1]) != null ? _b : kids[kids.length - 1];
    return !stepTo ? fromPath : path + stepTo.id;
  }
  setCollapsed(path, collapsed) {
    this.ctrl.tree.updateAt(path, (n) => n.collapsed = collapsed);
    this.saveCollapsed();
    this.ctrl.redraw();
  }
  setCollapsedFrom(from, collapsed, thisBranchOnly = false) {
    this.ctrl.tree.walkUntilTrue(
      (n, m) => {
        if (this.isCollapsible(n, m)) n.collapsed = collapsed;
        return false;
      },
      from,
      thisBranchOnly
    );
    this.saveCollapsed();
    this.ctrl.redraw();
  }
  revealNode(path) {
    let save = false;
    const nodes = path === void 0 ? this.ctrl.nodeList : this.ctrl.tree.getNodeList(path);
    for (let i = 0; i < nodes.length; i++) {
      const kid = nodes[i].children[0];
      if (nodes[i].collapsed && kid && nodes[i + 1] && kid !== nodes[i + 1]) {
        nodes[i].collapsed = false;
        save = true;
      }
    }
    if (save) this.saveCollapsed();
  }
  discloseOf(node, isMainline) {
    if (!node) return void 0;
    return this.isCollapsible(node, isMainline) ? this.ctrl.settings.disclosureMode && node.collapsed ? "collapsed" : "expanded" : void 0;
  }
  onAddNode(node, path) {
    if (this.noop || this.cache.movesDirty) return;
    this.cache.movesDirty = !this.ctrl.tree.pathExists(path + node.id);
  }
  async saveMoves(force = false) {
    if (this.noop || this.ctrl.study || !(this.cache.movesDirty || force)) return void 0;
    return this.moveDb().then(
      (db) => db.put(this.id, { root: structuredCloneLite(this.ctrl.tree.root) })
    );
  }
  async merge() {
    if (this.noop || !("indexedDB" in window) || !window.indexedDB) return;
    try {
      this.cacheMap.set(this.id, { movesDirty: false });
      await Promise.all([
        this.collapseDb().then((db) => db.getOpt(this.id)).then((collapsedPaths) => {
          if (!collapsedPaths) return this.collapseDefault();
          for (const path of collapsedPaths) {
            this.ctrl.tree.updateAt(path, (n) => n.collapsed = true);
          }
        }),
        !this.ctrl.study && this.moveDb().then((db) => db.getOpt(this.id)).then((moves) => {
          if (moves == null ? void 0 : moves.root) {
            this.ctrl.tree.merge(completeNode(this.ctrl.variantKey)(moves.root));
            this.cache.movesDirty = true;
          }
        })
      ]);
    } catch (e) {
      console.log("IDB error.", e);
    }
  }
  get movesDirty() {
    return this.cache.movesDirty;
  }
  get id() {
    var _a, _b;
    return (_b = (_a = this.ctrl.study) == null ? void 0 : _a.data.chapter.id) != null ? _b : this.ctrl.data.game.id;
  }
  get noop() {
    return this.id === "synthetic";
  }
  get cache() {
    if (this.cacheMap.has(this.id)) return this.cacheMap.get(this.id);
    const state = { movesDirty: false };
    this.cacheMap.set(this.id, state);
    return state;
  }
  async saveCollapsed() {
    return this.collapseDb().then((db) => db.put(this.id, this.getCollapsed()));
  }
  isCollapsible(node, isMainline) {
    var _a;
    const [first, second, third] = node.children.filter(
      (n) => this.ctrl.settings.showStaticAnalysis || !n.comp
    );
    return Boolean(
      (first == null ? void 0 : first.forceVariation) || third || second && hasBranching(second, 6) || isMainline && this.ctrl.treeView.mode === "column" && (second || ((_a = first == null ? void 0 : first.comments) == null ? void 0 : _a.filter(Boolean).length))
    );
  }
  getCollapsed() {
    const collapsedPaths = [];
    function traverse(node, path) {
      if (node.collapsed) collapsedPaths.push(path);
      for (const c of node.children) traverse(c, path + c.id);
    }
    traverse(this.ctrl.tree.root, "");
    return collapsedPaths;
  }
  collapseDefault() {
    const depthThreshold = 1;
    const traverse = (node, depth) => {
      if (depth === depthThreshold && this.isCollapsible(node, false)) {
        node.collapsed = true;
      }
      node.children.forEach((n, i) => traverse(n, depth + (i === 0 ? 0 : 1)));
    };
    traverse(this.ctrl.tree.root, 0);
  }
  familyOf(path) {
    const parentPath = path.slice(0, -2);
    return [
      parentPath,
      this.ctrl.tree.nodeAtPath(parentPath).children.filter((x) => !x.comp || this.ctrl.settings.showStaticAnalysis)
    ];
  }
};

// ../analyse/src/keyboard.ts
var keyToMouseEvent = (key, eventName, selector2) => window.site.mousetrap.bind(
  key,
  () => $(selector2).each(function() {
    this.dispatchEvent(new MouseEvent(eventName));
  })
);
var bind2 = (ctrl2) => {
  var _a;
  addModifierKeyListeners(ctrl2);
  const kbd = window.site.mousetrap;
  kbd.bind(["left", "k"], () => {
    ctrl2.navigate.prev();
    ctrl2.redraw();
  }).bind(["right", "j"], () => {
    ctrl2.navigate.next();
    ctrl2.redraw();
  }).bind(["up", "0", "home"], (e) => {
    if (e.key === "ArrowUp" && ctrl2.fork.select("prev")) ctrl2.setAutoShapes();
    else ctrl2.navigate.first();
    ctrl2.redraw();
  }).bind(["down", "$", "end"], (e) => {
    if (e.key === "ArrowDown" && ctrl2.fork.select("next")) ctrl2.setAutoShapes();
    else ctrl2.navigate.last();
    ctrl2.redraw();
  }).bind("shift+c", () => {
    ctrl2.showComments = !ctrl2.showComments;
    ctrl2.treeView.requestAutoScroll("smooth");
    ctrl2.redraw();
  }).bind("shift+i", () => ctrl2.settings.set("inline", !ctrl2.settings.inline));
  kbd.bind("space", () => {
    var _a2, _b;
    const gb = ctrl2.gamebookPlay();
    if (gb) gb.onSpace();
    else if (ctrl2.practice || ((_a2 = ctrl2.study) == null ? void 0 : _a2.practice) || ((_b = ctrl2.retro) == null ? void 0 : _b.isSolving())) return void 0;
    else if (ctrl2.cevalEnabled()) ctrl2.playBestMove();
    else if (ctrl2.isCevalAllowed() && ctrl2.ceval.analysable) ctrl2.cevalEnabled(!ctrl2.cevalEnabled());
    return void 0;
  });
  if ((_a = ctrl2.study) == null ? void 0 : _a.practice) return;
  kbd.bind("h", () => {
    ctrl2.toggleActionMenu();
    ctrl2.redraw();
  }).bind("f", ctrl2.flip).bind("?", () => {
    ctrl2.keyboardHelp = !ctrl2.keyboardHelp;
    if (ctrl2.keyboardHelp) pubsub.emit("analysis.closeAll");
    ctrl2.redraw();
  }).bind("l", () => {
    if (ctrl2.isCevalAllowed() && ctrl2.ceval.analysable) ctrl2.cevalEnabled(!ctrl2.cevalEnabled());
  }).bind("z", () => ctrl2.settings.set("showStaticAnalysis", !ctrl2.settings.showStaticAnalysis)).bind("a", () => ctrl2.settings.set("showBestMoveArrows", !ctrl2.settings.showBestMoveArrows)).bind("v", () => ctrl2.settings.set("showVariationArrows", !ctrl2.settings.showVariationArrows)).bind("x", () => ctrl2.toggleThreatMode()).bind("e", () => {
    ctrl2.toggleExplorer();
    ctrl2.redraw();
  });
  kbd.bind(["shift+left", "shift+k"], () => {
    ctrl2.navigate.previousBranch();
    ctrl2.redraw();
  }).bind(["shift+right", "shift+j"], () => {
    ctrl2.navigate.nextBranch();
    ctrl2.redraw();
  }).bind("shift+down", () => {
    ctrl2.userJumpIfCan(ctrl2.idbTree.stepLine(ctrl2.path, "next"), true);
    ctrl2.redraw();
  }).bind("shift+up", () => {
    ctrl2.userJumpIfCan(ctrl2.idbTree.stepLine(ctrl2.path, "prev"), true);
    ctrl2.redraw();
  });
  kbd.bind("shift+space", () => {
    var _a2;
    const move = (_a2 = document.querySelector(".explorer-box:not(.loading) tbody tr[data-uci]")) == null ? void 0 : _a2.getAttribute("data-uci");
    if (move) ctrl2.explorerMove(move);
  });
};
var view6 = (ctrl2) => snabDialog({
  class: "help.keyboard-help",
  htmlUrl: url("/analysis/help", { study: !!ctrl2.study }),
  modal: true,
  easyClose: "clickOutside",
  onClose() {
    ctrl2.keyboardHelp = false;
    ctrl2.redraw();
  }
});
function addModifierKeyListeners(ctrl2) {
  let modifierOnly = false;
  window.addEventListener("mousedown", () => modifierOnly = false, { capture: true });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Shift" || e.key === "Control") modifierOnly = !modifierOnly;
    else modifierOnly = false;
  });
  document.addEventListener("keyup", (e) => {
    var _a;
    if (!modifierOnly) return;
    modifierOnly = false;
    const isShift = e.key === "Shift" && !((_a = document.activeElement) == null ? void 0 : _a.classList.contains("mchat__say"));
    if (isShift && ctrl2.fork.select("next")) ctrl2.setAutoShapes();
    else if (e.key === "Control") ctrl2.toggleDiscloseOf();
    ctrl2.redraw();
  });
}

// ../analyse/src/liveAnnotate.ts
var glyphs2 = {
  inaccuracy: { id: 6, symbol: "?!", name: "Inaccuracy" },
  mistake: { id: 2, symbol: "?", name: "Mistake" },
  blunder: { id: 4, symbol: "??", name: "Blunder" }
};
var LiveAnnotate = class {
  constructor() {
    this.glyphs = /* @__PURE__ */ new Map();
    this.get = this.glyphs.get.bind(this.glyphs);
    this.onNewCeval = (path, node, tree) => {
      const parent = tree.parentNode(path);
      this.update(path, node, parent);
      node.children.forEach((child) => this.update(path + child.id, child, node));
    };
    this.liveGlyph = (node, parent) => {
      var _a;
      if (!parent.ceval || node.uci === parent.ceval.bestmove) return void 0;
      const postMoveEval = (_a = parent.ceval.pvs.find((pv) => node.uci === pv.moves[0])) != null ? _a : node.ceval;
      if (!postMoveEval) return void 0;
      const color = node.ply % 2 === 1 ? "white" : "black";
      const loss = povChances(color, parent.ceval) - povChances(color, postMoveEval);
      if (loss > 0.3) return glyphs2.blunder;
      if (loss > 0.2) return glyphs2.mistake;
      if (loss > 0.1) return glyphs2.inaccuracy;
      return void 0;
    };
    this.update = (path, node, parent) => {
      if (!path.length) return;
      const glyph = this.liveGlyph(node, parent);
      if (glyph) this.glyphs.set(path, glyph);
      else this.glyphs.delete(path);
    };
  }
};

// ../analyse/src/motif/boardAnalysis.ts
var boardAnalysisVariants = [
  "standard",
  "chess960",
  "fromPosition",
  "kingOfTheHill",
  "threeCheck",
  "racingKings"
];
var values = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100 };
var isSquareAttacked = (square, byColor, cb) => knightAttacks(square).intersects(cb[byColor].intersect(cb.knight)) || pawnAttacks(opposite(byColor), square).intersects(cb[byColor].intersect(cb.pawn)) || kingAttacks(square).intersects(cb[byColor].intersect(cb.king)) || rookAttacks(square, cb.occupied).intersects(cb[byColor].intersect(cb.rooksAndQueens())) || bishopAttacks(square, cb.occupied).intersects(cb[byColor].intersect(cb.bishopsAndQueens()));
function getAttackers(square, byColor, cb, byRole) {
  const attackers = [];
  const colorSet = cb[byColor];
  const add = (squares) => {
    for (const square2 of squares) {
      const piece = cb.get(square2);
      if (piece && (!byRole || piece.role === byRole)) attackers.push({ piece, square: square2 });
    }
  };
  add(knightAttacks(square).intersect(colorSet).intersect(cb.knight));
  add(pawnAttacks(opposite(byColor), square).intersect(colorSet).intersect(cb.pawn));
  add(kingAttacks(square).intersect(colorSet).intersect(cb.king));
  add(rookAttacks(square, cb.occupied).intersect(colorSet).intersect(cb.rooksAndQueens()));
  add(bishopAttacks(square, cb.occupied).intersect(colorSet).intersect(cb.bishopsAndQueens()));
  const pins = detectPins(cb);
  const usableAttacker = (attacker) => {
    var _a;
    if (attacker.piece.role === "king" && isSquareAttacked(square, opposite(byColor), cb)) return false;
    const pin = pins.find((p) => p.pinned === attacker.square);
    return !pin || ((_a = cb.get(pin.target)) == null ? void 0 : _a.role) !== "king" || square === pin.pinner || between(pin.pinner, pin.target).has(square);
  };
  return attackers.filter(usableAttacker);
}
function detectPins(cb) {
  const pins = [];
  const { occupied } = cb;
  for (const square of occupied) {
    const piece = cb.get(square);
    if (!piece) continue;
    if (piece.role !== "bishop" && piece.role !== "rook" && piece.role !== "queen") continue;
    const attackSet = attacks(piece, square, occupied);
    const pinnedCandidates = attackSet.intersect(cb[opposite(piece.color)]);
    for (const pinned of pinnedCandidates) {
      const raySet = ray(square, pinned);
      const xray = attacks(piece, square, occupied.without(pinned)).intersect(raySet);
      const targets = xray.intersect(occupied).without(pinned);
      for (const target of targets) {
        if (!between(square, target).has(pinned)) continue;
        const targetPiece = cb.get(target);
        if (!targetPiece || targetPiece.color === piece.color) continue;
        const pinnedPiece = cb.get(pinned);
        if (!pinnedPiece) continue;
        if (targetPiece.role === "king") {
          pins.push({ pinned, pinner: square, target });
        } else {
          const valTarget = values[targetPiece.role], valPinned = values[pinnedPiece.role], valAttacker = values[piece.role];
          if (valTarget > valPinned && // Back piece is worth more than front piece
          (!isSquareAttacked(target, targetPiece.color, cb) || valTarget > valAttacker)) {
            pins.push({ pinned, pinner: square, target });
          }
        }
        break;
      }
    }
  }
  return pins;
}
var epTargetPawnSq = (epSquare) => squareFromCoords(squareFile(epSquare), squareRank(epSquare) === 2 ? 3 : 4);
var lookupKey = ({ occupied }, target) => `${occupied.hi},${occupied.lo},${target.role}`;
function getSEE(square, isEpSquare, target, cb, lookupTable, recursiveCall) {
  if (!recursiveCall) {
    cb = cb.clone();
    cb.take(square);
    if (isEpSquare) cb.take(epTargetPawnSq(square));
  }
  const key = lookupKey(cb, target);
  if (lookupTable.has(key)) return lookupTable.get(key);
  const attackers = getAttackers(square, opposite(target.color), cb, isEpSquare ? "pawn" : void 0);
  attackers.sort((a, b) => values[a.piece.role] - values[b.piece.role]);
  let bestChoiceBalance = 0;
  let firstAttacker = void 0;
  for (const attacker of attackers.slice(0, 2)) {
    const simulationBoard = cb.clone();
    simulationBoard.take(attacker.square);
    const opponentRecaptureBalance = getSEE(
      square,
      false,
      attacker.piece,
      simulationBoard,
      lookupTable,
      true
    ).balance;
    const currChoiceBalance = values[target.role] - opponentRecaptureBalance;
    if (currChoiceBalance > bestChoiceBalance) {
      bestChoiceBalance = currChoiceBalance;
      firstAttacker = attacker.square;
    }
  }
  const result = { balance: bestChoiceBalance, firstAttacker };
  lookupTable.set(key, result);
  return result;
}
function detectUndefended(board, epSquare) {
  const undefended = [];
  const cb = board;
  for (let i = 0; i < 64; i++) {
    const p = board.get(i === epSquare ? epTargetPawnSq(epSquare) : i);
    if (p && p.role !== "king" && isSquareAttacked(i, opposite(p.color), cb)) {
      const { balance, firstAttacker } = getSEE(i, i === epSquare, p, cb, /* @__PURE__ */ new Map(), false);
      if (balance > 0 && firstAttacker !== void 0) {
        undefended.push({
          square: i,
          materialLoss: balance,
          principalAttacker: firstAttacker
        });
      }
    }
  }
  return undefended;
}
function detectCheckable(cb, epSquare, castlingRights) {
  const checkable = [];
  for (const color of COLORS) {
    const kSq = cb.kingOf(color);
    if (kSq === void 0 || isSquareAttacked(kSq, opposite(color), cb)) continue;
    const oppColor = opposite(color);
    const res = Chess.fromSetup({
      board: cb,
      turn: oppColor,
      castlingRights,
      epSquare,
      halfmoves: 0,
      fullmoves: 1,
      pockets: void 0,
      remainingChecks: void 0
    });
    if ("error" in res) continue;
    const legalPos = res.value;
    const dests = chessgroundDests(legalPos);
    let checkFound;
    const enemies = cb[oppColor];
    const enemyRooksQueens = enemies.intersect(cb.rooksAndQueens());
    const enemyBishopsQueens = enemies.intersect(cb.bishopsAndQueens());
    for (const [fromStr, tos] of dests) {
      if (checkFound) break;
      const from = parseSquare(fromStr);
      const piece = cb.get(from);
      if (!piece) continue;
      for (const toStr of tos) {
        const to = parseSquare(toStr);
        const rank = squareRank(to);
        const isPromo = piece.role === "pawn" && (rank === 0 || rank === 7);
        const isCastling = piece.role === "king" && Math.abs(to - from) > 1;
        const isEp = piece.role === "pawn" && to === epSquare;
        if (isPromo || isCastling || isEp) {
          const candidates = isPromo ? ["queen", "knight"] : [void 0];
          for (const promotion of candidates) {
            const testPos = legalPos.clone();
            testPos.play({ from, to, promotion });
            if (testPos.isCheck()) {
              checkFound = { from, to, promotion };
              break;
            }
          }
        } else {
          const occupied = cb.occupied.without(from).with(to);
          if (attacks(piece, to, occupied).has(kSq) || rookAttacks(kSq, occupied).intersects(enemyRooksQueens.without(from)) || bishopAttacks(kSq, occupied).intersects(enemyBishopsQueens.without(from))) {
            checkFound = { from, to };
          }
        }
        if (checkFound) break;
      }
    }
    if (checkFound) checkable.push({ king: kSq, check: checkFound });
  }
  return checkable;
}

// ../analyse/src/motif/motifCtrl.ts
var MotifCtrl = class {
  constructor(settings2) {
    this.settings = settings2;
    this.supports = (variant) => boardAnalysisVariants.includes(variant);
    this.any = () => this.settings.showPinnedPieces || this.settings.showCheckableKing || this.settings.showUndefendedPieces;
    this.detectPins = (board) => this.settings.showPinnedPieces ? detectPins(board) : [];
    this.detectUndefended = (board, epSquare) => this.settings.showUndefendedPieces ? detectUndefended(board, epSquare) : [];
    this.detectCheckable = (board, epSquare, castlingRights) => this.settings.showCheckableKing ? detectCheckable(board, epSquare, castlingRights) : [];
  }
};

// ../analyse/src/navigate.ts
var Navigate = class {
  constructor(ctrl2) {
    this.ctrl = ctrl2;
    this.next = () => {
      var _a;
      if ((_a = this.ctrl.retro) == null ? void 0 : _a.preventGoingToNextMove()) return;
      if (this.ctrl.fork.proceed()) return;
      const child = this.ctrl.node.children[0];
      if (child) this.ctrl.userJumpIfCan(this.ctrl.path + child.id);
    };
    this.prev = () => this.ctrl.userJumpIfCan(path_exports.init(this.ctrl.path));
    this.last = () => this.ctrl.userJumpIfCan(path_exports.fromNodeList(this.ctrl.mainline));
    this.first = () => this.ctrl.userJump(path_exports.root);
    this.previousBranch = () => {
      let path = path_exports.init(this.ctrl.path), parent = this.ctrl.tree.nodeAtPath(path);
      while (path.length && parent && this.ctrl.visibleChildren(parent).length < 2) {
        path = path_exports.init(path);
        parent = this.ctrl.tree.nodeAtPath(path);
      }
      this.ctrl.userJumpIfCan(path);
    };
    this.nextBranch = () => {
      let child = this.ctrl.visibleChildren()[this.ctrl.fork.selectedIndex];
      let path = this.ctrl.path;
      while (child && child.children.length < 2) {
        path += child.id;
        child = child.children[0];
      }
      if (child) this.ctrl.userJumpIfCan(path + child.id);
      else if (this.ctrl.tree.pathIsMainline(this.ctrl.path)) this.last();
      else this.exitVariation();
    };
    this.exitVariation = () => {
      if (this.ctrl.onMainline) return;
      let found, path = path_exports.root;
      this.ctrl.nodeList.slice(1, -1).forEach((n) => {
        path += n.id;
        if (n.children[1]) found = path;
      });
      if (found) this.ctrl.userJump(found);
    };
  }
};

// ../analyse/src/nodeFinder.ts
var hasCompChild = (node) => node.children.some((c) => !!c.comp);
var nextGlyphSymbol = (color, symbol, mainline, fromPly2) => mainline.map((_, i) => mainline[(fromPly2 - mainline[0].ply + i + 1) % mainline.length]).find((n) => {
  var _a;
  return n.ply % 2 === (color === "white" ? 1 : 0) && ((_a = n.glyphs) == null ? void 0 : _a.some((g) => g.symbol === symbol));
});
var evalSwings = (mainline, nodeFilter) => mainline.slice(1).filter((curr, i) => {
  const prev = mainline[i];
  return nodeFilter(curr) && curr.eval && prev.eval && hasCompChild(prev) && (Math.abs(winningChances_exports.povDiff("white", prev.eval, curr.eval)) > 0.1 || prev.eval.mate && !curr.eval.mate && Math.abs(prev.eval.mate) <= 3);
});
function detectThreefold(nodeList, node) {
  if (defined(node.threefold)) return;
  const currentEpd = fenToEpd(node.fen);
  node.threefold = nodeList.filter((n) => fenToEpd(n.fen) === currentEpd).length > 2;
}
function add3or5FoldGlyphs(mainlineNodes) {
  const lastEpd = fenToEpd(mainlineNodes[mainlineNodes.length - 1].fen);
  const repetitions = mainlineNodes.filter((n) => fenToEpd(n.fen) === lastEpd);
  if (repetitions.length > 2) {
    const unicodeList = ["\u2460", "\u2461", "\u2462", "\u2463", "\u2464"];
    for (const [i, [node, unicode]] of zip(repetitions, unicodeList).entries()) {
      const glyph = { symbol: unicode, name: `repetition number ${i + 1}`, id: 9 };
      if (!node.glyphs) node.glyphs = [glyph];
      else node.glyphs.push(glyph);
    }
    return true;
  }
  return false;
}

// ../analyse/src/study/nextChapter.ts
var renderNextChapter = (ctrl2) => {
  var _a;
  return !ctrl2.opts.relay && ((_a = ctrl2.study) == null ? void 0 : _a.hasNextChapter()) ? h(
    "button.next.text",
    {
      attrs: { "data-icon": licon.PlayTriangle, type: "button" },
      hook: bind("click", ctrl2.study.goToNextChapter),
      class: { highlighted: !!ctrl2.node.outcome() || ctrl2.node === ops_exports.last(ctrl2.mainline) }
    },
    i18n.study.nextChapter
  ) : null;
};

// ../analyse/src/practice/practiceView.ts
var commentBest = (c, ctrl2) => c.best ? i18n.site[c.verdict === "goodMove" ? "anotherWasX" : "bestWasX"].asArray(
  hl(
    "move",
    {
      hook: {
        ...onInsert((elem) => {
          elem.addEventListener("click", ctrl2.playCommentBest);
          elem.addEventListener("mouseover", () => ctrl2.commentShape(true));
          elem.addEventListener("mouseout", () => ctrl2.commentShape(false));
        }),
        destroy: () => ctrl2.commentShape(false)
      }
    },
    hl("san", fixCrazySan(c.best.san))
  )
) : [];
var renderOffTrack = (ctrl2) => hl("div.player.off", [
  hl("div.icon.off", "!"),
  hl("div.instruction", [
    hl("strong", i18n.site.youBrowsedAway),
    hl("div.choices", [
      hl("a", { hook: bind("click", ctrl2.resume, ctrl2.redraw) }, i18n.site.resumePractice)
    ])
  ])
]);
function renderEnd(root, end) {
  var _a;
  const color = end.winner || root.turnColor();
  const isFiftyMoves = ((_a = root.practice) == null ? void 0 : _a.currentNode().fen.split(" ")[4]) === "100";
  return hl("div.player", [
    color ? hl("div.no-square", hl("piece.king." + color)) : hl("div.icon.off", "!"),
    hl("div.instruction", [
      hl("strong", end.winner ? i18n.site.checkmate : i18n.site.draw),
      end.winner ? hl("em", hl("color", i18n.site[end.winner === "white" ? "whiteWinsGame" : "blackWinsGame"])) : isFiftyMoves ? i18n.site.drawByFiftyMoves : hl("em", i18n.site.theGameIsADraw)
    ])
  ]);
}
function renderRunning(root, ctrl2) {
  const hint = ctrl2.hinting();
  return hl("div.player.running", [
    hl("div.no-square", hl("piece.king." + root.turnColor())),
    hl("div.instruction", [
      ctrl2.isMyTurn() ? hl("strong", i18n.site.yourTurn) : hl("strong", i18n.site.computerThinking),
      hl(
        "div.choices",
        ctrl2.isMyTurn() ? hl(
          "a",
          { hook: bind("click", () => root.practice.hint(), ctrl2.redraw) },
          hint ? hint.mode === "piece" ? i18n.site.seeBestMove : i18n.site.hideBestMove : i18n.site.getAHint
        ) : ""
      )
    ])
  ]);
}
function renderCustomPearl({ ceval }, hardMode) {
  var _a, _b, _c;
  if (hardMode) {
    const time = i18n.site.nbSeconds(
      !isFinite(ceval.storedMovetime()) ? 60 : Math.round(ceval.storedMovetime() / 1e3)
    );
    return hl("div.practice-mode", [hl("p", "Mastery"), hl("p.secondary", time)]);
  }
  return hl("div.practice-mode", [
    hl("p", "Casual"),
    hl("p.secondary", (_c = (_b = (_a = api.overrides).practiceStrengthLabel) == null ? void 0 : _b.call(_a)) != null ? _c : "600 kNodes")
  ]);
}
var renderCustomStatus = ({ ceval }, hardMode) => ceval.isComputing ? void 0 : hl(
  "button.status.button-link",
  { hook: bind("click", () => hardMode(!hardMode())) },
  "Toggle difficulty"
);
function practiceView_default(root) {
  var _a;
  const ctrl2 = root.practice;
  if (!ctrl2) return void 0;
  const comment = ctrl2.comment();
  const isFiftyMoves = ctrl2.currentNode().fen.split(" ")[4] === "100";
  const running = ctrl2.running();
  const end = ctrl2.currentNode().threefold || isFiftyMoves ? { winner: void 0 } : root.node.outcome();
  return hl("div.practice-box.training-box.sub-box." + (comment ? comment.verdict : "no-verdict"), [
    hl("div.title", i18n.site.practiceWithComputer),
    hl(
      "div.feedback",
      end ? renderEnd(root, end) : running ? renderRunning(root, ctrl2) : renderOffTrack(ctrl2)
    ),
    running ? hl(
      "div.comment",
      (end && !((_a = root.study) == null ? void 0 : _a.practice) ? renderNextChapter(root) : null) || (comment ? [
        hl(
          "span.verdict",
          comment.verdict === "goodMove" ? i18n.study.goodMove : i18n.site[comment.verdict]
        ),
        " ",
        ...commentBest(comment, ctrl2)
      ] : [ctrl2.isMyTurn() || end ? "" : hl("span.wait", i18n.site.evaluatingYourMove)])
    ) : null
  ]);
}

// ../analyse/src/practice/practiceCtrl.ts
function make(root) {
  const masteryMode = storedBooleanPropWithEffect("analyse.practice-hard-mode", false, root.redraw);
  const variant = root.data.game.variant.key, running = prop(true), comment = prop(null), hovering = prop(null), hinting = prop(null), played = prop(false), altCastles = {
    e1a1: "e1c1",
    e1h1: "e1g1",
    e8a8: "e8c8",
    e8h8: "e8g8"
  };
  function commentable(node) {
    if (node.tbhit || node.outcome()) return true;
    if (!node.ceval) return false;
    if (api.overrides.practiceCommentReady)
      return api.overrides.practiceCommentReady(structuredClone(node.ceval));
    const { bestmove, nodes, millis } = node.ceval;
    return Boolean(bestmove || nodes >= 4e5 || (millis != null ? millis : 0) > 1e3);
  }
  function playable2(node) {
    if (!node.ceval) return false;
    if (api.overrides.practiceEvalReady) return api.overrides.practiceEvalReady(structuredClone(node.ceval));
    const { bestmove, nodes, millis, cloud } = node.ceval;
    return masteryMode() ? !root.ceval.isComputing : Boolean(bestmove || nodes >= 6e5 || cloud || millis > 2e3);
  }
  const tbhitToEval = (hit) => hit && (hit.winner ? {
    mate: hit.winner === "white" ? 10 : -10
  } : { cp: 0 });
  const nodeBestUci = (node) => {
    var _a, _b;
    return ((_a = node.tbhit) == null ? void 0 : _a.best) || ((_b = node.ceval) == null ? void 0 : _b.pvs[0].moves[0]);
  };
  function makeComment(prev, node, path) {
    let verdict, best;
    const outcome = node.outcome();
    if (outcome == null ? void 0 : outcome.winner) verdict = "goodMove";
    else {
      const isFiftyMoves = node.fen.split(" ")[4] === "100";
      const nodeEval = tbhitToEval(node.tbhit) || (node.threefold || outcome && !outcome.winner || isFiftyMoves ? { cp: 0 } : node.ceval);
      const prevEval = tbhitToEval(prev.tbhit) || prev.ceval;
      const shift = -winningChances_exports.povDiff(root.bottomColor(), nodeEval, prevEval);
      best = nodeBestUci(prev);
      if (best === node.uci || node.san.startsWith("O-O") && best === altCastles[node.uci])
        best = void 0;
      if (!best) verdict = "goodMove";
      else if (shift < 0.025) verdict = "goodMove";
      else if (shift < 0.06) verdict = "inaccuracy";
      else if (shift < 0.14) verdict = "mistake";
      else verdict = "blunder";
    }
    return {
      prev,
      node,
      path,
      verdict,
      best: best ? {
        uci: best,
        san: prev.pos().unwrap(
          (pos) => makeSan(pos, parseUci(best)),
          (_) => "--"
        )
      } : void 0
    };
  }
  const isMyTurn = () => root.turnColor() === root.bottomColor();
  function checkCeval() {
    const node = root.node;
    if (!running()) {
      comment(null);
      return root.redraw();
    }
    if (tablebaseGuaranteed(variant, node.fen) && !defined(node.tbhit)) return;
    if (isMyTurn()) {
      const h2 = hinting();
      if (h2) {
        h2.uci = nodeBestUci(node) || h2.uci;
        root.setAutoShapes();
      }
    } else {
      comment(null);
      if (node.san && commentable(node)) {
        const parentNode = root.tree.parentNode(root.path);
        if (commentable(parentNode)) comment(makeComment(parentNode, node, root.path));
        else {
          const olderNode = root.tree.parentNode(path_exports.init(root.path));
          if (commentable(olderNode)) comment(makeComment(olderNode, node, root.path));
        }
      }
      if (!played() && playable2(node)) {
        root.playUci(nodeBestUci(node));
        played(true);
      } else root.redraw();
    }
  }
  function checkCevalOrTablebase() {
    if (tablebaseGuaranteed(variant, root.node.fen))
      root.explorer.fetchTablebaseHit(root.node.fen).then(
        (hit) => {
          if (hit && root.node.fen === hit.fen) root.node.tbhit = hit;
          checkCeval();
        },
        () => {
          if (!defined(root.node.tbhit)) root.node.tbhit = null;
          checkCeval();
        }
      );
    else checkCeval();
  }
  function resume() {
    running(true);
    checkCevalOrTablebase();
  }
  requestIdleCallbackSafe(checkCevalOrTablebase, 800);
  return {
    onCeval: checkCeval,
    onJump() {
      played(false);
      hinting(null);
      detectThreefold(root.nodeList, root.node);
      checkCevalOrTablebase();
    },
    isMyTurn,
    comment,
    running,
    hovering,
    hinting,
    resume,
    reset() {
      comment(null);
      hinting(null);
    },
    preUserJump(from, to) {
      if (from !== to) {
        running(false);
        comment(null);
      }
    },
    postUserJump(from, to) {
      if (from !== to && isMyTurn()) resume();
    },
    onUserMove() {
      running(true);
    },
    playCommentBest() {
      const c = comment();
      if (!c) return;
      root.jump(path_exports.init(c.path));
      if (c.best) root.playUci(c.best.uci);
    },
    commentShape(enable) {
      const c = comment();
      if (!enable || !(c == null ? void 0 : c.best)) hovering(null);
      else
        hovering({
          uci: c.best.uci
        });
      root.setAutoShapes();
    },
    hint() {
      const best = root.node.ceval ? root.node.ceval.pvs[0].moves[0] : null, prev = hinting();
      if (!best || (prev == null ? void 0 : prev.mode) === "move") hinting(null);
      else
        hinting({
          mode: prev ? "move" : "piece",
          uci: best
        });
      root.setAutoShapes();
    },
    currentNode: () => root.node,
    bottomColor: root.bottomColor,
    redraw: root.redraw,
    customCeval: {
      search: () => {
        var _a, _b, _c;
        return masteryMode() && !isMyTurn() ? 60 * 1e3 : (_c = (_b = (_a = api.overrides).practiceSearch) == null ? void 0 : _b.call(_a)) != null ? _c : { by: { nodes: 6e5 }, multiPv: 1, indeterminate: true };
      },
      pearlNode: () => renderCustomPearl(root, masteryMode()),
      statusNode: () => root.ceval.isComputing ? void 0 : renderCustomStatus(root, masteryMode)
    }
  };
}

// ../analyse/src/retrospect/retroCtrl.ts
function make2(root, color) {
  const game2 = root.data.game;
  let candidateNodes = [];
  const explorerCancelPlies = [];
  let solvedPlies = [];
  const current = prop(null);
  const feedback2 = prop("find");
  function safeRedraw() {
    if (!site.blindMode) root.redraw();
  }
  const isPlySolved = (ply) => solvedPlies.includes(ply);
  const isPlyLearnCandidate = (ply) => candidateNodes.some((n) => n.ply === ply);
  function findNextNode() {
    const colorModulo = color === "white" ? 1 : 0;
    candidateNodes = evalSwings(
      root.mainline,
      (n) => n.ply % 2 === colorModulo && !explorerCancelPlies.includes(n.ply)
    );
    return candidateNodes.find((n) => !isPlySolved(n.ply));
  }
  function jumpToNext2() {
    feedback2("find");
    const node = findNextNode();
    if (!node) {
      current(null);
      return safeRedraw();
    }
    const fault = {
      node,
      path: root.mainlinePlyToPath(node.ply)
    };
    const prevPath = path_exports.init(fault.path);
    const prev = {
      node: root.tree.nodeAtPath(prevPath),
      path: prevPath
    };
    const solutionNode = prev.node.children.find((n) => !!n.comp);
    current({
      fault,
      prev,
      solution: {
        node: solutionNode,
        path: prevPath + solutionNode.id
      },
      openingUcis: []
    });
    if (game2.variant.key === "standard" && game2.division && (!game2.division.middle || fault.node.ply < game2.division.middle)) {
      root.explorer.fetchMasterOpening(prev.node.fen).then((res) => {
        const cur = current();
        const ucis = [];
        res.moves.forEach((m) => {
          if (m.white + m.draws + m.black > 1) ucis.push(m.uci);
        });
        if (ucis.includes(fault.node.uci)) {
          explorerCancelPlies.push(fault.node.ply);
          setTimeout(jumpToNext2, 100);
        } else {
          cur.openingUcis = ucis;
          current(cur);
        }
      }).catch(() => {
      });
    }
    root.userJump(prev.path);
    safeRedraw();
  }
  function onJump() {
    var _a;
    const node = root.node, fb = feedback2(), cur = current();
    if (!cur) return;
    if (fb === "eval" && cur.fault.node.ply !== node.ply || fb === "offTrack" && cur.prev.path === root.path) {
      feedback2("find");
      root.setAutoShapes();
      return;
    }
    if (isSolving() && cur.fault.node.ply === node.ply) {
      if (cur.openingUcis.includes(node.uci) || ((_a = node.san) == null ? void 0 : _a.endsWith("#")) || node.comp)
        onWin();
      else if (node.eval)
        onFail();
      else {
        feedback2("eval");
        checkCeval();
      }
    } else if (isSolving() && cur.prev.path !== root.path) feedback2("offTrack");
    root.setAutoShapes();
  }
  const isCevalReady = (node) => {
    var _a, _b, _c, _d;
    if (!node.ceval) return false;
    return (_d = (_b = (_a = api.overrides).learnFromMistakesEvalReady) == null ? void 0 : _b.call(_a, structuredClone(node.ceval))) != null ? _d : Boolean(node.ceval.bestmove || node.ceval.nodes >= 1e6 || ((_c = node.ceval.millis) != null ? _c : 0) > 3e3);
  };
  function checkCeval() {
    const node = root.node, cur = current();
    if (!cur || feedback2() !== "eval" || cur.fault.node.ply !== node.ply) return;
    if (isCevalReady(node)) {
      const diff = winningChances_exports.povDiff(color, node.ceval, cur.prev.node.eval);
      if (diff > -0.04) onWin();
      else onFail();
    }
  }
  function onWin() {
    solveCurrent();
    if (site.blindMode) jumpToNext2();
    feedback2("win");
    safeRedraw();
  }
  function onFail() {
    feedback2("fail");
    const bad = {
      node: root.node,
      path: root.path
    };
    root.userJump(current().prev.path);
    if (!root.tree.pathIsMainline(bad.path) && isEmpty(bad.node.children)) root.tree.deleteNodeAt(bad.path);
    safeRedraw();
  }
  function viewSolution() {
    feedback2("view");
    root.userJump(current().solution.path);
    solveCurrent();
  }
  function skip() {
    solveCurrent();
    jumpToNext2();
  }
  function solveCurrent() {
    if (current()) solvedPlies.push(current().fault.node.ply);
  }
  const hideComputerLine = (node) => isPlyLearnCandidate(node.ply) && !isPlySolved(node.ply);
  function showBadNode() {
    const cur = current();
    return cur && isSolving() && cur.prev.path === root.path ? cur.fault.node : void 0;
  }
  const isSolving = () => ["find", "fail"].includes(feedback2());
  jumpToNext2();
  function onMergeAnalysisData() {
    if (isSolving() && !current()) jumpToNext2();
  }
  return {
    current,
    color,
    isPlySolved,
    onJump,
    jumpToNext: jumpToNext2,
    skip,
    viewSolution,
    hideComputerLine,
    showBadNode,
    onCeval: checkCeval,
    onMergeAnalysisData,
    feedback: feedback2,
    isSolving,
    completion: () => [solvedPlies.length, candidateNodes.length],
    reset() {
      solvedPlies = [];
      jumpToNext2();
    },
    flip() {
      if (root.data.game.variant.key !== "racingKings") root.flip();
      else {
        root.retro = make2(root, opposite2(color));
        safeRedraw();
      }
    },
    preventGoingToNextMove: () => {
      const cur = current();
      return isSolving() && !!cur && root.path === cur.prev.path;
    },
    close: root.toggleRetro,
    node: () => root.node,
    redraw: root.redraw,
    forceCeval: () => feedback2() === "eval"
  };
}

// ../analyse/src/settingsCtrl.ts
var Settings = class {
  constructor(showGauge = true, inline = false, showStaticAnalysis = true, disclosureMode = false, showLiveAnnotations = false, showBestMoveArrows = true, showManeuverMoveArrows = false, showVariationArrows = true, showMoveAnnotationsOnBoard = true, showUndefendedPieces = false, showPinnedPieces = false, showCheckableKing = false) {
    this.showGauge = showGauge;
    this.inline = inline;
    this.showStaticAnalysis = showStaticAnalysis;
    this.disclosureMode = disclosureMode;
    this.showLiveAnnotations = showLiveAnnotations;
    this.showBestMoveArrows = showBestMoveArrows;
    this.showManeuverMoveArrows = showManeuverMoveArrows;
    this.showVariationArrows = showVariationArrows;
    this.showMoveAnnotationsOnBoard = showMoveAnnotationsOnBoard;
    this.showUndefendedPieces = showUndefendedPieces;
    this.showPinnedPieces = showPinnedPieces;
    this.showCheckableKing = showCheckableKing;
  }
};
var defaultSettings = Object.freeze(new Settings());
var SettingsCtrl = class extends Settings {
  constructor(redraw) {
    super();
    this.redraw = redraw;
    this.key = ["analyse", myUserId(), "settings"].filter(Boolean).join(".");
    this.throttledSave = throttle(1e3, () => this.save());
    const local = localStorage.getItem(this.key);
    try {
      if (local) Object.assign(this, JSON.parse(local));
    } catch (e) {
      localStorage.removeItem(this.key);
    }
  }
  keys() {
    return Object.keys(defaultSettings);
  }
  set(key, value) {
    var _a;
    const oldValue = this[key];
    if (oldValue === value) return;
    this[key] = value;
    (_a = this.redraw) == null ? void 0 : _a.call(this);
    this.throttledSave();
  }
  async save() {
    const local = Object.fromEntries(this.keys().map((k) => [k, this[k]]));
    localStorage.setItem(this.key, JSON.stringify(local));
  }
};

// ../analyse/src/socket.ts
function make3(send, ctrl2) {
  if (!ctrl2.synthetic)
    setTimeout(function() {
      send("startWatching", ctrl2.data.game.id);
    }, 1e3);
  const handlers = {
    opening({ fen, opening: opening2 }) {
      console.log(fen, opening2);
    },
    fen(e) {
      if (ctrl2.forecast && e.id === ctrl2.data.game.id && !ops_exports.last(ctrl2.mainline).fen.startsWith(e.fen))
        ctrl2.forecast.reloadToLastPly();
    },
    analysisProgress(data) {
      ctrl2.mergeAnalysisData(data);
    },
    evalHit: ctrl2.evalCache.onCloudEval
  };
  function withoutStandardVariant(obj) {
    if (obj.variant === "standard") delete obj.variant;
  }
  function sendAnaMove(req) {
    var _a;
    const studyData = (_a = ctrl2.study) == null ? void 0 : _a.socketSendNodeData();
    if (studyData) {
      withoutStandardVariant(req);
      send("anaMove", { ...req, ...studyData });
    }
  }
  function sendAnaDrop(req) {
    var _a;
    const studyData = (_a = ctrl2.study) == null ? void 0 : _a.socketSendNodeData();
    if (studyData) {
      withoutStandardVariant(req);
      send("anaDrop", { ...req, ...studyData });
    }
  }
  return {
    receive(type, data) {
      var _a;
      const handler = handlers[type];
      if (handler) {
        handler(data);
        return true;
      }
      return !!((_a = ctrl2.study) == null ? void 0 : _a.socketHandler(type, data));
    },
    sendAnaMove,
    sendAnaDrop,
    send
  };
}

// ../analyse/src/study/studyComments.ts
function authorDom(author) {
  if (!author) return "Unknown";
  if (typeof author === "string") return author;
  return h("span.user-link.ulpt", { attrs: { "data-href": "/@/" + author.id } }, author.name);
}
var isAuthorObj = (author) => typeof author === "object";
var authorText = (author) => !author ? "Unknown" : typeof author === "string" ? author : author.name;
function currentComments(ctrl2, includingMine) {
  if (!ctrl2.node.comments) return void 0;
  const node = ctrl2.node, study = ctrl2.study, chapter = study.currentChapter(), comments = node.comments;
  if (!comments.length) return void 0;
  return h(
    "div",
    comments.map((comment) => {
      const by = comment.by;
      const isMine = isAuthorObj(by) && by.id === ctrl2.opts.userId;
      if (!includingMine && isMine) return void 0;
      return h("div.study__comment." + comment.id, [
        study.members.canContribute() && study.vm.mode.write ? h("a.edit", {
          attrs: { "data-icon": licon.Trash, title: "Delete" },
          hook: bind("click", async () => {
            if (await confirm("Delete " + authorText(by) + "'s comment?")) {
              study.commentForm.delete(chapter.id, ctrl2.path, comment.id);
              ctrl2.redraw();
            }
          })
        }) : null,
        authorDom(by),
        ...node.san ? [" on ", h("span.node", nodeFullName(node))] : [],
        ": ",
        h("div.text", { hook: richHTML(comment.text) })
      ]);
    })
  );
}

// ../analyse/src/treeView/inlineView.ts
function renderInlineView(ctrl2) {
  const renderer = new InlineView(ctrl2);
  const parentNode = ctrl2.tree.root;
  const parentDisclose = ctrl2.idbTree.discloseOf(parentNode, true);
  return hl(
    "div.tview2.tview2-inline",
    { class: { hidden: ctrl2.treeView.hidden, anchor: !!parentDisclose } },
    [
      renderer.commentNodes(parentNode),
      renderer.renderNodes(ctrl2.visibleChildren(parentNode), {
        parentPath: "",
        parentNode,
        parentDisclose,
        isMainline: true
      })
    ]
  );
}
var InlineView = class {
  constructor(ctrl2) {
    this.ctrl = ctrl2;
    this.inline = true;
    this.glyphs = ["good", "mistake", "brilliant", "blunder", "interesting", "inaccuracy"];
  }
  renderNodes([child, ...siblings], args) {
    if (!child) return void 0;
    const { isMainline, parentDisclose } = args;
    return child.forceVariation && isMainline ? hl("interrupt", this.lines([child, ...siblings], args)) : [
      this.moveNode(child, args),
      parentDisclose !== "collapsed" && [
        this.commentNodes(child),
        siblings[0] && hl("interrupt", this.lines(siblings, args))
      ],
      this.renderNodes(this.ctrl.visibleChildren(child), this.childArgs(child, args, true))
    ];
  }
  commentNodes(node, classes = {}) {
    if (!this.ctrl.showComments || !node.comments) return [];
    return node.comments.map(
      (comment) => {
        var _a;
        return ((_a = this.ctrl.retro) == null ? void 0 : _a.hideComputerLine(node)) && this.isLichessComment(comment) ? hl("comment", i18n.site.learnFromThisMistake) : (!this.isLichessComment(comment) || this.ctrl.settings.showStaticAnalysis) && hl("comment", {
          class: {
            inaccuracy: comment.text.startsWith("Inaccuracy."),
            mistake: comment.text.startsWith("Mistake."),
            blunder: comment.text.startsWith("Blunder."),
            ...classes
          },
          hook: innerHTML(
            comment.text,
            (text) => {
              var _a2;
              return ((_a2 = node.comments) == null ? void 0 : _a2[1]) ? `<span class="by">${escapeHtml(authorText(comment.by))}</span> ` + enrichText(text) : enrichText(text);
            }
          )
        });
      }
    ).filter(Boolean);
  }
  isLichessComment(comment) {
    return comment.by === "lichess" && comment.text.endsWith(" was best.");
  }
  lines(lines, args) {
    const { parentDisclose, parentPath, parentNode, isMainline } = args;
    if (!lines.length || parentDisclose === "collapsed") return void 0;
    const anchor = parentDisclose === "expanded" && (this.inline || !isMainline);
    const lineArgs = { parentPath, parentNode, isMainline: false };
    return (!isMainline || this.inline) && args.parenthetical ? hl("inline", this.sidelineNodes(lines, lineArgs)) : hl("lines", { class: { anchor } }, [
      parentDisclose === "expanded" && this.disclosureConnector(parentPath),
      lines.map(
        (line) => hl("line", [parentDisclose && hl("branch"), this.sidelineNodes([line], lineArgs)])
      )
    ]);
  }
  sidelineNodes([child, ...siblings], args) {
    if (!child) return void 0;
    const childArgs = this.childArgs(child, args, false);
    const sideline = [
      this.moveNode(child, args),
      this.commentNodes(child),
      args.parenthetical && this.lines(siblings, args),
      this.ctrl.settings.disclosureMode || child.children.length < 2 || childArgs.parenthetical ? this.sidelineNodes(child.children, childArgs) : this.lines(child.children, childArgs),
      !args.parenthetical && this.lines(siblings, args)
    ];
    return this.ctrl.settings.disclosureMode && args.parentDisclose === "expanded" ? hl("interrupt", sideline) : sideline;
  }
  childArgs(child, args, isMainline = false) {
    return {
      isMainline,
      parentPath: args.parentPath + child.id,
      parentNode: child,
      parentDisclose: this.ctrl.idbTree.discloseOf(child, false),
      parenthetical: this.parenthetical(child)
    };
  }
  parenthetical(node) {
    const [, second, third] = node.children;
    return !third && second && !ops_exports.hasBranching(second, 6);
  }
  moveNode(node, { conceal, isMainline, parentPath, parentNode, parentDisclose, parenthetical }) {
    var _a, _b, _c, _d, _e;
    const { ctrl: ctrl2 } = this;
    const path = parentPath + node.id;
    const currentPath = !ctrl2.synthetic && playable(ctrl2.data) && ctrl2.initialPath || ((_b = (_a = ctrl2.retro) == null ? void 0 : _a.current()) == null ? void 0 : _b.prev.path) || ((_c = ctrl2.study) == null ? void 0 : _c.data.chapter.relayPath);
    const withIndex = (!isMainline || this.inline) && (node.ply % 2 === 1 || !isMainline && parentNode.children.length > 1 && (!parenthetical || parentNode.children[0] !== node));
    const classes = {
      mainline: isMainline && this.inline,
      conceal: conceal === "conceal",
      hide: conceal === "hide",
      active: path === ctrl2.path,
      current: path === currentPath,
      nongame: !currentPath && !!ctrl2.gamePath && path_exports.contains(path, ctrl2.gamePath) && path !== ctrl2.gamePath,
      "context-menu": path === ctrl2.contextMenuPath,
      "pending-deletion": path.startsWith(ctrl2.pendingDeletionPath() || " "),
      "pending-copy": ctrl2.isPendingCopy(path, isMainline)
    };
    const glyphs3 = [...(_d = node.glyphs) != null ? _d : []];
    const liveGlyph = (_e = ctrl2.liveAnnotate) == null ? void 0 : _e.get(path);
    if (liveGlyph && ctrl2.settings.showLiveAnnotations && !glyphs3.some((g) => g.id <= this.glyphs.length))
      glyphs3.push(liveGlyph);
    if (ctrl2.showMoveGlyphs()) {
      glyphs3 == null ? void 0 : glyphs3.map((g) => this.glyphs[g.id - 1]).filter(Boolean).forEach((cls) => classes[cls] = true);
    }
    return hl("move", { attrs: { p: path }, class: classes }, [
      parentDisclose && this.disclosureBtn(parentNode, parentPath),
      withIndex && renderIndex(node.ply, true),
      renderMoveNodes(
        node,
        isMainline && !this.inline,
        ctrl2.showMoveGlyphs(),
        ctrl2.allowedEval(node) || false,
        glyphs3
      )
    ]);
  }
  disclosureConnector(parentPath) {
    const callback = (vnode) => this.connectToDisclosureBtn(vnode, parentPath);
    return this.ctrl.settings.disclosureMode && hl(
      "div.disclosure-connector",
      { hook: { insert: callback, update: (v) => setTimeout(() => callback(v)) } },
      hl("div.disclosure-connector.riser")
    );
  }
  disclosureBtn(node, path) {
    return this.ctrl.settings.disclosureMode && hl("a.disclosure", {
      class: { expanded: !node.collapsed },
      attrs: { "data-path": path },
      on: { click: () => this.ctrl.idbTree.setCollapsed(path, !node.collapsed) }
    });
  }
  connectToDisclosureBtn(v, path) {
    const [el, btn] = [v.elm, this.findDisclosureBtn(v.elm, path)];
    if (!el || !btn || isSafari({ below: "16" })) return;
    const btnRect = btn.getBoundingClientRect();
    const anchorRect = el.closest(".anchor").getBoundingClientRect();
    const isFirstOnRow = btnRect.left < anchorRect.left + 8;
    const distanceMinusRiser = anchorRect.top - btnRect.bottom + btnRect.height / 2;
    const baseHeight = Math.max(0, distanceMinusRiser - (isFirstOnRow ? 0 : 12));
    const btnCenter = btnRect.width / 2;
    const width = isFirstOnRow ? 3 : document.documentElement.dir === "rtl" ? anchorRect.right - btnRect.left - btnCenter : btnRect.right - anchorRect.left - btnCenter;
    el.style.width = `${width}px`;
    el.style.height = `${baseHeight}px`;
    el.style.top = `-${baseHeight}px`;
    el.firstElementChild.style.display = isFirstOnRow ? "none" : "block";
  }
  findDisclosureBtn(el, path) {
    while (el && (el.nodeName !== "A" || el.dataset.path !== path)) {
      if (!el.previousSibling) el = el.parentNode;
      else {
        el = el.previousSibling;
        while (el.lastChild) el = el.lastChild;
      }
    }
    return el;
  }
};

// ../analyse/src/treeView/columnView.ts
function renderColumnView(ctrl2, concealOf = () => () => null) {
  const renderer = new ColumnView(ctrl2, concealOf);
  const node = ctrl2.tree.root;
  const commentTags = renderer.commentNodes(node);
  const blackStarts = (node.ply & 1) === 1;
  return hl("div.tview2.tview2-column", { class: { hidden: ctrl2.treeView.hidden } }, [
    commentTags.length > 0 && hl("interrupt", commentTags),
    blackStarts && [renderIndex(node.ply, false), hl("move.empty", "...")],
    renderer.renderNodes(ctrl2.visibleChildren(node), {
      parentPath: "",
      parentDisclose: ctrl2.idbTree.discloseOf(node, true),
      parentNode: node,
      isMainline: true
    })
  ]);
}
var ColumnView = class extends InlineView {
  constructor(ctrl2, concealOf) {
    super(ctrl2);
    this.concealOf = concealOf;
    this.inline = false;
  }
  renderNodes([child, ...siblings], opts) {
    var _a;
    if (!child) return void 0;
    const { parentPath, parentDisclose } = opts;
    const childPath = parentPath + child.id;
    const conceal = (_a = opts.conceal) != null ? _a : this.concealOf(true)(childPath, child);
    if (conceal === "hide") return void 0;
    const emptyMove = () => hl("move.empty", { class: { conceal: conceal === "conceal" } }, "...");
    const isWhite = child.ply % 2 === 1;
    const comments = this.commentNodes(child, { conceal: conceal === "conceal" });
    const interruptData = { class: { anchor: parentDisclose === "expanded" } };
    return child.forceVariation ? hl("interrupt", interruptData, this.lines([child, ...siblings], opts)) : [
      isWhite && renderIndex(child.ply, false),
      this.moveNode(child, { ...opts, conceal }),
      parentDisclose !== "collapsed" && (siblings.length > 0 || comments.length > 0) && [
        isWhite && emptyMove(),
        hl("interrupt", interruptData, [
          comments,
          siblings.length > 0 ? this.lines(siblings, opts) : parentDisclose && this.disclosureConnector(parentPath)
        ]),
        isWhite && child.children.length > 0 && [renderIndex(child.ply, false), emptyMove()]
      ],
      this.renderNodes(this.ctrl.visibleChildren(child), {
        parentPath: childPath,
        parentNode: child,
        parentDisclose: this.ctrl.idbTree.discloseOf(child, true),
        isMainline: true
      })
    ];
  }
};

// ../analyse/src/study/studyView.ts
var studyView_exports = {};
__export(studyView_exports, {
  contextMenu: () => contextMenu,
  overboard: () => overboard,
  resultTag: () => resultTag,
  studySideNodes: () => studySideNodes,
  studyView: () => studyView,
  underboard: () => underboard2
});

// ../analyse/src/view/controls.ts
function renderControls(ctrl2) {
  var _a, _b;
  const canJumpPrev = ctrl2.path !== "", canJumpNext = !!ctrl2.node.children[0];
  return hl(
    "div.analyse__controls.analyse-controls",
    {
      hook: onInsert(
        (el) => addPointerListeners(el, {
          click: (e) => clickControl(ctrl2, e),
          hold: (e) => holdControl(ctrl2, e)
        })
      )
    },
    [
      hl("div.jumps", [
        jumpButton(licon.JumpFirst, "first", canJumpPrev),
        jumpButton(licon.LessThan, "prev", canJumpPrev),
        jumpButton(licon.GreaterThan, "next", canJumpNext),
        jumpButton(licon.JumpLast, "last", ctrl2.node !== ctrl2.mainline[ctrl2.mainline.length - 1])
      ]),
      ((_a = ctrl2.study) == null ? void 0 : _a.practice) ? hl("button.fbt", {
        attrs: { title: i18n.site.analysis, "data-act": "analysis", "data-icon": licon.Microscope }
      }) : [
        displayColumns() === 1 && ctrl2.isCevalAllowed() && renderMobileCevalTab(ctrl2),
        hl("button.fbt", {
          attrs: {
            title: i18n.site.openingExplorerAndTablebase,
            "data-act": "opening-explorer",
            "data-icon": licon.Book
          },
          class: {
            hidden: !ctrl2.explorer.allowed() || !!ctrl2.retro && !isMobileUi(),
            active: ctrl2.activeControlBarTool() === "opening-explorer"
          }
        }),
        displayColumns() > 1 && !ctrl2.retro && !ctrl2.ongoing && renderPracticeTab(ctrl2)
      ],
      ((_b = ctrl2.study) == null ? void 0 : _b.practice) ? hl("div.noop") : hl("button.fbt", {
        class: { active: ctrl2.activeControlBarTool() === "action-menu" },
        attrs: { title: i18n.site.menu, "data-act": "menu", "data-icon": licon.Hamburger }
      })
    ]
  );
}
var renderPracticeTab = (ctrl2) => hl("button.fbt", {
  attrs: {
    title: i18n.site.practiceWithComputer,
    "data-act": "engine-mode",
    "data-mode": "practice",
    "data-icon": licon.Bullseye
  },
  class: {
    active: !!ctrl2.practice && !ctrl2.activeControlBarTool(),
    latent: !!ctrl2.practice && !!ctrl2.activeControlBarTool()
  }
});
function renderMobileCevalTab(ctrl2) {
  var _a;
  const engineMode = ctrl2.activeControlMode() || "ceval", ev = ctrl2.allowedEval() || void 0, evalstr = (ev == null ? void 0 : ev.cp) !== void 0 ? renderEval(ev.cp) : (ev == null ? void 0 : ev.mate) ? "#" + ev.mate : "", active = ctrl2.activeControlMode() && !ctrl2.activeControlBarTool(), latent = ctrl2.activeControlMode() && !!ctrl2.activeControlBarTool();
  return hl(
    "button.fbt",
    {
      key: "engine-mode",
      attrs: { "data-act": "engine-mode", "data-mode": engineMode },
      class: { active, latent, computing: ctrl2.ceval.isComputing }
    },
    [
      engineMode === "ceval" && [
        hl("div.bar"),
        main_exports.renderCevalSwitch(ctrl2),
        evalstr && ctrl2.showEvaluation() && !ctrl2.isGamebook() && hl("eval", evalstr)
      ],
      engineMode === "practice" && evalstr && hl("eval", evalstr),
      engineMode === "retro" && ((_a = ctrl2.retro) == null ? void 0 : _a.completion().join("/"))
    ]
  );
}
function holdControl(ctrl2, e) {
  var _a;
  if (!(e.target instanceof HTMLElement)) return;
  const action2 = (_a = e.target.closest("[data-act]")) == null ? void 0 : _a.dataset.act;
  if (action2 === "prev" || action2 === "next") {
    repeater(() => {
      ctrl2.navigate[action2]();
      ctrl2.redraw();
    });
  } else clickControl(ctrl2, e);
}
function clickControl(ctrl2, e) {
  var _a, _b, _c;
  if (!(e.target instanceof HTMLElement)) return;
  const action2 = (_a = e.target.closest("[data-act]")) == null ? void 0 : _a.dataset.act;
  if (!action2) return;
  if (action2 === "prev") ctrl2.navigate.prev();
  else if (action2 === "next") ctrl2.navigate.next();
  else if (action2 === "first") ctrl2.navigate.first();
  else if (action2 === "last") ctrl2.navigate.last();
  else if (action2 === "opening-explorer") ctrl2.toggleExplorer();
  else if (action2 === "menu") ctrl2.toggleActionMenu();
  else if (action2 === "analysis") window.open((_c = (_b = ctrl2.study) == null ? void 0 : _b.practice) == null ? void 0 : _c.analysisUrl(), "_blank");
  else if (action2 === "engine-mode" && !e.target.closest(".cmn-toggle")) {
    const mode = e.target.dataset.mode;
    if (ctrl2.activeControlBarTool()) {
      ctrl2.explorer.enabled(false);
      ctrl2.actionMenu(false);
      if (ctrl2.showCeval() || mode !== "ceval") return ctrl2.redraw();
    }
    if (mode === "practice") ctrl2.togglePractice();
    else if (mode === "retro") ctrl2.toggleRetro();
    else ctrl2.showCeval(!ctrl2.showCeval());
  }
  blurIfPrimaryClick(e);
  ctrl2.redraw();
}
var jumpButton = (icon2, effect, enabled) => hl("button.fbt.move", { attrs: { disabled: !enabled, "data-act": effect, "data-icon": icon2 } });
var isMobileUi = () => displayColumns() === 1 && isTouchDevice();

// ../analyse/src/retrospect/retroView.ts
var skipOrViewSolution = (ctrl2) => hl("div.choices", [
  hl("a", { hook: bind("click", ctrl2.viewSolution, ctrl2.redraw) }, i18n.site.viewTheSolution),
  hl("a", { hook: bind("click", ctrl2.skip) }, i18n.site.skipThisMove)
]);
var jumpToNext = (ctrl2) => hl("a.half.continue", { hook: bind("click", ctrl2.jumpToNext) }, [
  icon(licon.PlayTriangle)(),
  i18n.site.next
]);
var minDepth = 8;
var maxDepth = 18;
var renderEvalProgress = (node) => hl(
  "div.progress",
  hl("div", {
    attrs: {
      style: `width: ${node.ceval ? 100 * Math.max(0, node.ceval.depth - minDepth) / (maxDepth - minDepth) + "%" : 0}`
    }
  })
);
var feedback = {
  find(ctrl2) {
    return [
      hl("div.player", [
        hl("div.no-square", hl("piece.king." + ctrl2.color)),
        hl("div.instruction", [
          hl(
            "strong",
            i18n.site.xWasPlayed.asArray(
              hl("move", renderIndexAndMove(ctrl2.current().fault.node, false, true))
            )
          ),
          hl("em", i18n.site[ctrl2.color === "white" ? "findBetterMoveForWhite" : "findBetterMoveForBlack"]),
          skipOrViewSolution(ctrl2)
        ])
      ])
    ];
  },
  // user has browsed away from the move to solve
  offTrack(ctrl2) {
    return [
      hl("div.player", [
        hl("div.icon.off", "!"),
        hl("div.instruction", [
          hl("strong", i18n.site.youBrowsedAway),
          hl("div.choices.off", [
            hl("a", { hook: bind("click", ctrl2.jumpToNext) }, i18n.site.resumeLearning)
          ])
        ])
      ])
    ];
  },
  fail(ctrl2) {
    return [
      hl("div.player", [
        hl("div.icon", "\u2717"),
        hl("div.instruction", [
          hl("strong", i18n.site.youCanDoBetter),
          hl("em", i18n.site[ctrl2.color === "white" ? "tryAnotherMoveForWhite" : "tryAnotherMoveForBlack"]),
          skipOrViewSolution(ctrl2)
        ])
      ])
    ];
  },
  win(ctrl2) {
    return [
      hl(
        "div.half.top",
        hl("div.player", [hl("div.icon", "\u2713"), hl("div.instruction", hl("strong", i18n.study.goodMove))])
      ),
      jumpToNext(ctrl2)
    ];
  },
  view(ctrl2) {
    return [
      hl(
        "div.half.top",
        hl("div.player", [
          hl("div.icon", "\u2713"),
          hl("div.instruction", [
            hl("strong", i18n.site.solution),
            hl(
              "em",
              i18n.site.bestWasX.asArray(
                hl("strong", renderIndexAndMove(ctrl2.current().solution.node, false, false))
              )
            )
          ])
        ])
      ),
      jumpToNext(ctrl2)
    ];
  },
  eval(ctrl2) {
    return [
      hl(
        "div.half.top",
        hl(
          "div.player.center",
          hl("div.instruction", [
            hl("strong", i18n.site.evaluatingYourMove),
            renderEvalProgress(ctrl2.node())
          ])
        )
      )
    ];
  },
  end(ctrl2, hasFullComputerAnalysis) {
    if (!hasFullComputerAnalysis())
      return [
        hl(
          "div.half.top",
          hl("div.player", [hl("div.icon", spinnerVdom()), hl("div.instruction", i18n.site.waitingForAnalysis)])
        )
      ];
    const nothing = !ctrl2.completion()[1];
    return [
      hl("div.player", [
        hl("div.no-square", hl("piece.king." + ctrl2.color)),
        hl("div.instruction", [
          hl(
            "em",
            i18n.site[nothing ? ctrl2.color === "white" ? "noMistakesFoundForWhite" : "noMistakesFoundForBlack" : ctrl2.color === "white" ? "doneReviewingWhiteMistakes" : "doneReviewingBlackMistakes"]
          ),
          hl("div.choices.end", [
            !nothing && hl(
              "a",
              {
                key: "reset",
                hook: bind("click", ctrl2.reset)
              },
              i18n.site.doItAgain
            ),
            hl(
              "a",
              {
                key: "flip",
                hook: bind("click", ctrl2.flip)
              },
              i18n.site[ctrl2.color === "white" ? "reviewBlackMistakes" : "reviewWhiteMistakes"]
            )
          ])
        ])
      ])
    ];
  }
};
function renderFeedback(root, fb) {
  const ctrl2 = root.retro;
  const current = ctrl2.current();
  if (ctrl2.isSolving() && current && root.path !== current.prev.path) return feedback.offTrack(ctrl2);
  if (fb === "find") return current ? feedback.find(ctrl2) : feedback.end(ctrl2, root.hasFullComputerAnalysis);
  return feedback[fb](ctrl2);
}
function retroView_default(root) {
  const ctrl2 = root.retro;
  if (!ctrl2) return void 0;
  const fb = ctrl2.feedback(), completion = ctrl2.completion();
  return hl("div.retro-box.training-box.sub-box", [
    hl("div.title", [
      hl("span", i18n.site.learnFromYourMistakes),
      hl("span", `${Math.min(completion[0] + 1, completion[1])} / ${completion[1]}`),
      hl("button.fbt", {
        hook: bind("click", root.toggleRetro, root.redraw),
        attrs: { "data-icon": licon.X, "aria-label": "Close learn window" }
      })
    ]),
    hl("div.feedback." + fb, renderFeedback(root, fb))
  ]);
}

// ../analyse/src/view/settingsView.ts
var settings = {
  showStaticAnalysis: {
    label: i18n.preferences.showServerAnalysis,
    shortcutHtml: "<kbd>z</kbd>",
    group: i18n.preferences.generalSettings,
    helpHtml: videoHtml("info-static-analysis")
  },
  showGauge: {
    label: i18n.preferences.showGauge,
    group: i18n.preferences.generalSettings,
    helpHtml: imageHtml("info-evaluation-gauge")
  },
  inline: {
    label: i18n.preferences.inlineNotation,
    shortcutHtml: "<kbd>shift</kbd> +<kbd>i</kbd>",
    group: i18n.preferences.moveListSettings,
    helpHtml: videoHtml("info-inline-notation")
  },
  disclosureMode: {
    label: i18n.preferences.disclosureMode,
    group: i18n.preferences.moveListSettings,
    helpHtml: videoHtml("info-disclosure-mode")
  },
  showLiveAnnotations: {
    label: i18n.preferences.showLiveGlyphs,
    group: i18n.preferences.moveListSettings,
    helpHtml: videoHtml("info-live-annotations")
  },
  showBestMoveArrows: {
    label: i18n.preferences.showBestMoveArrows,
    shortcutHtml: "<kbd>a</kbd>",
    group: i18n.preferences.boardSettings,
    helpHtml: videoHtml("info-best-move-arrows")
  },
  showVariationArrows: {
    label: i18n.preferences.showVariationArrows,
    shortcutHtml: "<kbd>v</kbd>",
    group: i18n.preferences.boardSettings,
    helpHtml: `${videoHtml("info-variation-arrows")} <span>${i18n.site.keyCycleSelectedVariation} <kbd>shift</kbd></span>`
  },
  showManeuverMoveArrows: {
    label: i18n.preferences.showManeuverArrows,
    group: i18n.preferences.boardSettings,
    helpHtml: `${imageHtml("info-maneuver-arrows")} <span>${i18n.preferences.maneuverArrowsHelp}</span>`
  },
  showMoveAnnotationsOnBoard: {
    label: i18n.preferences.showMoveAnnotationsOnBoard,
    group: i18n.preferences.boardSettings,
    helpHtml: videoHtml("info-move-annotations-on-board")
  },
  showUndefendedPieces: {
    label: i18n.preferences.showUndefendedPieces,
    group: i18n.preferences.boardSettings,
    helpHtml: videoHtml("info-undefended-pieces")
  },
  showPinnedPieces: {
    label: i18n.preferences.showPinnedPieces,
    group: i18n.preferences.boardSettings,
    helpHtml: videoHtml("info-pinned-pieces")
  },
  showCheckableKing: {
    label: i18n.preferences.showCheckableKing,
    group: i18n.preferences.boardSettings,
    helpHtml: videoHtml("info-checkable-king")
  }
};
async function showSettingsDialog(ctrl2) {
  let scrollableDiv = null;
  const flexTamer = () => {
    scrollableDiv != null ? scrollableDiv : scrollableDiv = document.querySelector(".analysis-settings-dialog");
    if (!scrollableDiv || isTouchDevice()) return;
    scrollableDiv.style.width = scrollableDiv.style.height = "";
    const { width, height } = scrollableDiv.getBoundingClientRect();
    scrollableDiv.style.width = `${width}px`;
    scrollableDiv.style.height = `${height}px`;
  };
  if (!isTouchDevice()) window.addEventListener("resize", flexTamer);
  return domDialog({
    class: "analysis-settings-dialog",
    htmlText: "<h2>Analysis settings</h2>",
    insert: [{ nodes: settingsView(ctrl2.settings) }],
    modal: !isTouchDevice(),
    easyClose: "clickOutside",
    show: true,
    actions: [
      { selector: ".show-all", result: "showKeyboardShortcuts" },
      { selector: ".ok", result: "ok" }
    ],
    onShow: flexTamer,
    onClose: (dlg) => {
      window.removeEventListener("resize", flexTamer);
      if (dlg.returnValue !== "showKeyboardShortcuts") return;
      ctrl2.keyboardHelp = true;
      ctrl2.redraw();
    }
  });
}
function settingsView(ctrl2) {
  const groupedHtml = (group) => {
    return `<fieldset><legend>${i18n.preferences[group]}</legend> ${Object.keys(settings).filter((key) => settings[key].group === i18n.preferences[group]).map((key) => {
      var _a;
      return ((_a = settings[key].renderHtml) != null ? _a : defaultToggleHtml)(ctrl2, key);
    }).join("")} </fieldset>`;
  };
  const view21 = frag(`<div class="analysis-settings-view"><div class="column"> ${helpHtml()} ${groupedHtml("generalSettings")} </div><div class="column"> ${groupedHtml("moveListSettings")} ${groupedHtml("boardSettings")} </div></div>`);
  if (isTouchDevice()) setupTouchHelp(view21);
  else setupHoverHelp(view21);
  view21.querySelectorAll(".setting input").forEach((input) => {
    var _a;
    const key = input.dataset.key;
    if (!settings[key]) return;
    const listener = (_a = settings[key].listener) != null ? _a : defaultToggleListener;
    if ("events" in listener) {
      listener.events.forEach((event) => input.addEventListener(event, (e) => listener.action(e, ctrl2, key)));
    } else {
      input.addEventListener("change", (e) => listener(e, ctrl2, key));
    }
  });
  return view21;
}
function setupTouchHelp(view21) {
  view21.querySelectorAll(".help-button").forEach(async (el) => {
    var _a;
    const key = el.dataset.key;
    if (!((_a = settings[key]) == null ? void 0 : _a.helpHtml)) return;
    const nodes = await preload(settings[key].helpHtml);
    el.addEventListener(
      "click",
      () => domDialog({
        class: "setting-popup",
        insert: [{ nodes }],
        noCloseButton: true,
        show: true,
        easyClose: "anyClick"
      })
    );
  });
}
function setupHoverHelp(view21) {
  const helpEl = () => view21.querySelector(".help-container").firstElementChild;
  const keyboardHelp = helpEl();
  let resetTimeout;
  view21.querySelectorAll(".hover-help").forEach((el) => {
    const key = el.dataset.key;
    const setting = settings[key];
    if (!(setting == null ? void 0 : setting.helpHtml)) return;
    el.addEventListener("mouseenter", async () => {
      var _a;
      const fieldset = frag(
        `<fieldset class="help-pane" data-key="${key}"><legend>${setting.label}</legend></fieldset>`
      );
      clearTimeout(resetTimeout);
      fieldset.append(...await preload(setting.helpHtml));
      if (!el.matches(":hover")) return;
      helpEl().replaceWith(fieldset);
      (_a = fieldset.querySelector("video")) == null ? void 0 : _a.play();
    });
    el.addEventListener("mouseleave", () => {
      resetTimeout = setTimeout(() => {
        if (!view21.querySelector(".hover-help:hover")) helpEl().replaceWith(keyboardHelp);
      }, 300);
    });
  });
  if (document.querySelector("main.analyse")) return;
  keyboardHelp.querySelector("button").addEventListener(
    "click",
    () => domDialog({
      class: "help.keyboard-help",
      htmlUrl: "/analysis/help",
      easyClose: "clickOutside",
      modal: true,
      show: true
    })
  );
}
function defaultToggleHtml(ctrl2, key) {
  const setting = settings[key];
  const label = setting.helpHtml && isTouchDevice() ? `<button class="help-button" data-key="${key}" data-icon="${licon.InfoCircle}">${setting.label}</button>` : `<span>${setting.label}</span>`;
  return `<span class="setting${setting.helpHtml ? " hover-help" : ""}" data-key="${key}"> ${label} <span class="form-check__input"><input data-key="${key}" id="${key}" type="checkbox" ${ctrl2[key] ? "checked" : ""}><label class="form-check__label" for="${key}"></label></span></span>`;
}
function defaultToggleListener(e, ctrl2, key) {
  ctrl2.set(key, e.target.checked);
}
function helpHtml() {
  const settingShortcutsHtml = Object.values(settings).filter((opt) => opt.shortcutHtml).map((opt) => `<div class="setting inert">${opt.label}<span>${opt.shortcutHtml}</span></div>`).join("");
  return `<div class="help-container"><fieldset class="help-pane" data-key="keyboardShortcuts"><legend>${i18n.site.keyboardShortcuts}</legend><div class="setting inert">${i18n.site.flipBoard}<kbd>f</kbd></div><div class="setting inert">Toggle local engine<kbd>l</kbd></div> ${settingShortcutsHtml} <button class="button button-empty button-dim show-all">Show all</button></fieldset></div>`;
}
function videoHtml(path) {
  return `<video autoplay loop muted playsinline preload="auto"><source src="${site.asset.url("video/" + path + ".webm")}" type="video/webm"></video><br>`;
}
function imageHtml(path) {
  return `<img src="${site.asset.url("images/help/" + path + ".webp")}" alt=""><br>`;
}
async function preload(html) {
  const loader = frag(
    `<div style="position: fixed; left: -100000px; top: 0; visibility: hidden"></div>`
  );
  loader.append(frag(html));
  document.body.append(loader);
  await Promise.all([
    ...[...loader.querySelectorAll("img")].map(
      (img) => img.complete ? img.decode().catch(() => {
      }) : new Promise(
        (resolve) => ["load", "error"].forEach((e) => img.addEventListener(e, () => resolve(), { once: true }))
      )
    ),
    ...[...loader.querySelectorAll("audio, video")].map((media) => {
      media.preload = "auto";
      media.load();
      return media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ? Promise.resolve() : new Promise(
        (resolve) => ["loadeddata", "error"].forEach((e) => media.addEventListener(e, () => resolve(), { once: true }))
      );
    })
  ]);
  loader.remove();
  return [...loader.childNodes];
}

// ../analyse/src/view/actionMenu.ts
var baseSpeeds = [
  { name: "fast", delay: 1e3 },
  { name: "slow", delay: 5e3 }
];
var realtimeSpeed = {
  name: "realtimeReplay",
  delay: "realtime"
};
var cplSpeed = {
  name: "byCPL",
  delay: "cpl"
};
function autoplayButtons(ctrl2) {
  const d = ctrl2.data;
  const speeds = [
    ...baseSpeeds,
    ...d.game.speed !== "correspondence" && !isEmpty(d.game.moveCentis) ? [realtimeSpeed] : [],
    ...d.analysis ? [cplSpeed] : []
  ];
  return hl(
    "div.autoplay",
    speeds.map((speed) => {
      const active = ctrl2.autoplay.getDelay() === speed.delay;
      return hl(
        "a.button",
        {
          class: { active, "button-empty": !active },
          hook: bind("click", () => ctrl2.togglePlay(speed.delay), ctrl2.redraw)
        },
        String(i18n.site[speed.name])
      );
    })
  );
}
var hiddenInput = (name, value) => hl("input", { attrs: { type: "hidden", name, value } });
function studyButton(ctrl2) {
  if (ctrl2.study || ctrl2.ongoing) return void 0;
  return hl(
    "form",
    {
      attrs: { method: "post", action: "/study/as" },
      hook: bind("submit", (e) => {
        const pgnInput = e.target.querySelector("input[name=pgn]");
        if (pgnInput && (ctrl2.synthetic || ctrl2.idbTree.movesDirty)) {
          pgnInput.value = renderFullTxt(ctrl2);
        }
      })
    },
    [
      !ctrl2.synthetic && hiddenInput("gameId", ctrl2.data.game.id),
      hiddenInput("pgn", ""),
      hiddenInput("orientation", ctrl2.bottomColor()),
      hiddenInput("variant", ctrl2.data.game.variant.key),
      hiddenInput("fen", ctrl2.tree.root.fen),
      hl("button", { attrs: { type: "submit", "data-icon": licon.StudyBoard } }, i18n.site.toStudy)
    ]
  );
}
function view7(ctrl2) {
  const d = ctrl2.data, canContinue = !ctrl2.ongoing && d.game.variant.key === "standard", canPractice = ctrl2.isCevalAllowed() && !ctrl2.isEmbed && !ctrl2.isGamebook() && !ctrl2.practice, canRetro = ctrl2.hasFullComputerAnalysis() && !ctrl2.isEmbed && !ctrl2.retro, linkAttrs = { rel: ctrl2.isEmbed ? "" : "nofollow", target: ctrl2.isEmbed ? "_blank" : "" };
  const tools = [
    hl("div.action-menu__tools", [
      hl(
        "a",
        {
          hook: bind("click", () => {
            ctrl2.flip();
            ctrl2.actionMenu.toggle();
            ctrl2.redraw();
          }),
          attrs: { "data-icon": licon.ChasingArrows, title: "Hotkey: f" }
        },
        i18n.site.flipBoard
      ),
      !ctrl2.ongoing && hl(
        "a",
        {
          attrs: {
            href: d.userAnalysis ? "/editor?" + new URLSearchParams({
              fen: ctrl2.node.fen,
              variant: d.game.variant.key,
              color: ctrl2.chessground.state.orientation
            }) : `/${d.game.id}/edit?fen=${ctrl2.node.fen}`,
            "data-icon": licon.Pencil,
            ...linkAttrs
          }
        },
        i18n.site.boardEditor
      ),
      displayColumns() === 1 && canPractice && hl(
        "a",
        { hook: bind("click", () => ctrl2.togglePractice()), attrs: dataIcon(licon.Bullseye) },
        i18n.site.practiceWithComputer
      ),
      canRetro && hl(
        "a",
        { hook: bind("click", ctrl2.toggleRetro, ctrl2.redraw), attrs: dataIcon(licon.GraduateCap) },
        i18n.site.learnFromYourMistakes
      ),
      canContinue && hl(
        "a",
        {
          hook: bind(
            "click",
            () => domDialog({
              cash: $(".continue-with.g_" + d.game.id),
              modal: true,
              show: true,
              easyClose: "clickOutside"
            })
          ),
          attrs: dataIcon(licon.Swords)
        },
        i18n.site.continueFromHere
      ),
      studyButton(ctrl2),
      ctrl2.idbTree.movesDirty && hl(
        "a",
        {
          attrs: {
            title: i18n.site.clearSavedMoves,
            "data-icon": licon.Trash
          },
          hook: bind("click", () => ctrl2.idbTree.clear("moves"))
        },
        i18n.site.clearSavedMoves
      ),
      hl(
        "button",
        {
          attrs: { "data-icon": licon.Gear, title: i18n.site.settings },
          on: { click: () => showSettingsDialog(ctrl2) }
        },
        i18n.site.settings
      )
    ])
  ];
  return hl("div.action-menu.sub-box.reduced", [
    hl("div.title", i18n.site.analysis),
    hl("div.inner", [
      tools,
      ctrl2.mainline.length > 4 && [hl("h2", i18n.site.replayMode), autoplayButtons(ctrl2)],
      canContinue && hl("div.continue-with.none.g_" + d.game.id, [
        hl(
          "a.button",
          {
            attrs: {
              href: d.userAnalysis ? "/?fen=" + ctrl2.encodeNodeFen() + "#ai" : cont(d, "ai") + "?fen=" + ctrl2.node.fen,
              ...linkAttrs
            }
          },
          i18n.site.playAgainstComputer
        ),
        hl(
          "a.button",
          {
            attrs: {
              href: d.userAnalysis ? "/?fen=" + ctrl2.encodeNodeFen() + "#friend" : cont(d, "friend") + "?fen=" + ctrl2.node.fen,
              ...linkAttrs
            }
          },
          i18n.site.challengeAFriend
        )
      ])
    ])
  ]);
}

// ../analyse/src/view/tools.ts
function renderTools({ ctrl: ctrl2, deps, concealOf, allowVideo: allowVideo2 }, embeddedVideo) {
  var _a, _b;
  const showCeval = ctrl2.isCevalAllowed() && ctrl2.showCeval();
  return hl(addChapterId(ctrl2.study, "div.analyse__tools"), [
    allowVideo2 && embeddedVideo,
    showCeval && main_exports.renderCeval(ctrl2),
    showCeval && !((_a = ctrl2.retro) == null ? void 0 : _a.isSolving()) && !ctrl2.practice && !((_b = ctrl2.study) == null ? void 0 : _b.hideMoves()) && main_exports.renderPvs(ctrl2),
    renderMoveList(ctrl2, deps, concealOf),
    (deps == null ? void 0 : deps.gbEdit.running(ctrl2)) ? deps == null ? void 0 : deps.gbEdit.render(ctrl2) : void 0,
    renderBackToLiveButton(ctrl2),
    view5(ctrl2, concealOf),
    retroView_default(ctrl2) || explorerView_default(ctrl2) || practiceView_default(ctrl2),
    ctrl2.actionMenu() && view7(ctrl2)
  ]);
}
var renderMoveList = (ctrl2, deps, concealOf) => {
  var _a;
  return hl(
    "div.analyse__moves.areplay",
    { hook: ctrl2.treeView.hook() },
    ((_a = ctrl2.study) == null ? void 0 : _a.hideMoves()) ? [] : [
      hl("div", [ctrl2.treeView.render(concealOf), renderResult(ctrl2)]),
      !ctrl2.practice && !(deps == null ? void 0 : deps.gbEdit.running(ctrl2)) && renderNextChapter(ctrl2)
    ]
  );
};
var renderBackToLiveButton = (ctrl2) => {
  var _a;
  return ((_a = ctrl2.study) == null ? void 0 : _a.isRelayAwayFromLive()) ? hl(
    "button.fbt.relay-back-to-live.text",
    {
      attrs: dataIcon(licon.PlayTriangle),
      hook: bind(
        "click",
        () => {
          var _a2;
          const p = (_a2 = ctrl2.study) == null ? void 0 : _a2.data.chapter.relayPath;
          if (p) ctrl2.userJump(p);
        },
        ctrl2.redraw
      )
    },
    i18n.broadcast.backToLiveMove
  ) : void 0;
};

// ../analyse/src/wiki.ts
function wikiToggleBox() {
  $("#wikibook-field").each(function() {
    const box = this;
    const state = storedBooleanPropWithEffect(
      "analyse.wikibooks.display",
      true,
      (value) => box.classList.toggle("toggle-box--toggle-off", value)
    );
    const toggle2 = () => state(!state());
    if (!state()) box.classList.add("toggle-box--toggle-off");
    $(box).children("legend").on("click", toggle2).on("keypress", enter(toggle2));
  });
}
function wikiTheory() {
  const cache = /* @__PURE__ */ new Map();
  const show = (html) => {
    $(".analyse__wiki").toggleClass("empty", !html);
    $(".analyse__wiki-text").html(html);
  };
  const plyPrefix = (node) => `${Math.floor((node.ply + 1) / 2)}${node.ply % 2 === 1 ? "._" : "..."}`;
  return debounce(
    async (nodes) => {
      var _a;
      const pathParts = nodes.slice(1).map((n) => `${plyPrefix(n)}${n.san}`);
      const path = (_a = pathParts.join("/").replace(/[+!#?]/g, "")) != null ? _a : "";
      if (pathParts.length > 30 || !path || path.length > 255 - 21) show("");
      else if (cache.has(path)) show(cache.get(path));
      else if (Array.from({ length: pathParts.length }, (_, i) => -i - 1).map((i) => pathParts.slice(0, i).join("/")).some((sub) => cache.has(sub) && !cache.get(sub).length))
        show("");
      else {
        const title = `Chess_Opening_Theory/${path}`;
        try {
          const res = await fetch(`${wikiBooksUrl}/w/api.php?titles=${title}&${apiArgs}`);
          const saveAndShow = (html) => {
            cache.set(path, html);
            show(html);
          };
          if (res.ok) {
            const json2 = await res.json();
            const page = json2.query.pages[0];
            if (page.missing || page.extract.length === 0) saveAndShow("");
            else if (page.invalid) show("invalid request: " + page.invalidreason);
            else if (!page.extract)
              show("error: unexpected API response:<br><pre>" + JSON.stringify(page) + "</pre>");
            else saveAndShow(transformWikiHtml(page.extract, title));
          } else saveAndShow("");
        } catch (err) {
          show("error: " + err);
        }
      }
    },
    500,
    true
  );
}
function wikiClear() {
  $(".analyse__wiki").toggleClass("empty", true);
}

// ../analyse/src/crazy/crazyView.ts
var eventNames = ["mousedown", "touchstart"];
var oKeys = ["pawn", "knight", "bishop", "rook", "queen"];
function crazyView_default(ctrl2, color, position) {
  var _a;
  if (!ctrl2.node.crazy || ctrl2.data.game.variant.key !== "crazyhouse") return void 0;
  const pocket = ctrl2.node.crazy.pockets[color === "white" ? 0 : 1];
  const dropped = ctrl2.justDropped;
  const captured = ctrl2.justCaptured;
  if (captured) captured.role = captured.promoted ? "pawn" : captured.role;
  const activeColor = color === ctrl2.turnColor();
  const usable = activeColor && !((_a = ctrl2.node.san) == null ? void 0 : _a.endsWith("#"));
  return h(
    `div.pocket.is2d.pocket-${position}.pos-${ctrl2.bottomColor()}`,
    {
      class: { usable },
      hook: onInsert((el) => {
        eventNames.forEach((name) => {
          el.addEventListener(name, (e) => drag(ctrl2, color, e));
        });
      })
    },
    oKeys.map((role) => {
      let nb = pocket[role] || 0;
      if (activeColor) {
        if (dropped === role) nb--;
        if ((captured == null ? void 0 : captured.role) === role) nb++;
      }
      return h(
        "div.pocket-c1",
        h(
          "div.pocket-c2",
          h(`piece.${role}.${color}`, {
            attrs: { "data-role": role, "data-color": color, "data-nb": nb }
          })
        )
      );
    })
  );
}

// ../analyse/src/view/roundTraining.ts
var renderPlayer = ({ data, study }, color) => {
  const player = getPlayer(data, color);
  if (player.user)
    return h("a.user-link.ulpt", { attrs: { href: "/@/" + player.user.username } }, [
      player.user.username,
      " ",
      ratingDiff(player)
    ]);
  return h(
    "span",
    player.name || player.ai && "Stockfish level " + player.ai || study && findTag(study.data.chapter.tags, color) || "Anonymous"
  );
};
var advices = [
  { kind: "inaccuracy", i18n: i18n.site.numberInaccuracies, symbol: "?!" },
  { kind: "mistake", i18n: i18n.site.numberMistakes, symbol: "?" },
  { kind: "blunder", i18n: i18n.site.numberBlunders, symbol: "??" }
];
var phaseLabels = {
  opening: i18n.site.opening,
  middlegame: i18n.site.middlegame,
  endgame: i18n.site.endgame
};
var phaseOrder = ["opening", "middlegame", "endgame"];
function playerTable(ctrl2, color) {
  const sideData = ctrl2.data.analysis[color];
  return h("div.advice-summary__side", [
    h("div.advice-summary__player", [h(`icon.is.color-icon.${color}.text`), renderPlayer(ctrl2, color)]),
    h("div.advice-summary__sections", [
      h("div.advice-summary__acpl", [
        ...advices.map((a) => error(sideData[a.kind], color, a)),
        h("div", [h("strong", sideData.acpl), h("span", ` ${i18n.site.averageCentipawnLoss}`)])
      ]),
      h("div.advice-summary__accuracy", [...renderPhases(sideData)])
    ])
  ]);
}
var accuracyClass = (accuracy) => accuracy >= 85 ? "good" : accuracy >= 70 ? "inaccuracy" : accuracy >= 55 ? "mistake" : "blunder";
var renderPhases = (side2) => {
  return [
    h(`div.advice-summary__phase`, [h("strong", [side2.accuracy, "%"]), h("span", i18n.site.accuracy)]),
    ...phaseOrder.filter((phase) => {
      var _a;
      return ((_a = side2.phases) == null ? void 0 : _a[phase]) !== void 0;
    }).map(
      (phase) => h(`div.advice-summary__phase.${accuracyClass(side2.phases[phase])}`, [
        h("strong", `${side2.phases[phase]}%`),
        h("span", phaseLabels[phase])
      ])
    )
  ];
};
var error = (nb, color, advice) => h(
  "div.advice-summary__error" + (nb ? `.symbol.${advice.kind}` : ""),
  { attrs: nb ? { "data-color": color, "data-symbol": advice.symbol } : {} },
  advice.i18n.asArray(nb, h("strong", nb))
);
var doRender = (ctrl2) => {
  return h(
    "div.advice-summary",
    {
      hook: onInsert((elem) => {
        $(elem).on("click", "div.symbol", function() {
          ctrl2.jumpToGlyphSymbol(this.dataset.color, this.dataset.symbol);
        });
      })
    },
    [
      playerTable(ctrl2, "white"),
      ctrl2.study ? null : h(
        "a.button.text",
        {
          class: { active: !!ctrl2.retro },
          attrs: dataIcon(licon.PlayTriangle),
          hook: bind("click", ctrl2.toggleRetro, ctrl2.redraw)
        },
        i18n.site.learnFromYourMistakes
      ),
      playerTable(ctrl2, "black")
    ]
  );
};
function puzzleLink(ctrl2) {
  const puzzle = ctrl2.data.puzzle;
  if (!puzzle) return void 0;
  return h(
    "div.analyse__puzzle",
    h(
      "a.button-link.text",
      {
        attrs: {
          ...dataIcon(licon.ArcheryTarget),
          href: `/training/${puzzle.key}/${ctrl2.bottomColor()}`
        }
      },
      ["Recommended puzzle training", h("br"), puzzle.name]
    )
  );
}
function render2(ctrl2) {
  var _a;
  if ((_a = ctrl2.study) == null ? void 0 : _a.practice) return void 0;
  if (!ctrl2.data.analysis || !ctrl2.settings.showStaticAnalysis || ctrl2.study && ctrl2.study.vm.toolTab() !== "serverEval") {
    if (!ctrl2.data.puzzle) return h("div.analyse__round-training");
    return h("div.analyse__round-training", puzzleLink(ctrl2));
  }
  const buster = ctrl2.data.analysis.partial ? Math.random() : "";
  let cacheKey = String(buster) + !!ctrl2.retro;
  if (ctrl2.study) cacheKey += ctrl2.study.data.chapter.id;
  return h("div.analyse__round-training", [
    h("div.analyse__acpl", thunk("div.advice-summary", doRender, [ctrl2, cacheKey])),
    puzzleLink(ctrl2)
  ]);
}

// ../analyse/src/study/commentForm.ts
var CommentForm = class {
  constructor(root) {
    this.root = root;
    this.current = prop(null);
    this.opening = prop(false);
    this.submit = (text) => this.current() && this.doSubmit(text);
    this.doSubmit = throttle(500, (text) => {
      const cur = this.current();
      if (cur) this.root.study.makeChange("setComment", { ch: cur.chapterId, path: cur.path, text });
    });
    this.start = (chapterId, path, node) => {
      this.opening(true);
      this.current({ chapterId, path, node });
      this.root.userJump(path);
    };
    this.onSetPath = (chapterId, path, node) => {
      const cur = this.current();
      if (cur && (path !== cur.path || chapterId !== cur.chapterId || cur.node !== node)) {
        cur.chapterId = chapterId;
        cur.path = path;
        cur.node = node;
      }
    };
    this.delete = (chapterId, path, id) => {
      this.root.study.makeChange("deleteComment", { ch: chapterId, path, id });
    };
  }
};
var viewDisabled = (root, why) => h("div.study__comments", [currentComments(root, true), h("div.study__message", why)]);
function view8(root) {
  const study = root.study, ctrl2 = study.commentForm, current = ctrl2.current();
  if (!current) return viewDisabled(root, "Select a move to comment");
  const setupTextarea = (vnode, old) => {
    const el = vnode.elm;
    const newKey = current.chapterId + current.path;
    if ((old == null ? void 0 : old.data.path) !== newKey) {
      const mine = (current.node.comments || []).find(
        (c) => isAuthorObj(c.by) && c.by.id && c.by.id === ctrl2.root.opts.userId
      );
      el.value = (mine == null ? void 0 : mine.text) || "";
    }
    vnode.data.path = newKey;
    if (ctrl2.opening()) {
      requestAnimationFrame(() => el.focus());
      ctrl2.opening(false);
    }
  };
  return h(
    "div.study__comments",
    { hook: onInsert(() => root.enableWiki(root.data.game.variant.key === "standard")) },
    [
      currentComments(root, !study.members.canContribute()),
      h("form.form3", [
        h("textarea#comment-text.form-control", {
          hook: {
            insert(vnode) {
              setupTextarea(vnode);
              const el = vnode.elm;
              el.oninput = () => setTimeout(() => ctrl2.submit(el.value), 50);
              const heightStore = storage.make("study.comment.height");
              el.onmouseup = () => heightStore.set(String(el.offsetHeight));
              el.style.height = parseInt(heightStore.get() || "80") + "px";
              blurOnEscape(el);
            },
            postpatch: (old, vnode) => setupTextarea(vnode, old)
          }
        })
      ]),
      h("div.analyse__wiki.study__wiki.force-ltr")
    ]
  );
}

// ../analyse/src/study/description.ts
var DescriptionCtrl = class {
  constructor(text, doSave, redraw) {
    this.text = text;
    this.doSave = doSave;
    this.redraw = redraw;
    this.edit = false;
  }
  save(t) {
    this.text = t;
    this.doSave(t);
    this.redraw();
  }
  set(t) {
    this.text = t ? t : void 0;
  }
};
var descTitle = (chapter) => `Pinned ${chapter ? "chapter" : "study"} comment`;
function view9(study, chapter) {
  const desc = chapter ? study.chapterDesc : study.studyDesc, contrib = study.members.canContribute() && !study.gamebookPlay;
  if (desc.edit) return edit(desc, chapter ? study.data.chapter.id : study.data.id, chapter);
  const isEmpty2 = desc.text === "-";
  if (!desc.text || isEmpty2 && !contrib) return void 0;
  return hl(`div.study-desc${chapter ? ".chapter-desc" : ""}${isEmpty2 ? ".empty" : ""}`, [
    contrib && !isEmpty2 && hl("div.contrib", [
      hl("span", descTitle(chapter)),
      !isEmpty2 && hl("a", {
        attrs: { "data-icon": licon.Pencil, title: "Edit" },
        hook: bind("click", () => desc.edit = true, desc.redraw)
      }),
      hl("a", {
        attrs: { "data-icon": licon.Trash, title: "Delete" },
        hook: bind("click", async () => {
          if (await confirm("Delete permanent description?")) desc.save("");
        })
      })
    ]),
    isEmpty2 ? hl(
      "a.text.button",
      { hook: bind("click", () => desc.edit = true, desc.redraw) },
      descTitle(chapter)
    ) : hl("div.text", { hook: richHTML(desc.text) })
  ]);
}
var edit = (ctrl2, id, chapter) => hl("div.study-desc-form", [
  hl("div.title", [
    descTitle(chapter),
    hl("button.button.button-empty.button-green", {
      attrs: { "data-icon": licon.Checkmark, title: "Save and close" },
      hook: bind("click", () => ctrl2.edit = false, ctrl2.redraw)
    })
  ]),
  hl("form.form3", [
    hl("div.form-group", [
      hl("textarea#form-control.desc-text." + id, {
        hook: onInsert((el) => {
          el.value = ctrl2.text === "-" ? "" : ctrl2.text || "";
          el.oninput = () => ctrl2.save(el.value.trim());
          el.focus();
        })
      })
    ])
  ])
]);

// ../analyse/src/study/gamebook/gamebookButtons.ts
function playButtons(root) {
  const study = root.study, ctrl2 = study.gamebookPlay;
  if (!ctrl2) return void 0;
  const state = ctrl2.state, fb = state.feedback, myTurn = fb === "play";
  return hl("div.gamebook-buttons", [
    root.path && hl(
      "button.fbt.text.back",
      {
        attrs: { "data-icon": licon.LessThan, type: "button" },
        hook: bind("click", () => root.userJump(""), ctrl2.redraw)
      },
      i18n.study.back
    ),
    myTurn && hl(
      "button.fbt.text.solution",
      {
        attrs: { "data-icon": licon.PlayTriangle, type: "button" },
        hook: bind("click", ctrl2.solution, ctrl2.redraw)
      },
      i18n.site.viewTheSolution
    ),
    overrideButton(study)
  ]);
}
function overrideButton(study) {
  if (study.data.chapter.gamebook) {
    const o = study.vm.gamebookOverride;
    if (study.members.canContribute())
      return hl(
        "button.fbt.text.preview",
        {
          class: { active: o === "play" },
          attrs: { "data-icon": licon.Eye, type: "button" },
          hook: bind(
            "click",
            () => study.setGamebookOverride(o === "play" ? void 0 : "play"),
            study.redraw
          )
        },
        "Preview"
      );
    else {
      const isAnalyse = o === "analyse", ctrl2 = study.gamebookPlay;
      if (isAnalyse || (ctrl2 == null ? void 0 : ctrl2.state.feedback) === "end")
        return hl(
          "a.fbt.text.preview",
          {
            class: { active: isAnalyse },
            attrs: dataIcon(licon.Microscope),
            hook: bind(
              "click",
              () => study.setGamebookOverride(isAnalyse ? void 0 : "analyse"),
              study.redraw
            )
          },
          i18n.site.analysis
        );
    }
  }
  return void 0;
}

// ../analyse/src/study/inviteForm.ts
function makeCtrl(send, members, setTab, redraw) {
  const open = prop(false), spectators = prop([]);
  const toggle2 = () => {
    if (!open()) pubsub.emit("analysis.closeAll");
    open(!open());
    redraw();
  };
  pubsub.on("analysis.closeAll", () => open(false));
  const previouslyInvited = storedSet("study.previouslyInvited", 10);
  return {
    open,
    members,
    spectators,
    toggle: toggle2,
    invite(titleName) {
      const userId = titleNameToId(titleName);
      send("invite", userId);
      setTimeout(() => previouslyInvited(userId), 1e3);
      setTab();
    },
    redraw,
    previouslyInvited
  };
}
function view10(ctrl2) {
  const candidates = [.../* @__PURE__ */ new Set([...ctrl2.spectators(), ...ctrl2.previouslyInvited()])].filter((s) => !ctrl2.members()[titleNameToId(s)]).sort();
  return snabDialog({
    class: "study__invite",
    onClose() {
      ctrl2.open(false);
      ctrl2.redraw();
    },
    modal: true,
    noScrollable: true,
    easyClose: "clickOutside",
    vnodes: [
      h("h2", i18n.study.inviteToTheStudy),
      h("p.info", { attrs: dataIcon(licon.InfoCircle) }, i18n.study.pleaseOnlyInvitePeopleYouKnow),
      h("div.input-wrapper", [
        // because typeahead messes up with snabbdom
        h("input", {
          attrs: { placeholder: i18n.study.searchByUsername, spellcheck: "false" },
          hook: onInsert(
            (input) => userComplete({
              input,
              focus: true,
              tag: "span",
              onSelect(v) {
                input.value = "";
                ctrl2.invite(v.name);
                ctrl2.redraw();
              }
            })
          )
        })
      ]),
      candidates.length ? h(
        "div.users",
        candidates.map(function(username) {
          return h(
            "span.button.button-metal",
            { key: username, hook: bind("click", () => ctrl2.invite(username)) },
            username
          );
        })
      ) : void 0
    ]
  });
}

// ../analyse/src/study/notif.ts
var NotifCtrl = class {
  constructor(redraw) {
    this.redraw = redraw;
    this.set = (n) => {
      clearTimeout(this.timeoutId);
      this.current = n;
      this.timeoutId = setTimeout(() => {
        this.current = void 0;
        this.redraw();
      }, n.duration);
    };
    this.get = () => this.current;
  }
};
function view11(ctrl2) {
  const c = ctrl2.get();
  return c ? h("div.notif", c.text) : void 0;
}

// ../analyse/src/study/practice/studyPracticeView.ts
var studyPracticeView_exports = {};
__export(studyPracticeView_exports, {
  side: () => side,
  underboard: () => underboard
});
var selector = (data) => h(
  "select.selector",
  { hook: bind("change", (e) => location.href = e.target.value) },
  [
    h("option", { attrs: { disabled: true } }, "Practice list"),
    ...data.structure.map(
      (section) => h(
        "optgroup",
        { attrs: { label: section.name } },
        section.studies.map(
          (study) => option(`/practice/${section.id}/${study.slug}/${study.id}`, data.url, study.name)
        )
      )
    )
  ]
);
function renderGoal(practice, inMoves) {
  const goal = practice.goal();
  switch (goal.result) {
    case "mate":
      return "Checkmate the opponent";
    case "mateIn":
      return "Checkmate the opponent in " + plural("move", inMoves);
    case "drawIn":
      return "Hold the draw for " + plural("more move", inMoves);
    case "equalIn":
      return "Equalize in " + plural("move", inMoves);
    case "evalIn":
      if (practice.isWhite() === goal.cp >= 0) return "Get a winning position in " + plural("move", inMoves);
      return "Defend for " + plural("move", inMoves);
    case "promotion":
      return "Safely promote your pawn";
    default:
      return void 0;
  }
}
function underboard(ctrl2) {
  if (ctrl2.vm.loading) return [h("div.feedback", spinnerVdom())];
  const p = ctrl2.practice, gb = ctrl2.gamebookPlay, pinned = ctrl2.data.chapter.description;
  if (gb) return pinned ? [h("div.feedback.ongoing", [h("div.comment", { hook: richHTML(pinned) })])] : [];
  else if (!ctrl2.data.chapter.practice) return [view9(ctrl2, true)];
  switch (p.success()) {
    case true:
      if (p.autoNext()) return [h("span.feedback.win", "Success!")];
      else {
        return [
          h(
            "a.feedback.win",
            ctrl2.nextChapter() ? { hook: bind("click", ctrl2.goToNextChapter) } : { attrs: { href: "/practice" } },
            [h("span", "Success!"), ctrl2.nextChapter() ? "Go to next exercise" : "Back to practice menu"]
          )
        ];
      }
    case false:
      return [
        h("a.feedback.fail", { hook: bind("click", p.reset, ctrl2.redraw) }, [
          h("span", [renderGoal(p, p.goal().moves)]),
          h("strong", "Click to retry")
        ])
      ];
    default:
      return [
        h("div.feedback.ongoing", [
          h("div.goal", [renderGoal(p, p.goal().moves - p.nbMoves())]),
          pinned ? h("div.comment", { hook: richHTML(pinned) }) : null
        ]),
        cmnToggleWrapProp({
          id: "autoNext",
          name: "Load next exercise immediately",
          prop: p.autoNext,
          redraw: ctrl2.redraw
        })
      ];
  }
}
function side(ctrl2) {
  const current = ctrl2.currentChapter(), data = ctrl2.practice.data;
  return h("div.practice__side", [
    h("div.practice__side__title", [
      h("icon." + data.study.id),
      h("div.text", [h("h1", data.study.name), h("em", data.study.desc)])
    ]),
    h(
      "div.practice__side__chapters",
      {
        hook: bindNonPassive("click", (e) => {
          e.preventDefault();
          const target = e.target, id = target.parentNode.dataset["id"] || target.dataset["id"];
          if (id) ctrl2.setChapter(id, true);
          return false;
        })
      },
      ctrl2.chapters.list.all().flatMap(({ id, name }) => {
        const loading = ctrl2.vm.loading && id === ctrl2.vm.nextChapterId, active = !ctrl2.vm.loading && (current == null ? void 0 : current.id) === id, completion = data.completion[id] >= 0 ? "done" : "ongoing";
        return [
          h(
            "a.ps__chapter",
            {
              key: id,
              attrs: { href: data.url + "/" + id, "data-id": id },
              class: { active, loading }
            },
            [
              h("span.status." + completion, {
                attrs: dataIcon(
                  (loading || active) && completion === "ongoing" ? licon.PlayTriangle : licon.Checkmark
                )
              }),
              h("h3", name)
            ]
          )
        ];
      })
    ),
    h("div.finally", [
      h("a.back", { attrs: { "data-icon": licon.LessThan, href: "/practice", title: "More practice" } }),
      thunk("select.selector", selector, [data])
    ])
  ]);
}

// ../analyse/src/study/serverEval.ts
var chartSpinner = () => h("div#acpl-chart-container-loader", [
  h("span", [stockfishName, h("br"), "Server analysis"]),
  spinnerVdom()
]);
var ServerEval = class {
  constructor(root, chapterId) {
    this.root = root;
    this.chapterId = chapterId;
    this.requested = false;
    this.reset = () => {
      this.requested = false;
    };
    this.request = () => {
      this.root.socket.send("requestAnalysis", this.chapterId());
      this.requested = true;
    };
    this.updateChart = (d) => {
      var _a;
      return (_a = this.chart) == null ? void 0 : _a.updateData(d, this.analysedMainline());
    };
    this.analysedMainline = () => {
      var _a, _b, _c, _d;
      return this.root.mainline.slice(0, (((_d = (_c = (_b = (_a = this.root.study) == null ? void 0 : _a.data.chapter) == null ? void 0 : _b.serverEval) == null ? void 0 : _c.path) == null ? void 0 : _d.length) || 999) / 2 + 1);
    };
    pubsub.on("analysis.server.progress", this.updateChart);
  }
};
function view12(ctrl2) {
  var _a, _b, _c;
  const analysis = ctrl2.root.data.analysis;
  if (!ctrl2.root.settings.showStaticAnalysis) return disabled();
  if (!analysis) return ctrl2.requested ? requested() : requestButton(ctrl2);
  const mainline = ctrl2.requested ? ctrl2.root.data.treeParts : ctrl2.analysedMainline();
  const chart = h("canvas.study__server-eval.ready." + analysis.id, {
    hook: onInsert((el) => {
      requestIdleCallbackSafe(async () => {
        (await site.asset.loadEsm("chart.game")).acpl(el, ctrl2.root.data, mainline).then((chart2) => ctrl2.chart = chart2);
      }, 800);
    })
  });
  const loading = !((_c = (_b = (_a = ctrl2.root.study) == null ? void 0 : _a.data.chapter) == null ? void 0 : _b.serverEval) == null ? void 0 : _c.done) && mainline.find(ctrl2.root.partialAnalysisCallback);
  return h("div.study__server-eval.ready.", loading ? [chart, chartSpinner()] : chart);
}
var disabled = () => h("div.study__server-eval.disabled.padded", "You disabled computer analysis.");
var requested = () => h("div.study__server-eval.requested.padded", spinnerVdom());
function requestButton(ctrl2) {
  const root = ctrl2.root;
  return h(
    "div.study__message",
    root.mainline.length < 5 ? h("p", i18n.study.theChapterIsTooShortToBeAnalysed) : !root.study.members.canContribute() ? [i18n.study.onlyContributorsCanRequestAnalysis] : [
      h("p", [i18n.study.getAFullComputerAnalysis, h("br"), i18n.study.makeSureTheChapterIsComplete]),
      h(
        "a.button.text",
        {
          attrs: { "data-icon": licon.BarChart, disabled: root.mainline.length < 5 },
          hook: bind("click", ctrl2.request, root.redraw)
        },
        i18n.site.requestAComputerAnalysis
      )
    ]
  );
}

// ../analyse/src/study/studyForm.ts
var StudyForm = class {
  constructor(doSave, getData, redraw, relay) {
    this.doSave = doSave;
    this.getData = getData;
    this.redraw = redraw;
    this.relay = relay;
    this.initAt = Date.now();
    this.open = toggle(false);
    this.isNew = () => {
      const d = this.getData();
      return !!d.isNew && Date.now() - this.initAt < 9e3 && (d.from === "scratch" || isObjectWithSomeProperty(d.from, ["study", "game"]));
    };
    this.openIfNew = () => {
      if (this.isNew()) this.open(true);
    };
    this.save = (data, isNew) => {
      this.doSave(data, isNew);
      this.open(false);
    };
  }
};
var isObjectWithSomeProperty = (o, keys) => typeof o === "object" && o !== null && keys.some((k) => k in o);
var select = (s) => hl("div.form-group.form-half" + (s.visible ? "" : ".none"), [
  hl("label.form-label", { attrs: { for: "study-" + s.key } }, s.name),
  hl(
    `select#study-${s.key}.form-control`,
    s.choices.map((o) => hl("option", { attrs: { value: o[0], selected: s.selected === o[0] } }, o[1]))
  )
]);
function view13(ctrl2) {
  var _a;
  const data = ctrl2.getData();
  const isNew = ctrl2.isNew();
  const isEditable = !((_a = ctrl2.relay) == null ? void 0 : _a.isOfficial());
  const updateName = (elem, isUpdate) => {
    if (!isUpdate && !elem.value) {
      elem.value = data.name;
      if (isNew) elem.select();
      elem.focus();
    }
  };
  const userSelectionChoices = [
    ["nobody", i18n.study.nobody],
    ["owner", i18n.study.onlyMe],
    ["contributor", i18n.study.contributors],
    ["member", i18n.study.members],
    ["everyone", i18n.study.everyone]
  ];
  const formFields = [
    hl("div.form-split.flair-and-name" + (ctrl2.relay ? ".none" : ""), [
      hl("div.form-group", [
        hl("label.form-label", "Flair"),
        hl(
          "div.form-control.emoji-details",
          {
            hook: onInsert((el) => flairPickerLoader(el))
          },
          [
            hl("div.emoji-popup-button", [
              hl(
                "select#study-flair.form-control",
                { attrs: { name: "flair" } },
                data.flair && hl("option", { attrs: { value: data.flair, selected: true } })
              ),
              hl("img", { attrs: { src: data.flair ? site.asset.flairSrc(data.flair) : "" } })
            ]),
            hl(
              "div.flair-picker.none",
              data.admin || { attrs: { "data-except-emojis": "activity.lichess" } },
              hl("button.button.button-metal.emoji-remove", { attrs: { type: "button" } }, "clear")
            )
          ]
        )
      ]),
      hl("div.form-group", [
        hl("label.form-label", { attrs: { for: "study-name" } }, i18n.site.name),
        hl("input#study-name.form-control", {
          attrs: { minlength: 3, maxlength: 100 },
          hook: {
            ...onInsert((elem) => {
              updateName(elem, false);
              elem.addEventListener("focus", () => elem.select());
              setTimeout(() => elem.focus());
            }),
            postpatch: (_, vnode) => updateName(vnode.elm, true)
          }
        })
      ])
    ]),
    hl("div.form-split", [
      ctrl2.relay ? hl("input#study-visibility", {
        attrs: { type: "hidden", name: "visibility", value: data.visibility }
      }) : select({
        key: "visibility",
        name: i18n.study.visibility,
        choices: [
          ["public", i18n.study.public],
          ["unlisted", i18n.study.unlisted],
          ["private", i18n.study.inviteOnly]
        ],
        selected: data.visibility,
        visible: isEditable
      }),
      select({
        key: "chat",
        name: i18n.site.chat,
        choices: userSelectionChoices,
        selected: data.settings.chat,
        visible: isEditable
      })
    ]),
    hl("div.form-split", [
      select({
        key: "computer",
        name: i18n.site.computerAnalysis,
        choices: userSelectionChoices,
        selected: data.settings.computer,
        visible: isEditable
      }),
      select({
        key: "explorer",
        name: i18n.site.openingExplorerAndTablebase,
        choices: userSelectionChoices,
        selected: data.settings.explorer,
        visible: isEditable
      })
    ]),
    hl("div.form-split", [
      select({
        key: "cloneable",
        name: i18n.study.allowCloning,
        choices: userSelectionChoices,
        selected: data.settings.cloneable,
        visible: isEditable
      }),
      select({
        key: "shareable",
        name: i18n.study.shareAndExport,
        choices: userSelectionChoices,
        selected: data.settings.shareable,
        visible: isEditable
      })
    ]),
    hl("div.form-split", [
      select({
        key: "sticky",
        name: i18n.study.enableSync,
        choices: [
          ["true", i18n.study.yesKeepEveryoneOnTheSamePosition],
          ["false", i18n.study.noLetPeopleBrowseFreely]
        ],
        selected: String(data.settings.sticky),
        visible: isEditable
      }),
      select({
        key: "description",
        name: i18n.study.pinnedStudyComment,
        choices: [
          ["false", i18n.study.noPinnedComment],
          ["true", i18n.study.rightUnderTheBoard]
        ],
        selected: String(data.settings.description),
        visible: true
      })
    ])
  ];
  const relayLinks = ctrl2.relay && hl("div.form-actions-secondary", [
    hl(
      "a.text",
      {
        attrs: {
          "data-icon": licon.RadioTower,
          href: `/broadcast/${ctrl2.relay.data.tour.id}/edit`
        }
      },
      "Tournament settings"
    ),
    hl(
      "a.text",
      { attrs: { "data-icon": licon.RadioTower, href: `/broadcast/round/${data.id}/edit` } },
      "Round settings"
    )
  ]);
  const deleteForms = hl("div", { attrs: { style: "display: flex" } }, [
    hl(
      "form",
      {
        attrs: { action: "/study/" + data.id + "/delete", method: "post" },
        hook: bindNonPassive("submit", (e) => {
          if (isNew) return;
          e.preventDefault();
          prompt(i18n.study.confirmDeleteStudy(data.name)).then((userInput) => {
            if ((userInput == null ? void 0 : userInput.trim()) === data.name.trim()) e.target.submit();
          });
        })
      },
      [hl(emptyRedButton, isNew ? i18n.site.cancel : i18n.study.deleteStudy)]
    ),
    !isNew && hl(
      "form",
      {
        attrs: { action: "/study/" + data.id + "/clear-chat", method: "post" },
        hook: bindNonPassive("submit", (e) => {
          e.preventDefault();
          confirm(i18n.study.deleteTheStudyChatHistory).then((yes) => {
            if (yes) e.target.submit();
          });
        })
      },
      [hl(emptyRedButton, i18n.study.clearChat)]
    )
  ]);
  return snabDialog({
    class: "study-edit",
    onClose() {
      ctrl2.open(false);
      ctrl2.redraw();
    },
    modal: true,
    vnodes: [
      hl(
        "h2",
        ctrl2.relay ? i18n.broadcast.editRoundStudy : isNew ? i18n.study.createStudy : i18n.study.editStudy
      ),
      hl(
        "form.form3",
        {
          hook: bindSubmit((e) => {
            const getVal = (name) => {
              const el = e.target.querySelector("#study-" + name);
              if (el) return el.value;
              else throw `Missing form input: ${name}`;
            };
            ctrl2.save(
              {
                name: getVal("name"),
                flair: getVal("flair"),
                visibility: getVal("visibility"),
                computer: getVal("computer"),
                explorer: getVal("explorer"),
                cloneable: getVal("cloneable"),
                shareable: getVal("shareable"),
                chat: getVal("chat"),
                sticky: getVal("sticky") === "true",
                description: getVal("description") === "true"
              },
              isNew
            );
          }, ctrl2.redraw)
        },
        [
          formFields,
          relayLinks,
          hl("div.form-actions", [
            deleteForms,
            hl("button.button", { attrs: { type: "submit" } }, isNew ? i18n.study.start : i18n.study.save)
          ])
        ]
      )
    ]
  });
}

// ../analyse/src/study/studyGlyph.ts
var renderGlyph = (ctrl2, node) => (glyph) => h(
  "button",
  {
    hook: bind("click", (e) => {
      ctrl2.toggleGlyph(glyph.id);
      blurIfPrimaryClick(e);
    }),
    attrs: { "data-symbol": glyph.symbol, type: "button" },
    class: { active: !!node.glyphs && node.glyphs.some((g) => g.id === glyph.id) }
  },
  [glyph.name]
);
var GlyphForm = class {
  constructor(root) {
    this.root = root;
    this.all = prop(null);
    this.loadGlyphs = () => {
      if (!this.all())
        glyphs().then((gs) => {
          this.all(gs);
          this.root.redraw();
        });
    };
    this.toggleGlyph = throttle(500, (id) => {
      this.root.study.makeChange("toggleGlyph", this.root.study.withPosition({ id }));
      this.root.redraw();
    });
  }
};
var viewDisabled2 = (why) => h("div.study__glyphs", [h("div.study__message", why)]);
function view14(ctrl2) {
  const all = ctrl2.all(), node = ctrl2.root.node;
  return h(
    "div.study__glyphs" + (all ? "" : ".empty"),
    { hook: { insert: ctrl2.loadGlyphs } },
    all ? [
      h("div.move", all.move.map(renderGlyph(ctrl2, node))),
      h("div.position", all.position.map(renderGlyph(ctrl2, node))),
      h("div.observation", all.observation.map(renderGlyph(ctrl2, node)))
    ] : [h("div.study__message", spinnerVdom())]
  );
}

// ../analyse/src/study/studyMembers.ts
function memberActivity(onIdle) {
  let timeout;
  const schedule = () => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(onIdle, 100);
  };
  schedule();
  return schedule;
}
var StudyMemberCtrl = class {
  constructor(opts) {
    this.opts = opts;
    this.config = prop(null);
    this.active = /* @__PURE__ */ new Map();
    this.online = {};
    this.spectatorIds = [];
    this.max = 30;
    this.owner = () => this.dict()[this.opts.ownerId];
    this.isOwner = () => this.opts.myId === this.opts.ownerId || this.opts.admin && this.canContribute();
    this.myMember = () => this.opts.myId ? this.dict()[this.opts.myId] : void 0;
    this.canContribute = () => {
      var _a;
      return ((_a = this.myMember()) == null ? void 0 : _a.role) === "w";
    };
    this.setActive = (id) => {
      if (this.opts.tab() !== "members") return;
      const active = this.active.get(id);
      if (active) active();
      else
        this.active.set(
          id,
          memberActivity(() => {
            this.active.delete(id);
            this.opts.redraw();
          })
        );
      this.opts.redraw();
    };
    this.updateOnline = () => {
      this.online = {};
      const members = this.dict();
      this.spectatorIds.forEach((id) => {
        if (members[id]) this.online[id] = true;
      });
      if (this.opts.tab() === "members") this.opts.redraw();
    };
    this.update = (members) => {
      if (this.isOwner()) this.config(Object.keys(members).find((sri) => !this.dict()[sri]) || null);
      const wasViewer = this.myMember() && !this.canContribute();
      const wasContrib = this.myMember() && this.canContribute();
      this.dict(members);
      if (wasViewer && this.canContribute()) {
        if (once("study-tour")) this.opts.startTour();
        this.opts.onBecomingContributor();
        this.opts.notif.set({
          text: i18n.study.youAreNowAContributor,
          duration: 3e3
        });
      } else if (wasContrib && !this.canContribute())
        this.opts.notif.set({
          text: i18n.study.youAreNowASpectator,
          duration: 3e3
        });
      this.updateOnline();
    };
    this.setRole = (userId, role) => {
      this.setActive(userId);
      this.opts.send("setRole", { userId, role });
      this.config(null);
    };
    this.kick = (id) => {
      this.opts.send("kick", id);
      this.config(null);
    };
    this.leave = () => this.opts.send("leave");
    this.ordered = () => {
      const d = this.dict();
      return Object.keys(d).map((id) => d[id]).sort((a, b) => a.role === "r" && b.role === "w" ? 1 : a.role === "w" && b.role === "r" ? -1 : 0);
    };
    this.size = () => Object.keys(this.dict()).length;
    this.isOnline = (userId) => this.online[userId];
    this.hasOnlineContributor = () => {
      const members = this.dict();
      for (const i in members) if (this.online[i] && members[i].role === "w") return true;
      return false;
    };
    this.dict = prop(opts.initDict);
    this.inviteForm = makeCtrl(opts.send, this.dict, () => opts.tab("members"), opts.redraw);
    pubsub.on("socket.in.crowd", (d) => {
      const names = d.users || [];
      this.inviteForm.spectators(names);
      this.spectatorIds = names.map(titleNameToId);
      this.updateOnline();
    });
  }
};
function view15(ctrl2) {
  const { members, data } = ctrl2;
  const isOwner = members.isOwner();
  function statusIcon({ user, role }) {
    const contrib = role === "w";
    return hl(
      "span.status",
      {
        class: {
          contrib,
          active: members.active.has(user.id),
          online: members.isOnline(user.id)
        },
        attrs: { title: i18n.study[contrib ? "contributor" : "spectator"] }
      },
      icon(contrib ? licon.User : licon.Eye)()
    );
  }
  function configButton(ctrl3, { user }) {
    if (isOwner && (user.id !== members.opts.myId || data.admin))
      return button(
        ".act",
        {
          hook: bind(
            "click",
            () => members.config(members.config() === user.id ? null : user.id),
            ctrl3.redraw
          )
        },
        icon(licon.Gear)()
      );
    if (!isOwner && user.id === members.opts.myId)
      return button(
        ".act.leave",
        {
          title: i18n.study.leaveTheStudy,
          hook: bind("click", members.leave, ctrl3.redraw)
        },
        icon(licon.InternalArrow)()
      );
    return void 0;
  }
  function memberConfig({ user, role }) {
    return hl(
      "m-config",
      {
        key: user.id + "-config",
        hook: onInsert((el) => scrollTo(el.closest(".study-list"), el))
      },
      [
        cmnToggleWrap({
          id: "member-role",
          name: i18n.study.contributor,
          checked: role === "w",
          change: (v) => members.setRole(user.id, v ? "w" : "r"),
          redraw: ctrl2.redraw
        }),
        hl(
          "div.kick",
          button(
            ".button.button-red.button-empty.text",
            { ...dataIcon(licon.X), hook: bind("click", (_) => members.kick(user.id), ctrl2.redraw) },
            i18n.study.kick
          )
        )
      ]
    );
  }
  const ordered = members.ordered();
  return hl("div.study__members", [
    hl(
      "div.study-list",
      ordered.flatMap((member) => {
        const config = members.config() === member.user.id;
        return [
          hl("div", { key: member.user.id, class: { editing: config } }, [
            hl("div.left", [statusIcon(member), userLink({ ...member.user, line: false })]),
            configButton(ctrl2, member)
          ]),
          config && memberConfig(member)
        ];
      })
    ),
    isOwner && ordered.length < members.max && button(".add", { key: "add", hook: bind("click", members.inviteForm.toggle) }, [
      icon(licon.PlusButton)(),
      hl("h3", i18n.study.addMembers)
    ]),
    !members.canContribute() && data.admin && hl(
      "form.admin",
      {
        key: ":admin",
        hook: bindNonPassive("submit", () => {
          textRaw(`/study/${data.id}/admin`, { method: "post" }).then(() => location.reload());
          return false;
        })
      },
      button(".button.button-red.button-thin", "Enter as admin")
    )
  ]);
}

// ../analyse/src/study/studySearch.ts
var SearchCtrl = class {
  constructor(studyName, chapters, rootSetChapter, redraw) {
    this.studyName = studyName;
    this.chapters = chapters;
    this.rootSetChapter = rootSetChapter;
    this.redraw = redraw;
    this.query = propWithEffect("", this.redraw);
    this.cleanQuery = () => this.query().toLowerCase().trim();
    this.results = () => {
      const q = this.cleanQuery();
      return q ? this.chapters.all().filter((c) => c.name.toLowerCase().includes(q)) : this.chapters.all();
    };
    this.setChapter = (id) => {
      this.rootSetChapter(id);
      this.open(false);
      this.query("");
    };
    this.setFirstChapter = () => {
      const c = this.results()[0];
      if (c) this.setChapter(c.id);
    };
    this.open = toggle(false, () => this.query(""));
  }
};
var escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function view16(ctrl2) {
  const cleanQuery = ctrl2.cleanQuery();
  const highlightRegex = cleanQuery && new RegExp(escapeRegExp(cleanQuery), "gi");
  return snabDialog({
    class: "study-search",
    onClose() {
      ctrl2.open(false);
    },
    noScrollable: true,
    easyClose: "clickOutside",
    modal: true,
    vnodes: [
      h("h2", `Search chapters`),
      h(
        "div.search-wrapper",
        h("input", {
          attrs: { autofocus: 1, placeholder: `Search in ${ctrl2.studyName}`, value: ctrl2.query() },
          hook: onInsert((el) => {
            el.addEventListener(
              "input",
              (e) => ctrl2.query(e.target.value.trim())
            );
            el.addEventListener("keydown", enter(ctrl2.setFirstChapter));
          })
        })
      ),
      h(
        // dynamic extra class necessary to fully redraw the results and produce innerHTML
        `div.study-search__results.search-query-${encodeURIComponent(cleanQuery)}`,
        { attrs: { tabindex: -1 } },
        ctrl2.results().length > 0 ? ctrl2.results().map(
          (c) => h("button", { hook: bind("click", () => ctrl2.setChapter(c.id)) }, [
            h(
              "h3",
              {
                hook: highlightRegex ? {
                  insert(vnode) {
                    const el = vnode.elm;
                    el.innerHTML = escapeHtml(c.name).replace(highlightRegex, "<high>$&</high>");
                  }
                } : {}
              },
              c.name
            ),
            c.playing ? h("ongoing", { attrs: { ...dataIcon(licon.DiscBig), title: "Ongoing" } }) : c.status && h("res", c.status)
          ])
        ) : h("p.no-results", i18n.site.thereAreNoResultsForX(cleanQuery))
      )
    ]
  });
}

// ../analyse/src/study/studyShare.ts
var StudyShare = class {
  constructor(data, currentChapter, currentNode, onMainline, bottomColor, relay, redraw) {
    this.data = data;
    this.currentChapter = currentChapter;
    this.currentNode = currentNode;
    this.onMainline = onMainline;
    this.bottomColor = bottomColor;
    this.relay = relay;
    this.redraw = redraw;
    this.withPly = prop(false);
    this.studyId = this.data.id;
    this.variantKey = this.data.chapter.setup.variant.key;
    this.chapter = this.currentChapter;
    this.isPrivate = () => this.data.visibility === "private";
    this.cloneable = () => this.data.features.cloneable;
    this.shareable = () => this.data.features.shareable;
    this.gamebook = this.data.chapter.gamebook;
  }
};
function fromPly(ctrl2) {
  if (!ctrl2.onMainline()) return void 0;
  const renderedMove = renderIndexAndMove(ctrl2.currentNode(), false, false);
  return hl("label.url-start-at-ply", [
    cmnToggleProp({ id: "study-share-start-position", prop: ctrl2.withPly, redraw: ctrl2.redraw }),
    ...renderedMove.length ? i18n.study.startAtX.asArray(hl("strong", renderedMove)) : [i18n.study.startAtInitialPosition]
  ]);
}
function youCanPasteThis() {
  return hl(
    "p.form-help.text",
    { attrs: dataIcon(licon.InfoCircle) },
    i18n.study.youCanPasteThisInTheForumToEmbed
  );
}
function copyChapterPgn(url2, text) {
  return hl(
    "a.button.text",
    {
      attrs: {
        ...dataIcon(licon.Clipboard),
        tabindex: "0",
        "data-url": url2
      },
      hook: bind("click", async (event) => {
        const target = event.target;
        const url3 = target.dataset["url"];
        const iconFeedback = (success) => {
          target.setAttribute("data-icon", success ? licon.Checkmark : licon.X);
          setTimeout(() => target.setAttribute("data-icon", licon.Clipboard), 1e3);
        };
        writeTextClipboard(url3).then(
          () => iconFeedback(true),
          (err) => {
            console.log(err);
            iconFeedback(false);
          }
        );
      })
    },
    text
  );
}
function view17(ctrl2) {
  const { studyId, relay } = ctrl2;
  const chapter = ctrl2.chapter();
  const isPrivate = ctrl2.isPrivate();
  const currentNode = ctrl2.currentNode();
  const addPly = (path) => ctrl2.onMainline() ? ctrl2.withPly() ? `${path}#${currentNode.ply}` : path : `${path}#last`;
  return hl("div.study__share", [
    hl("div.downloads", [
      ctrl2.cloneable() && hl(
        "a.button.text",
        { attrs: { ...dataIcon(licon.StudyBoard), href: `/study/${studyId}/clone` } },
        i18n.study.cloneStudy
      ),
      relay && hl(
        "a.button.text",
        {
          attrs: {
            ...dataIcon(licon.Download),
            href: `/api/broadcast/${relay.data.tour.id}.pgn`,
            download: true
          }
        },
        i18n.broadcast.downloadAllRounds
      ),
      hl(
        "a.button.text",
        {
          attrs: {
            ...dataIcon(licon.Download),
            href: relay ? `${relay.roundPath()}.pgn` : `/study/${studyId}.pgn`,
            download: true
          }
        },
        relay ? i18n.site.downloadAllGames : i18n.study.studyPgn
      ),
      hl(
        "a.button.text",
        {
          attrs: {
            ...dataIcon(licon.Download),
            href: `/study/${studyId}/${chapter.id}.pgn`,
            download: true
          }
        },
        relay ? i18n.study.downloadGame : i18n.study.chapterPgn
      ),
      copyChapterPgn(`/study/${studyId}/${chapter.id}.pgn`, i18n.study.copyChapterPgn),
      copyChapterPgn(
        `/study/${studyId}/${chapter.id}.pgn?clocks=false&comments=false&variations=false`,
        i18n.study.copyRawChapterPgn
      ),
      hl(
        "a.button.text",
        {
          attrs: {
            ...dataIcon(licon.Download),
            href: url(site.asset.baseUrl() + "/export/fen.gif", {
              fen: currentNode.fen,
              color: ctrl2.bottomColor(),
              lastMove: currentNode.uci,
              variant: ctrl2.variantKey,
              theme: document.body.dataset.board,
              piece: document.body.dataset.pieceSet
            }),
            download: true
          }
        },
        i18n.site.board
      ),
      hl(
        "a.button.text",
        {
          attrs: {
            ...dataIcon(licon.Download),
            href: url(`/study/${studyId}/${chapter.id}.gif`, {
              theme: document.body.dataset.board,
              piece: document.body.dataset.pieceSet,
              showGlyphs: true
            }),
            download: true
          }
        },
        "GIF"
      )
    ]),
    hl("form.form3", [
      (relay ? [
        [relay.data.tour.name, relay.tourPath()],
        [ctrl2.data.name, relay.roundPath()],
        [i18n.broadcast.currentGameUrl, addPly(`${relay.roundPath()}/${chapter.id}`), true]
      ] : [
        [i18n.study.studyUrl, `/study/${studyId}`],
        [i18n.study.currentChapterUrl, addPly(`/study/${studyId}/${chapter.id}`), true]
      ]).map(
        ([text, path, pastable]) => hl("div.form-group", [
          hl("label.form-label", text),
          copyMeInput(`${baseUrl()}${path}`, { inputAttrs: { readonly: true } }),
          pastable && fromPly(ctrl2),
          pastable && isPrivate && youCanPasteThis()
        ])
      ),
      relay ? hl("div.form-group", [
        hl("label.form-label", "Embed this particular game"),
        copyMeInput(relayIframe(`${relay.roundPath()}/${chapter.id}`), {
          inputAttrs: { readonly: true }
        }),
        hl(
          "a.form-help.text",
          { attrs: { ...dataIcon(licon.InfoCircle), href: `${relay.roundPath()}#overview` } },
          "More options for embedding a broadcast"
        )
      ]) : isPrivate || // study embed
      hl("div.form-group", [
        hl("div.form-label", [
          hl("label", i18n.study.embedInYourWebsite),
          hl(
            "a.form-help.text",
            {
              attrs: {
                href: "/developers#embed-study",
                target: "_blank",
                ...dataIcon(licon.InfoCircle)
              }
            },
            i18n.study.readMoreAboutEmbedding
          )
        ]),
        copyMeInput(
          !isPrivate ? `<iframe ${ctrl2.gamebook ? 'width="320" height="320"' : 'width="600" height="371"'} src="${baseUrl()}${addPly(
            `/study/embed/${studyId}/${chapter.id}`
          )}" frameborder=0></iframe>` : i18n.study.onlyPublicStudiesCanBeEmbedded,
          { inputAttrs: { readonly: true, disabled: isPrivate } }
        ),
        fromPly(ctrl2)
      ])
    ]),
    hl("div.form-group", [
      hl("label.form-label", "FEN"),
      copyMeInput(currentNode.fen, { inputAttrs: { readonly: true } })
    ])
  ]);
}

// ../analyse/src/study/studyTags.ts
var tagsToMap = (tags) => {
  const map = /* @__PURE__ */ new Map();
  tags.forEach(([k, v]) => map.set(k.toLowerCase(), v));
  return map;
};
var TagsForm = class {
  constructor(root, types) {
    this.root = root;
    this.types = types;
    this.selectedType = prop(void 0);
    this.getChapter = () => this.root.data.chapter;
    this.makeChange = throttle(500, (name, value) => {
      this.root.makeChange("setTag", {
        chapterId: this.getChapter().id,
        name,
        value: value.slice(0, 140)
      });
    });
    this.editable = () => this.root.vm.mode.write;
    this.submit = (name, value) => this.editable() && this.makeChange(name, value);
  }
};
function view18(root) {
  const chapter = root.tags.getChapter(), tagKey = chapter.tags.map((t) => t[1]).join(","), key = chapter.id + root.data.name + chapter.name + root.data.likes + tagKey + root.vm.mode.write;
  return thunk("div." + chapter.id, doRender2, [root, key]);
}
var doRender2 = (root) => h("div", renderPgnTags(root.tags, root.data.showRatings));
var editable = (name, value, submit) => h("input", {
  key: value,
  // force to redraw on change, to visibly update the input value
  attrs: { spellcheck: "false", ...inputAttrs[name], maxlength: 140, value },
  hook: onInsert((el) => {
    el.onblur = () => el.checkValidity() && submit(name, el.value, el);
    el.onkeydown = enter(() => el.blur());
  })
});
var titles = "GM|WGM|IM|WIM|FM|WFM|CM|WCM|NM|WNM|LM|BOT";
var acceptableTitlePattern = `${titles}|${titles.toLowerCase()}`;
var inputAttrs = /* @__PURE__ */ (() => {
  const elo = { pattern: "\\d{3,4}" };
  const fideId = { pattern: "\\d{2,9}" };
  const title = { pattern: acceptableTitlePattern };
  return {
    Date: {
      pattern: (
        // Match 1700-2099. or ????.
        "(?:(?:(?:17|18|19|20)[0-9]{2}\\.)|\\?\\?\\?\\?\\.)(?:(?:(?:0[1-9]|1[0-2])\\.(?:0[1-9]|1[0-9]|2[0-9])|(?:(?!02)(?:0[1-9]|1[0-2])\\.(?:30))|(?:(?:0[13578]|1[02])\\.31))|(?:\\?\\?\\.(?:0[1-9]|1[0-9]|2[0-9]|30|31))|(?:(?:0[1-9]|1[0-2])\\.\\?\\?)|(?:\\?\\?\\.\\?\\?))"
      ),
      // PGN specification allows for substition of any numeric value with '?'
      title: "yyyy.mm.dd or ????.??.??"
    },
    WhiteElo: elo,
    BlackElo: elo,
    WhiteFideId: fideId,
    BlackFideId: fideId,
    WhiteTitle: title,
    BlackTitle: title
  };
})();
var fixed = ([key, value]) => key.endsWith("FideId") ? h("a", { attrs: { href: `/fide/${value}/redirect` } }, value) : fixedValue(value);
var fixedValue = (value) => h("span", value);
function renderPgnTags(tags, showRatings) {
  let rows = [];
  const chapter = tags.getChapter();
  if (chapter.setup.variant.key !== "standard")
    rows.push(["Variant", fixedValue(chapter.setup.variant.name)]);
  rows = rows.concat(
    chapter.tags.filter(
      (tag) => tag[0] !== "Variant" && (showRatings || !["WhiteElo", "BlackElo"].includes(tag[0]) || !looksLikeLichessGame(chapter.tags))
    ).map((tag) => [tag[0], tags.editable() ? editable(tag[0], tag[1], tags.submit) : fixed(tag)])
  );
  if (tags.editable()) {
    const existingTypes = new Set(chapter.tags.map((t) => t[0]));
    rows.push([
      h(
        "select.button.button-metal",
        {
          hook: {
            ...onInsert((elem) => {
              tags.selectedType(elem.value);
              elem.addEventListener("change", (_) => {
                var _a;
                tags.selectedType(elem.value);
                const pattern = (_a = inputAttrs[elem.value]) == null ? void 0 : _a.pattern;
                $(elem).parents("tr").find("input").each(function() {
                  if (pattern) this.setAttribute("pattern", String(pattern));
                  else this.removeAttribute("pattern");
                  this.focus();
                });
              });
            }),
            postpatch: (_, vnode) => tags.selectedType(vnode.elm.value)
          }
        },
        [
          h("option", i18n.study.newTag),
          ...tags.types.map((t) => !existingTypes.has(t) ? option(t, "", t) : void 0)
        ]
      ),
      editable("", "", (_, value, el) => {
        const tpe = tags.selectedType();
        if (tpe) {
          tags.submit(tpe, value);
          el.value = "";
        }
      })
    ]);
  }
  return h(
    "table.study__tags.slist",
    h(
      "tbody",
      rows.map((r) => h("tr", { key: r[0].toString() }, [h("th", r[0]), h("td", r[1])]))
    )
  );
}

// ../analyse/src/study/topics.ts
var TopicsCtrl = class {
  constructor(save, getTopics, redraw) {
    this.save = save;
    this.getTopics = getTopics;
    this.redraw = redraw;
    this.open = prop(false);
  }
};
var view19 = (ctrl2) => h("div.study__topics", [
  ...ctrl2.topics.getTopics().map(
    (topic) => h("a.topic", { attrs: { href: `/study/topic/${encodeURIComponent(topic)}/hot` } }, topic)
  ),
  ctrl2.members.canContribute() ? h(
    "a.manage",
    { hook: bind("click", () => ctrl2.topics.open(true), ctrl2.redraw) },
    i18n.study.manageTopics
  ) : null
]);
var tagify;
var formView = (ctrl2, userId) => snabDialog({
  class: "study-topics",
  onClose() {
    ctrl2.open(false);
    ctrl2.redraw();
  },
  modal: true,
  vnodes: [
    h("h2", i18n.study.topics),
    h(
      "form",
      {
        hook: bindSubmit((_) => {
          const tags = tagify == null ? void 0 : tagify.value;
          if (tags) {
            ctrl2.save(tags.map((t) => t.value));
            ctrl2.open(false);
          }
        }, ctrl2.redraw)
      },
      [
        h(
          "textarea",
          { hook: onInsert((elm) => setupTagify(elm, userId)) },
          ctrl2.getTopics().join(", ").replace(/[<>]/g, "")
        ),
        h("button.button", { type: "submit" }, i18n.study.save)
      ]
    )
  ],
  onInsert: (dlg) => {
    var _a;
    dlg.show();
    (_a = dlg.view.querySelector(".tagify__input")) == null ? void 0 : _a.focus();
  }
});
function setupTagify(elm, userId) {
  site.asset.loadCssPath("bits.tagify");
  site.asset.loadIife("npm/tagify.min.js").then(() => {
    const tagi = tagify = new window.Tagify(elm, { pattern: /.{2,}/, maxTags: 30 });
    let abortCtrl;
    tagi.on("input", (e) => {
      const term = e.detail.value.trim();
      if (term.length < 2) return;
      tagi.settings.whitelist.length = 0;
      abortCtrl == null ? void 0 : abortCtrl.abort("nevermind " + term);
      abortCtrl = new AbortController();
      tagi.loading(true).dropdown.hide.call(tagi);
      json(url("/study/topic/autocomplete", { term, user: userId }), { signal: abortCtrl.signal }).then(
        (list) => {
          tagi.settings.whitelist.splice(0, list.length, ...list);
          tagi.loading(false).dropdown.show.call(tagi, term);
        }
      );
    });
    $(".tagify__input").each(function() {
      this.focus();
    });
  });
}

// ../analyse/src/study/studyView.ts
function studyView(ctrl2, study, deps) {
  var _a;
  const ctx = viewContext(ctrl2, deps);
  const { gamebookPlayView, gaugeOn } = ctx;
  return renderMain(
    ctx,
    ctrl2.keyboardHelp && view6(ctrl2),
    deps.studyView.overboard(study),
    renderBoard(ctx),
    gaugeOn && main_exports.renderGauge(ctrl2),
    crazyView_default(ctrl2, ctrl2.topColor(), "top"),
    gamebookPlayView || renderTools(ctx),
    crazyView_default(ctrl2, ctrl2.bottomColor(), "bottom"),
    !gamebookPlayView && renderControls(ctrl2),
    renderUnderboard(ctx),
    ctrl2.keyboardMove && render(ctrl2.keyboardMove),
    render2(ctrl2),
    ((_a = ctrl2.study) == null ? void 0 : _a.practice) ? deps == null ? void 0 : deps.studyPracticeView.side(study) : hl(
      "aside.analyse__side",
      {
        hook: onInsert((elm) => {
          var _a2;
          if ((_a2 = ctrl2.opts.$side) == null ? void 0 : _a2.length) {
            $(elm).replaceWith(ctrl2.opts.$side);
            wikiToggleBox();
          }
        })
      },
      deps == null ? void 0 : deps.studyView.studySideNodes(study, true)
    )
  );
}
function studySideNodes(ctrl2, withSearch) {
  const activeTab = ctrl2.vm.tab();
  const makeTab = (key, name) => hl(
    `button.${key}`,
    {
      class: { active: activeTab === key },
      attrs: { role: "tab" },
      on: {
        click: (e) => {
          ctrl2.setTab(key);
          blurIfPrimaryClick(e);
        }
      }
    },
    name
  );
  const chaptersTab = ctrl2.chapters.list.looksNew() && !ctrl2.members.canContribute() || makeTab("chapters", i18n.study[ctrl2.relay ? "nbGames" : "nbChapters"](ctrl2.chapters.list.size()));
  const tabs = hl("div.tabs-horiz", { attrs: { role: "tablist" } }, [
    chaptersTab,
    ctrl2.members.size() > 0 && makeTab("members", i18n.study.nbMembers(ctrl2.members.size())),
    withSearch && hl("button.search.narrow", {
      attrs: { ...dataIcon(licon.Search) },
      on: {
        click: () => ctrl2.search.open(true)
      }
    }),
    ctrl2.members.isOwner() && hl("button.more.narrow", {
      attrs: { ...dataIcon(licon.Hamburger), title: i18n.study.editStudy },
      on: {
        click: () => ctrl2.toggleStudyFormIfAllowed()
      }
    })
  ]);
  const content = (activeTab === "members" ? view15 : view3)(ctrl2);
  const trailer = withSearch && sideTrailerNodes(ctrl2);
  return [
    hl("div.study__side", [tabs, content, displayColumns() > 2 && trailer]),
    displayColumns() < 3 && trailer
  ];
}
var contextMenu = (ctrl2, path, node) => ctrl2.vm.mode.write ? [
  hl(
    "a",
    {
      attrs: dataIcon(licon.BubbleSpeech),
      hook: bind("click", () => {
        ctrl2.vm.toolTab("comments");
        ctrl2.commentForm.start(ctrl2.currentChapter().id, path, node);
      })
    },
    i18n.study.commentThisMove
  ),
  hl(
    "a.glyph-icon",
    {
      hook: bind("click", () => {
        ctrl2.vm.toolTab("glyphs");
        ctrl2.ctrl.userJump(path);
      })
    },
    i18n.study.annotateWithGlyphs
  )
] : [];
var overboard = (ctrl2) => ctrl2.chapters.newForm.isOpen() ? view(ctrl2.chapters.newForm) : ctrl2.chapters.editForm.current() ? view2(ctrl2.chapters.editForm) : ctrl2.members.inviteForm.open() ? view10(ctrl2.members.inviteForm) : ctrl2.topics.open() ? formView(ctrl2.topics, ctrl2.members.opts.myId) : ctrl2.form.open() ? view13(ctrl2.form) : ctrl2.search.open() ? view16(ctrl2.search) : void 0;
function underboard2(ctrl2) {
  var _a;
  if ((_a = ctrl2.study) == null ? void 0 : _a.practice) return underboard(ctrl2.study);
  const study = ctrl2.study, toolTab = study.vm.toolTab();
  if (study.gamebookPlay)
    return [playButtons(ctrl2), view9(study, true), view9(study, false), metadata(study)];
  let panel;
  switch (toolTab) {
    case "tags":
      panel = metadata(study);
      break;
    case "comments":
      panel = study.vm.mode.write ? view8(ctrl2) : viewDisabled(
        ctrl2,
        study.members.canContribute() ? "Press REC to comment moves" : "Only the study members can comment on moves"
      );
      break;
    case "glyphs":
      panel = ctrl2.path ? study.vm.mode.write ? view14(study.glyphForm) : viewDisabled2("Press REC to annotate moves") : viewDisabled2("Select a move to annotate");
      break;
    case "serverEval":
      panel = view12(study.serverEval);
      if (study == null ? void 0 : study.relay) panel = hl("div.eval-chart-and-training", [panel, render2(ctrl2)]);
      break;
    case "share":
      panel = view17(study.share);
      break;
    case "multiBoard":
      panel = view4(study.multiBoard, study);
      break;
  }
  return [view11(study.notif), view9(study, true), view9(study, false), buttons(ctrl2), panel];
}
var resultTag = (s) => s === "1" ? "good" : s === "0" ? "bad" : "status";
var toolButton = (opts) => hl(
  "button." + opts.tab,
  {
    attrs: { role: "tab", title: opts.hint },
    class: { active: opts.tab === opts.ctrl.vm.toolTab() },
    hook: bind(
      "click",
      (e) => {
        if (opts.onClick) opts.onClick();
        opts.ctrl.vm.toolTab(opts.tab);
        if (opts.shouldBlurIfPrimaryClick) blurIfPrimaryClick(e);
      },
      opts.ctrl.redraw
    )
  },
  [!!opts.count && hl("count.data-count", { attrs: { "data-count": opts.count } }), opts.icon]
);
function buttons(root) {
  const ctrl2 = root.study, canContribute = ctrl2.members.canContribute(), showSticky = ctrl2.data.features.sticky && (canContribute || ctrl2.vm.behind && ctrl2.isUpdatedRecently()), gbButton = overrideButton(ctrl2);
  return hl("div.study__buttons", [
    hl("div.left-buttons.tabs-horiz", { attrs: { role: "tablist" } }, [
      // distinct classes (sync, write) allow snabbdom to differentiate buttons
      !!showSticky && hl(
        "a.mode.sync",
        {
          attrs: { title: i18n.study.allSyncMembersRemainOnTheSamePosition },
          class: { on: ctrl2.vm.mode.sticky },
          hook: bind("click", ctrl2.toggleSticky)
        },
        [ctrl2.vm.behind ? hl("span.behind", ctrl2.vm.behind) : hl("icon.is"), "SYNC"]
      ),
      canContribute && hl(
        "a.mode.write",
        {
          attrs: { title: i18n.study.shareChanges },
          class: { on: ctrl2.vm.mode.write },
          hook: bind("click", ctrl2.toggleWrite)
        },
        [hl("icon.is"), "REC"]
      ),
      toolButton({
        ctrl: ctrl2,
        tab: "tags",
        hint: i18n.study.pgnTags,
        icon: icon(licon.Tag)(),
        shouldBlurIfPrimaryClick: true
      }),
      canContribute && toolButton({
        ctrl: ctrl2,
        tab: "comments",
        hint: i18n.study.commentThisPosition,
        icon: icon(licon.BubbleSpeech)(),
        onClick() {
          ctrl2.commentForm.start(ctrl2.vm.chapterId, root.path, root.node);
        },
        count: (root.node.comments || []).length
      }),
      canContribute && toolButton({
        ctrl: ctrl2,
        tab: "glyphs",
        hint: i18n.study.annotateWithGlyphs,
        icon: hl("icon.glyph-icon"),
        count: (root.node.glyphs || []).length,
        shouldBlurIfPrimaryClick: true
      }),
      (canContribute || root.data.analysis) && toolButton({
        ctrl: ctrl2,
        tab: "serverEval",
        hint: i18n.site.computerAnalysis,
        icon: icon(licon.BarChart)(),
        count: root.data.analysis && "\u2713",
        shouldBlurIfPrimaryClick: true
      }),
      toolButton({
        ctrl: ctrl2,
        tab: "multiBoard",
        hint: "Multiboard",
        icon: icon(licon.Multiboard)(),
        shouldBlurIfPrimaryClick: true
      }),
      ctrl2.share.shareable() && toolButton({
        ctrl: ctrl2,
        tab: "share",
        hint: i18n.study.shareAndExport,
        icon: icon(shareIcon())(),
        shouldBlurIfPrimaryClick: true
      }),
      !ctrl2.relay && !ctrl2.data.chapter.gamebook && hl("button.help", {
        attrs: { title: i18n.study.getTheTour, ...dataIcon(licon.InfoCircle) },
        hook: bind("click", ctrl2.startTour)
      })
    ]),
    gbButton && hl("div.right", gbButton)
  ]);
}
function metadata(ctrl2) {
  const d = ctrl2.data, title = `${d.name}: ${ctrl2.currentChapter().name}`;
  return hl("div.study__metadata", [
    hl("h2", [
      hl("span.name", { attrs: { title } }, [
        d.flair && hl("img.icon-flair", { attrs: { src: site.asset.flairSrc(d.flair) } }),
        title
      ]),
      hl(
        "span.liking.text",
        {
          class: { liked: d.liked },
          attrs: {
            ...dataIcon(d.liked ? licon.Heart : licon.HeartOutline),
            title: d.liked ? i18n.site.liked : i18n.site.like
          },
          hook: bind("click", ctrl2.toggleLike)
        },
        d.likes
      )
    ]),
    view19(ctrl2),
    view18(ctrl2)
  ]);
}
function sideTrailerNodes(study) {
  const showChat = study.ctrl.chatCtrl && (study == null ? void 0 : study.data.settings.chat) !== "nobody";
  const resizeId = displayColumns() > 2 && `studySide/${study == null ? void 0 : study.data.id}`;
  return [
    resizeId && verticalResize({
      selector: ".study-list",
      key: "study-list",
      id: resizeId,
      min: () => 28,
      max: () => 28 * 64,
      initialMaxHeight: () => 28 * 6
    }),
    showChat && renderChat(study.ctrl.chatCtrl),
    showChat && resizeId && verticalResize({
      key: "study-chat",
      id: resizeId,
      min: () => 34,
      max: () => window.innerHeight,
      initialMaxHeight: () => window.innerHeight / 3
    }),
    hl("div.chat__members.none", { hook: onInsert(watchers) })
  ];
}

// ../analyse/src/treeView/contextMenu.ts
function renderContextMenu(e, ctrl2, path) {
  let pos = getPosition(e);
  if (pos === null) {
    if (ctrl2.contextMenuPath) return;
    pos = { x: 0, y: 0 };
  }
  const el = $("#" + elementId)[0] || $('<div id="' + elementId + '">').appendTo($("body"))[0];
  ctrl2.contextMenuPath = path;
  function close(e2) {
    if (e2.button === 2) return;
    ctrl2.contextMenuPath = void 0;
    document.removeEventListener("click", close, false);
    $("#" + elementId).removeClass("visible");
    ctrl2.redraw();
  }
  document.addEventListener("click", close, false);
  el.innerHTML = "";
  patch(el, view20(ctrl2, path, pos));
}
var elementId = "analyse-cm";
function getPosition(e) {
  let pos = e;
  if ("touches" in e && e.touches.length > 0) pos = e.touches[0];
  if (pos.pageX || pos.pageY) return { x: pos.pageX, y: pos.pageY };
  else if (pos.clientX || pos.clientY)
    return {
      x: pos.clientX + document.body.scrollLeft + document.documentElement.scrollLeft,
      y: pos.clientY + document.body.scrollTop + document.documentElement.scrollTop
    };
  else return null;
}
function positionMenu(menu, coords) {
  const menuWidth = menu.offsetWidth + 4, menuHeight = menu.offsetHeight + 4, windowWidth = window.innerWidth, windowHeight = window.innerHeight;
  menu.style.left = windowWidth - coords.x < menuWidth ? windowWidth - menuWidth + "px" : menu.style.left = coords.x + "px";
  menu.style.top = windowHeight - coords.y < menuHeight ? windowHeight - menuHeight + "px" : menu.style.top = coords.y + "px";
}
function action(icon2, text, onClick, onHover, onLeave) {
  return hl(
    "a",
    {
      attrs: dataIcon(icon2),
      hook: onInsert((elm) => {
        elm.addEventListener("click", onClick);
        if (onHover && !isTouchDevice())
          elm.addEventListener("mouseover", () => {
            onHover();
            $("#" + elementId).addClass("transparent");
          });
        if (onLeave)
          elm.addEventListener("mouseout", () => {
            onLeave();
            $("#" + elementId).removeClass("transparent");
          });
      })
    },
    text
  );
}
function view20(ctrl2, path, coords) {
  const { tree, idbTree } = ctrl2;
  const canPrune = ctrl2.ongoing && path.startsWith(ctrl2.initialPath);
  const node = tree.nodeAtPath(path), onMainline = tree.pathIsMainline(path) && !tree.pathIsForcedVariation(path);
  let canPromote = !onMainline;
  for (let iter = tree.lastMainlineNode(path).children[1]; canPromote && iter; iter = iter.children[0]) {
    if (iter === node) canPromote = false;
  }
  return hl(
    "div#" + elementId + ".visible",
    {
      hook: {
        ...onInsert((elm) => {
          elm.addEventListener("contextmenu", (e) => (e.preventDefault(), false));
          positionMenu(elm, coords);
        }),
        postpatch: (_, vnode) => positionMenu(vnode.elm, coords)
      }
    },
    [
      hl("p.title", nodeFullName(node)),
      idbTree.someCollapsedOf(false) && // with variation hiding enabled, collapse/expand all are most common
      action(licon.MinusButton, "Collapse all", () => idbTree.setCollapsedFrom("", true)),
      idbTree.someCollapsedOf(true) && action(licon.PlusButton, "Expand all", () => idbTree.setCollapsedFrom("", false)),
      canPrune && action(licon.Trash, "Prune to main line", () => ctrl2.pruneToMainline(path)),
      // correspondence
      canPromote && action(licon.UpTriangle, i18n.site.promoteVariation, () => ctrl2.promote(path, false)),
      !onMainline && action(licon.Checkmark, i18n.site.makeMainLine, () => ctrl2.promote(path, true)),
      path && ctrl2.study && contextMenu(ctrl2.study, path, node),
      path && onMainline && action(licon.InternalArrow, i18n.site.forceVariation, () => ctrl2.forceVariation(path, true)),
      action(
        licon.Clipboard,
        onMainline ? i18n.site.copyMainLinePgn : i18n.site.copyVariationPgn,
        () => navigator.clipboard.writeText(
          renderNodesPgn(ctrl2.data.game, ctrl2.tree.getNodeList(path), !onMainline)
        ),
        () => ctrl2.pendingCopy({ eventPath: path, withVariations: !onMainline }),
        () => ctrl2.pendingCopy(null)
      ),
      path && action(
        licon.Trash,
        i18n.site.deleteFromHere,
        () => ctrl2.deleteNode(path),
        () => ctrl2.pendingDeletionPath(path),
        () => ctrl2.pendingDeletionPath(null)
      )
    ]
  );
}

// ../analyse/src/treeView/treeView.ts
var TreeView = class {
  constructor(ctrl2) {
    this.ctrl = ctrl2;
    this.autoScrollRequest = false;
    this.hidden = true;
  }
  render(concealOf) {
    this.mode = concealOf || !this.ctrl.settings.inline ? "column" : "inline";
    return this.mode === "column" ? renderColumnView(this.ctrl, concealOf) : renderInlineView(this.ctrl);
  }
  requestAutoScroll(request) {
    this.autoScrollRequest = request;
  }
  hook() {
    const { ctrl: ctrl2 } = this;
    return {
      ...onInsert((el) => {
        if (ctrl2.path !== "") this.autoScrollRequest = "instant";
        const ctxMenuCallback = (e) => {
          var _a;
          renderContextMenu(e, ctrl2, (_a = eventPath(e)) != null ? _a : "");
          ctrl2.redraw();
          return false;
        };
        if (site.debug) {
          el.ondblclick = ctxMenuCallback;
        } else {
          el.oncontextmenu = ctxMenuCallback;
        }
        if (isTouchDevice()) {
          el.ondblclick = ctxMenuCallback;
          addPointerListeners(el, { hold: ctxMenuCallback });
        }
        el.addEventListener("pointerup", (e) => {
          if (!(e.target instanceof HTMLElement)) return;
          if (e.target.classList.contains("disclosure") || defined(e.button) && e.button !== 0) return;
          const path = eventPath(e);
          if (path) ctrl2.userJump(path);
          this.autoScrollRequest = false;
          ctrl2.redraw();
        });
      }),
      postpatch: () => {
        if (this.autoScrollRequest) {
          autoScroll(this.autoScrollRequest);
          this.autoScrollRequest = false;
        }
      }
    };
  }
};
var eventPath = (e) => {
  const target = e.target;
  return target.getAttribute("p") || target.parentElement.getAttribute("p");
};
var autoScroll = throttle(200, (behavior = "instant") => {
  const scrollView = document.querySelector(".analyse__moves");
  const moveEl = scrollView.querySelector(".active");
  if (!moveEl) return scrollView.scrollTo({ top: 0, behavior });
  const [move, view21] = [moveEl.getBoundingClientRect(), scrollView.getBoundingClientRect()];
  const visibleHeight = Math.min(view21.bottom, window.innerHeight) - Math.max(view21.top, 0);
  scrollView.scrollTo({
    top: scrollView.scrollTop + move.top - view21.top - (visibleHeight - move.height) / 2,
    behavior
  });
});

// ../analyse/src/util.ts
function treeReconstruct(parts, variant, sidelines) {
  const completer = completeNode(variant);
  const root = completer(parts[0]);
  let node = root;
  for (let i = 1; i < parts.length; i++) {
    const n = completer(parts[i]);
    const variations = sidelines ? sidelines[i] : [];
    node.children.unshift(n, ...variations);
    node = n;
  }
  return root;
}
function addCrazyData(node, pos) {
  if (pos.pockets)
    node.crazy = {
      pockets: [pos.pockets.white, pos.pockets.black]
    };
}

// ../analyse/src/ctrl.ts
var AnalyseCtrl = class {
  constructor(opts, redraw, makeStudy) {
    this.opts = opts;
    this.redraw = redraw;
    this.liveAnnotate = new LiveAnnotate();
    this.idbTree = new IdbTree(this);
    this.actionMenu = toggle(false);
    this.redirecting = false;
    this.onMainline = true;
    // true if real game is ongoing
    this.cevalEnabledProp = storedBooleanProp("engine.enabled", false);
    // display flags
    this.flipped = false;
    this.showComments = true;
    this.showCevalProp = storedBooleanProp(
      "analyse.show-engine",
      this.cevalEnabledProp()
    );
    this.keyboardHelp = location.hash === "#keyboard";
    this.threatMode = prop(false);
    this.cgVersion = {
      js: 1,
      // increment to recreate chessground
      dom: 1
    };
    this.pvUciQueue = [];
    this.makeInitialPath = () => {
      if (this.ongoing) return path_exports.fromNodeList(ops_exports.mainlineNodeList(this.tree.root));
      const loc = window.location, hashPly = loc.hash === "#last" ? this.tree.lastPly() : parseInt(loc.hash.slice(1)), startPly = hashPly >= 0 ? hashPly : this.opts.inlinePgn ? this.tree.lastPly() : void 0;
      if (defined(startPly)) {
        window.history.replaceState(null, "", loc.pathname + loc.search);
        this.requestInitialPly = startPly;
        const mainline = ops_exports.mainlineNodeList(this.tree.root);
        return ops_exports.takePathWhile(mainline, (n) => n.ply <= startPly);
      } else return path_exports.root;
    };
    this.enableWiki = (v) => {
      this.wiki = v ? wikiTheory() : void 0;
      if (this.wiki) this.wiki(this.nodeList);
      else wikiClear();
    };
    this.setPath = (path) => {
      this.path = path;
      this.nodeList = this.tree.getNodeList(path);
      this.node = ops_exports.last(this.nodeList);
      this.mainline = ops_exports.mainlineNodeList(this.tree.root);
      this.onMainline = this.tree.pathIsMainline(path);
      this.fenInput = void 0;
      this.pgnInput = void 0;
      if (this.wiki && this.data.game.variant.key === "standard") this.wiki(this.nodeList);
      this.idbTree.saveMoves();
      this.idbTree.revealNode();
    };
    this.flip = () => {
      var _a, _b;
      if (((_a = this.study) == null ? void 0 : _a.onFlip(!this.flipped)) === false) return;
      this.flipped = !this.flipped;
      (_b = this.chessground) == null ? void 0 : _b.set({
        orientation: this.bottomColor()
      });
      if (this.retro && this.data.game.variant.key !== "racingKings")
        this.retro = make2(this, this.bottomColor());
      if (this.practice) this.startCeval();
      this.explorer.onFlip();
      this.onChange();
      this.redraw();
    };
    this.bottomIsWhite = () => this.bottomColor() === "white";
    this.serverMainline = () => this.mainline.slice(0, playedTurns(this.data) + 1);
    this.setChessground = (cg) => {
      var _a, _b;
      this.chessground = cg;
      if (this.data.pref.keyboardMove && !((_a = this.study) == null ? void 0 : _a.relay)) {
        (_b = this.keyboardMove) != null ? _b : this.keyboardMove = ctrl({
          ...this,
          data: { ...this.data, player: { color: "both" } },
          flipNow: this.flip
        });
        this.keyboardMove.update({ fen: this.node.fen, canMove: true, cg });
        requestAnimationFrame(() => this.redraw());
      }
      this.setAutoShapes();
      if (this.node.shapes) this.chessground.setShapes(this.node.shapes.slice());
      this.cgVersion.dom = this.cgVersion.js;
    };
    this.onChange = throttle(300, () => {
      pubsub.emit("analysis.change", this.node.fen, this.path);
    });
    this.updateHref = debounce(() => {
      if (!this.opts.study) window.history.replaceState(null, "", "#" + this.node.ply);
    }, 750);
    this.playedLastMoveMyself = () => !!this.justPlayed && !!this.node.uci && this.node.uci.startsWith(this.justPlayed);
    this.userJump = (path) => {
      this.autoplay.stop();
      if (!this.gamebookPlay()) this.withCg((cg) => cg.selectSquare(null));
      if (this.practice) {
        const prev = this.path;
        this.practice.preUserJump(prev, path);
        this.jump(path);
        this.withCg((cg) => cg.cancelPremove());
        this.practice.postUserJump(prev, this.path);
      } else this.jump(path);
    };
    this.canJumpTo = (path) => !this.study || this.study.canJumpTo(path);
    this.jumpToMain = (ply) => {
      this.userJump(this.mainlinePlyToPath(ply));
    };
    this.jumpToIndex = (index) => {
      this.jumpToMain(index + 1 + this.tree.root.ply);
    };
    this.crazyValid = (role, key) => {
      const color = this.chessground.state.movable.color;
      return (color === "white" || color === "black") && valid(this.chessground, this.node.drops(), { color, role }, key);
    };
    this.getCrazyhousePockets = () => {
      var _a;
      return (_a = this.node.crazy) == null ? void 0 : _a.pockets;
    };
    // keyboardMove
    this.sendNewPiece = (role, key) => {
      const color = this.chessground.state.movable.color;
      if (color === "white" || color === "black") this.userNewPiece({ color, role }, key);
    };
    this.userNewPiece = (piece, pos) => {
      if (valid(this.chessground, this.node.drops(), piece, pos)) {
        this.justPlayed = roleToChar(piece.role).toUpperCase() + "@" + pos;
        this.justDropped = piece.role;
        this.justCaptured = void 0;
        const drop = {
          role: piece.role,
          pos,
          variant: this.data.game.variant.key,
          path: this.path
        };
        if (this.study) this.socket.sendAnaDrop(drop);
        this.addNodeLocally({
          role: piece.role,
          to: parseSquare(pos)
        });
      } else this.jump(this.path);
    };
    this.userMove = (orig, dest, capture) => {
      this.justPlayed = orig;
      this.justDropped = void 0;
      if (!this.promotion.start(orig, dest, {
        submit: (orig2, dest2, prom) => this.sendMove(orig2, dest2, capture, prom)
      }))
        this.sendMove(orig, dest, capture);
    };
    this.sendMove = (orig, dest, capture, prom) => {
      const move = {
        orig,
        dest,
        variant: this.data.game.variant.key,
        path: this.path
      };
      if (prom) move.promotion = prom;
      if (capture) this.justCaptured = capture;
      if (this.practice) this.practice.onUserMove();
      if (this.study) this.socket.sendAnaMove(move);
      this.addNodeLocally({
        from: parseSquare(orig),
        to: parseSquare(dest),
        promotion: prom
      });
    };
    this.onPremoveSet = () => {
      if (this.study) this.study.onPremoveSet();
    };
    this.motifAllowed = () => {
      var _a, _b;
      return ((_a = this.study) == null ? void 0 : _a.isCevalAllowed()) !== false && !((_b = this.retro) == null ? void 0 : _b.isSolving());
    };
    this.motifEnabled = () => this.motifAllowed() && this.motif.supports(this.data.game.variant.key);
    this.setAutoShapes = () => {
      var _a;
      if (!site.blindMode) (_a = this.chessground) == null ? void 0 : _a.setAutoShapes(compute(this));
    };
    this.onNewCeval = (ev, path, isThreat) => {
      this.tree.updateAt(path, (node) => {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        if (node.fen !== ev.fen && !isThreat) return;
        if (isThreat) {
          const threat = ev;
          if (!node.threat || isFirstEvalBetter(threat, node.threat, this.ceval.search.multiPv))
            node.threat = threat;
        } else if ((!node.ceval || isFirstEvalBetter(ev, node.ceval, this.ceval.search.multiPv)) && !(ev.cloud && this.ceval.engines.external)) {
          node.ceval = ev;
        } else if (!ev.cloud) {
          if (((_a = node.ceval) == null ? void 0 : _a.cloud) && this.ceval.isDeeper()) node.ceval = ev;
        }
        if (!isThreat) (_b = this.liveAnnotate) == null ? void 0 : _b.onNewCeval(path, node, this.tree);
        if (path === this.path) {
          this.setAutoShapes();
          if (!isThreat) {
            (_c = this.retro) == null ? void 0 : _c.onCeval();
            (_e = (_d = this.study) == null ? void 0 : _d.practice) == null ? void 0 : _e.onCeval();
            (_f = this.practice) == null ? void 0 : _f.onCeval();
            (_h = (_g = this.study) == null ? void 0 : _g.multiCloudEval) == null ? void 0 : _h.onLocalCeval(node, ev);
            this.evalCache.onLocalCeval();
          }
          if (!(site.blindMode && this.retro)) this.redraw();
        }
      });
    };
    this.isCevalAllowed = () => !this.ongoing && (!this.study || this.study.isCevalAllowed()) && (this.synthetic || !playable(this.data)) && !location.search.includes("evals=0");
    this.cevalEnabled = (enable) => {
      var _a, _b;
      const force = Boolean(((_a = this.study) == null ? void 0 : _a.practice) || this.practice || ((_b = this.retro) == null ? void 0 : _b.forceCeval()));
      const unforcedState = this.cevalEnabledProp() && this.isCevalAllowed() && !this.ceval.wasUnloaded;
      if (enable === void 0) return force ? "force" : unforcedState;
      if (!force) {
        this.showCevalProp(enable);
        this.cevalEnabledProp(enable);
      }
      if (enable && this.ceval.wasUnloaded) this.ceval.reset();
      if (enable !== unforcedState) {
        if (enable) this.startCeval();
        else {
          this.threatMode(false);
          this.ceval.reset();
        }
        this.setAutoShapes();
        this.ceval.showEnginePrefs(false);
        this.redraw();
      }
      return force ? "force" : enable;
    };
    this.startCeval = () => {
      if (!this.ceval.download) this.ceval.reset();
      if (this.node.threefold || !this.cevalEnabled() || this.node.outcome()) return;
      this.ceval.start(this.path, this.nodeList, void 0, this.threatMode());
      this.evalCache.fetch(this.path, this.ceval.search.multiPv);
    };
    this.showMoveGlyphs = () => this.study && !this.study.relay || this.settings.showStaticAnalysis;
    this.showMoveAnnotations = () => {
      var _a;
      return this.settings.showMoveAnnotationsOnBoard && !((_a = this.retro) == null ? void 0 : _a.isSolving()) && this.showMoveGlyphs();
    };
    this.showCeval = (show) => {
      const barMode = this.activeControlMode();
      if (show === void 0) return displayColumns() > 1 || barMode === "ceval" || barMode === "practice";
      this.ceval.showEnginePrefs(false);
      this.showCevalProp(show);
      if (show) this.cevalEnabled(true);
      return show;
    };
    this.activeControlMode = () => {
      var _a;
      return ((_a = this.study) == null ? void 0 : _a.practice) ? "learn-practice" : this.practice ? "practice" : this.retro ? "retro" : this.showCevalProp() ? "ceval" : false;
    };
    this.toggleThreatMode = (v = !this.threatMode()) => {
      if (v === this.threatMode()) return;
      if (this.node.check() || !this.showEvaluation()) return;
      if (!this.cevalEnabled()) return;
      this.threatMode(v);
      if (this.threatMode() && this.practice) this.togglePractice();
      this.setAutoShapes();
      this.startCeval();
      this.redraw();
    };
    this.toggleActionMenu = () => {
      if (!this.actionMenu() && this.explorer.enabled()) this.explorer.toggle();
      this.actionMenu.toggle();
    };
    this.toggleRetro = () => {
      if (this.retro) this.retro = void 0;
      else {
        this.closeTools();
        this.retro = make2(this, this.bottomColor());
      }
      this.setAutoShapes();
    };
    this.toggleExplorer = () => {
      if (!this.explorer.allowed()) return;
      if (!this.explorer.enabled()) {
        this.retro = void 0;
        this.actionMenu(false);
      }
      this.explorer.toggle();
    };
    this.togglePractice = (enable = !this.practice) => {
      if (enable === !!this.practice) return;
      this.practice = void 0;
      if (!enable || !this.isCevalAllowed()) {
        this.setCevalPracticeOpts();
        this.showGround();
      } else {
        this.closeTools();
        this.threatMode(false);
        this.practice = make(this);
        this.setCevalPracticeOpts();
        this.setAutoShapes();
        this.startCeval();
      }
    };
    this.gamebookPlay = () => {
      var _a;
      return (_a = this.study) == null ? void 0 : _a.gamebookPlay;
    };
    this.isGamebook = () => {
      var _a;
      return !!((_a = this.study) == null ? void 0 : _a.data.chapter.gamebook);
    };
    this.closeTools = () => {
      this.retro = void 0;
      this.togglePractice(false);
      if (this.explorer.enabled()) this.explorer.toggle();
      this.actionMenu(false);
    };
    this.withCg = (f) => this.chessground && this.cgVersion.js === this.cgVersion.dom ? f(this.chessground) : void 0;
    this.hasFullComputerAnalysis = () => {
      return Object.keys(this.mainline[0].eval || {}).length > 0;
    };
    this.canEvalGet = () => {
      if (this.node.ply >= 15 && !this.opts.study) return false;
      const fens = /* @__PURE__ */ new Set();
      for (let i = this.nodeList.length - 1; i >= 0; i--) {
        const node = this.nodeList[i];
        const epd = fenToEpd(node.fen);
        if (fens.has(epd)) return false;
        if (node.san && sanIrreversible(this.data.game.variant.key, node.san)) return true;
        fens.add(epd);
      }
      return true;
    };
    this.instanciateEvalCache = () => {
      var _a;
      if (this.evalCache) this.evalCache.destroy();
      this.evalCache = new EvalCache({
        variant: this.data.game.variant.key,
        canGet: this.canEvalGet,
        canPut: () => {
          var _a2;
          return !!(((_a2 = this.ceval) == null ? void 0 : _a2.isCacheable) && this.canEvalGet() && // if not in study, only put decent opening moves
          (this.opts.study || !this.node.ceval.mate && Math.abs(this.node.ceval.cp) < 99));
        },
        getNode: () => this.node,
        send: this.opts.socketSend,
        receive: this.onNewCeval,
        upgradable: (_a = this.evalCache) == null ? void 0 : _a.upgradable()
      });
    };
    this.playUci = (uci, uciQueue) => {
      this.pvUciQueue = uciQueue != null ? uciQueue : [];
      const move = parseUci(uci);
      const to = makeSquare(move.to);
      if (isNormal(move)) {
        const piece = this.chessground.state.pieces.get(makeSquare(move.from));
        const capture = this.chessground.state.pieces.get(to);
        this.sendMove(
          makeSquare(move.from),
          to,
          capture && piece && capture.color !== piece.color ? capture : void 0,
          move.promotion
        );
      } else
        this.chessground.newPiece(
          {
            color: this.chessground.state.movable.color,
            role: move.role
          },
          to
        );
    };
    this.pluginMove = (orig, dest, prom) => {
      const capture = this.chessground.state.pieces.get(dest);
      this.sendMove(orig, dest, capture, prom);
    };
    this.handleArrowKey = (arrowKey) => {
      if (arrowKey === "ArrowUp") {
        if (this.fork.select("prev")) this.setAutoShapes();
        else this.navigate.first();
      } else if (arrowKey === "ArrowDown") {
        if (this.fork.select("next")) this.setAutoShapes();
        else this.navigate.last();
      } else if (arrowKey === "ArrowLeft") this.navigate.prev();
      else if (arrowKey === "ArrowRight") this.navigate.next();
      this.redraw();
    };
    this.pluginUpdate = (fen) => {
      var _a, _b;
      if (!fen.startsWith((_a = this.chessground) == null ? void 0 : _a.getFen())) return;
      (_b = this.keyboardMove) == null ? void 0 : _b.update({ fen, canMove: true });
    };
    this.showBestMoveArrows = () => {
      var _a;
      return this.settings.showBestMoveArrows && !((_a = this.retro) == null ? void 0 : _a.hideComputerLine(this.node));
    };
    this.resetAutoShapes = () => {
      var _a;
      if (this.showBestMoveArrows() || this.settings.showMoveAnnotationsOnBoard || this.settings.showVariationArrows || this.motifEnabled() && this.motif.any())
        this.setAutoShapes();
      else (_a = this.chessground) == null ? void 0 : _a.setAutoShapes([]);
    };
    this.ensureServerEvalNodes = (node) => {
      var _a;
      if (node.eval && !node.eval.knodes && ((_a = this.data.analysis) == null ? void 0 : _a.nodesPerMove))
        node.eval.knodes = this.data.analysis.nodesPerMove / 1e3;
    };
    var _a, _b;
    this.data = opts.data;
    this.element = opts.element;
    this.isEmbed = !!opts.embed;
    this.settings = new SettingsCtrl(() => {
      this.setAutoShapes();
      this.redraw();
    });
    this.treeView = new TreeView(this);
    this.navigate = new Navigate(this);
    this.promotion = new PromotionCtrl(
      this.withCg,
      () => this.withCg((g) => g.set(this.cgConfig)),
      this.redraw
    );
    this.motif = new MotifCtrl(this.settings);
    if (this.data.forecast) this.forecast = new ForecastCtrl(this.data.forecast, this.data, redraw);
    if (this.opts.wiki) this.wiki = wikiTheory();
    if (site.blindMode)
      site.asset.loadEsm("analyse.nvui", { init: this }).then((nvui) => {
        this.nvui = nvui;
        this.redraw();
      });
    this.instanciateEvalCache();
    if (opts.inlinePgn) this.data = this.changePgn(opts.inlinePgn, false) || this.data;
    this.initialize(this.data, false);
    this.initCeval();
    this.pendingCopy = propWithEffect(null, this.redraw);
    this.pendingDeletionPath = propWithEffect(null, this.redraw);
    this.initialPath = this.makeInitialPath();
    this.setPath(this.initialPath);
    this.showGround();
    this.resetAutoShapes();
    this.explorer.setNode();
    this.study = opts.study && makeStudy ? new makeStudy(opts.study, this, (opts.tagTypes || "").split(","), opts.practice, opts.relay) : void 0;
    if (location.hash === "#practice" || ((_a = this.study) == null ? void 0 : _a.data.chapter.practice)) this.togglePractice();
    else if (location.hash === "#menu") requestIdleCallbackSafe(this.actionMenu.toggle, 500);
    this.setCevalPracticeOpts();
    this.startCeval();
    bind2(this);
    const urlEngine = new URLSearchParams(location.search).get("engine");
    if (urlEngine) {
      try {
        this.ceval.selectEngine(urlEngine);
        this.cevalEnabled(true);
        this.threatMode(false);
      } catch (e) {
        console.info(e);
      }
      site.redirect("/analysis");
    }
    if (this.opts.chat && !this.isEmbed) {
      this.chatCtrl = new ChatCtrl(
        { ...this.opts.chat, enhance: { plies: true, boards: !!((_b = this.study) == null ? void 0 : _b.relay) } },
        this.redraw
      );
    }
    pubsub.on("jump", (ply) => {
      this.jumpToMain(parseInt(ply));
      this.redraw();
    });
    pubsub.on(
      "ply.trigger",
      () => pubsub.emit("ply", this.node.ply, this.tree.lastMainlineNode(this.path).ply === this.node.ply)
    );
    pubsub.on("analysis.chart.click", (index) => {
      this.jumpToIndex(index);
      this.redraw();
    });
    pubsub.on("board.change", (is3d) => {
      if (this.chessground) {
        this.chessground.state.addPieceZIndex = is3d;
        this.chessground.redrawAll();
        redraw();
      }
    });
    this.mergeIdbThenShowTreeView();
    window.lichess.analysis = {
      playUci: this.playUci,
      navigate: this.navigate
    };
    window.lichess.chessground = () => this.chessground;
  }
  initialize(data, merge) {
    var _a;
    this.data = data;
    this.synthetic = data.game.id === "synthetic";
    this.ongoing = !this.synthetic && playable(data);
    this.treeView.hidden = true;
    const prevTree = merge && this.tree.root;
    this.tree = makeTree(treeReconstruct(this.data.treeParts, this.variantKey, this.data.sidelines));
    if (prevTree) this.tree.merge(prevTree);
    ops_exports.updateAll(this.tree.root, this.ensureServerEvalNodes);
    const mainline = ops_exports.mainlineNodeList(this.tree.root);
    if (this.data.game.status.name === "draw") {
      if (add3or5FoldGlyphs(mainline)) this.data.game.threefold = true;
    }
    this.autoplay = new Autoplay(this);
    (_a = this.socket) != null ? _a : this.socket = make3(this.opts.socketSend, this);
    if (this.explorer) this.explorer.destroy();
    this.explorer = new ExplorerCtrl(this, this.opts.explorer, this.explorer);
    this.gamePath = this.synthetic || this.ongoing ? void 0 : path_exports.fromNodeList(mainline);
    this.fork = new ForkCtrl(this);
    site.sound.preloadBoardSounds();
  }
  get variantKey() {
    return this.data.game.variant.key;
  }
  topColor() {
    return opposite(this.bottomColor());
  }
  bottomColor() {
    if (this.data.game.variant.key === "racingKings") return this.flipped ? "black" : "white";
    return this.flipped ? opposite(this.data.orientation) : this.data.orientation;
  }
  getOrientation() {
    return this.bottomColor();
  }
  getNode() {
    return this.node;
  }
  turnColor() {
    return plyColor(this.node.ply);
  }
  togglePlay(delay) {
    this.autoplay.toggle(delay);
    this.actionMenu(false);
  }
  showGround() {
    if (this.node.pos().isErr || this.node.outcome()) this.ceval.reset();
    this.withCg((cg) => {
      cg.set(this.makeCgOpts());
      this.setAutoShapes();
      if (this.node.shapes) cg.setShapes(this.node.shapes.slice());
      cg.playPremove();
    });
    this.pluginUpdate(this.node.fen);
    this.onChange();
  }
  makeCgOpts() {
    const node = this.node, color = this.turnColor(), dests = this.node.dests(), drops = this.node.drops(), gamebookPlay = this.gamebookPlay(), movableColor = gamebookPlay ? gamebookPlay.movableColor() : this.practice ? this.bottomColor() : dests.size || (drops == null ? void 0 : drops.length) ? color : void 0, config = {
      fen: node.fen,
      turnColor: color,
      movable: {
        color: movableColor,
        dests: movableColor === color && dests || /* @__PURE__ */ new Map()
      },
      check: node.check(),
      lastMove: uciToMove(node.uci)
    };
    config.premovable = {
      enabled: config.movable.color && config.turnColor !== config.movable.color
    };
    this.cgConfig = config;
    return config;
  }
  jump(path) {
    var _a, _b;
    const pathChanged = path !== this.path, isForwardStep = pathChanged && path.length === this.path.length + 2;
    if (this.path !== path)
      this.treeView.requestAutoScroll(ops_exports.distance(this.path, path) > 8 ? "instant" : "smooth");
    this.setPath(path);
    if (pathChanged) {
      if (this.study) this.study.setPath(path, this.node);
      if (this.retro) this.retro.onJump();
      if (isForwardStep) {
        const isAtomicCapture = this.data.game.variant.key === "atomic" && !!((_a = this.node.san) == null ? void 0 : _a.includes("x"));
        if (isAtomicCapture) site.sound.play("explosion");
        else site.sound.move(this.node);
      }
      this.threatMode(false);
      (_b = this.ceval) == null ? void 0 : _b.reset();
      this.startCeval();
      site.sound.saySan(this.node.san, true);
    }
    this.justPlayed = this.justDropped = this.justCaptured = void 0;
    this.explorer.setNode();
    this.updateHref();
    this.promotion.cancel();
    if (pathChanged) {
      if (this.practice) this.practice.onJump();
      if (this.study) this.study.onJump();
    }
    pubsub.emit("ply", this.node.ply, this.tree.lastMainlineNode(this.path).ply === this.node.ply);
    this.showGround();
  }
  userJumpIfCan(path, sideStep = false) {
    var _a, _b;
    if (path === this.path || !this.canJumpTo(path)) return;
    if (sideStep) {
      this.node = this.tree.nodeAtPath(path.slice(0, -2));
      (_a = this.chessground) == null ? void 0 : _a.set(this.makeCgOpts());
      (_b = this.chessground) == null ? void 0 : _b.state.dom.redrawNow(true);
    }
    this.userJump(path);
  }
  mainlinePlyToPath(ply) {
    return ops_exports.takePathWhile(this.mainline, (n) => n.ply <= ply);
  }
  jumpToGlyphSymbol(color, symbol) {
    const node = nextGlyphSymbol(color, symbol, this.mainline, this.node.ply);
    if (node) this.jumpToMain(node.ply);
    this.redraw();
  }
  reloadData(data, merge) {
    this.initialize(data, merge);
    this.redirecting = false;
    this.setPath(path_exports.root);
    this.initCeval();
    this.instanciateEvalCache();
    this.startCeval();
    this.cgVersion.js++;
    this.mergeIdbThenShowTreeView();
  }
  changePgn(pgn, andReload) {
    this.pgnError = "";
    try {
      const data = {
        ...pgnImport_default(pgn),
        orientation: this.bottomColor(),
        pref: this.data.pref,
        externalEngines: this.data.externalEngines
      };
      if (andReload) {
        this.reloadData(data, false);
        this.userJump(this.mainlinePlyToPath(this.tree.lastPly()));
        this.redraw();
      }
      return data;
    } catch (err) {
      this.pgnError = err.message;
      requestAnimationFrame(this.redraw);
    }
    return void 0;
  }
  changeFen(fen) {
    this.redirecting = true;
    window.location.href = "/analysis/" + this.data.game.variant.key + "/" + encodeURIComponent(fen).replace(/%20/g, "_").replace(/%2F/g, "/");
  }
  addNodeLocally(move) {
    const pos = this.node.pos().unwrap().clone();
    move = normalizeMove(pos, move);
    const san = makeSanAndPlay(pos, move);
    const node = completeNode(this.variantKey)({
      ply: this.node.ply + 1,
      uci: makeUci(move),
      san,
      fen: makeFen(pos.toSetup()),
      pos: () => Result.ok(pos)
    });
    addCrazyData(node, pos);
    this.addNode(node, this.path);
  }
  addNode(node, path) {
    var _a;
    this.idbTree.onAddNode(node, path);
    const newPath = this.tree.addNode(node, path);
    if (!newPath) {
      console.log("Can't addNode", node, path);
      return this.redraw();
    }
    const relayPath = (_a = this.study) == null ? void 0 : _a.data.chapter.relayPath;
    if (relayPath && relayPath === path) this.forceVariation(newPath, true);
    else this.jump(newPath);
    this.redraw();
    const queuedUci = this.pvUciQueue.shift();
    if (queuedUci) this.playUci(queuedUci, this.pvUciQueue);
    else this.chessground.playPremove();
  }
  async deleteNode(path) {
    this.pendingDeletionPath(null);
    const node = this.tree.nodeAtPath(path);
    if (!node) return;
    const count = ops_exports.countChildrenAndComments(node);
    if ((count.nodes >= 10 || count.comments > 0) && !await confirm(
      "Delete " + plural("move", count.nodes) + (count.comments ? " and " + plural("comment", count.comments) : "") + "?"
    ))
      return;
    this.tree.deleteNodeAt(path);
    if (path_exports.contains(this.path, path)) this.userJump(path_exports.init(path));
    else this.jump(this.path);
    if (this.study) this.study.deleteNode(path);
    this.redraw();
  }
  isPendingCopy(path, isMainline) {
    const pending = this.pendingCopy();
    if (!pending) return false;
    const { eventPath: eventPath2, withVariations } = pending;
    return withVariations ? path_exports.areComparable(path, eventPath2) : isMainline;
  }
  allowedEval(node = this.node) {
    return this.cevalEnabled() && node.ceval || this.settings.showStaticAnalysis && node.eval;
  }
  async pruneToMainline(path) {
    const nodeList = this.tree.getNodeList(path);
    for (let i = 0; i < nodeList.length - 1; i++) {
      if (nodeList[i].forceVariation) delete nodeList[i].forceVariation;
      nodeList[i].children = [nodeList[i + 1]];
    }
    this.jump(path);
    this.redraw();
  }
  promote(path, toMainline) {
    this.tree.promoteAt(path, toMainline);
    this.jump(path);
    if (this.study) this.study.promote(path, toMainline);
  }
  forceVariation(path, force) {
    this.tree.forceVariationAt(path, force);
    this.jump(path);
    if (this.study) this.study.forceVariation(path, force);
  }
  visibleChildren(node = this.node) {
    return node.children.filter(
      (kid) => {
        var _a, _b;
        return !kid.comp || this.settings.showStaticAnalysis && !((_a = this.retro) == null ? void 0 : _a.hideComputerLine(kid)) || ops_exports.contains(kid, this.node) && !((_b = this.retro) == null ? void 0 : _b.forceCeval());
      }
    );
  }
  reset() {
    this.showGround();
    this.redraw();
  }
  encodeNodeFen() {
    return this.node.fen.replace(/\s/g, "_");
  }
  nextNodeBest() {
    return ops_exports.withMainlineChild(this.node, (n) => {
      var _a;
      return validUci((_a = n.eval) == null ? void 0 : _a.best);
    });
  }
  initCeval(mergeOpts) {
    var _a;
    const opts = {
      variant: this.data.game.variant,
      initialFen: this.data.game.initialFen,
      emit: (ev, meta) => {
        if (ev) this.onNewCeval(ev, meta.path, meta.threatMode);
        else this.cevalEnabled(false);
      },
      onUciHover: this.setAutoShapes,
      redraw: this.redraw,
      externalEngines: ((_a = this.data.externalEngines) == null ? void 0 : _a.map((engine) => ({
        ...engine,
        endpoint: this.opts.externalEngineEndpoint
      }))) || [],
      onSelectEngine: () => {
        this.initCeval();
        this.redraw();
      },
      hideErrors: this.isEmbed,
      ...mergeOpts
    };
    if (this.ceval) this.ceval.init(opts);
    else this.ceval = new CevalCtrl(opts);
  }
  clearCeval() {
    this.tree.removeCeval();
    this.evalCache.clear();
    this.startCeval();
  }
  showVariationArrows() {
    if (!this.allowLines() || !this.settings.showVariationArrows) return false;
    return Boolean(this.node.children.filter((x) => !x.comp || this.settings.showStaticAnalysis).length);
  }
  showEvaluation() {
    return this.settings.showStaticAnalysis || this.cevalEnabled() && this.isCevalAllowed();
  }
  showEvalGauge() {
    return this.settings.showGauge && displayColumns() > 1 && this.showEvaluation() && this.isCevalAllowed() && (this.cevalEnabled() || !!this.node.eval || !!this.node.ceval) && !this.node.outcome();
  }
  activeControlBarTool() {
    return this.actionMenu() ? "action-menu" : this.explorer.enabled() ? "opening-explorer" : false;
  }
  allowLines() {
    var _a, _b, _c;
    const chap = (_a = this.study) == null ? void 0 : _a.data.chapter;
    return !(chap == null ? void 0 : chap.practice) && (chap == null ? void 0 : chap.conceal) === void 0 && !((_b = this.study) == null ? void 0 : _b.gamebookPlay) && !((_c = this.retro) == null ? void 0 : _c.isSolving());
  }
  toggleDiscloseOf(path = this.path.slice(0, -2)) {
    const disclose = this.idbTree.discloseOf(this.tree.nodeAtPath(path), this.tree.pathIsMainline(path));
    if (disclose) this.idbTree.setCollapsed(path, disclose === "expanded");
    return Boolean(disclose);
  }
  setCevalPracticeOpts() {
    var _a, _b, _c, _d;
    this.initCeval({ custom: (_d = (_b = (_a = this.study) == null ? void 0 : _a.practice) == null ? void 0 : _b.customCeval) != null ? _d : (_c = this.practice) == null ? void 0 : _c.customCeval });
  }
  mergeAnalysisData(data) {
    if (this.study && this.study.data.chapter.id !== data.ch) return;
    const tree = completeNode(this.variantKey)(data.tree);
    this.tree.merge(tree);
    this.data.treeParts = ops_exports.mainlineNodeList(this.tree.root);
    this.data.treeParts.forEach(this.ensureServerEvalNodes);
    this.data.analysis = data.analysis;
    if (data.analysis) data.analysis.partial = !!ops_exports.findInMainline(tree, this.partialAnalysisCallback);
    if (data.division) this.data.game.division = data.division;
    if (this.retro) this.retro.onMergeAnalysisData();
    pubsub.emit("analysis.server.progress", this.data);
    this.redraw();
  }
  partialAnalysisCallback(n) {
    return !n.eval && !!n.children.length && n.ply <= 300 && n.ply > 0;
  }
  playUciList(uciList) {
    this.pvUciQueue = uciList;
    const firstUci = this.pvUciQueue.shift();
    if (firstUci) this.playUci(firstUci, this.pvUciQueue);
  }
  explorerMove(uci) {
    this.explorer.loading(true);
    this.playUci(uci);
  }
  playBestMove() {
    var _a;
    const uci = ((_a = this.node.ceval) == null ? void 0 : _a.pvs[0].moves[0]) || this.nextNodeBest();
    if (uci) this.playUci(uci);
  }
  async mergeIdbThenShowTreeView() {
    await this.idbTree.merge();
    this.treeView.hidden = false;
    this.idbTree.revealNode();
    this.redraw();
  }
};

// ../analyse/src/forecast/forecastView.ts
function onMyTurn(fctrl, cNodes) {
  const firstNode = cNodes[0];
  if (!firstNode) return void 0;
  const fcs = fctrl.findStartingWithNode(firstNode);
  if (!fcs.length) return void 0;
  const lines = fcs.filter((fc) => fc.length > 1);
  return h(
    "button.on-my-turn.button.text",
    {
      attrs: dataIcon(licon.Checkmark),
      hook: bind("click", () => fctrl.playAndSave(firstNode))
    },
    [
      h("span", [
        h("strong", i18n.site.playX(fixCrazySan(cNodes[0].san))),
        lines.length ? h("span", i18n.site.andSaveNbPremoveLines(lines.length)) : h("span", i18n.site.noConditionalPremoves)
      ])
    ]
  );
}
function makeCnodes(ctrl2, fctrl) {
  const afterPly = ctrl2.tree.getCurrentNodesAfterPly(ctrl2.nodeList, ctrl2.mainline, ctrl2.data.game.turns);
  return fctrl.truncate(
    afterPly.map((node) => ({
      ply: node.ply,
      fen: node.fen,
      uci: node.uci,
      san: node.san
    }))
  );
}
function forecastView_default(ctrl2, fctrl) {
  const cNodes = makeCnodes(ctrl2, fctrl);
  const isCandidate = fctrl.isCandidate(cNodes);
  return h("div.forecast", { class: { loading: fctrl.loading() } }, [
    fctrl.loading() ? h("div.overlay", spinnerVdom()) : null,
    h("div.box", [
      h("div.top", i18n.site.conditionalPremoves),
      h(
        "div.list",
        fctrl.forecasts().map(
          (nodes, i) => h(
            "button.entry.text",
            {
              attrs: dataIcon(licon.PlayTriangle),
              hook: bind(
                "click",
                () => ctrl2.userJump(
                  fctrl.showForecast(
                    ctrl2.variantKey,
                    playable(ctrl2.data) && ctrl2.initialPath || "",
                    ctrl2.tree,
                    nodes
                  )
                ),
                ctrl2.redraw
              )
            },
            [
              h("button.del", {
                hook: bind("click", (_) => fctrl.removeIndex(i), ctrl2.redraw),
                attrs: { ...dataIcon(licon.X), type: "button" }
              }),
              h("sans", renderNodesHtml(nodes))
            ]
          )
        )
      ),
      h(
        "button.add.text",
        {
          class: { enabled: isCandidate },
          attrs: dataIcon(isCandidate ? licon.PlusButton : licon.InfoCircle),
          hook: bind("click", () => fctrl.addNodes(makeCnodes(ctrl2, fctrl)), ctrl2.redraw)
        },
        [
          isCandidate ? h("span", [h("span", i18n.site.addCurrentVariation), h("sans", renderNodesHtml(cNodes))]) : h("span", i18n.site.playVariationToCreateConditionalPremoves)
        ]
      )
    ]),
    fctrl.onMyTurn() ? onMyTurn(fctrl, cNodes) : null
  ]);
}

// ../analyse/src/study/relay/relayView.ts
function relayView(ctrl2, study, relay, deps) {
  const ctx = { ...viewContext(ctrl2, deps), study, deps, relay, allowVideo: allowVideo() };
  const renderTourView = () => {
    const resizable = displayColumns() > (ctx.hasRelayTour ? 1 : 2);
    return [
      renderRelayTour(ctx),
      tourSide(ctx, resizable && deps.relayManager(relay, study)),
      !resizable && deps.relayManager(relay, study)
    ];
  };
  return renderMain(
    ctx,
    ctrl2.keyboardHelp && view6(ctrl2),
    deps.studyView.overboard(study),
    ctx.hasRelayTour ? renderTourView() : renderBoardView(ctx)
  );
}
function renderBoardView(ctx) {
  var _a;
  const { ctrl: ctrl2, deps, study, gaugeOn, relay } = ctx;
  const resizable = !isTouchDevice() && displayColumns() > 2;
  return [
    renderBoard(ctx),
    gaugeOn && main_exports.renderGauge(ctrl2),
    renderTools(ctx, relay.userClosedTheVideoEmbed() ? void 0 : (_a = relay.videoPlayer) == null ? void 0 : _a.render()),
    renderControls(ctrl2),
    !ctrl2.isEmbed && renderUnderboard(ctx),
    tourSide(ctx, resizable && deps.relayManager(relay, study)),
    !resizable && deps.relayManager(relay, study)
  ];
}

// ../analyse/src/view/main.ts
var resizeCache;
function main_default(deps) {
  return function(ctrl2) {
    var _a;
    resizeCache != null ? resizeCache : resizeCache = resizeHandler(ctrl2);
    if (ctrl2.nvui) return ctrl2.nvui.render(deps);
    else if (deps && ((_a = ctrl2.study) == null ? void 0 : _a.relay)) return relayView(ctrl2, ctrl2.study, ctrl2.study.relay, deps);
    else if (deps && ctrl2.study) return studyView(ctrl2, ctrl2.study, deps);
    else return analyseView(ctrl2, deps);
  };
}
function analyseView(ctrl2, deps) {
  const ctx = viewContext(ctrl2, deps);
  return renderMain(
    ctx,
    ctrl2.keyboardHelp && view6(ctrl2),
    renderBoard(ctx),
    ctx.gaugeOn && main_exports.renderGauge(ctrl2),
    crazyView_default(ctrl2, ctrl2.topColor(), "top"),
    renderTools(ctx),
    crazyView_default(ctrl2, ctrl2.bottomColor(), "bottom"),
    renderControls(ctrl2),
    renderUnderboard(ctx),
    ctrl2.data.pref.keyboardMove && render(ctrl2.keyboardMove),
    render2(ctrl2),
    hl(
      "aside.analyse__side",
      {
        hook: onInsert((elm) => {
          var _a;
          if ((_a = ctrl2.opts.$side) == null ? void 0 : _a.length) {
            $(elm).replaceWith(ctrl2.opts.$side);
            wikiToggleBox();
          }
        })
      },
      [
        ctrl2.forecast && forecastView_default(ctrl2, ctrl2.forecast),
        !ctrl2.synthetic && playable(ctrl2.data) && hl(
          "div.back-to-game",
          hl(
            "a.button.button-empty.text",
            {
              attrs: {
                href: game(ctrl2.data, ctrl2.data.player.color),
                "data-icon": licon.Back
              }
            },
            i18n.site.backToGame
          )
        )
      ]
    ),
    ctrl2.chatCtrl && renderChat(ctrl2.chatCtrl, { insert: (v) => fixChatHeight(v.elm) }),
    hl("div.chat__members.none", { hook: onInsert(watchers) })
  );
}
function resizeHandler(ctrl2) {
  window.addEventListener("resize", () => {
    var _a;
    if (resizeCache.columns !== displayColumns()) ctrl2.redraw();
    resizeCache.columns = displayColumns();
    if (ctrl2.study || resizeCache.columns < 3) return;
    (_a = resizeCache.chat) != null ? _a : resizeCache.chat = document.querySelector(".mchat");
    fixChatHeight(resizeCache.chat);
  });
  return { columns: displayColumns(), chat: null, board: null, meta: null };
}
function fixChatHeight(el) {
  var _a, _b;
  if (!(el instanceof HTMLElement)) return;
  (_a = resizeCache.board) != null ? _a : resizeCache.board = document.querySelector(".analyse__board .cg-wrap");
  (_b = resizeCache.meta) != null ? _b : resizeCache.meta = document.querySelector(".game__meta");
  if (!resizeCache.board || !resizeCache.meta) return;
  el.style.height = `${resizeCache.board.offsetHeight - resizeCache.meta.offsetHeight - 16}px`;
}

// ../analyse/src/start.ts
function start_default(patch2, deps) {
  return function(opts) {
    opts.element = document.querySelector("main.analyse");
    const ctrl2 = site.analysis = new AnalyseCtrl(opts, redraw, deps == null ? void 0 : deps.StudyCtrl);
    const view21 = main_default(deps);
    const blueprint = view21(ctrl2);
    opts.element.innerHTML = "";
    let vnode = patch2(opts.element, blueprint);
    function redraw() {
      vnode = patch2(vnode, view21(ctrl2));
    }
    menuHover_default();
    return {
      socketReceive: ctrl2.socket.receive,
      path: () => ctrl2.path,
      setChapter(id) {
        if (ctrl2.study) ctrl2.study.setChapter(id);
      }
    };
  };
}

export {
  makeShapesFromUci,
  keyToMouseEvent,
  CommentForm,
  DescriptionCtrl,
  NotifCtrl,
  studyPracticeView_exports,
  ServerEval,
  StudyForm,
  GlyphForm,
  StudyMemberCtrl,
  SearchCtrl,
  StudyShare,
  tagsToMap,
  TagsForm,
  TopicsCtrl,
  studySideNodes,
  resultTag,
  studyView_exports,
  start_default
};
//# sourceMappingURL=lib.MVDLUPAI.js.map
