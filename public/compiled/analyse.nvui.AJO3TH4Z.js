import {
  addBreaks,
  arrowKeyHandler,
  boardCommands,
  boardCommandsHandler,
  castlingFlavours,
  commands,
  inputToMove,
  lastCapturedCommandHandler,
  leaveSquareHandler,
  liveText,
  makeContext,
  pieceJumpingHandler,
  pocketsStr,
  positionJumpHandler,
  possibleMovesHandler,
  renderBoard,
  renderComments,
  renderMainline,
  renderPieces,
  renderPockets,
  renderSan,
  renderSetting,
  scanDirectionsHandler,
  selectionHandler
} from "./lib.KNM37UUI.js";
import {
  explorerView_default,
  makeConfig,
  playersView,
  renderClocks,
  renderResult,
  showInfo,
  view,
  view2,
  viewContext
} from "./lib.UZWUG6PB.js";
import {
  renderChat
} from "./lib.OY6DQ2TE.js";
import "./lib.2NHX5WHM.js";
import "./lib.HSNYRAMB.js";
import {
  ops_exports,
  path_exports
} from "./lib.NPW3BL7S.js";
import "./lib.ZXVUOO3F.js";
import "./lib.FMGDQ222.js";
import "./lib.LG7MGGUH.js";
import "./lib.5Q3MW527.js";
import "./lib.SPSB7AAJ.js";
import "./lib.CHCAIC5O.js";
import "./lib.67VUYMDO.js";
import "./lib.GD6YSPBF.js";
import "./lib.BMKV23O2.js";
import {
  main_exports,
  renderEval
} from "./lib.6Z4MCRO3.js";
import "./lib.MFOXABY3.js";
import "./lib.D6AFQ4TK.js";
import "./lib.EAANXKAK.js";
import "./lib.REVOPUIJ.js";
import "./lib.BWJ4DVGT.js";
import {
  enter
} from "./lib.MYPIOGN5.js";
import {
  plyOpponentColor,
  plyToTurn
} from "./lib.LRP46MC3.js";
import "./lib.HMFK7OOB.js";
import {
  Chessground
} from "./lib.AEOHBIQD.js";
import "./lib.RPQH5UYI.js";
import "./lib.XAEDCBGD.js";
import {
  lichessRules,
  makeSan,
  parseFen,
  setupPosition
} from "./lib.X7H2PLEK.js";
import {
  COLORS,
  charToRole,
  opposite,
  parseUci
} from "./lib.53PYQRAK.js";
import "./lib.CAO7TYYH.js";
import "./lib.PNHYIP7B.js";
import {
  bind,
  hl,
  isTouchDevice,
  noTrans,
  onInsert
} from "./lib.S3TIZ2HQ.js";
import "./lib.LWF5S4ZV.js";
import {
  pubsub
} from "./lib.QPQZCXK2.js";
import "./lib.5I4BSVKX.js";
import {
  text
} from "./lib.TT4QSUKQ.js";
import {
  throttle
} from "./lib.NFSQQWN5.js";
import {
  defined,
  prop
} from "./lib.GMEH5BEF.js";
import "./lib.KO2KTNGK.js";

// ../analyse/src/nvuiUtil.ts
function clickHook(main, post) {
  return {
    // put unique identifying props on the button container (such as class)
    // because snabbdom WILL mix plain adjacent buttons up.
    hook: onInsert((el) => {
      el.addEventListener("click", () => {
        main == null ? void 0 : main(el);
        post == null ? void 0 : post();
      });
      el.addEventListener(
        "keydown",
        enter(() => {
          main == null ? void 0 : main(el);
          post == null ? void 0 : post();
        })
      );
    })
  };
}
function currentLineIndex(ctrl) {
  if (ctrl.path === path_exports.root) return { i: 1, of: 1 };
  const prevNode = ctrl.tree.parentNode(ctrl.path);
  return {
    i: prevNode.children.findIndex((node) => node.id === ctrl.node.id),
    of: prevNode.children.length
  };
}
function renderLineIndex(ctrl) {
  const { i, of } = currentLineIndex(ctrl);
  return of > 1 ? `, line ${i + 1} of ${of} ,` : "";
}
function renderCurrentNode({
  ctrl,
  moveStyle
}) {
  const node = ctrl.node;
  if (!node.san || !node.uci) return i18n.nvui.gameStart;
  return [
    plyToTurn(node.ply),
    node.ply % 2 === 1 ? i18n.site.white : i18n.site.black,
    renderSan(node.san, node.uci, moveStyle.get()),
    renderLineIndex(ctrl),
    !ctrl.retro && renderComments(node, moveStyle.get())
  ].filter(Boolean).join(" ").trim();
}

// ../analyse/src/retrospect/nvuiRetroView.ts
function renderRetro(nvuiCtx) {
  var _a, _b, _c, _d;
  const ctx = makeContext2(nvuiCtx);
  const { ctrl } = ctx;
  if (ctrl.ongoing || ctrl.synthetic || !ctrl.hasFullComputerAnalysis()) return void 0;
  const current = (_a = ctrl.retro) == null ? void 0 : _a.current();
  const mistakes = (_b = ctrl.retro) == null ? void 0 : _b.completion();
  let state = (_c = ctrl.retro) == null ? void 0 : _c.feedback();
  if (((_d = ctrl.retro) == null ? void 0 : _d.isSolving()) && current && ctrl.path !== current.prev.path) state = "offTrack";
  return [
    hl(
      "button.retro-toggle",
      ctx.focusFriendlyHook(ctrl.toggleRetro),
      ctrl.retro ? i18n.site.finished : i18n.site.learnFromYourMistakes
    ),
    hl("div.retro-view", { key: "retro-view" }, [
      hl("label", mistakes && `Mistake ${Math.min(mistakes[0] + 1, mistakes[1])} of ${mistakes[1]}`),
      retroStateView[state != null ? state : "none"](ctx)
    ])
  ];
}
function doneWithMistakes({ spoken, ctrl, focusFriendlyHook }, prelude = "") {
  const noMistakes = !ctrl.retro.completion()[1];
  return [
    spoken(
      (prelude ? prelude + ". " : "") + i18n.site[noMistakes ? ctrl.retro.color === "white" ? "noMistakesFoundForWhite" : "noMistakesFoundForBlack" : ctrl.retro.color === "white" ? "doneReviewingWhiteMistakes" : "doneReviewingBlackMistakes"]
    ),
    !noMistakes && hl("button.retro-again", focusFriendlyHook(ctrl.retro.reset), i18n.site.doItAgain),
    hl(
      "button.retro-flip",
      focusFriendlyHook(ctrl.retro.flip),
      i18n.site[ctrl.retro.color === "white" ? "reviewBlackMistakes" : "reviewWhiteMistakes"]
    )
  ];
}
var debounceRedraw;
var retroStateView = {
  offTrack({ spoken, ctrl, moveStyle, focusFriendlyHook }) {
    return [
      spoken(i18n.site.youBrowsedAway + ", " + renderCurrentNode({ ctrl, moveStyle }) + "."),
      hl("button.retro-resume", focusFriendlyHook(ctrl.retro.jumpToNext), i18n.site.resumeLearning)
    ];
  },
  fail(ctx) {
    return retroStateView.find(ctx, `${i18n.site.youCanDoBetter}, `, true);
  },
  win(ctx) {
    ctx.ctrl.retro.feedback("find");
    return retroStateView.find(ctx, `${i18n.study.goodMove}, `);
  },
  view(ctx) {
    const { ctrl, spoken, focusFriendlyHook } = ctx;
    if (!ctrl.retro.current()) return doneWithMistakes(ctx);
    const node = ctrl.retro.current().solution.node;
    const solution = `${i18n.site.solution} ${renderSan(node.san, node.uci, ctx.moveStyle.get())}.`;
    return ctrl.retro.current() ? [spoken(solution), hl("button.retro-next", focusFriendlyHook(ctrl.retro.skip), i18n.site.next)] : doneWithMistakes(ctx, solution);
  },
  find(ctx, prelude = "", tryAgain = false) {
    var _a;
    const { ctrl, spoken, focusFriendlyHook } = ctx;
    const node = (_a = ctrl.retro.current()) == null ? void 0 : _a.fault.node;
    if (!node) return doneWithMistakes(ctx, prelude);
    const c = ctrl.retro.color;
    const trailer = c === "white" ? tryAgain ? i18n.site.tryAnotherMoveForWhite : i18n.site.findBetterMoveForWhite : tryAgain ? i18n.site.tryAnotherMoveForBlack : i18n.site.findBetterMoveForBlack;
    return [
      spoken(
        prelude + `Turn ${Math.floor((node.ply + 1) / 2)}, ${i18n.site[c]} played ${renderSan(node.san, node.uci, ctx.moveStyle.get())}, ${trailer}`
      ),
      hl(
        "button.retro-solve",
        focusFriendlyHook(() => ctrl.retro.feedback("view")),
        i18n.site.viewTheSolution
      ),
      hl("button.retro-skip", focusFriendlyHook(ctrl.retro.skip), i18n.site.skipThisMove)
    ];
  },
  eval({ ctrl }) {
    clearTimeout(debounceRedraw);
    debounceRedraw = setTimeout(ctrl.redraw, 200);
    return void 0;
  },
  none(ctx) {
    return ctx.spoken("");
  }
};
function makeContext2(nvuiCtx) {
  return {
    ...nvuiCtx,
    spoken: (text2) => liveText(text2, "assertive", "p.retro-spoken"),
    focusFriendlyHook: (callback) => clickHook(callback, () => {
      var _a;
      (_a = document.querySelector("p.retro-spoken")) == null ? void 0 : _a.focus();
      nvuiCtx.ctrl.redraw();
    })
  };
}

// ../analyse/src/view/nvuiView.ts
var throttled = (sound) => throttle(100, () => site.sound.play(sound));
var selectSound = throttled("select");
var borderSound = throttled("outOfBound");
var errorSound = throttled("error");
function initNvui(ctx) {
  const { ctrl, notify } = ctx;
  pubsub.on("analysis.server.progress", (data) => {
    if (data.analysis && !data.analysis.partial) notify.set("Server-side analysis complete");
  });
  site.mousetrap.unbind("c");
  site.mousetrap.bind("c", () => notify.set(renderEvalAndDepth(ctrl)));
}
function renderNvui(ctx) {
  var _a, _b, _c;
  const { ctrl, deps, notify, moveStyle, pieceStyle, prefixStyle, positionStyle, boardStyle, pageStyle } = ctx;
  const d = ctrl.data, style = moveStyle.get(), clocks = renderClocks(ctrl, ctrl.path), pockets = (_a = ctrl.node.crazy) == null ? void 0 : _a.pockets;
  ctrl.chessground = Chessground(document.createElement("div"), {
    ...makeConfig(ctrl),
    animation: { enabled: false },
    drawable: { enabled: false },
    coordinates: false
  });
  const boardFirst = isTouchDevice() && pageStyle.get() === "board-actions";
  if (boardFirst) {
    pieceStyle.set("name");
    prefixStyle.set("name");
    boardStyle.set("plain");
  }
  const boardView = [
    hl("h2", i18n.site.board),
    hl(
      "div.board",
      { hook: onInsert((el) => boardEventsHook(ctx, el)) },
      renderBoard(
        ctrl.chessground.state.pieces,
        ctrl.data.game.variant.key === "racingKings" ? "white" : ctrl.bottomColor(),
        pieceStyle.get(),
        prefixStyle.get(),
        positionStyle.get(),
        boardStyle.get()
      )
    )
  ];
  return hl("main.analyse", [
    hl("div.nvui", [
      ...boardFirst ? boardView : [],
      boardFirst && renderTouchDeviceCommands(ctx),
      studyDetails(ctrl),
      hl("h2", i18n.nvui.gameInfo),
      ...COLORS.map((color) => hl("p", [`${i18n.site[color]}: `, renderPlayer(ctrl, playerByColor(d, color))])),
      hl("p", `${i18n.site[d.game.rated ? "rated" : "casual"]} ${d.game.perf || d.game.variant.name}`),
      d.clock ? hl("p", `Clock: ${d.clock.initial / 60} + ${d.clock.increment}`) : null,
      hl("h2", i18n.nvui.moveList),
      hl("p.moves", { attrs: { role: "log", "aria-live": "off" } }, renderCurrentLine(ctx)),
      !((_b = ctrl.study) == null ? void 0 : _b.practice) && [
        hl(
          "button",
          {
            attrs: { "aria-pressed": `${ctrl.explorer.enabled()}` },
            hook: bind("click", (_) => ctrl.explorer.toggle(), ctrl.redraw)
          },
          i18n.site.openingExplorerAndTablebase
        ),
        explorerView_default(ctrl)
      ],
      hl("h2", i18n.nvui.pieces),
      renderPieces(ctrl.chessground.state.pieces, style, ctrl.bottomColor()),
      pockets && hl("h2", i18n.nvui.pockets),
      pockets && renderPockets(pockets),
      renderAriaResult(ctrl),
      hl("h2", i18n.nvui.lastMove),
      !ctrl.retro && liveText(renderCurrentNode(ctx), "polite", "p.position.lastMove"),
      clocks && hl("div.clocks", [
        hl("h2", i18n.site.clock),
        hl("div.clocks", [hl("div.topc", clocks[0]), hl("div.botc", clocks[1])])
      ]),
      hl("h2", i18n.nvui.inputForm),
      hl(
        "form#move-form",
        {
          hook: onInsert((el) => {
            const $form = $(el);
            const $input = $form.find(".move").val("");
            $form.on("submit", onSubmit(ctx, $input));
          })
        },
        [
          hl("label", [
            i18n.nvui.inputForm,
            hl("input.move.mousetrap", {
              attrs: { name: "move", type: "text", autocomplete: "off" }
            })
          ])
        ]
      ),
      notify.render(),
      renderRetro(ctx),
      !ctrl.retro && [
        hl("h2", i18n.site.computerAnalysis),
        main_exports.renderCeval(ctrl),
        // beware unsolicited redraws hosing the screen reader
        main_exports.renderPvs(ctrl),
        renderAcpl(ctx) || requestAnalysisBtn(ctx)
      ],
      ...boardFirst ? [] : boardView,
      hl("div.boardstatus", { attrs: { "aria-live": "polite", "aria-atomic": "true" } }, ""),
      hl("div.content", {
        hook: onInsert((elem) => {
          const $root = $(elem);
          $root.append($(".blind-content").removeClass("none"));
          $root.find(".copy-pgn").on("click", function() {
            navigator.clipboard.writeText(this.dataset.pgn).then(() => {
              notify.set(i18n.nvui.copiedToClipboard("PGN"));
            });
          });
          $root.find(".copy-fen").on("click", function() {
            var _a2;
            const fen = (_a2 = document.querySelector(".analyse__underboard__fen input")) == null ? void 0 : _a2.value;
            if (fen) {
              navigator.clipboard.writeText(fen).then(() => {
                notify.set(i18n.nvui.copiedToClipboard("FEN"));
              });
            }
          });
        })
      }),
      hl("h2", i18n.site.advancedSettings),
      hl("label", ["Move notation", renderSetting(moveStyle, ctrl.redraw)]),
      hl("h3", "Board settings"),
      hl("label", ["Piece style", renderSetting(pieceStyle, ctrl.redraw)]),
      hl("label", ["Piece prefix style", renderSetting(prefixStyle, ctrl.redraw)]),
      hl("label", ["Show position", renderSetting(positionStyle, ctrl.redraw)]),
      hl("label", ["Board layout", renderSetting(boardStyle, ctrl.redraw)]),
      hl("h2", i18n.site.keyboardShortcuts),
      hl(
        "p",
        [
          "Use arrow keys to navigate in the game.",
          `l: ${i18n.site.toggleLocalAnalysis}`,
          `z: ${i18n.site.toggleAllAnalysis}`,
          `space: ${i18n.site.playComputerMove}`,
          "c: announce computer evaluation",
          `x: ${i18n.site.showThreat}`
        ].reduce(addBreaks, [])
      ),
      boardCommands(),
      hl("h2", i18n.nvui.inputFormCommandList),
      hl(
        "p",
        [
          "Type these commands in the command input.",
          ...inputCommands.filter((c) => {
            var _a2;
            return !((_a2 = c.invalid) == null ? void 0 : _a2.call(c, ctrl));
          }).flatMap((command) => [noTrans(`${command.cmd}: `), command.help])
        ].reduce(
          (acc, curr, i) => i % 2 !== 0 ? addBreaks(acc, curr) : acc.concat(curr),
          []
        )
      ),
      hl("h2", "Chat"),
      ctrl.chatCtrl && renderChat(ctrl.chatCtrl),
      deps && ((_c = ctrl.study) == null ? void 0 : _c.relay) && tourDetails(ctx)
    ])
  ]);
}
function renderTouchDeviceCommands(ctx) {
  const { notify, ctrl, moveStyle } = ctx;
  return [
    hl("div.actions", [
      hl("button", { hook: bind("click", ctrl.navigate.prev) }, "previous move"),
      hl("button", { hook: bind("click", ctrl.navigate.next) }, "next move"),
      hl("button", { hook: bind("click", () => notify.set(renderEvalAndDepth(ctrl))) }, "evaluation"),
      hl(
        "button",
        { hook: bind("click", () => notify.set(renderBestMove({ ctrl, moveStyle }))) },
        "top engine move"
      ),
      hl(
        "button",
        {
          hook: bind("click", () => {
            notify.set(`${$(".nvui .botc").text()} - ${$(".nvui .topc").text()}`);
          })
        },
        "clocks"
      ),
      hl("button", { hook: bind("click", ctrl.navigate.first) }, "first move"),
      hl("button", { hook: bind("click", ctrl.navigate.last) }, "last move"),
      hl(
        "button",
        { hook: bind("click", () => toggleLocalEvaluation(ctrl)) },
        noEvalStr(ctrl) ? noEvalStr(ctrl) : "local evaluation is enabled"
      )
    ])
  ];
}
function boardEventsHook({ ctrl, pieceStyle, prefixStyle, moveStyle, notify }, el) {
  const $board = $(el);
  const $buttons = $board.find("button");
  const steps = () => ctrl.tree.getNodeList(ctrl.path);
  const fenSteps = () => steps().map((step) => step.fen);
  $buttons.on("blur", leaveSquareHandler($buttons));
  $buttons.on(
    "click",
    selectionHandler(() => plyOpponentColor(ctrl.node.ply))
  );
  $buttons.on("keydown", (e) => {
    var _a;
    if (e.shiftKey && e.key.match(/^[ad]$/i)) jumpMoveOrLine(ctrl)(e);
    else if (e.key.match(/^x$/i))
      scanDirectionsHandler(ctrl.bottomColor(), ctrl.chessground.state.pieces, moveStyle.get())(e);
    else if (["o", "l", "t"].includes(e.key)) boardCommandsHandler()(e);
    else if (e.key.startsWith("Arrow")) arrowKeyHandler(ctrl.bottomColor(), borderSound)(e);
    else if (e.key === "c") lastCapturedCommandHandler(fenSteps, pieceStyle.get(), prefixStyle.get())();
    else if (e.key === "i") {
      e.preventDefault();
      (_a = document.querySelector("input.move")) == null ? void 0 : _a.focus();
    } else if (e.key === "f") {
      if (ctrl.data.game.variant.key !== "racingKings") {
        notify.set("Flipping the board");
        setTimeout(() => ctrl.flip(), 1e3);
      }
    } else if (e.code.match(/^Digit([1-8])$/)) positionJumpHandler()(e);
    else if (e.key.match(/^[kqrbnp]$/i)) pieceJumpingHandler(selectSound, errorSound)(e);
    else if (e.key.toLowerCase() === "m")
      possibleMovesHandler(ctrl.turnColor(), ctrl.chessground, ctrl.data.game.variant.key, ctrl.nodeList)(e);
    else if (e.key.toLowerCase() === "v") notify.set(renderEvalAndDepth(ctrl));
    else if (e.key === "G") ctrl.playBestMove();
    else if (e.key === "g") notify.set(renderBestMove({ ctrl, moveStyle }));
  });
}
function renderEvalAndDepth(ctrl) {
  var _a;
  if (ctrl.threatMode()) return `${evalInfo(ctrl.node.threat)} ${depthInfo(ctrl.node.threat, false)}`;
  const evs = { client: ctrl.getNode().ceval, server: ctrl.getNode().eval }, bestEv = main_exports.getBestEval(ctrl);
  const evalStr = evalInfo(bestEv);
  return !evalStr ? noEvalStr(ctrl) : `${evalStr} ${depthInfo(evs.client, !!((_a = evs.client) == null ? void 0 : _a.cloud))}`;
}
var evalInfo = (bestEv) => defined(bestEv == null ? void 0 : bestEv.cp) ? renderEval(bestEv.cp).replace("-", "\u2212") : defined(bestEv == null ? void 0 : bestEv.mate) ? `mate in ${Math.abs(bestEv.mate)} for ${bestEv.mate > 0 ? "white" : "black"}` : "";
var depthInfo = (clientEv, isCloud) => clientEv ? `${i18n.site.depthX(clientEv.depth || 0)} ${isCloud ? "Cloud" : ""}` : "";
var noEvalStr = (ctrl) => !ctrl.isCevalAllowed() ? "local evaluation not allowed" : !ctrl.cevalEnabled() ? "local evaluation not enabled" : "";
function toggleLocalEvaluation(ctrl) {
  if (ctrl.isCevalAllowed() && ctrl.ceval.analysable) ctrl.cevalEnabled(!ctrl.cevalEnabled());
}
function renderBestMove({ ctrl, moveStyle }) {
  const noEvalMsg = noEvalStr(ctrl);
  if (noEvalMsg) return noEvalMsg;
  const node = ctrl.node, setup = parseFen(node.fen).unwrap();
  let pvs = [];
  if (ctrl.threatMode() && node.threat) {
    pvs = node.threat.pvs;
    setup.turn = opposite(setup.turn);
    if (setup.turn === "white") setup.fullmoves += 1;
  } else if (node.ceval) pvs = node.ceval.pvs;
  const pos = setupPosition(lichessRules(ctrl.ceval.opts.variant.key), setup);
  if (pos.isOk && pvs.length > 0 && pvs[0].moves.length > 0) {
    const uci = pvs[0].moves[0];
    const san = makeSan(pos.unwrap(), parseUci(uci));
    return renderSan(san, uci, moveStyle.get());
  }
  return "";
}
function renderAriaResult(ctrl) {
  const result = renderResult(ctrl);
  const res = result.length ? result : i18n.site.none;
  return [
    hl("h2", i18n.nvui.gameStatus),
    hl("div", { attrs: { role: "status", "aria-live": "assertive", "aria-atomic": "true" } }, res)
  ];
}
function renderCurrentLine({ ctrl, moveStyle }) {
  if (ctrl.path.length === 0) return renderMainline(ctrl.mainline, ctrl.path, moveStyle.get(), !ctrl.retro);
  else {
    const futureNodes = ctrl.node.children.length > 0 ? ops_exports.mainlineNodeList(ctrl.node.children[0]) : [];
    return renderMainline(ctrl.nodeList.concat(futureNodes), ctrl.path, moveStyle.get(), !ctrl.retro);
  }
}
function onSubmit(ctx, $input) {
  const { ctrl, notify } = ctx;
  return (e) => {
    var _a;
    e.preventDefault();
    const input = castlingFlavours($input.val().trim());
    const command = getCommand(input) || getCommand(input.slice(1));
    if (command && !((_a = command.invalid) == null ? void 0 : _a.call(command, ctrl))) command.cb(ctx, input);
    else {
      const move = inputToMove(input, ctrl.node.fen, ctrl.chessground);
      const isDrop = (u) => !!(u && typeof u !== "string");
      const isInvalidDrop = (d) => !ctrl.crazyValid(d.role, d.key) || ctrl.chessground.state.pieces.has(d.key);
      const isInvalidCrazy = isDrop(move) && isInvalidDrop(move);
      if (!move || isInvalidCrazy) notify.set(`Invalid move: ${input}`);
      else sendMove(move, ctrl);
    }
    $input.val("");
  };
}
var inputCommands = [
  {
    cmd: "b",
    help: commands().board.help,
    cb: ({ ctrl, notify, moveStyle }, input) => notify.set(commands().board.apply(input, ctrl.chessground.state.pieces, moveStyle.get()) || "")
  },
  {
    cmd: "p",
    help: commands().piece.help,
    cb: ({ ctrl, notify, moveStyle }, input) => notify.set(
      commands().piece.apply(input, ctrl.chessground.state.pieces, moveStyle.get()) || `Bad input: ${input}. Exptected format: ${commands().piece.help}`
    )
  },
  {
    cmd: "s",
    help: commands().scan.help,
    cb: ({ ctrl, notify, moveStyle }, input) => notify.set(
      commands().scan.apply(input, ctrl.chessground.state.pieces, moveStyle.get()) || `Bad input: ${input}. Exptected format: ${commands().scan.help}`
    )
  },
  {
    cmd: "eval",
    help: noTrans("announce last move's computer evaluation"),
    cb: ({ ctrl, notify }) => notify.set(renderEvalAndDepth(ctrl))
  },
  {
    cmd: "best",
    help: noTrans("announce the top engine move"),
    cb: (ctx) => ctx.notify.set(renderBestMove(ctx))
  },
  {
    cmd: "prev",
    help: noTrans("return to the previous move"),
    cb: ({ ctrl }) => doAndRedraw(ctrl, ctrl.navigate.prev)
  },
  {
    cmd: "next",
    help: noTrans("go to the next move"),
    cb: ({ ctrl }) => doAndRedraw(ctrl, ctrl.navigate.next)
  },
  {
    cmd: "prev line",
    help: noTrans("switch to the previous variation"),
    cb: ({ ctrl }) => doAndRedraw(ctrl, jumpPrevLine)
  },
  {
    cmd: "next line",
    help: noTrans("switch to the next variation"),
    cb: ({ ctrl }) => doAndRedraw(ctrl, jumpNextLine)
  },
  {
    cmd: "pocket",
    help: noTrans('Read out pockets for white or black. Example: "pocket black"'),
    cb: ({ ctrl, notify }, input) => {
      var _a, _b, _c;
      const pockets = (_a = ctrl.node.crazy) == null ? void 0 : _a.pockets;
      const color = (_c = (_b = input.split(" ")) == null ? void 0 : _b[1]) == null ? void 0 : _c.trim();
      return notify.set(
        pockets ? color ? pocketsStr(color === "white" ? pockets[0] : pockets[1]) || i18n.site.none : "Expected format: pocket [white|black]" : "Command only available in crazyhouse"
      );
    },
    invalid: (ctrl) => ctrl.data.game.variant.key !== "crazyhouse"
  }
];
var getCommand = (input) => {
  const split = input.split(" ");
  const firstWordLowerCase = split[0].toLowerCase();
  return inputCommands.find((c) => c.cmd === input.toLowerCase()) || inputCommands.find((c) => split.length !== 1 && c.cmd === firstWordLowerCase);
};
function sendMove(uciOrDrop, ctrl) {
  if (typeof uciOrDrop === "string")
    ctrl.sendMove(
      uciOrDrop.slice(0, 2),
      uciOrDrop.slice(2, 4),
      void 0,
      charToRole(uciOrDrop.slice(4))
    );
  else if (ctrl.crazyValid(uciOrDrop.role, uciOrDrop.key)) ctrl.sendNewPiece(uciOrDrop.role, uciOrDrop.key);
}
var analysisGlyphs = /* @__PURE__ */ new Set(["?!", "?", "??"]);
function renderAcpl({ ctrl, moveStyle }) {
  const analysis = ctrl.data.analysis;
  if (!analysis || ctrl.retro) return void 0;
  const analysisNodes = ctrl.mainline.filter((n) => {
    var _a;
    return (_a = n.glyphs) == null ? void 0 : _a.find((g) => analysisGlyphs.has(g.symbol));
  });
  const res = [];
  COLORS.forEach((color) => {
    res.push(
      hl("h3", `${color} player: ${analysis[color].acpl} ${i18n.site.averageCentipawnLoss}`),
      hl(
        "select",
        {
          hook: bind(
            "change",
            (e) => ctrl.jumpToMain(parseInt(e.target.value)),
            ctrl.redraw
          )
        },
        analysisNodes.filter((n) => n.ply % 2 === 1 === (color === "white")).map(
          (node) => hl(
            "option",
            { attrs: { value: node.ply, selected: node.ply === ctrl.node.ply } },
            [
              plyToTurn(node.ply),
              renderSan(node.san, node.uci, moveStyle.get()),
              renderComments(node, moveStyle.get())
            ].join(" ")
          )
        )
      )
    );
  });
  return res;
}
var requestAnalysisBtn = ({ ctrl, notify, analysisInProgress }) => {
  if (ctrl.ongoing || ctrl.synthetic || ctrl.hasFullComputerAnalysis()) return void 0;
  return analysisInProgress() ? hl("p", "Server-side analysis in progress") : hl(
    "button.request-analysis",
    clickHook(
      () => text(`/${ctrl.data.game.id}/request-analysis`, { method: "post" }).then(
        () => {
          analysisInProgress(true);
          notify.set("Server-side analysis in progress");
        },
        () => notify.set("Cannot run server-side analysis")
      )
    ),
    i18n.site.requestAComputerAnalysis
  );
};
var renderPlayer = (ctrl, player) => player.ai ? i18n.site.aiNameLevelAiLevel("Stockfish", player.ai) : userHtml(ctrl, player);
function userHtml(ctrl, player) {
  var _a;
  const d = ctrl.data, user = player.user, perf = user ? user.perfs[d.game.perf] : null, rating = (_a = player.rating) != null ? _a : perf == null ? void 0 : perf.rating, rd = player.ratingDiff, ratingDiff = rd ? rd > 0 ? "+" + rd : rd < 0 ? "\u2212" + -rd : "" : "";
  const studyPlayers = ctrl.study && renderStudyPlayer(ctrl, player.color);
  return user ? hl("span", [
    hl(
      "a",
      { attrs: { href: "/@/" + user.username } },
      user.title ? `${user.title} ${user.username}` : user.username
    ),
    rating ? ` ${rating}` : ``,
    " " + ratingDiff
  ]) : studyPlayers || hl("span", i18n.site.anonymous);
}
function renderStudyPlayer({ study }, color) {
  var _a;
  const player = (_a = study == null ? void 0 : study.currentChapter().players) == null ? void 0 : _a[color];
  const keys = [
    ["name", i18n.site.name],
    ["title", "title"],
    ["rating", i18n.site.rating],
    ["fed", "fed"],
    ["team", "team"]
  ];
  return player && hl(
    "span",
    keys.reduce(
      (strs, [key, i18n2]) => player[key] ? strs.concat(`${i18n2}: ${key === "fed" ? player[key].i18nName : player[key]}`) : strs,
      []
    ).join(" ")
  );
}
var playerByColor = (d, color) => color === d.player.color ? d.player : d.opponent;
var jumpNextLine = (ctrl) => jumpLine(ctrl, 1);
var jumpPrevLine = (ctrl) => jumpLine(ctrl, -1);
function jumpLine(ctrl, delta) {
  const { i, of } = currentLineIndex(ctrl);
  if (of === 1) return;
  const newI = (i + delta + of) % of;
  const prevPath = path_exports.init(ctrl.path);
  const prevNode = ctrl.tree.nodeAtPath(prevPath);
  const newPath = prevPath + prevNode.children[newI].id;
  ctrl.userJumpIfCan(newPath);
}
var redirectToSelectedHook = bind("change", (e) => {
  const target = e.target;
  const selectedOption = target.options[target.selectedIndex];
  const url = selectedOption.getAttribute("url");
  if (url) window.location.href = url;
});
function tourDetails({ ctrl, deps }) {
  const ctx = { ...viewContext(ctrl, deps), allowVideo: false };
  const tour = ctx.relay.data.tour;
  ctx.relay.redraw = ctrl.redraw;
  return [
    hl("h1", "Tour details"),
    hl("h2", "Overview"),
    hl("div", showInfo(tour.info, tour.dates)),
    hl("h2", "Players"),
    hl(
      "button.tournament-players",
      clickHook(() => ctx.relay.tab("players"), ctrl.redraw),
      "Load player list"
    ),
    hl("div", ctx.relay.tab() === "players" && playersView(ctx.relay.players))
  ];
}
function studyDetails({ study, redraw }) {
  var _a, _b, _c;
  const relayGroups = (_a = study == null ? void 0 : study.relay) == null ? void 0 : _a.data.group;
  const relayRounds = (_b = study == null ? void 0 : study.relay) == null ? void 0 : _b.data.rounds;
  const tour = (_c = study == null ? void 0 : study.relay) == null ? void 0 : _c.data.tour;
  const hash = window.location.hash;
  return study && hl("div.study-details", [
    hl("h2", "Study details"),
    hl("span", `Title: ${study.data.name}. By: ${study.data.ownerId}`),
    hl("br"),
    relayGroups && hl(
      "div.relay-groups",
      hl("label", [
        "Current group:",
        hl(
          "select",
          {
            attrs: { autofocus: hash === "#group-select" },
            hook: redirectToSelectedHook
          },
          relayGroups.tours.map(
            (t) => hl(
              "option",
              { attrs: { selected: t.id === (tour == null ? void 0 : tour.id), url: `/broadcast/-/${t.id}#group-select` } },
              t.name
            )
          )
        )
      ])
    ),
    tour && relayRounds && hl(
      "div.relay-rounds",
      hl("label", [
        "Current round:",
        hl(
          "select",
          {
            attrs: { autofocus: hash === "#round-select" },
            hook: redirectToSelectedHook
          },
          relayRounds.map(
            (r) => {
              var _a2;
              return hl(
                "option",
                {
                  attrs: {
                    selected: r.id === study.data.id,
                    url: `/broadcast/${tour.slug}/${r.slug}/${r.id}#round-select`
                  }
                },
                (_a2 = study.relay) == null ? void 0 : _a2.round.name
              );
            }
          )
        )
      ])
    ),
    hl("div.chapters", [
      hl("label", [
        "Current chapter:",
        hl(
          "select",
          {
            attrs: { id: "chapter-select" },
            hook: bind("change", (e) => {
              const target = e.target;
              const selectedOption = target.options[target.selectedIndex];
              const chapterId = selectedOption.getAttribute("chapterId");
              study.setChapter(chapterId);
            })
          },
          study.chapters.list.all().map(
            (ch, i) => hl(
              "option",
              { attrs: { selected: ch.id === study.currentChapter().id, chapterId: ch.id } },
              `${i + 1}. ${ch.name}`
            )
          )
        )
      ]),
      study.members.canContribute() ? hl("div.buttons", [
        hl(
          "button.edit-chapter",
          clickHook(() => study.chapters.editForm.toggle(study.currentChapter()), redraw),
          [
            "Edit current chapter",
            study.chapters.editForm.current() && view2(study.chapters.editForm)
          ]
        ),
        hl(
          "button.create-chapter",
          clickHook(() => study.chapters.newForm.toggle(), redraw),
          [
            "Add new chapter",
            study.chapters.newForm.isOpen() ? view(study.chapters.newForm) : void 0
          ]
        )
      ]) : void 0
    ])
  ]);
}
var doAndRedraw = (ctrl, fn) => {
  fn(ctrl);
  ctrl.redraw();
};
function jumpMoveOrLine(ctrl) {
  return (e) => {
    if (e.key === "A") doAndRedraw(ctrl, e.altKey ? jumpPrevLine : ctrl.navigate.prev);
    else if (e.key === "D") doAndRedraw(ctrl, e.altKey ? jumpNextLine : ctrl.navigate.next);
  };
}

// ../analyse/src/analyse.nvui.ts
function initModule(ctrl) {
  const ctx = makeContext(
    {
      ctrl,
      analysisInProgress: prop(false)
    },
    ctrl.redraw
  );
  initNvui(ctx);
  return { render: (deps) => renderNvui({ ...ctx, deps }) };
}
export {
  initModule
};
//# sourceMappingURL=analyse.nvui.AJO3TH4Z.js.map
