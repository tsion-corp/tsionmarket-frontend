import {
  Chessground,
  read
} from "./lib.LYPETE66.js";
import {
  invRanks,
  uciToMove
} from "./lib.ILS4LNPZ.js";
import {
  files,
  ranks
} from "./lib.GSUEVEQG.js";
import {
  makeFen,
  makeSanAndPlay,
  parseComment,
  parsePgn,
  parseSan,
  scalachessCharPair,
  startingPosition,
  transform
} from "./lib.JUCKJNFH.js";
import {
  makeSquare,
  makeUci,
  opposite
} from "./lib.PM233RJM.js";
import {
  attributesModule,
  classModule,
  h,
  init
} from "./lib.2L7Z4FRN.js";

// ../../node_modules/.pnpm/@lichess-org+pgn-viewer@2.6.4/node_modules/@lichess-org/pgn-viewer/dist/config.js
var defaults = {
  pgn: "*",
  // the PGN to render
  fen: void 0,
  // initial FEN, will append [FEN "initial FEN"] to the PGN
  showPlayers: "auto",
  // show the players above and under the board
  showClocks: true,
  // show the clocks alongside the players
  showMoves: "auto",
  // false | "right" | "bottom" | auto. "auto" uses media queries
  showControls: true,
  // show the [prev, menu, next] buttons
  scrollToMove: true,
  // enable scrolling through moves with a mouse wheel
  keyboardToMove: true,
  // enable keyboard navigation through moves
  orientation: void 0,
  // orientation of the board. Undefined to use the Orientation PGN tag.
  initialPly: 0,
  // current position to display. Can be a number, or "last"
  chessground: {},
  // chessground configuration https://github.com/lichess-org/chessground/blob/master/src/config.ts#L7
  drawArrows: true,
  // allow mouse users to draw volatile arrows on the board. Disable for little perf boost
  menu: {
    getPgn: {
      enabled: true,
      // enable the "Get PGN" menu entry
      fileName: void 0
      // name of the file when user clicks "Download PGN". Leave empty for automatic name.
    },
    practiceWithComputer: {
      enabled: true
    },
    analysisBoard: {
      enabled: true
    }
  },
  lichess: "https://lichess.org",
  // support for Lichess games, with links to the game and players. Set to false to disable.
  classes: void 0
  // CSS classes to set on the root element. Defaults to the element classes before being replaced by LPV.
};
function Config(element, cfg) {
  const opts = { ...defaults };
  deepMerge(opts, cfg);
  if (opts.fen)
    opts.pgn = `[FEN "${opts.fen}"]
${opts.pgn}`;
  if (!opts.classes)
    opts.classes = element.className;
  return opts;
}
function deepMerge(base, extend) {
  for (const key in extend) {
    if (typeof extend[key] !== "undefined") {
      if (isPlainObject(base[key]) && isPlainObject(extend[key]))
        deepMerge(base[key], extend[key]);
      else
        base[key] = extend[key];
    }
  }
}
function isPlainObject(o) {
  if (typeof o !== "object" || o === null)
    return false;
  const proto = Object.getPrototypeOf(o);
  return proto === Object.prototype || proto === null;
}

// ../../node_modules/.pnpm/@lichess-org+pgn-viewer@2.6.4/node_modules/@lichess-org/pgn-viewer/dist/path.js
var Path = class _Path {
  constructor(path) {
    this.path = path;
    this.size = () => this.path.length / 2;
    this.head = () => this.path.slice(0, 2);
    this.tail = () => new _Path(this.path.slice(2));
    this.init = () => new _Path(this.path.slice(0, -2));
    this.last = () => this.path.slice(-2);
    this.empty = () => this.path === "";
    this.contains = (other) => this.path.startsWith(other.path);
    this.isChildOf = (parent) => this.init() === parent;
    this.append = (id) => new _Path(this.path + id);
    this.equals = (other) => this.path === other.path;
  }
};
Path.root = new Path("");

// ../../node_modules/.pnpm/@lichess-org+pgn-viewer@2.6.4/node_modules/@lichess-org/pgn-viewer/dist/game.js
var Game = class {
  constructor(initial, moves, players, metadata) {
    this.initial = initial;
    this.moves = moves;
    this.players = players;
    this.metadata = metadata;
    this.nodeAt = (path) => nodeAtPathFrom(this.moves, path);
    this.dataAt = (path) => {
      const node = this.nodeAt(path);
      return node ? isMoveNode(node) ? node.data : this.initial : void 0;
    };
    this.title = () => this.players.white.name ? [
      this.players.white.title,
      this.players.white.name,
      "vs",
      this.players.black.title,
      this.players.black.name
    ].filter((x) => x && !!x.trim()).join("_").replace(" ", "-") : "lichess-pgn-viewer";
    this.pathAtMainlinePly = (ply) => {
      var _a;
      return ply === 0 ? Path.root : ((_a = this.mainline[Math.max(0, Math.min(this.mainline.length - 1, ply === "last" ? 9999 : ply - 1))]) === null || _a === void 0 ? void 0 : _a.path) || Path.root;
    };
    this.hasPlayerName = () => {
      var _a, _b, _c;
      return !!((_b = (_a = this.players.white) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : (_c = this.players.black) === null || _c === void 0 ? void 0 : _c.name);
    };
    this.mainline = Array.from(this.moves.mainline());
  }
};
var childById = (node, id) => node.children.find((c) => c.data.path.last() === id);
var nodeAtPathFrom = (node, path) => {
  if (path.empty())
    return node;
  const child = childById(node, path.head());
  return child ? nodeAtPathFrom(child, path.tail()) : void 0;
};
var isMoveNode = (n) => "data" in n;
var isMoveData = (d) => "uci" in d;

// ../../node_modules/.pnpm/@lichess-org+pgn-viewer@2.6.4/node_modules/@lichess-org/pgn-viewer/dist/pgn.js
var State = class _State {
  constructor(pos, path, clocks) {
    this.pos = pos;
    this.path = path;
    this.clocks = clocks;
    this.clone = () => new _State(this.pos.clone(), this.path, { ...this.clocks });
  }
};
var parseComments = (strings) => {
  const comments = strings.map(parseComment);
  const reduceTimes = (times) => times.reduce((last, time) => typeof time === "undefined" ? last : time, void 0);
  return {
    texts: comments.map((c) => c.text).filter((t) => !!t),
    shapes: comments.flatMap((c) => c.shapes),
    clock: reduceTimes(comments.map((c) => c.clock)),
    emt: reduceTimes(comments.map((c) => c.emt))
  };
};
var makeGame = (pgn, lichess = false) => {
  var _a, _b, _c, _d, _e;
  const game = parsePgn(pgn)[0] || parsePgn("*")[0];
  const start2 = startingPosition(game.headers).unwrap();
  const fen = makeFen(start2.toSetup());
  const comments = parseComments((_a = game.comments) !== null && _a !== void 0 ? _a : []);
  const headers = new Map(Array.from(game.headers, ([key, value]) => [key.toLowerCase(), value]));
  const metadata = makeMetadata(headers, lichess);
  const initial = {
    fen,
    turn: start2.turn,
    check: start2.isCheck(),
    pos: start2.clone(),
    comments: comments.texts,
    shapes: comments.shapes,
    clocks: {
      white: (_c = (_b = metadata.timeControl) === null || _b === void 0 ? void 0 : _b.initial) !== null && _c !== void 0 ? _c : comments.clock,
      black: (_e = (_d = metadata.timeControl) === null || _d === void 0 ? void 0 : _d.initial) !== null && _e !== void 0 ? _e : comments.clock
    }
  };
  const moves = makeMoves(start2, game.moves, metadata);
  const players = makePlayers(headers, metadata);
  return new Game(initial, moves, players, metadata);
};
var makeMoves = (start2, moves, metadata) => transform(moves, new State(start2, Path.root, {}), (state, node, _index) => {
  var _a, _b, _c;
  const move = parseSan(state.pos, node.san);
  if (!move)
    return void 0;
  const moveId = scalachessCharPair(move);
  const path = state.path.append(moveId);
  const san = makeSanAndPlay(state.pos, move);
  state.path = path;
  const setup = state.pos.toSetup();
  const comments = parseComments((_a = node.comments) !== null && _a !== void 0 ? _a : []);
  const startingComments = parseComments((_b = node.startingComments) !== null && _b !== void 0 ? _b : []);
  const shapes = [...comments.shapes, ...startingComments.shapes];
  const ply = (setup.fullmoves - 1) * 2 + (state.pos.turn === "white" ? 0 : 1);
  let clocks = state.clocks = makeClocks(state.clocks, state.pos.turn, comments.clock);
  if (ply < 2 && metadata.timeControl)
    clocks = {
      white: metadata.timeControl.initial,
      black: metadata.timeControl.initial,
      ...clocks
    };
  const moveNode = {
    path,
    ply,
    move,
    san,
    uci: makeUci(move),
    fen: makeFen(state.pos.toSetup()),
    turn: state.pos.turn,
    check: state.pos.isCheck(),
    comments: comments.texts,
    startingComments: startingComments.texts,
    nags: (_c = node.nags) !== null && _c !== void 0 ? _c : [],
    shapes,
    clocks,
    emt: comments.emt
  };
  return moveNode;
});
var makeClocks = (prev, turn, clk) => turn === "white" ? { ...prev, black: clk } : { ...prev, white: clk };
function makePlayers(headers, metadata) {
  const get = (color, field) => {
    const raw = headers.get(`${color}${field}`);
    return raw === "?" || raw === "" ? void 0 : raw;
  };
  const makePlayer = (color) => {
    var _a;
    const name = get(color, "");
    return {
      name,
      title: get(color, "title"),
      rating: Number.parseInt((_a = get(color, "elo")) !== null && _a !== void 0 ? _a : "") || void 0,
      isLichessUser: metadata.isLichess && !!(name === null || name === void 0 ? void 0 : name.match(/^[a-z0-9][a-z0-9_-]{0,28}[a-z0-9]$/i))
    };
  };
  return {
    white: makePlayer("white"),
    black: makePlayer("black")
  };
}
function makeMetadata(headers, lichess) {
  var _a, _b, _c, _d;
  const site = (_c = (_b = (_a = headers.get("chapterurl")) !== null && _a !== void 0 ? _a : headers.get("gameurl")) !== null && _b !== void 0 ? _b : headers.get("source")) !== null && _c !== void 0 ? _c : headers.get("site");
  const tcs = (_d = headers.get("timecontrol")) === null || _d === void 0 ? void 0 : _d.split("+").map((x) => Number.parseInt(x));
  const timeControl = tcs && tcs[0] ? {
    initial: tcs[0],
    increment: tcs[1] || 0
  } : void 0;
  const orientation = headers.get("orientation");
  return {
    externalLink: site && site.match(/^https?:\/\//) ? site : void 0,
    isLichess: !!(lichess && (site === null || site === void 0 ? void 0 : site.startsWith(lichess))),
    timeControl,
    orientation: orientation === "white" || orientation === "black" ? orientation : void 0,
    result: headers.get("result")
  };
}

// ../../node_modules/.pnpm/@lichess-org+pgn-viewer@2.6.4/node_modules/@lichess-org/pgn-viewer/dist/translation.js
var defaultTranslator = (key) => defaultTranslations[key];
function translate(custom) {
  return (key, ...args) => {
    var _a;
    const translated = (_a = custom && custom(key)) !== null && _a !== void 0 ? _a : defaultTranslator(key);
    return interpolate(translated !== null && translated !== void 0 ? translated : key, args);
  };
}
var interpolate = (str, args) => {
  let result = str;
  args.forEach((arg, index) => {
    result = result.replace(`%${index + 1}$s`, arg);
    result = result.replace("%s", arg);
  });
  return result;
};
var defaultTranslations = {
  flipTheBoard: "Flip the board",
  analysisBoard: "Analysis board",
  practiceWithComputer: "Practice with computer",
  getPgn: "Get PGN",
  download: "Download",
  viewOnLichess: "View on Lichess",
  viewOnSite: "View on site",
  menu: "Menu",
  "aria.first": "Go to first move",
  "aria.prev": "Go to previous move",
  "aria.next": "Go to next move",
  "aria.last": "Go to last move",
  "aria.gameMoves": "Game moves",
  "aria.gameResult": "Game result",
  "aria.variation": "Variation",
  "aria.navigationControls": "Game navigation controls",
  "aria.viewProfileOnLichess": "View %s's profile on Lichess",
  "aria.chessGameBetween": "Chess game between %1$s as white and %2$s as black. %3$s",
  "aria.gameInProgress": "Game in progress",
  "aria.whiteWins": "White wins",
  "aria.blackWins": "Black wins",
  "aria.draw": "Draw",
  "aria.unknownPlayer": "Unknown player",
  "aria.rated": "rated %s",
  "aria.move": "Move %1$s, %2$s, %3$s",
  "aria.white": "white",
  "aria.black": "black",
  "aria.remaining": "%s remaining",
  "aria.linkOpensInNewTab": "%s, link, opens in new tab",
  "aria.accessibleChessboard": "Accessible chessboard",
  "aria.piece.king": "king",
  "aria.piece.queen": "queen",
  "aria.piece.rook": "rook",
  "aria.piece.bishop": "bishop",
  "aria.piece.knight": "knight",
  "aria.piece.pawn": "pawn",
  "aria.empty": "empty",
  "san.takes": "takes",
  "san.check": "check",
  "san.checkmate": "checkmate",
  "san.promotesTo": "promotes to",
  "san.droppedOn": "dropped on",
  "san.longCastling": "long castling",
  "san.shortCastling": "short castling"
};

// ../../node_modules/.pnpm/@lichess-org+pgn-viewer@2.6.4/node_modules/@lichess-org/pgn-viewer/dist/pgnViewer.js
var PgnViewer = class {
  constructor(opts, redraw) {
    var _a;
    this.opts = opts;
    this.redraw = redraw;
    this.flipped = false;
    this.pane = "board";
    this.autoScrollRequested = false;
    this.curNode = () => {
      var _a2;
      return (_a2 = this.game.nodeAt(this.path)) !== null && _a2 !== void 0 ? _a2 : this.game.moves;
    };
    this.curData = () => {
      var _a2;
      return (_a2 = this.game.dataAt(this.path)) !== null && _a2 !== void 0 ? _a2 : this.game.initial;
    };
    this.goTo = (to, focus = true) => {
      var _a2, _b;
      const path = to === "first" ? Path.root : to === "prev" ? this.path.init() : to === "next" ? (_b = (_a2 = this.game.nodeAt(this.path)) === null || _a2 === void 0 ? void 0 : _a2.children[0]) === null || _b === void 0 ? void 0 : _b.data.path : this.game.pathAtMainlinePly("last");
      this.toPath(path !== null && path !== void 0 ? path : this.path, focus);
    };
    this.canGoTo = (to) => to === "prev" || to === "first" ? !this.path.empty() : !!this.curNode().children[0];
    this.toPath = (path, focus = true) => {
      this.path = path;
      this.pane = "board";
      this.autoScrollRequested = true;
      this.redrawGround();
      this.redraw();
      if (focus)
        this.focus();
    };
    this.focus = () => {
      var _a2;
      return (_a2 = this.div) === null || _a2 === void 0 ? void 0 : _a2.focus();
    };
    this.toggleMenu = () => {
      this.pane = this.pane === "board" ? "menu" : "board";
      this.redraw();
      if (this.pane === "board") {
        setTimeout(() => {
          var _a2;
          return (_a2 = this.menuButton) === null || _a2 === void 0 ? void 0 : _a2.focus();
        }, 0);
      }
    };
    this.togglePgn = () => {
      this.pane = this.pane === "pgn" ? "board" : "pgn";
      this.redraw();
    };
    this.orientation = () => {
      var _a2;
      const base = (_a2 = this.opts.orientation) !== null && _a2 !== void 0 ? _a2 : "white";
      return this.flipped ? opposite(base) : base;
    };
    this.flip = () => {
      this.flipped = !this.flipped;
      this.pane = "board";
      this.redrawGround();
      this.redraw();
    };
    this.cgState = () => {
      var _a2;
      const data = this.curData();
      const lastMove = isMoveData(data) ? uciToMove(data.uci) : (_a2 = this.opts.chessground) === null || _a2 === void 0 ? void 0 : _a2.lastMove;
      return {
        fen: data.fen,
        orientation: this.orientation(),
        check: data.check,
        lastMove,
        turnColor: data.turn
      };
    };
    this.analysisUrl = (forPractice) => {
      const mainlinePly = this.plyOnMainline();
      const onMainline = mainlinePly !== void 0;
      return this.game.metadata.isLichess && this.game.metadata.externalLink && onMainline && !forPractice ? this.game.metadata.externalLink + `#${mainlinePly}` : `https://lichess.org/analysis/${this.curData().fen.replace(" ", "_")}?color=${this.orientation()}`;
    };
    this.practiceUrl = () => `${this.analysisUrl(true)}#practice`;
    this.setGround = (cg) => {
      this.ground = cg;
      this.redrawGround();
    };
    this.redrawGround = () => this.withGround((g) => {
      g.set(this.cgState());
      g.setShapes(this.curData().shapes.map((s) => ({
        orig: makeSquare(s.from),
        dest: makeSquare(s.to),
        brush: s.color
      })));
    });
    this.withGround = (f) => this.ground && f(this.ground);
    this.game = makeGame(opts.pgn, opts.lichess);
    opts.orientation = (_a = opts.orientation) !== null && _a !== void 0 ? _a : this.game.metadata.orientation;
    this.translate = translate(opts.translate);
    this.path = this.game.pathAtMainlinePly(opts.initialPly);
  }
  plyOnMainline() {
    const data = this.curData();
    const ply = isMoveData(data) ? data.ply : 0;
    const onMainline = ply === 0 ? this.path.empty() : !!this.game.mainline[ply - 1] && this.game.mainline[ply - 1].path.equals(this.path);
    return onMainline ? ply : void 0;
  }
};

// ../../node_modules/.pnpm/@lichess-org+pgn-viewer@2.6.4/node_modules/@lichess-org/pgn-viewer/dist/events.js
function stepwiseScroll(inner) {
  let scrollTotal = 0;
  return (e) => {
    scrollTotal += e.deltaY * (e.deltaMode ? 40 : 1);
    if (Math.abs(scrollTotal) >= 4) {
      inner(e, true);
      scrollTotal = 0;
    } else {
      inner(e, false);
    }
  };
}
function eventRepeater(action, e) {
  const repeat = () => {
    action();
    delay = Math.max(100, delay - delay / 15);
    timeout = setTimeout(repeat, delay);
  };
  let delay = 350;
  let timeout = setTimeout(repeat, 500);
  action();
  const eventName = e.type === "touchstart" ? "touchend" : "mouseup";
  document.addEventListener(eventName, () => clearTimeout(timeout), { once: true });
}
var suppressKeyNavOn = (e) => e.altKey || e.ctrlKey || e.shiftKey || e.metaKey || document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
var onKeyDown = (ctrl) => (e) => {
  if (!suppressKeyNavOn(e)) {
    if (e.key === "ArrowLeft")
      ctrl.goTo("prev");
    else if (e.key === "ArrowRight")
      ctrl.goTo("next");
    else if (e.key === "f")
      ctrl.flip();
  }
};

// ../../node_modules/.pnpm/@lichess-org+pgn-viewer@2.6.4/node_modules/@lichess-org/pgn-viewer/dist/view/glyph.js
var renderNag = (nag) => {
  const glyph = glyphs[nag];
  return glyph ? h("nag", { attrs: { title: glyph.name } }, glyph.symbol) : void 0;
};
var glyphs = {
  1: {
    symbol: "!",
    name: "Good move"
  },
  2: {
    symbol: "?",
    name: "Mistake"
  },
  3: {
    symbol: "!!",
    name: "Brilliant move"
  },
  4: {
    symbol: "??",
    name: "Blunder"
  },
  5: {
    symbol: "!?",
    name: "Interesting move"
  },
  6: {
    symbol: "?!",
    name: "Dubious move"
  },
  7: {
    symbol: "\u25A1",
    name: "Only move"
  },
  22: {
    symbol: "\u2A00",
    name: "Zugzwang"
  },
  10: {
    symbol: "=",
    name: "Equal position"
  },
  13: {
    symbol: "\u221E",
    name: "Unclear position"
  },
  14: {
    symbol: "\u2A72",
    name: "White is slightly better"
  },
  15: {
    symbol: "\u2A71",
    name: "Black is slightly better"
  },
  16: {
    symbol: "\xB1",
    name: "White is better"
  },
  17: {
    symbol: "\u2213",
    name: "Black is better"
  },
  18: {
    symbol: "+\u2212",
    name: "White is winning"
  },
  19: {
    symbol: "-+",
    name: "Black is winning"
  },
  146: {
    symbol: "N",
    name: "Novelty"
  },
  32: {
    symbol: "\u2191\u2191",
    name: "Development"
  },
  36: {
    symbol: "\u2191",
    name: "Initiative"
  },
  40: {
    symbol: "\u2192",
    name: "Attack"
  },
  132: {
    symbol: "\u21C6",
    name: "Counterplay"
  },
  138: {
    symbol: "\u2295",
    name: "Time trouble"
  },
  44: {
    symbol: "=\u221E",
    name: "With compensation"
  },
  140: {
    symbol: "\u2206",
    name: "With the idea"
  }
};

// ../../node_modules/.pnpm/@lichess-org+pgn-viewer@2.6.4/node_modules/@lichess-org/pgn-viewer/dist/view/util.js
function bindMobileMousedown(el, f, redraw) {
  for (const mousedownEvent of ["touchstart", "mousedown"]) {
    el.addEventListener(mousedownEvent, (e) => {
      f(e);
      e.preventDefault();
      if (redraw)
        redraw();
    }, { passive: false });
  }
}
var bind = (eventName, f, redraw, passive = true) => onInsert((el) => el.addEventListener(eventName, (e) => {
  const res = f(e);
  if (res === false)
    e.preventDefault();
  redraw === null || redraw === void 0 ? void 0 : redraw();
  return res;
}, { passive }));
function onInsert(f) {
  return {
    insert: (vnode) => f(vnode.elm)
  };
}
var clockContent = (seconds) => {
  if (!seconds && seconds !== 0)
    return ["-"];
  const date = new Date(seconds * 1e3), sep = ":", baseStr = pad2(date.getUTCMinutes()) + sep + pad2(date.getUTCSeconds());
  return seconds >= 3600 ? [Math.floor(seconds / 3600) + sep + baseStr] : [baseStr];
};
var pad2 = (num) => (num < 10 ? "0" : "") + num;
var formatSquareForScreenReader = (translate2, file, rank, piece) => {
  const square = `${file.toUpperCase()}${rank}`;
  if (!piece)
    return `${square} ${translate2("aria.empty")}`;
  const pieceName = translate2(`aria.piece.${piece.role}`);
  return `${square} ${translate2(`aria.${piece.color}`)} ${pieceName}`;
};
var formatMoveForScreenReader = (san, nags, translate2) => {
  let formatted = translate2 ? transSanToWords(san, translate2) : san;
  if (nags && nags.length > 0) {
    const annotations = nags.map((nag) => {
      var _a;
      return (_a = glyphs[nag]) === null || _a === void 0 ? void 0 : _a.name;
    }).filter(Boolean).join(", ");
    if (annotations) {
      formatted += `, ${annotations}`;
    }
  }
  return formatted;
};
var transSanToWords = (san, translate2) => san.split("").map((c) => {
  if (c === "x")
    return translate2("san.takes");
  if (c === "+")
    return translate2("san.check");
  if (c === "#")
    return translate2("san.checkmate");
  if (c === "=")
    return translate2("san.promotesTo");
  if (c === "@")
    return translate2("san.droppedOn");
  const code = c.charCodeAt(0);
  if (code > 48 && code < 58)
    return c;
  if (code > 96 && code < 105)
    return c.toUpperCase();
  if (c === "K")
    return translate2("aria.piece.king");
  if (c === "Q")
    return translate2("aria.piece.queen");
  if (c === "R")
    return translate2("aria.piece.rook");
  if (c === "B")
    return translate2("aria.piece.bishop");
  if (c === "N")
    return translate2("aria.piece.knight");
  if (c === "O")
    return "O";
  return c;
}).join(" ").replace("O - O - O", translate2("san.longCastling")).replace("O - O", translate2("san.shortCastling"));

// ../../node_modules/.pnpm/@lichess-org+pgn-viewer@2.6.4/node_modules/@lichess-org/pgn-viewer/dist/view/accessibleBoard.js
var renderAccessibleBoard = (ctrl) => {
  const flipped = ctrl.flipped;
  return h("div.lpv__sr-only", {
    attrs: {
      role: "grid",
      "aria-label": ctrl.translate("aria.accessibleChessboard"),
      "aria-hidden": "false"
    }
  }, renderBoardRows(ctrl, flipped));
};
var renderBoardRows = (ctrl, flipped) => {
  var _a, _b;
  const pieces = (_b = (_a = ctrl.ground) === null || _a === void 0 ? void 0 : _a.state.pieces) !== null && _b !== void 0 ? _b : read(ctrl.curData().fen);
  const orderedRanks = flipped ? ranks : invRanks;
  const orderedFiles = flipped ? [...files].reverse() : files;
  return orderedRanks.map((rank) => h("div", {
    attrs: {
      role: "row"
    }
  }, orderedFiles.map((file) => {
    const squareKey = `${file}${rank}`;
    const piece = pieces.get(squareKey);
    return renderSquare(ctrl.translate, file, rank, piece);
  })));
};
var renderSquare = (translate2, file, rank, piece) => {
  const ariaLabel = formatSquareForScreenReader(translate2, file, rank, piece);
  return h("span", {
    attrs: {
      role: "gridcell",
      "aria-label": ariaLabel
    }
  }, ariaLabel);
};

// ../../node_modules/.pnpm/@lichess-org+pgn-viewer@2.6.4/node_modules/@lichess-org/pgn-viewer/dist/view/aria.js
var ariaHidden = { "aria-hidden": true };
var presentation = { role: "presentation", "aria-hidden": "true" };
var renderAriaAnnouncement = (ctrl) => {
  const data = ctrl.curData();
  if (!isMoveData(data))
    return "";
  const moveNumber = Math.ceil(data.ply / 2);
  const color = data.ply % 2 === 1 ? "white" : "black";
  const san = data.san;
  let announcement = ctrl.translate("aria.move", moveNumber.toString(), ctrl.translate(`aria.${color}`), formatMoveForScreenReader(san, data.nags, ctrl.translate));
  const clock = data.clocks && data.clocks[color === "white" ? "white" : "black"];
  if (clock !== void 0 && ctrl.opts.showClocks) {
    const clockTime = clockContent(clock).join("");
    if (clockTime !== "-") {
      announcement += ", " + ctrl.translate("aria.remaining", clockTime);
    }
  }
  const comments = data.comments.join(" ").trim();
  if (comments) {
    announcement += `. ${comments}`;
  }
  return announcement;
};
var renderRootAriaLabel = (ctrl) => {
  const game = ctrl.game;
  const formatPlayer = (player) => {
    var _a;
    let playerInfo = (_a = player.name) !== null && _a !== void 0 ? _a : ctrl.translate("aria.unknownPlayer");
    if (player.title) {
      playerInfo = `${player.title} ${playerInfo}`;
    }
    if (player.rating) {
      playerInfo = `${playerInfo}, ${ctrl.translate("aria.rated", player.rating.toString())}`;
    }
    return playerInfo;
  };
  const formatResult = (result2) => {
    if (!result2 || result2 === "*")
      return ctrl.translate("aria.gameInProgress");
    if (result2 === "1-0")
      return ctrl.translate("aria.whiteWins");
    if (result2 === "0-1")
      return ctrl.translate("aria.blackWins");
    if (result2 === "1/2-1/2")
      return ctrl.translate("aria.draw");
    return result2;
  };
  const whiteName = formatPlayer(game.players.white);
  const blackName = formatPlayer(game.players.black);
  const result = formatResult(game.metadata.result);
  return ctrl.translate("aria.chessGameBetween", whiteName, blackName, result);
};

// ../../node_modules/.pnpm/@lichess-org+pgn-viewer@2.6.4/node_modules/@lichess-org/pgn-viewer/dist/view/menu.js
var renderMenu = (ctrl) => {
  var _a, _b, _c, _d;
  return h("div.lpv__menu.lpv__pane", {
    attrs: {
      role: "menu",
      "aria-label": (_a = ctrl.translate("menu")) !== null && _a !== void 0 ? _a : "Menu"
    },
    hook: {
      insert: (vnode) => {
        const menuEl = vnode.elm;
        const firstItem = menuEl.querySelector('[role="menuitem"]');
        firstItem === null || firstItem === void 0 ? void 0 : firstItem.focus();
        setupMenuKeyboard(ctrl, menuEl);
      }
    }
  }, [
    h("button.lpv__menu__entry.lpv__menu__flip.lpv__fbt", {
      attrs: { role: "menuitem" },
      hook: bind("click", ctrl.flip)
    }, ctrl.translate("flipTheBoard")),
    ((_b = ctrl.opts.menu.analysisBoard) === null || _b === void 0 ? void 0 : _b.enabled) ? h("a.lpv__menu__entry.lpv__menu__analysis.lpv__fbt", {
      attrs: {
        role: "menuitem",
        href: ctrl.analysisUrl(false),
        target: "_blank",
        "aria-label": ctrl.translate("aria.linkOpensInNewTab", ctrl.translate("analysisBoard"))
      }
    }, ctrl.translate("analysisBoard")) : void 0,
    ((_c = ctrl.opts.menu.practiceWithComputer) === null || _c === void 0 ? void 0 : _c.enabled) ? h("a.lpv__menu__entry.lpv__menu__practice.lpv__fbt", {
      attrs: {
        role: "menuitem",
        href: ctrl.practiceUrl(),
        target: "_blank",
        "aria-label": ctrl.translate("aria.linkOpensInNewTab", ctrl.translate("practiceWithComputer"))
      }
    }, ctrl.translate("practiceWithComputer")) : void 0,
    ctrl.opts.menu.getPgn.enabled ? h("button.lpv__menu__entry.lpv__menu__pgn.lpv__fbt", {
      attrs: { role: "menuitem" },
      hook: bind("click", ctrl.togglePgn)
    }, ctrl.translate("getPgn")) : void 0,
    !ctrl.game.metadata.isLichess || !((_d = ctrl.opts.menu.analysisBoard) === null || _d === void 0 ? void 0 : _d.enabled) ? renderExternalLink(ctrl) : void 0
  ]);
};
var renderExternalLink = (ctrl) => {
  const link = ctrl.game.metadata.externalLink;
  const linkText = ctrl.translate(ctrl.game.metadata.isLichess ? "viewOnLichess" : "viewOnSite");
  return link && h("a.lpv__menu__entry.lpv__fbt", {
    attrs: {
      role: "menuitem",
      href: link,
      target: "_blank",
      "aria-label": ctrl.translate("aria.linkOpensInNewTab", linkText)
    }
  }, linkText);
};
var renderControls = (ctrl) => h("div.lpv__controls", {
  attrs: {
    role: "navigation",
    "aria-label": ctrl.translate("aria.navigationControls")
  }
}, [
  ctrl.pane === "board" ? void 0 : dirButton(ctrl, "first", "step-backward"),
  dirButton(ctrl, "prev", "left-open"),
  h("button.lpv__fbt.lpv__controls__menu.lpv__icon", {
    class: {
      active: ctrl.pane !== "board",
      "lpv__icon-ellipsis-vert": ctrl.pane === "board"
    },
    hook: {
      insert: (vnode) => {
        const el = vnode.elm;
        el.addEventListener("click", ctrl.toggleMenu);
        ctrl.menuButton = el;
      }
    },
    attrs: {
      "aria-label": ctrl.translate("menu"),
      "aria-expanded": String(ctrl.pane === "menu"),
      "aria-haspopup": "menu"
    }
  }, ctrl.pane === "board" ? void 0 : "X"),
  dirButton(ctrl, "next", "right-open"),
  ctrl.pane === "board" ? void 0 : dirButton(ctrl, "last", "step-forward")
]);
var dirButton = (ctrl, to, icon) => {
  const isDisabled = ctrl.pane === "board" && !ctrl.canGoTo(to);
  return h(`button.lpv__controls__goto.lpv__controls__goto--${to}.lpv__fbt.lpv__icon.lpv__icon-${icon}`, {
    class: { disabled: isDisabled },
    hook: onInsert((el) => bindMobileMousedown(el, (e) => eventRepeater(() => ctrl.goTo(to), e))),
    attrs: {
      "aria-label": ctrl.translate(`aria.${to}`),
      "aria-disabled": String(isDisabled),
      disabled: isDisabled
    }
  });
};
var setupMenuKeyboard = (ctrl, menuEl) => {
  const handleMenuKeydown = (e) => {
    var _a;
    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        (_a = document.activeElement) === null || _a === void 0 ? void 0 : _a.click();
        break;
      case "Escape":
        e.preventDefault();
        ctrl.toggleMenu();
        break;
    }
  };
  menuEl.addEventListener("keydown", handleMenuKeydown);
};

// ../../node_modules/.pnpm/@lichess-org+pgn-viewer@2.6.4/node_modules/@lichess-org/pgn-viewer/dist/view/player.js
function renderPlayer(ctrl, side) {
  const color = side === "bottom" ? ctrl.orientation() : opposite(ctrl.orientation());
  const player = ctrl.game.players[color];
  const personEls = [
    player.title ? h("span.lpv__player__title", player.title) : void 0,
    h("span.lpv__player__name", player.name),
    player.rating ? h("span.lpv__player__rating", ["(", player.rating, ")"]) : void 0
  ];
  return h(`div.lpv__player.lpv__player--${side}`, [
    player.isLichessUser && player.name ? h("a.lpv__player__person.ulpt.user-link", {
      attrs: {
        href: `${ctrl.opts.lichess}/@/${player.name}`,
        "aria-label": ctrl.translate("aria.viewProfileOnLichess", player.name)
      }
    }, personEls) : h("span.lpv__player__person", personEls),
    ctrl.opts.showClocks ? renderClock(ctrl, color) : void 0
  ]);
}
var renderClock = (ctrl, color) => {
  const move = ctrl.curData();
  const clock = move.clocks && move.clocks[color];
  return typeof clock === "undefined" ? void 0 : h("div.lpv__player__clock", {
    class: { active: color === move.turn },
    attrs: {
      role: "timer",
      "aria-label": clockContent(clock).join("")
    }
  }, clockContent(clock));
};

// ../../node_modules/.pnpm/@lichess-org+pgn-viewer@2.6.4/node_modules/@lichess-org/pgn-viewer/dist/view/side.js
var renderMoves = (ctrl) => h("div.lpv__side", [
  h("div.lpv__moves", {
    attrs: {
      role: "complementary",
      "aria-label": ctrl.translate("aria.gameMoves")
    },
    hook: {
      insert: (vnode) => {
        const el = vnode.elm;
        if (!ctrl.path.empty())
          autoScroll(ctrl, el);
        el.addEventListener("click", (e) => {
          var _a;
          const path = (_a = e.target.closest("[data-path]")) === null || _a === void 0 ? void 0 : _a.getAttribute("data-path");
          if (path)
            ctrl.toPath(new Path(path));
        }, { passive: true });
      },
      postpatch: (_, vnode) => {
        if (ctrl.autoScrollRequested) {
          autoScroll(ctrl, vnode.elm);
          ctrl.autoScrollRequested = false;
        }
      }
    }
  }, [...ctrl.game.initial.comments.map(commentNode), ...makeMoveNodes(ctrl), ...renderResultComment(ctrl)])
]);
var renderResultComment = (ctrl) => {
  const res = ctrl.game.metadata.result;
  return res && res !== "*" ? [
    h("comment.result", { attrs: { role: "note", "aria-label": ctrl.translate("aria.gameResult") } }, ctrl.game.metadata.result)
  ] : [];
};
var emptyMove = () => h("button.move.empty", { attrs: { "aria-hidden": "true", disabled: true } }, "...");
var indexNode = (turn) => h("index", { attrs: presentation }, `${turn}.`);
var commentNode = (comment) => h("comment", { attrs: { role: "note" } }, comment);
var parenOpen = () => h("paren.open", { attrs: ariaHidden }, "(");
var parenClose = () => h("paren.close", { attrs: ariaHidden }, ")");
var moveTurn = (move) => Math.floor((move.ply - 1) / 2) + 1;
var makeMoveNodes = (ctrl) => {
  const moveDom = renderMove(ctrl);
  const elms = [];
  let node, variations = ctrl.game.moves.children.slice(1);
  if (ctrl.game.initial.pos.turn === "black" && ctrl.game.mainline[0])
    elms.push(indexNode(ctrl.game.initial.pos.fullmoves), emptyMove());
  while (node = (node !== null && node !== void 0 ? node : ctrl.game.moves).children[0]) {
    const move = node.data;
    const oddMove = move.ply % 2 === 1;
    if (oddMove)
      elms.push(indexNode(moveTurn(move)));
    elms.push(moveDom(move));
    const addEmptyMove = oddMove && (variations.length || move.comments.length) && node.children.length;
    if (addEmptyMove)
      elms.push(emptyMove());
    move.comments.forEach((comment) => elms.push(commentNode(comment)));
    variations.forEach((variation) => elms.push(makeMainVariation(ctrl.translate, moveDom, variation)));
    if (addEmptyMove)
      elms.push(indexNode(moveTurn(move)), emptyMove());
    variations = node.children.slice(1);
  }
  return elms;
};
var makeMainVariation = (translate2, moveDom, node) => h("variation", { attrs: { role: "group", "aria-label": translate2("aria.variation") } }, makeVariationMoves(moveDom, node));
var makeVariationMoves = (moveDom, node) => {
  let elms = [];
  let variations = [];
  let firstMove = true;
  do {
    const move = node.data;
    move.startingComments.forEach((comment) => elms.push(commentNode(comment)));
    if (firstMove && move.ply % 2 === 0)
      elms.push(h("index", { attrs: presentation }, [moveTurn(move), "..."]));
    if (move.ply % 2 === 1)
      elms.push(h("index", { attrs: presentation }, [moveTurn(move), "."]));
    elms.push(moveDom(move));
    move.comments.forEach((comment) => elms.push(commentNode(comment)));
    variations.forEach((variation) => {
      elms = [...elms, parenOpen(), ...makeVariationMoves(moveDom, variation), parenClose()];
    });
    variations = node.children.slice(1);
    node = node.children[0];
    firstMove = false;
  } while (node);
  return elms;
};
var renderMove = (ctrl) => (move) => h("button.move", {
  class: {
    current: ctrl.path.equals(move.path),
    ancestor: ctrl.path.contains(move.path),
    good: move.nags.includes(1),
    mistake: move.nags.includes(2),
    brilliant: move.nags.includes(3),
    blunder: move.nags.includes(4),
    interesting: move.nags.includes(5),
    inaccuracy: move.nags.includes(6)
  },
  attrs: {
    "data-path": move.path.path,
    role: "button",
    "aria-label": ctrl.translate("aria.move", Math.ceil(move.ply / 2).toString(), ctrl.translate(`aria.${move.ply % 2 === 1 ? "white" : "black"}`), formatMoveForScreenReader(move.san, move.nags, ctrl.translate))
  }
}, [move.san, ...move.nags.map(renderNag)]);
var autoScroll = (ctrl, cont) => {
  const target = cont.querySelector(".current");
  if (!target) {
    cont.scrollTop = ctrl.path.empty() ? 0 : 99999;
    return;
  }
  cont.scrollTop = target.offsetTop - cont.offsetHeight / 2 + target.offsetHeight;
};

// ../../node_modules/.pnpm/@lichess-org+pgn-viewer@2.6.4/node_modules/@lichess-org/pgn-viewer/dist/view/main.js
function view(ctrl) {
  const opts = ctrl.opts, staticClasses = `lpv.lpv--moves-${opts.showMoves}.lpv--controls-${opts.showControls}${opts.classes ? "." + opts.classes.replace(" ", ".") : ""}`;
  const showPlayers = opts.showPlayers === "auto" ? ctrl.game.hasPlayerName() : opts.showPlayers;
  return h(`div.${staticClasses}`, {
    class: {
      "lpv--menu": ctrl.pane !== "board",
      "lpv--players": showPlayers
    },
    attrs: {
      role: "region",
      tabindex: 0,
      "aria-label": renderRootAriaLabel(ctrl)
    },
    hook: onInsert((el) => {
      ctrl.setGround(Chessground(el.querySelector(".cg-wrap"), makeConfig(ctrl, el)));
      if (opts.keyboardToMove)
        el.addEventListener("keydown", onKeyDown(ctrl));
    })
  }, [
    h("div.lpv__sr-only", {
      attrs: { "aria-live": "polite", "aria-atomic": "true" }
    }, renderAriaAnnouncement(ctrl)),
    renderAccessibleBoard(ctrl),
    showPlayers ? renderPlayer(ctrl, "top") : void 0,
    renderBoard(ctrl),
    showPlayers ? renderPlayer(ctrl, "bottom") : void 0,
    opts.showControls ? renderControls(ctrl) : void 0,
    opts.showMoves ? renderMoves(ctrl) : void 0,
    ctrl.pane === "menu" ? renderMenu(ctrl) : ctrl.pane === "pgn" ? renderPgnPane(ctrl) : void 0
  ]);
}
var renderBoard = (ctrl) => h("div.lpv__board", {
  attrs: ariaHidden,
  hook: onInsert((el) => {
    el.addEventListener("click", ctrl.focus);
    if (ctrl.opts.scrollToMove && !("ontouchstart" in window))
      el.addEventListener("wheel", stepwiseScroll((e, scroll) => {
        e.preventDefault();
        if (e.deltaY > 0 && scroll)
          ctrl.goTo("next", false);
        else if (e.deltaY < 0 && scroll)
          ctrl.goTo("prev", false);
      }));
  })
}, h("div.cg-wrap"));
var renderPgnPane = (ctrl) => {
  var _a;
  const blob = new Blob([ctrl.opts.pgn], { type: "text/plain" });
  return h("div.lpv__pgn.lpv__pane", [
    h("a.lpv__pgn__download.lpv__fbt", {
      attrs: {
        href: window.URL.createObjectURL(blob),
        download: (_a = ctrl.opts.menu.getPgn.fileName) !== null && _a !== void 0 ? _a : `${ctrl.game.title()}.pgn`
      }
    }, ctrl.translate("download")),
    h("textarea.lpv__pgn__text", ctrl.opts.pgn)
  ]);
};
var makeConfig = (ctrl, rootEl) => ({
  viewOnly: !ctrl.opts.drawArrows,
  addDimensionsCssVarsTo: rootEl,
  drawable: {
    enabled: ctrl.opts.drawArrows,
    visible: true
  },
  disableContextMenu: ctrl.opts.drawArrows,
  ...ctrl.opts.chessground,
  movable: {
    free: false
  },
  draggable: {
    enabled: false
  },
  selectable: {
    enabled: false
  },
  ...ctrl.cgState()
});

// ../../node_modules/.pnpm/@lichess-org+pgn-viewer@2.6.4/node_modules/@lichess-org/pgn-viewer/dist/main.js
function start(element, cfg) {
  const patch = init([classModule, attributesModule]);
  const opts = Config(element, cfg);
  const ctrl = new PgnViewer(opts, redraw);
  const blueprint = view(ctrl);
  element.innerHTML = "";
  let vnode = patch(element, blueprint);
  ctrl.div = vnode.elm;
  function redraw() {
    vnode = patch(vnode, view(ctrl));
  }
  return ctrl;
}

export {
  start
};
//# sourceMappingURL=lib.QPVUN6AP.js.map
