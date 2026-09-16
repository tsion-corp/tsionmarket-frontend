import {
  as,
  dest,
  findTransforms,
  getSpread,
  movesTo,
  promo,
  pushMap,
  remove,
  spread,
  spreadMap,
  src
} from "./lib.WB3RHOLH.js";
import {
  promote
} from "./lib.QGZVCTIP.js";
import "./lib.CHCAIC5O.js";
import "./lib.67VUYMDO.js";
import {
  readFen,
  square
} from "./lib.GD6YSPBF.js";
import {
  rangeConfig
} from "./lib.MYPIOGN5.js";
import {
  destsToUcis
} from "./lib.LRP46MC3.js";
import "./lib.HMFK7OOB.js";
import "./lib.AEOHBIQD.js";
import "./lib.RPQH5UYI.js";
import "./lib.XAEDCBGD.js";
import "./lib.X7H2PLEK.js";
import {
  charToRole
} from "./lib.53PYQRAK.js";
import "./lib.CAO7TYYH.js";
import "./lib.PNHYIP7B.js";
import {
  bind
} from "./lib.S3TIZ2HQ.js";
import {
  h
} from "./lib.LWF5S4ZV.js";
import "./lib.QPQZCXK2.js";
import {
  licon
} from "./lib.5I4BSVKX.js";
import {
  jsonSimple
} from "./lib.TT4QSUKQ.js";
import {
  storedBooleanPropWithEffect,
  storedIntProp,
  storedIntPropWithEffect
} from "./lib.NFSQQWN5.js";
import "./lib.GMEH5BEF.js";
import "./lib.KO2KTNGK.js";

// ../voice/src/move/arrows.ts
var brushes = /* @__PURE__ */ new Map([
  ["green", { key: "vgn", color: "#15781B", opacity: 0.8, lineWidth: 12 }],
  ["blue", { key: "vbl", color: "#003088", opacity: 0.8, lineWidth: 12 }],
  ["purple", { key: "vpu", color: "#68217a", opacity: 0.85, lineWidth: 12 }],
  ["pink", { key: "vpn", color: "#ee2080", opacity: 0.5, lineWidth: 12 }],
  ["yellow", { key: "vyl", color: "#ffef00", opacity: 0.6, lineWidth: 12 }],
  ["orange", { key: "vor", color: "#f6931f", opacity: 0.8, lineWidth: 12 }],
  ["red", { key: "vrd", color: "#881010", opacity: 0.8, lineWidth: 12 }],
  ["brown", { key: "vgy", color: "#7b3c13", opacity: 0.8, lineWidth: 12 }],
  ["grey", { key: "vgr", color: "#666666", opacity: 0.8, lineWidth: 12 }],
  ["white", { key: "vwh", color: "#ffffff", opacity: 1, lineWidth: 15 }]
]);
function numberedArrows(choices, timer) {
  var _a;
  if (!choices) return [];
  const shapes = [];
  const preferred = choices[0][0] === "yes" ? (_a = choices.shift()) == null ? void 0 : _a[1] : void 0;
  choices.forEach(([, uci], i) => {
    shapes.push({
      orig: uci.slice(0, 2),
      dest: uci.slice(2, 4),
      brush: `v-grey`,
      modifiers: uci === preferred ? { hilite: "white" } : void 0,
      label: choices.length > 1 ? { text: `${i + 1}` } : void 0
    });
  });
  if (timer)
    shapes[0].customSvg = {
      center: choices.length > 1 ? "label" : "orig",
      html: timerShape(timer, choices.length > 1 ? "grey" : "white", 0.6)
    };
  return shapes.reverse();
}
function coloredArrows(choices, timer) {
  var _a;
  if (!choices) return [];
  const shapes = [];
  const preferred = choices[0][0] === "yes" ? (_a = choices.shift()) == null ? void 0 : _a[1] : void 0;
  choices.forEach(([c, uci]) => {
    shapes.push({
      orig: uci.slice(0, 2),
      dest: uci.slice(2, 4),
      brush: `v-${c}`,
      modifiers: uci === preferred ? { hilite: "white" } : void 0
    });
  });
  if (timer) {
    const [mainBrush] = [...brushes.values()];
    shapes[0].customSvg = {
      center: "orig",
      html: timerShape(timer, mainBrush.color)
    };
  }
  return shapes.reverse();
}
function timerShape(duration, color, alpha = 0.4) {
  setTimeout(() => {
    var _a;
    for (const anim of document.querySelectorAll(".voice-timer-arc")) {
      anim.beginElement();
      (_a = anim.parentElement) == null ? void 0 : _a.setAttribute("visibility", "visible");
      if (color === "grey") return;
    }
  });
  return `<svg width="100" height="100" class="voice-arrows"><circle cx="50" cy="50" r="25" fill="transparent" stroke="${color}" transform="rotate(270,50,50)" stroke-width="50" stroke-opacity="${alpha}" visibility="hidden"><animate class="voice-timer-arc" attributeName="stroke-dasharray" dur="${duration}s" values="0 ${Math.PI * 50}; ${Math.PI * 50} ${Math.PI * 50}"/></circle><circle cx="50" cy="50" r="50" fill="transparent" stroke="white" transform="rotate(270,50,50)" stroke-width="4" stroke-opacity="0.7" visibility="hidden"><animate class="voice-timer-arc" attributeName="stroke-dasharray" dur="${duration}s" values="0 ${Math.PI * 100}; ${Math.PI * 100} ${Math.PI * 100}"/></circle></svg>`;
}

// ../voice/src/move/view.ts
function settingNodes(colors, clarity, timer, redraw) {
  return [colorsSetting(colors, redraw), claritySetting(clarity, redraw), timerSetting(timer, redraw)];
}
function colorsSetting(colors, redraw) {
  return h("div.voice-choices", [
    "Label with",
    h(
      "span.btn-rack",
      ["Colors", "Numbers"].map(
        (pref) => h(
          `span.btn-rack__btn`,
          {
            class: { active: colors() === (pref === "Colors") },
            hook: bind("click", () => colors(pref === "Colors"), redraw)
          },
          pref
        )
      )
    )
  ]);
}
function claritySetting(clarity, redraw) {
  return h("div.voice-setting", [
    h("label", { attrs: { for: "voice-clarity" } }, "Clarity"),
    h("input#voice-clarity", {
      attrs: { type: "range", min: 0, max: 2, step: 1 },
      hook: rangeConfig(clarity, (val) => {
        clarity(val);
        redraw();
      })
    }),
    h("div.range_value", ["Fuzzy", "Average", "Clear"][clarity()])
  ]);
}
function timerSetting(timer, redraw) {
  return h("div.voice-setting", [
    h("label", { attrs: { for: "voice-timer" } }, "Timer"),
    h("input#voice-timer", {
      attrs: { type: "range", min: 0, max: 5, step: 1 },
      hook: rangeConfig(timer, (val) => {
        timer(val);
        redraw();
      })
    }),
    h("div.range_value", ["Off", "1.5s", "2s", "2.5s", "3s", "5s"][timer()])
  ]);
}

// ../voice/src/move/voice.move.ts
function initModule({
  root,
  voice,
  initial
}) {
  const DEBUG = { emptyMatches: false, buildMoves: false, buildSquares: false, collapse: true };
  let cg;
  let entries = [];
  let partials = { commands: [], colors: [], numbers: [] };
  let board;
  let ucis;
  const byVal = /* @__PURE__ */ new Map();
  const byTok = /* @__PURE__ */ new Map();
  const byWord = /* @__PURE__ */ new Map();
  const moves = /* @__PURE__ */ new Map();
  const squares = /* @__PURE__ */ new Map();
  const sans = /* @__PURE__ */ new Map();
  let request;
  let command;
  let choices;
  let choiceTimeout;
  const clarityPref = storedIntProp("voice.clarity", 1);
  const colorsPref = storedBooleanPropWithEffect("voice.useColors", true, () => initTimerRec());
  const timerPref = storedIntPropWithEffect("voice.timer", 3, () => initTimerRec());
  const listenHandlers = [handleConfirm, handleCommand, handleAmbiguity, handleMove];
  const commands = {
    no: as(["ok", "clear"], () => voice.showHelp() ? voice.showHelp(false) : clearMoveProgress()),
    help: as(["ok"], () => voice.showHelp(true)),
    vocabulary: as(["ok"], () => voice.showHelp("list")),
    "mic-off": as(["ok"], () => voice.mic.stop()),
    flip: as(["ok"], () => root.flipNow()),
    draw: as(["ok"], () => setConfirm("draw", (v) => {
      var _a;
      return v && ((_a = root.offerDraw) == null ? void 0 : _a.call(root, true, true));
    })),
    resign: as(["ok"], () => setConfirm("resign", (v) => {
      var _a;
      return v && ((_a = root.resign) == null ? void 0 : _a.call(root, true, true));
    })),
    takeback: as(["ok"], () => setConfirm("takeback", (v) => {
      var _a;
      return v && ((_a = root.takebackYes) == null ? void 0 : _a.call(root));
    })),
    rematch: as(["ok", "clear"], () => {
      var _a;
      return (_a = root.rematch) == null ? void 0 : _a.call(root, true);
    }),
    next: as(["ok", "clear"], () => {
      var _a;
      return (_a = root.nextPuzzle) == null ? void 0 : _a.call(root);
    }),
    upvote: as(["ok", "clear"], () => {
      var _a;
      return (_a = root.vote) == null ? void 0 : _a.call(root, true);
    }),
    downvote: as(["ok", "clear"], () => {
      var _a;
      return (_a = root.vote) == null ? void 0 : _a.call(root, false);
    }),
    solve: as(["ok", "clear"], () => {
      var _a;
      return (_a = root.solve) == null ? void 0 : _a.call(root);
    }),
    clock: as(["ok"], () => {
      var _a;
      return (_a = root.speakClock) == null ? void 0 : _a.call(root);
    }),
    pieces: as(["ok"], () => speakBoard == null ? void 0 : speakBoard()),
    "white-pieces": as(["ok"], () => speakBoard == null ? void 0 : speakBoard("white")),
    "black-pieces": as(["ok"], () => speakBoard == null ? void 0 : speakBoard("black")),
    blindfold: as(["ok"], () => {
      var _a;
      return (_a = root.blindfold) == null ? void 0 : _a.call(root, !root.blindfold());
    })
  };
  update(initial);
  initGrammar();
  return {
    ctrl: voice,
    initGrammar,
    prefNodes,
    allPhrases,
    update,
    promotionHook,
    listenForResponse,
    question
  };
  async function initGrammar() {
    const g = await jsonSimple(site.asset.url(`compiled/grammar/move-${voice.lang()}.json`)).catch(() => ({
      entries: [],
      partials: { numbers: [], commands: [], colors: [] }
    }));
    byWord.clear();
    byTok.clear();
    byVal.clear();
    for (const e of g.entries) {
      byWord.set(e.in, e);
      byTok.set(e.tok, e);
      if (e.val === void 0) e.val = e.tok;
      pushMap(byVal, e.val, e);
    }
    entries = g.entries;
    partials = g.partials;
    initDefaultRec();
    initTimerRec();
  }
  function initDefaultRec() {
    const excludeTag = (root == null ? void 0 : root.vote) ? "round" : "puzzle";
    const words = tagWords().filter((x) => {
      var _a, _b;
      return !((_b = (_a = byWord.get(x)) == null ? void 0 : _a.tags) == null ? void 0 : _b.includes(excludeTag));
    });
    voice.mic.initRecognizer(words, { listener: listen });
  }
  function initTimerRec() {
    if (timer() === 0) return;
    const words = [...partials.commands, ...colorsPref() ? partials.colors : partials.numbers].map(
      (w) => valWord(w)
    );
    voice.mic.initRecognizer(words, { recId: "timer", partial: true, listener: listenTimer });
  }
  function listen(heard, msgType) {
    if (msgType === "stop" && !voice.pushTalk()) clearMoveProgress();
    else if (msgType !== "full") return;
    try {
      (DEBUG.collapse ? console.groupCollapsed : console.info)(`listen '${heard}'`);
      const results = [];
      for (const handler of listenHandlers) {
        results.push(...handler(heard));
        if (results.includes("ok")) {
          if (results.includes("clear")) clearConfirm();
          return;
        }
      }
      if (heard.length <= 3) return;
      voice.flash();
    } finally {
      if (DEBUG.collapse) console.groupEnd();
    }
  }
  function listenTimer(word) {
    if (!choices || !choiceTimeout) return;
    const val = wordVal(word);
    const move = choices.get(val);
    if (val !== "no" && !move) return;
    clearMoveProgress();
    if (move) submit(move);
    voice.mic.setRecognizer("default");
    cg.redrawAll();
  }
  function clearConfirm() {
    request == null ? void 0 : request.action(false);
    command == null ? void 0 : command.action(false);
    request = command = void 0;
  }
  function handleConfirm(heard) {
    const answer = matchOneTags(heard, ["command", "choice"]);
    const confirm = request != null ? request : command;
    if (!confirm || !answer) return [];
    if (["yes", "no", confirm.key].includes(answer)) {
      confirm.action(answer !== "no");
      request = command = void 0;
      return ["ok"];
    }
    return [];
  }
  function handleCommand(heard) {
    const cmd = matchOneTags(heard, ["command", "choice"]);
    if (cmd && cmd in commands) return commands[cmd]();
    else return [];
  }
  function handleAmbiguity(heard) {
    if (!choices || heard.includes(" ")) return [];
    const chosen = matchOne(
      heard,
      [...choices].map(([w, uci]) => [wordVal(w), [uci]])
    );
    if (!chosen) {
      clearMoveProgress();
      console.info("handleAmbiguity", `no match for '${heard}' among`, choices);
      return [];
    }
    console.info("handleAmbiguity", `matched '${heard}' to '${chosen}' among`, choices);
    submit(chosen);
    return ["ok", "clear"];
  }
  function handleMove(phrase) {
    if (phrase.trim().length < 3) return [];
    if (selection() && chooseMoves(matchMany(phrase, spreadMap(squares)))) return ["ok", "clear"];
    return chooseMoves(matchMany(phrase, [...spreadMap(moves), ...spreadMap(squares)])) ? ["ok", "clear"] : [];
  }
  function matchMany(phrase, xvalsOut, partite = false) {
    const htoks = wordsToks(phrase);
    const xtoksOut = /* @__PURE__ */ new Map();
    for (const [xvals, outs] of xvalsOut) {
      for (const xtoks of valsToks(xvals)) {
        for (const out of outs) pushMap(xtoksOut, xtoks, out);
      }
    }
    const matches = /* @__PURE__ */ new Map();
    for (const [xtoks, outs] of spreadMap(xtoksOut)) {
      const cost = costToMatch(htoks, xtoks, partite);
      const sanUcis = new Set(getSpread(sans, toksVals(xtoks)));
      if (cost > 0.99) continue;
      for (const out of outs) {
        if (!matches.has(out) || matches.get(out).cost > cost) {
          matches.set(out, { isSan: sanUcis.has(out), cost });
        }
      }
    }
    const sorted = [...matches].sort(([, lhs], [, rhs]) => lhs.cost - rhs.cost);
    if (sorted.length > 0 || DEBUG.emptyMatches)
      console.info("matchMany - in:", xvalsOut, "from: ", xtoksOut, "\nto: ", new Map(sorted));
    return sorted;
  }
  function matchOne(heard, xvalsOut) {
    var _a, _b;
    return (_b = (_a = matchMany(heard, xvalsOut, true)[0]) == null ? void 0 : _a[0]) != null ? _b : false;
  }
  function matchOneTags(heard, tags, vals = []) {
    return matchOne(heard, [...vals.map((v) => [v, [v]]), ...byTags(tags).map((e) => [e.val, [e.val]])]);
  }
  function costToMatch(h2, x, partite) {
    var _a;
    if (h2 === x) return 0;
    const xforms = findTransforms(h2, x).map((t) => t.reduce((acc, t2) => acc + transformCost(t2, partite), 0)).sort((lhs, rhs) => lhs - rhs);
    return (_a = xforms == null ? void 0 : xforms[0]) != null ? _a : Infinity;
  }
  function transformCost(transform, partite) {
    var _a, _b, _c;
    if (transform.from === transform.to) return 0;
    const from = byTok.get(transform.from);
    const sub = (_a = from == null ? void 0 : from.subs) == null ? void 0 : _a.find((x) => x.to === transform.to);
    if (partite) {
      const to = byTok.get(transform.to);
      if (((_b = from == null ? void 0 : from.tags) == null ? void 0 : _b.every((x) => {
        var _a2;
        return (_a2 = to == null ? void 0 : to.tags) == null ? void 0 : _a2.includes(x);
      })) && from.tags.length === to.tags.length)
        return Infinity;
    }
    return (_c = sub == null ? void 0 : sub.cost) != null ? _c : Infinity;
  }
  function chooseMoves(options) {
    var _a;
    if (options.length === 0) return false;
    if (options.length === 1 && options[0][0].length === 2) {
      console.info("chooseMoves", `select '${options[0][0]}'`);
      submit(options[0][0]);
      return true;
    }
    options = options.filter(
      ([uci, _], keepIfFirst) => options.findIndex((first) => first[0].slice(0, 4) === uci.slice(0, 4)) === keepIfFirst
    ).slice(0, maxArrows());
    const sameLowCost = options.filter(([_, m]) => m.cost === options[0][1].cost);
    const sanMoves = sameLowCost.filter(([_, m]) => m.isSan);
    if (sanMoves.length === 1 && sameLowCost.length > 1) {
      const sanIndex = sameLowCost.findIndex(([uci, _]) => uci === sanMoves[0][0]);
      [options[0], options[sanIndex]] = [options[sanIndex], options[0]];
      options[0][1].cost -= 0.01;
    }
    const clarityThreshold = [1, 0.5, 1e-3][clarityPref()];
    const lowestCost = options[0][1].cost;
    options = options.filter(([, m]) => m.cost - lowestCost <= clarityThreshold);
    if (!timer() && options.length === 1 && (options[0][1].cost < 0.3 || ((_a = root.confirmMoveToggle) == null ? void 0 : _a.call(root)))) {
      console.info("chooseMoves", `chose '${options[0][0]}' cost=${options[0][1].cost}`);
      submit(options[0][0], false);
      return true;
    }
    return ambiguate(options);
  }
  function ambiguate(options) {
    if (options.length === 0) return false;
    choices = /* @__PURE__ */ new Map();
    const preferred = options.length === 1 || options[0][1].cost < options[1][1].cost;
    if (preferred) choices.set("yes", options[0][0]);
    if (colorsPref()) {
      const colorNames = [...brushes.keys()];
      options.forEach(([uci], i) => choices.set(colorNames[i], uci));
    } else options.forEach(([uci], i) => choices.set(`${i + 1}`, uci));
    console.info("ambiguate", choices);
    choiceTimeout = 0;
    if (preferred && timer()) {
      choiceTimeout = setTimeout(
        () => {
          submit(options[0][0], false);
          choiceTimeout = void 0;
          voice.mic.setRecognizer("default");
        },
        timer() * 1e3 + 100
      );
      voice.mic.setRecognizer("timer");
    }
    const arrowTime = choiceTimeout ? timer() : void 0;
    cg.setShapes(
      colorsPref() ? coloredArrows([...choices], arrowTime) : numberedArrows([...choices], arrowTime)
    );
    cg.redrawAll();
    return true;
  }
  function update(up) {
    if (up.cg) {
      cg = up.cg;
      for (const [color, brush] of brushes) cg.state.drawable.brushes[`v-${color}`] = brush;
    }
    board = readFen(up.fen);
    cg.setShapes([]);
    ucis = up.canMove && cg.state.movable.dests ? destsToUcis(cg.state.movable.dests) : [];
    buildMoves();
    buildSquares();
  }
  function submit(uci, preConfirmed = true) {
    clearMoveProgress();
    if (uci.length < 3) {
      const dests = [...new Set(ucis.filter((x) => x.length === 4 && x.startsWith(uci)))];
      if (dests.length <= maxArrows()) return ambiguate(dests.map((uci2) => [uci2, { cost: 0 }]));
      if (uci !== selection()) selection(src(uci));
      cg.redrawAll();
      return true;
    }
    const role = promo(uci);
    cg.cancelMove();
    if (role) promote(cg, dest(uci), role);
    root.pluginMove(src(uci), dest(uci), role, preConfirmed);
    return true;
  }
  function promotionHook() {
    return (ctrl, roles) => roles ? voice.mic.addListener(
      (text) => {
        const val = matchOneTags(text, ["role"], ["no"]);
        voice.mic.stopPropagation();
        if (!val) return;
        const role = charToRole(val);
        if (role && roles.includes(role)) ctrl.finish(role);
        else if (val === "no") ctrl.cancel();
      },
      { listenerId: "promotion" }
    ) : voice.mic.removeListener("promotion");
  }
  function buildMoves() {
    const addToks = (xtoks, sanUci) => {
      const xvals = xtoks.split("").join(",");
      xvalset.add(xvals);
      if (sanUci) pushMap(sans, xvals, sanUci);
    };
    moves.clear();
    sans.clear();
    const xvalset = /* @__PURE__ */ new Set();
    for (const uci of ucis) {
      const usrc = src(uci), udest = dest(uci), nsrc = square(usrc), ndest = square(udest), dp = board.pieces[ndest], srole = board.pieces[nsrc].toUpperCase();
      if (srole === "K") {
        if (isOurs(dp)) {
          pushMap(moves, "castle", uci);
          moves.set(ndest < nsrc ? "O-O-O" : "O-O", /* @__PURE__ */ new Set([uci]));
        } else if (Math.abs(nsrc & 7) - Math.abs(ndest & 7) > 1) continue;
      }
      xvalset.clear();
      addToks(uci, uci);
      if (dp && !isOurs(dp)) {
        const drole = dp.toUpperCase();
        addToks(`${srole}${drole}`);
        addToks(`${srole}x${drole}`);
        pushMap(moves, `${srole},x`, uci);
        addToks(`x${drole}`);
        addToks(`${uci[0]}x`);
        addToks(`${uci[0]}x${drole}`);
        addToks(`x`);
      }
      if (srole === "P") {
        addToks(udest, uci);
        if (uci.startsWith(uci[2])) {
          addToks(`P${udest}`);
        } else if (dp) {
          addToks(`${usrc}x${udest}`);
          addToks(`Px${udest}`);
          addToks(`${uci[0]}x${udest}`, uci);
        }
        if (uci[3] === "1" || uci[3] === "8") {
          for (const moveVals of xvalset) {
            for (const role of "QRBN") {
              for (const xvals of [`${moveVals},=,${role}`, `${moveVals},${role}`]) {
                pushMap(moves, xvals, `${uci}${role}`);
              }
            }
          }
        }
      } else {
        const others = movesTo(ndest, srole, board);
        let rank = "", file = "";
        for (const other of others) {
          if (other === nsrc || board.pieces[other] !== board.pieces[nsrc]) continue;
          if (nsrc >> 3 === other >> 3) file = uci[0];
          if ((nsrc & 7) === (other & 7)) rank = uci[1];
          else file = uci[0];
        }
        for (const piece of [`${srole}${file}${rank}`, srole]) {
          if (dp) addToks(`${piece}x${udest}`, uci);
          addToks(`${piece}${udest}`, uci);
        }
      }
      for (const xvals of xvalset) pushMap(moves, xvals, uci);
    }
    if (DEBUG.buildMoves) console.info("buildMoves", moves);
  }
  function buildSquares() {
    squares.clear();
    for (const uci of ucis) {
      const sel = selection();
      if (sel && !uci.startsWith(sel)) continue;
      const usrc = src(uci), udest = dest(uci), nsrc = square(usrc), ndest = square(udest), dp = board.pieces[ndest], srole = board.pieces[nsrc].toUpperCase();
      pushMap(squares, `${usrc[0]},${usrc[1]}`, usrc);
      pushMap(squares, `${udest[0]},${udest[1]}`, uci);
      pushMap(squares, srole, uci);
      pushMap(squares, srole, usrc);
      if (dp && !isOurs(dp)) pushMap(squares, dp.toUpperCase(), uci);
    }
    for (const [xouts, set] of squares) {
      if (!"PNBRQK".includes(xouts)) continue;
      const moves2 = spread(set).filter((x) => x.length > 2);
      if (moves2.length > maxArrows()) moves2.forEach((x) => remove(squares, xouts, x));
      else if (moves2.length > 0)
        Array.from(set).filter((x) => x.length === 2).forEach((x) => remove(squares, xouts, x));
    }
    if (DEBUG.buildSquares) console.info("buildSquares", squares);
  }
  function isOurs(p) {
    return p === "" || p === void 0 ? void 0 : cg.state.turnColor === "white" ? p.toUpperCase() === p : p.toLowerCase() === p;
  }
  function clearMoveProgress() {
    const mustRedraw = moveInProgress();
    clearTimeout(choiceTimeout);
    choiceTimeout = void 0;
    choices = void 0;
    cg.setShapes([]);
    selection(false);
    if (mustRedraw) cg.redrawAll();
  }
  function selection(sq) {
    if (sq !== void 0) {
      cg.selectSquare(sq || null);
      buildSquares();
    }
    return cg.state.selected;
  }
  function setConfirm(key, action) {
    command = {
      key,
      action: (v) => {
        action(v);
        command = void 0;
        root.redraw();
      }
    };
    root.redraw();
  }
  function listenForResponse(key, action) {
    request = { key, action };
  }
  function question() {
    const mkOpts = (prompt, yesIcon) => ({
      prompt,
      yes: { action: () => {
        var _a;
        return (_a = command == null ? void 0 : command.action) == null ? void 0 : _a.call(command, true);
      }, key: "yes", icon: yesIcon },
      no: { action: () => {
        var _a;
        return (_a = command == null ? void 0 : command.action) == null ? void 0 : _a.call(command, false);
      }, key: "no" }
    });
    return (command == null ? void 0 : command.key) === "resign" ? mkOpts("Confirm resignation", licon.FlagOutline) : (command == null ? void 0 : command.key) === "draw" ? mkOpts("Confirm draw offer", licon.OneHalf) : (command == null ? void 0 : command.key) === "takeback" ? mkOpts("Confirm takeback request", licon.Back) : false;
  }
  function speakBoard(filter) {
    const k = cg.state.orientation === "white" ? 1 : -1;
    const fullBoard = [...cg.state.pieces].filter(([, p]) => p && (!filter || p.color === filter)).map(([sq, p]) => ({ file: sq.charAt(0), rank: sq.charAt(1), p })).sort((a, b) => k * a.rank.localeCompare(b.rank) || k * a.file.localeCompare(b.file)).map(({ file, rank, p }) => `${p.color} ${p.role} on ${file === "a" ? '"A"' : file} ${rank}`).join(", ");
    site.sound.say(fullBoard, false, true);
  }
  function prefNodes() {
    return settingNodes(colorsPref, clarityPref, timerPref, root.redraw);
  }
  function maxArrows() {
    return Math.min(8, colorsPref() ? partials.colors.length : partials.numbers.length);
  }
  function timer() {
    return [0, 1.5, 2, 2.5, 3, 5][timerPref()];
  }
  function moveInProgress() {
    return selection !== void 0 || choices !== void 0;
  }
  function tokWord(tok) {
    var _a;
    return (_a = byTok.get(tok)) == null ? void 0 : _a.in;
  }
  function toksVals(toks) {
    return Array.from(toks).map((tok) => {
      var _a;
      return (_a = byTok.get(tok)) == null ? void 0 : _a.val;
    }).join(",");
  }
  function tagWords(tags, intersect = false) {
    return byTags(tags, intersect).map((e) => e.in);
  }
  function byTags(tags, intersect = false) {
    return tags === void 0 ? entries : intersect ? entries.filter((e) => e.tags.every((tag) => tags.includes(tag))) : entries.filter((e) => e.tags.some((tag) => tags.includes(tag)));
  }
  function wordTok(word) {
    var _a, _b;
    return (_b = (_a = byWord.get(word)) == null ? void 0 : _a.tok) != null ? _b : "";
  }
  function wordVal(word) {
    var _a, _b;
    return (_b = (_a = byWord.get(word)) == null ? void 0 : _a.val) != null ? _b : word;
  }
  function wordsToks(phrase) {
    return phrase.split(" ").map((word) => wordTok(word)).join("");
  }
  function valToks(val) {
    return getSpread(byVal, val).map((e) => e.tok);
  }
  function valsToks(vals) {
    const fork = (toks, val) => {
      if (val.length === 0) return toks;
      const nextToks = [];
      for (const nextTok of valToks(val[0])) {
        for (const tok of toks) nextToks.push(tok + nextTok);
      }
      return fork(nextToks, val.slice(1));
    };
    return fork([""], vals.split(","));
  }
  function valsWords(vals) {
    return valsToks(vals).map(
      (toks) => Array.from(toks).map((tok) => tokWord(tok)).join(" ")
    );
  }
  function valWord(val, tag) {
    var _a, _b;
    const v = byVal.has(val) ? byVal.get(val) : byTok.get(val);
    if (v instanceof Set) {
      if (tag) return (_b = (_a = [...v].find((e) => e.tags.includes(tag))) == null ? void 0 : _a.in) != null ? _b : val;
      else return v.values().next().value.in;
    } else return v ? v.in : val;
  }
  function allPhrases() {
    const res = [];
    for (const [xval, uci] of [...moves, ...squares]) {
      const toVal = typeof uci === "string" ? uci : "[...]";
      res.push(...valsWords(xval).map((p) => [p, toVal]));
    }
    for (const e of byTags(["command", "choice"])) {
      res.push(...valsWords(e.val).map((p) => [p, e.val]));
    }
    return [...new Map(res)];
  }
}
export {
  initModule
};
//# sourceMappingURL=voice.move.FKEXI2WL.js.map
