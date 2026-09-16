import {
  renderChat
} from "./lib.OY6DQ2TE.js";
import {
  watchers
} from "./lib.2NHX5WHM.js";
import {
  plyPrefix,
  renderNodesTxt
} from "./lib.HSNYRAMB.js";
import {
  completeNode,
  path_exports
} from "./lib.NPW3BL7S.js";
import {
  perfIcons_default
} from "./lib.ZXVUOO3F.js";
import {
  chess960IdToFEN,
  randomPositionId
} from "./lib.FMGDQ222.js";
import {
  renderMaterialDiffs
} from "./lib.LG7MGGUH.js";
import {
  formatClockTimeVerbal,
  status
} from "./lib.5Q3MW527.js";
import {
  dispatchChessgroundResize,
  resizeHandle
} from "./lib.SPSB7AAJ.js";
import {
  Coords,
  MoveEvent,
  ShowResizeHandle
} from "./lib.CHCAIC5O.js";
import {
  playable
} from "./lib.67VUYMDO.js";
import {
  userLink,
  userTitle
} from "./lib.BMKV23O2.js";
import {
  povChances,
  renderEval
} from "./lib.6Z4MCRO3.js";
import {
  stepwiseScroll
} from "./lib.MFOXABY3.js";
import {
  userComplete
} from "./lib.D6AFQ4TK.js";
import {
  commonDateFormat,
  displayLocale,
  numberFormat,
  timeago
} from "./lib.EAANXKAK.js";
import {
  extendTablesortNumber,
  sortTable
} from "./lib.REVOPUIJ.js";
import {
  alert,
  button,
  cmnToggleWrap,
  cmnToggleWrapProp,
  confirm,
  copyMeInput,
  domDialog,
  formatMs,
  icon,
  otbClockIsRunning,
  snabDialog,
  spinnerHtml,
  spinnerVdom
} from "./lib.MYPIOGN5.js";
import {
  fenColor,
  fixCrazySan,
  plyColor,
  plyToTurn
} from "./lib.LRP46MC3.js";
import {
  clamp
} from "./lib.HMFK7OOB.js";
import {
  Chessground
} from "./lib.AEOHBIQD.js";
import {
  opposite as opposite2,
  uciToMove
} from "./lib.RPQH5UYI.js";
import {
  EMPTY_BOARD_FEN,
  INITIAL_FEN,
  IllegalSetup,
  makeFen,
  makeSanAndPlay,
  makeVariant,
  parseFen,
  parsePgn,
  parseSan,
  startingPosition
} from "./lib.X7H2PLEK.js";
import {
  COLORS,
  makeUci,
  opposite
} from "./lib.53PYQRAK.js";
import {
  bind,
  bindNonPassive,
  bindSubmit,
  dataIcon,
  displayColumns,
  hl,
  isMobile,
  isSafari,
  isTouchDevice,
  onInsert,
  requiresI18n
} from "./lib.S3TIZ2HQ.js";
import {
  attributesModule,
  classModule,
  eventListenersModule,
  h,
  init,
  propsModule
} from "./lib.LWF5S4ZV.js";
import {
  pubsub
} from "./lib.QPQZCXK2.js";
import {
  licon
} from "./lib.5I4BSVKX.js";
import {
  ensureOk,
  form,
  json,
  text,
  textRaw,
  url
} from "./lib.TT4QSUKQ.js";
import {
  debounce,
  storage,
  storedBooleanProp,
  storedBooleanPropWithEffect,
  storedJsonProp,
  storedMap,
  storedProp,
  storedStringProp,
  throttle
} from "./lib.NFSQQWN5.js";
import {
  blurIfPrimaryClick,
  defined,
  escapeHtml,
  innerHTML,
  memoize,
  myUserId,
  myUsername,
  notNull,
  onClickAway,
  prop,
  richHTML,
  scrollToInnerSelector,
  toggle
} from "./lib.GMEH5BEF.js";

// ../analyse/src/view/util.ts
var patch = init([classModule, attributesModule, propsModule, eventListenersModule]);
var emptyRedButton = "button.button.button-red.button-empty";
var baseUrl = () => `${window.location.protocol}//${window.location.host}`;
var nodeFullName = (node) => node.san ? plyToTurn(node.ply) + (node.ply % 2 === 1 ? "." : "...") + " " + fixCrazySan(node.san) : "Initial position";
var plural = (noun, nb) => nb + " " + (nb === 1 ? noun : noun + "s");
function titleNameToId(titleName) {
  const split = titleName.split(" ");
  return (split.length === 1 ? split[0] : split[1]).toLowerCase();
}
var option = (value, current, name, data) => hl("option", { attrs: { value, selected: value === current }, ...data }, name);
var playerFedFlag = (fed) => fed && hl("img.mini-game__flag", {
  attrs: {
    src: site.asset.fideFedSrc(fed.id),
    title: `Federation: ${fed.i18nName}`
  }
});

// ../analyse/src/explorer/explorerUtil.ts
var MAX_ANALYSE_DEPTH = 50;
function winnerOf(fen, move) {
  const stm = fenColor(fen);
  if (move.checkmate || move.variant_loss || move.dtz && move.dtz < 0 || move.dtc && move.dtc < 0)
    return stm;
  if (move.variant_win || move.dtz && move.dtz > 0 || move.dtc && move.dtc > 0) return opposite(stm);
  return void 0;
}
var ucfirst = (str) => `${str[0].toUpperCase()}${str.slice(1)}`;
var moveArrowAttributes = (ctrl, opts) => ({
  attrs: { "data-fen": opts.fen },
  hook: onInsert((el) => {
    el.addEventListener("mouseover", (e) => {
      ctrl.explorer.setHovering(
        $(el).attr("data-fen"),
        $(e.target).parents("tr").attr("data-uci")
      );
    });
    el.addEventListener("mouseout", (_) => {
      ctrl.explorer.setHovering($(el).attr("data-fen"), null);
    });
    el.addEventListener("click", (e) => {
      const uci = $(e.target).parents("tr").attr("data-uci");
      opts.onClick(e, uci);
    });
  })
});

// ../analyse/src/explorer/explorerConfig.ts
var allSpeeds = ["ultraBullet", "bullet", "blitz", "rapid", "classical", "correspondence"];
var allModes = ["casual", "rated"];
var allRatings = [400, 1e3, 1200, 1400, 1600, 1800, 2e3, 2200, 2500];
var minYear = 1952;
var ExplorerConfigCtrl = class {
  constructor(root, variant, onClose, previous) {
    this.root = root;
    this.variant = variant;
    this.onClose = onClose;
    this.allDbs = ["lichess", "player"];
    this.selectPlayer = (name) => {
      var _a2;
      name = name === "me" ? this.myName : name;
      if (!name) return;
      if (name === name.toLowerCase()) {
        name = (_a2 = [
          ...this.data.playerName.previous(),
          this.data.playerName.value(),
          this.myName,
          ...this.participants
        ].find((x) => (x == null ? void 0 : x.toLowerCase()) === name.toLowerCase())) != null ? _a2 : name;
      }
      if (name !== this.myName && !this.participants.includes(name)) {
        const previous = this.data.playerName.previous().filter((n) => n !== name);
        previous.unshift(name);
        this.data.playerName.previous(previous.slice(0, 20));
      }
      this.data.db("player");
      this.data.playerName.value(name);
    };
    this.removePlayer = (name) => {
      if (!name) return;
      const previous = this.data.playerName.previous().filter((n) => n !== name);
      this.data.playerName.previous(previous);
      if (this.data.playerName.value() === name) this.data.playerName.value("");
    };
    this.toggleMany = (c) => (value) => {
      if (!c().includes(value)) c(c().concat([value]));
      else if (c().length > 1) c(c().filter((v) => v !== value));
    };
    this.toggleColor = () => this.data.color(opposite2(this.data.color()));
    this.toggleOpen = () => {
      this.data.open(!this.data.open());
      if (!this.data.open()) {
        if (this.data.db() === "player" && !this.data.playerName.value()) this.data.db("lichess");
        this.onClose();
      }
    };
    this.fullHouse = () => this.data.byDb().since() <= `${minYear}-01` && (!this.data.byDb().until() || (/* @__PURE__ */ new Date()).toISOString().slice(0, 7) <= this.data.byDb().until()) && (this.data.db() === "masters" || this.data.speed().length === allSpeeds.length) && (this.data.db() !== "lichess" || this.data.rating().length === allRatings.length) && (this.data.db() !== "player" || this.data.mode().length === allModes.length);
    var _a2, _b;
    this.myName = myUsername();
    this.participants = [(_a2 = root.data.player.user) == null ? void 0 : _a2.username, (_b = root.data.opponent.user) == null ? void 0 : _b.username].filter(
      (name) => name && name !== this.myName
    );
    if (variant === "standard") this.allDbs.unshift("masters");
    const byDbData = {};
    for (const db of this.allDbs) {
      byDbData[db] = {
        since: storedStringProp("analyse.explorer.since-2." + db, ""),
        until: storedStringProp("analyse.explorer.until-2." + db, "")
      };
    }
    const prevData = previous == null ? void 0 : previous.data;
    this.data = {
      open: (prevData == null ? void 0 : prevData.open) || prop(false),
      db: storedProp("explorer.db2." + variant, this.allDbs[0], (str) => str),
      rating: storedJsonProp("analyse.explorer.rating", () => allRatings.slice(1)),
      speed: storedJsonProp("explorer.speed", () => allSpeeds.slice(1)),
      mode: storedJsonProp("explorer.mode", () => allModes),
      byDbData,
      playerName: {
        open: (prevData == null ? void 0 : prevData.playerName.open) || prop(false),
        value: storedStringProp("analyse.explorer.player.name", this.myName || ""),
        previous: storedJsonProp("explorer.player.name.previous", () => [])
      },
      color: storedProp("analyse.explorer.player.color", root.bottomColor(), (str) => str),
      byDb() {
        return this.byDbData[this.db()] || this.byDbData.lichess;
      }
    };
  }
};
var view = (ctrl) => [
  ctrl.data.db() === "masters" ? masterDb(ctrl) : ctrl.data.db() === "lichess" ? lichessDb(ctrl) : playerDb(ctrl),
  h(
    "section.save",
    h(
      "button.button.button-green.text",
      { attrs: dataIcon(licon.Checkmark), hook: bind("click", ctrl.toggleOpen) },
      i18n.site.allSet
    )
  )
];
var selectText = "Select a Lichess player";
var playerDb = (ctrl) => {
  const name = ctrl.data.playerName.value();
  return h("div.player-db", [
    ctrl.data.playerName.open() ? playerModal(ctrl) : void 0,
    h("section.name", [
      h("label", i18n.site.player),
      h("div", [
        h(
          "div.choices",
          h(
            `button.player-name${name ? ".active" : ""}`,
            {
              hook: bind("click", () => ctrl.data.playerName.open(true), ctrl.root.redraw),
              attrs: name ? { title: selectText } : void 0
            },
            name || selectText
          )
        ),
        h(
          "button.button-link.text.color",
          {
            attrs: dataIcon(licon.ChasingArrows),
            hook: bind("click", ctrl.toggleColor, ctrl.root.redraw)
          },
          ` ${i18n.site[ctrl.data.color() === "white" ? "asWhite" : "asBlack"]}`
        )
      ])
    ]),
    speedSection(ctrl),
    modeSection(ctrl),
    monthSection(ctrl)
  ]);
};
var masterDb = (ctrl) => h("div", [
  h("section.date", [
    h("label", [i18n.site.since, yearInput(ctrl.data.byDb().since, () => "", ctrl.root.redraw)]),
    h("label", [
      i18n.site.until,
      yearInput(ctrl.data.byDb().until, ctrl.data.byDb().since, ctrl.root.redraw)
    ])
  ])
]);
var radioButton = (ctrl, storage2, render2) => (v) => h(
  "button",
  {
    attrs: { "aria-pressed": `${storage2().includes(v)}`, title: render2 ? ucfirst(String(v)) : "" },
    hook: bind("click", (_) => ctrl.toggleMany(storage2)(v), ctrl.root.redraw)
  },
  render2 ? render2(v) : i18n(v)
);
var lichessDb = (ctrl) => h("div", [
  speedSection(ctrl),
  h("section.rating", [
    h("label", i18n.site.averageElo),
    h("div.choices", allRatings.map(radioButton(ctrl, ctrl.data.rating)))
  ]),
  monthSection(ctrl)
]);
var speedSection = (ctrl) => h("section.speed", [
  h("label", i18n.site.timeControl),
  h("div.choices", allSpeeds.map(radioButton(ctrl, ctrl.data.speed, (s) => icon(perfIcons_default[s])())))
]);
var modeSection = (ctrl) => h("section.mode", [
  h("label", i18n.site.mode),
  h("div.choices", allModes.map(radioButton(ctrl, ctrl.data.mode)))
]);
var monthInput = (prop2, after, redraw) => {
  const validateRange = (input) => input.setCustomValidity(!input.value || after() <= input.value ? "" : "Invalid date range");
  const max = (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
  return h("input", {
    key: after() ? "until-month" : "since-month",
    attrs: {
      type: "month",
      title: `Insert year and month in YYYY-MM format starting from ${minYear}-01`,
      pattern: "^(19|20)[0-9]{2}-(0[1-9]|1[012])$",
      placeholder: "YYYY-MM",
      min: `${minYear}-01`,
      max,
      value: prop2() > max ? max : prop2()
    },
    hook: {
      ...onInsert((input) => {
        validateRange(input);
        input.addEventListener("change", (e) => {
          const input2 = e.target;
          input2.setCustomValidity("");
          if (input2.checkValidity()) {
            validateRange(input2);
            prop2(input2.value);
            redraw();
          }
        });
      }),
      update: (_, vnode) => validateRange(vnode.elm)
    }
  });
};
var yearInput = (prop2, after, redraw) => {
  const validateRange = (input) => input.setCustomValidity(!input.value || after().split("-")[0] <= input.value ? "" : "Invalid date range");
  return h("input", {
    attrs: {
      key: after() ? "until-year" : "since-year",
      type: "number",
      title: `Insert year in YYYY format starting from ${minYear}`,
      placeholder: "YYYY",
      min: minYear,
      max: (/* @__PURE__ */ new Date()).toISOString().slice(0, 4),
      value: prop2().split("-")[0]
    },
    hook: {
      ...onInsert((input) => {
        validateRange(input);
        input.addEventListener("change", (e) => {
          const input2 = e.target;
          input2.setCustomValidity("");
          if (input2.checkValidity()) {
            validateRange(input2);
            prop2(input2.value ? `${input2.value}-${after() ? "12" : "01"}` : "");
            redraw();
          }
        });
      }),
      update: (_, vnode) => validateRange(vnode.elm)
    }
  });
};
var monthSection = (ctrl) => {
  const db = ctrl.data.byDb();
  return h("section.date", [
    h("label", [i18n.site.since, monthInput(db.since, () => "", ctrl.root.redraw)]),
    h("label", [i18n.site.until, monthInput(db.until, db.since, ctrl.root.redraw)])
  ]);
};
var playerModal = (ctrl) => {
  let dlg;
  const onSelect = (name) => {
    ctrl.selectPlayer(name);
    dlg.close();
  };
  const nameToOptionalColor = (name) => {
    if (!name) return "";
    else if (name === ctrl.myName) return ".button-green";
    else if (ctrl.data.playerName.previous().includes(name)) return "";
    return ".button-metal";
  };
  return snabDialog({
    class: "explorer__config__player__choice",
    onClose() {
      ctrl.data.playerName.open(false);
      ctrl.root.redraw();
    },
    onInsert: (dialog) => (dlg = dialog).show(),
    modal: true,
    easyClose: "clickOutside",
    vnodes: [
      h("h2", "Personal opening explorer"),
      h("div.input-wrapper", [
        h("input", {
          attrs: {
            placeholder: i18n.study.searchByUsername,
            spellcheck: "false"
          },
          hook: onInsert(
            (input) => userComplete({ input, focus: true, tag: "span", onSelect: (v) => onSelect(v.name) })
          )
        })
      ]),
      h(
        "div.previous",
        [
          .../* @__PURE__ */ new Set([
            ...ctrl.myName ? [ctrl.myName] : [],
            ...ctrl.participants,
            ...ctrl.data.playerName.previous()
          ])
        ].map(
          (name) => h("div", { key: name }, [
            h(
              `button.button${nameToOptionalColor(name)}`,
              { hook: bind("click", () => onSelect(name)) },
              name
            ),
            name && ctrl.data.playerName.previous().includes(name) ? h("button.remove", {
              attrs: dataIcon(licon.X),
              hook: bind("click", () => ctrl.removePlayer(name), ctrl.root.redraw)
            }) : null
          ])
        )
      )
    ]
  });
};

// ../analyse/src/explorer/interfaces.ts
var isOpening = (m) => !!m.isOpening;
var isTablebase = (m) => !!m.tablebase;

// ../analyse/src/explorer/tablebaseView.ts
function showTablebase(ctrl, fen, title, tooltip, moves) {
  if (!moves.length) return [];
  return [
    h("div.title", tooltip ? { attrs: { title: tooltip } } : {}, title),
    h("table.tablebase", [
      h(
        "tbody",
        moveArrowAttributes(ctrl, { fen, onClick: (_, uci) => uci && ctrl.explorerMove(uci) }),
        moves.map(
          (move) => h("tr", { key: move.uci, attrs: { "data-uci": move.uci } }, [
            h("td", move.san),
            h("td", [showDtz(fen, move), showDtc(fen, move), showDtm(fen, move), showDtw(fen, move)])
          ])
        )
      )
    ])
  ];
}
var showDtm = (fen, move) => move.dtm ? h(
  "result." + winnerOf(fen, move),
  {
    attrs: { title: i18n.site.mateInXHalfMoves(Math.abs(move.dtm)) + " (Depth To Mate)" }
  },
  "DTM " + Math.abs(move.dtm)
) : void 0;
var showDtw = (fen, move) => move.dtw ? h(
  "result." + winnerOf(fen, move),
  { attrs: { title: "Half-moves to win (Depth To Win)" } },
  "DTW " + Math.abs(move.dtw)
) : void 0;
var showDtc = (fen, move) => move.dtc ? h(
  "result." + winnerOf(fen, move),
  { attrs: { title: "Moves to capture, promotion, or checkmate (Depth To Conversion)" } },
  "DTC " + Math.abs(move.dtc)
) : void 0;
function showDtz(fen, move) {
  if (move.checkmate) return h("result." + winnerOf(fen, move), i18n.site.checkmate);
  if (move.variant_win) return h("result." + winnerOf(fen, move), i18n.site.variantLoss);
  if (move.variant_loss) return h("result." + winnerOf(fen, move), i18n.site.variantWin);
  if (move.stalemate) return h("result.draws", i18n.site.stalemate);
  if (move.insufficient_material) return h("result.draws", i18n.site.insufficientMaterial);
  if (move.dtz === 0 || move.dtc === 0) return h("result.draws", i18n.site.draw);
  if ((move.dtz || move.dtc) && move.zeroing)
    return move.san.includes("x") ? h("result." + winnerOf(fen, move), i18n.site.capture) : h("result." + winnerOf(fen, move), i18n.site.pawnMove);
  return move.dtz ? h(
    "result." + winnerOf(fen, move),
    {
      attrs: {
        title: i18n.site.dtzWithRounding + " (Distance To Zeroing)"
      }
    },
    "DTZ " + Math.abs(move.dtz)
  ) : void 0;
}

// ../analyse/src/explorer/explorerView.ts
function resultBar(move) {
  const sum = move.white + move.draws + move.black;
  const section = (key) => {
    const percent = move[key] * 100 / sum;
    return hl(
      "span." + key,
      { attrs: { style: "width: " + Math.round(move[key] * 1e3 / sum) / 10 + "%" } },
      percent > 12 ? Math.round(percent) + (percent > 20 ? "%" : "") : ""
    );
  };
  return hl("div.bar", ["white", "draws", "black"].map(section));
}
function showMoveTable(ctrl, data) {
  if (!data.moves.length) return null;
  const sumTotal = data.white + data.black + data.draws;
  const movesWithCurrent = data.moves.length > 1 ? [
    ...data.moves,
    {
      white: data.white,
      black: data.black,
      draws: data.draws,
      uci: "",
      san: "\u03A3"
    }
  ] : data.moves;
  return hl("table.moves", [
    hl("thead", [
      hl("tr", [
        hl("th", i18n.site.move),
        hl("th", { attrs: { colspan: 2 } }, i18n.site.games),
        hl("th", i18n.site.whiteDrawBlack)
      ])
    ]),
    hl(
      "tbody",
      moveArrowAttributes(ctrl, { fen: data.fen, onClick: (_, uci) => uci && ctrl.explorerMove(uci) }),
      movesWithCurrent.map((move) => {
        const total = move.white + move.draws + move.black;
        return hl(`tr${move.uci ? "" : ".sum"}`, { key: move.uci, attrs: { "data-uci": move.uci } }, [
          hl(
            "td",
            { attrs: { title: move.opening ? `${move.opening.eco}: ${move.opening.name}` : "" } },
            move.san
          ),
          hl("td", (total / sumTotal * 100).toFixed(0) + "%"),
          hl("td", bigNumberFormatter ? bigNumberFormatter.format(total) : numberFormat(total)),
          hl("td", { attrs: { title: moveStatsTooltip(ctrl, move) } }, resultBar(move))
        ]);
      })
    )
  ]);
}
var bigNumberFormatter = window.Intl && Intl.NumberFormat ? new Intl.NumberFormat(displayLocale, { notation: "compact" }) : null;
function moveStatsTooltip(ctrl, move) {
  if (!move.uci) return "Total";
  if (move.game) {
    const g = move.game;
    const result = g.winner === "white" ? "1-0" : g.winner === "black" ? "0-1" : "\xBD-\xBD";
    return ctrl.explorer.opts.showRatings ? `${g.white.name} (${g.white.rating}) ${result} ${g.black.name} (${g.black.rating})` : `${g.white.name} ${result} ${g.black.name}`;
  }
  if (ctrl.explorer.opts.showRatings) {
    if (move.averageRating) return i18n.site.averageRatingX(move.averageRating);
    if (move.averageOpponentRating)
      return `Performance rating: ${move.performance}, average opponent: ${move.averageOpponentRating}`;
  }
  return "";
}
var showResult = (winner) => winner === "white" ? hl("result.white", "1-0") : winner === "black" ? hl("result.black", "0-1") : hl("result.draws", "\xBD-\xBD");
function showGameTable(ctrl, fen, title, games2) {
  if (!ctrl.explorer.withGames || !games2.length) return null;
  const openedId = ctrl.explorer.gameMenu();
  const isMasters = ctrl.explorer.db() === "masters";
  return hl("table.games", [
    hl("thead", [hl("tr", [hl("th.title", { attrs: { colspan: isMasters ? 4 : 5 } }, title)])]),
    hl(
      "tbody",
      moveArrowAttributes(ctrl, {
        fen,
        onClick: (e) => {
          var _a2;
          const $tr = $(e.target).parents("tr");
          if (!$tr.length) return;
          const id = $tr.data("id");
          if ((_a2 = ctrl.study) == null ? void 0 : _a2.members.canContribute()) {
            ctrl.explorer.gameMenu(id);
            ctrl.redraw();
          } else openGame(ctrl, id);
        }
      }),
      games2.map(
        (game) => openedId === game.id ? gameActions(ctrl, game) : hl("tr", { key: game.id, attrs: { "data-id": game.id, "data-uci": game.uci || "" } }, [
          ctrl.explorer.opts.showRatings && hl(
            "td.game-rating",
            [game.white, game.black].map((p) => hl("span", p.rating))
          ),
          hl(
            "td",
            [game.white, game.black].map((p) => hl("span", p.name))
          ),
          hl("td", showResult(game.winner)),
          hl("td.game-date", game.month || game.year),
          !isMasters && hl("td.game-type", game.speed && icon(perfIcons_default[game.speed])({ title: ucfirst(game.speed) }))
        ])
      )
    )
  ]);
}
function openGame(ctrl, gameId) {
  const orientation = ctrl.chessground.state.orientation, fenParam = ctrl.node.ply > 0 ? "?fen=" + ctrl.node.fen : "";
  let url2 = "/" + gameId + "/" + orientation + fenParam;
  if (ctrl.explorer.db() === "masters") url2 = "/import/master" + url2;
  window.open(url2, "_blank");
}
function gameActions(ctrl, game) {
  const send = (insert) => {
    ctrl.study.explorerGame(game.id, insert);
    ctrl.explorer.gameMenu(null);
    ctrl.redraw();
  };
  return hl("tr", { key: game.id + "-m" }, [
    hl("td.game_menu", { attrs: { colspan: ctrl.explorer.db() === "masters" ? 4 : 5 } }, [
      hl(
        "div.game_title",
        `${game.white.name} - ${game.black.name}, ${showResult(game.winner).text}, ${game.year}`
      ),
      hl("div.menu", [
        hl(
          "a.text",
          { attrs: dataIcon(licon.Eye), hook: bind("click", () => openGame(ctrl, game.id)) },
          "View"
        ),
        ctrl.study && hl(
          "a.text",
          { attrs: dataIcon(licon.BubbleSpeech), hook: bind("click", () => send(false), ctrl.redraw) },
          "Cite"
        ),
        ctrl.study && hl(
          "a.text",
          { attrs: dataIcon(licon.PlusButton), hook: bind("click", () => send(true), ctrl.redraw) },
          "Insert"
        ),
        hl(
          "a.text",
          { attrs: dataIcon(licon.X), hook: bind("click", () => ctrl.explorer.gameMenu(null), ctrl.redraw) },
          "Close"
        )
      ])
    ])
  ]);
}
var closeButton = (ctrl) => hl(
  "button.button.button-empty.text",
  { attrs: dataIcon(licon.X), hook: bind("click", ctrl.toggleExplorer, ctrl.redraw) },
  i18n.site.close
);
var showEmpty = (ctrl, data) => {
  const isTooDeep = ctrl.explorer.root.node.ply >= MAX_ANALYSE_DEPTH;
  return hl("div.data.empty", [
    explorerTitle(ctrl),
    openingTitle(ctrl, data),
    hl("div.message", [
      hl("strong", isTooDeep ? i18n.site.maxDepthReached : i18n.site.noGameFound),
      (data == null ? void 0 : data.queuePosition) ? hl("p.explanation", `Indexing ${data.queuePosition} other players first ...`) : !(ctrl.explorer.config.fullHouse() || isTooDeep) && hl("p.explanation", i18n.site.maybeIncludeMoreGamesFromThePreferencesMenu)
    ])
  ]);
};
var showGameEnd = (ctrl, title) => hl("div.data.empty", [
  hl("div.title", i18n.site.gameOver),
  hl("div.message", [icon(licon.InfoCircle)(), hl("h3", title), closeButton(ctrl)])
]);
var openingTitle = (ctrl, data) => {
  const opening = data == null ? void 0 : data.opening;
  if (opening) {
    const title = `${opening.eco} ${opening.name}`;
    return hl(
      "div.title",
      { attrs: { title } },
      hl("a", { attrs: { href: `/opening/${opening.name}`, target: "_blank" } }, title)
    );
  }
  return hl("div.title", showTitle(ctrl.data.game.variant));
};
var lastShow;
var clearLastShow = () => {
  lastShow = void 0;
};
function show(ctrl) {
  const data = ctrl.explorer.current();
  if (data && isOpening(data)) {
    if (!ctrl.explorer.isAuth()) return showAnon(ctrl);
    const moveTable = showMoveTable(ctrl, data);
    const recentTable = showGameTable(ctrl, data.fen, i18n.site.recentGames, data.recentGames || []);
    const topTable = showGameTable(ctrl, data.fen, i18n.site.topGames, data.topGames || []);
    if (moveTable || recentTable || topTable)
      lastShow = hl("div.data", [
        explorerTitle(ctrl),
        (data == null ? void 0 : data.opening) && openingTitle(ctrl, data),
        moveTable,
        topTable,
        recentTable
      ]);
    else lastShow = showEmpty(ctrl, data);
  } else if (data && isTablebase(data)) {
    const row = (category, title, tooltip) => showTablebase(
      ctrl,
      data.fen,
      title,
      tooltip,
      data.moves.filter((m) => m.category === category)
    );
    if (data.moves.length)
      lastShow = hl("div.data", [
        row("loss", i18n.site.winning),
        row("unknown", i18n.site.unknown),
        row("syzygy-loss", i18n.site.winOr50MovesByPriorMistake, i18n.site.unknownDueToRounding),
        row("maybe-loss", "Win or 50 moves"),
        row("blessed-loss", i18n.site.winPreventedBy50MoveRule),
        row("draw", i18n.site.drawn),
        row("cursed-win", i18n.site.lossSavedBy50MoveRule),
        row("maybe-win", "Loss or 50 moves"),
        row("syzygy-win", i18n.site.lossOr50MovesByPriorMistake, i18n.site.unknownDueToRounding),
        row("win", i18n.site.losing)
      ]);
    else if (data.checkmate) lastShow = showGameEnd(ctrl, i18n.site.checkmate);
    else if (data.stalemate) lastShow = showGameEnd(ctrl, i18n.site.stalemate);
    else if (data.variant_win || data.variant_loss) lastShow = showGameEnd(ctrl, "variantEnding");
    else lastShow = showEmpty(ctrl);
  }
  return lastShow;
}
var explorerTitle = (ctrl) => {
  const explorer = ctrl.explorer;
  const config = explorer.config;
  const configOpened = config.data.open();
  const playerName = config.data.playerName.value();
  const masterDbExplanation = i18n.site.masterDbExplanation(2200, "1952", "2026-01");
  const db = explorer.db();
  const data = explorer.current();
  const queuePosition = data && isOpening(data) && data.queuePosition;
  const otherLink = (name, title) => hl(
    "button.button-link",
    {
      key: name,
      attrs: { title },
      hook: bind(
        "click",
        () => {
          var _a2;
          config.data.db(name.toLowerCase());
          (_a2 = document.querySelector(".explorer-box")) == null ? void 0 : _a2.scrollTo({
            top: 0
          });
        },
        explorer.reload
      )
    },
    name
  );
  const active = (nodes, title, icon2) => hl(
    "span.active.text." + db,
    {
      attrs: { title, ...dataIcon(icon2) },
      hook: db === "player" ? bind("click", config.toggleColor, explorer.reload) : void 0
    },
    nodes
  );
  return hl("div.explorer-title", [
    db === "masters" ? active([hl("strong", "Masters"), " database"], masterDbExplanation, licon.Book) : explorer.config.allDbs.includes("masters") && otherLink("Masters", masterDbExplanation),
    db === "lichess" ? active([hl("strong", "Lichess"), " database"], i18n.site.lichessDbExplanation, licon.Logo) : otherLink("Lichess", i18n.site.lichessDbExplanation),
    db === "player" ? playerName ? active(
      [
        hl(`strong${playerName.length > 14 ? ".long" : ""}`, playerName),
        ` ${i18n.site[config.data.color() === "white" ? "asWhite" : "asBlack"]}`,
        explorer.isIndexing() && !configOpened && hl("icon.ddloader", {
          attrs: {
            title: queuePosition ? `Indexing ${queuePosition} other players first ...` : "Indexing ..."
          }
        })
      ],
      i18n.site.switchSides,
      licon.User
    ) : active([hl("strong", "Player"), " database"], "", licon.User) : hl(
      "button.button-link.player",
      {
        key: "player",
        hook: bind(
          "click",
          () => {
            config.selectPlayer(playerName || "me");
            if (explorer.db() !== "player") {
              config.data.db("player");
              config.data.open(true);
            }
          },
          explorer.reload
        )
      },
      i18n.site.player
    ),
    hl("button.fbt.toconf", {
      attrs: {
        "aria-label": configOpened ? "Close configuration" : "Open configuration",
        ...dataIcon(configOpened ? licon.X : licon.Gear)
      },
      hook: bind("click", () => config.toggleOpen(), ctrl.redraw)
    })
  ]);
};
var showTitle = (variant) => ["standard", "fromPosition"].includes(variant.key) ? i18n.site.openingExplorer : i18n.site.xOpeningExplorer(variant.name);
var showConfig = (ctrl) => hl("div.config", [explorerTitle(ctrl), view(ctrl.explorer.config)]);
var showFailing = (ctrl) => {
  var _a2;
  return hl("div.data.empty", [
    explorerTitle(ctrl),
    hl("div.message", [
      hl("h3", "Oops, sorry!"),
      hl("p.explanation", (_a2 = ctrl.explorer.failing()) == null ? void 0 : _a2.toString()),
      closeButton(ctrl)
    ])
  ]);
};
var showAnon = (ctrl) => hl("div.data.empty", [
  hl("div.title", i18n.site.openingExplorer),
  hl("div.message", [
    hl("p.explanation", i18n.site.youNeedAnAccountToDoThat),
    hl(
      "a.button.button-empty.text",
      { attrs: { ...dataIcon(licon.Checkmark), href: "/signup" } },
      i18n.site.signUp
    ),
    closeButton(ctrl)
  ])
]);
var lastFen = "";
function explorerView_default(ctrl) {
  const { explorer } = ctrl;
  if (!explorer.enabled()) return void 0;
  const data = explorer.current();
  const configOpened = explorer.config.data.open();
  const loading = !configOpened && (explorer.loading() || !data && !explorer.failing());
  const content = configOpened ? showConfig(ctrl) : explorer.failing() ? showFailing(ctrl) : show(ctrl);
  return hl(
    `section.explorer-box.sub-box${configOpened ? ".explorer__config" : ""}`,
    {
      class: { loading, reduced: !configOpened && (!!explorer.failing() || explorer.movesAway() > 2) },
      hook: {
        ...onInsert((elem) => {
          elem.scrollTop = 0;
        }),
        postpatch(_, vnode) {
          if (!data || lastFen === data.fen) return;
          vnode.elm.scrollTop = 0;
          lastFen = data.fen;
        }
      }
    },
    [hl("div.overlay"), content]
  );
}

// ../analyse/src/ground.ts
var render = (ctrl) => h("div.cg-wrap.cgv" + ctrl.cgVersion.js, {
  hook: onInsert((elem) => ctrl.setChessground(Chessground(elem, makeConfig(ctrl))))
});
function makeConfig(ctrl) {
  var _a2;
  const d = ctrl.data, pref = d.pref, opts = ctrl.makeCgOpts();
  const config = {
    turnColor: opts.turnColor,
    fen: opts.fen,
    check: opts.check,
    lastMove: opts.lastMove,
    orientation: ctrl.bottomColor(),
    coordinates: pref.coords !== Coords.Hidden,
    coordinatesOnSquares: pref.coords === Coords.All,
    addPieceZIndex: pref.is3d,
    addDimensionsCssVarsTo: document.body,
    touchIgnoreRadius: 0,
    viewOnly: false,
    jsHover: isSafari(),
    movable: {
      free: false,
      color: opts.movable.color,
      dests: opts.movable.dests,
      showDests: pref.destination,
      rookCastle: pref.rookCastle
    },
    events: {
      move: ctrl.userMove,
      dropNewPiece: ctrl.userNewPiece,
      insert(elements) {
        resizeHandle(elements, ShowResizeHandle.Always, ctrl.node.ply);
      }
    },
    premovable: {
      enabled: opts.premovable.enabled,
      showDests: pref.destination,
      events: {
        set: ctrl.onPremoveSet
      }
    },
    draggable: {
      enabled: pref.moveEvent !== MoveEvent.Click,
      showGhost: pref.highlight
    },
    selectable: {
      enabled: pref.moveEvent !== MoveEvent.Drag
    },
    drawable: {
      enabled: true,
      eraseOnMovablePieceClick: !ctrl.opts.study || !!ctrl.opts.practice,
      defaultSnapToValidMove: storage.boolean("arrow.snap").getOrDefault(true)
    },
    highlight: {
      lastMove: pref.highlight,
      check: pref.highlight
    },
    animation: {
      duration: pref.animationDuration
    },
    disableContextMenu: true
  };
  (_a2 = ctrl.study) == null ? void 0 : _a2.mutateCgConfig(config);
  return config;
}

// ../analyse/src/study/studyXhr.ts
var reload = (baseUrl2, id, chapterId, withChapters = false) => {
  let url2 = `/${baseUrl2}/${id}`;
  if (chapterId) url2 += "/" + chapterId;
  if (withChapters) url2 += "?chapters=1";
  return json(url2);
};
var variants = () => json("/variant", { cache: "default" });
var glyphs = () => json(`/study/glyphs/${document.documentElement.lang}.json`, { cache: "default" });
var chapterConfig = (studyId, chapterId) => json(`/study/${studyId}/${chapterId}/config`);
var practiceComplete = (chapterId, nbMoves) => text(`/practice/complete/${chapterId}/${nbMoves}`, {
  method: "POST"
});
var importPgn = async (studyId, data) => {
  const res = await textRaw(`/study/${studyId}/import-pgn?sri=${site.sri}`, {
    method: "POST",
    body: form(data)
  });
  return ensureOk(res).then((r) => r.text());
};

// ../analyse/src/study/chapterNewForm.ts
var modeChoices = [
  ["normal", i18n.study.normalAnalysis],
  ["practice", i18n.site.practiceWithComputer],
  ["conceal", i18n.study.hideNextMoves],
  ["gamebook", i18n.study.interactiveLesson]
];
var fieldValue = (e, id) => {
  var _a2;
  return (_a2 = e.target.querySelector("#chapter-" + id)) == null ? void 0 : _a2.value;
};
var StudyChapterNewForm = class {
  constructor(send, chapters, isBroadcast, setChaptersTab, root, currentChapter) {
    this.send = send;
    this.chapters = chapters;
    this.isBroadcast = isBroadcast;
    this.setChaptersTab = setChaptersTab;
    this.root = root;
    this.currentChapter = currentChapter;
    this.multiPgnMax = 64;
    this.variants = [];
    this.isOpen = toggle(false, (val) => {
      var _a2;
      if (!val) (_a2 = this.dialog) == null ? void 0 : _a2.close();
    });
    this.initial = toggle(false);
    this.tab = storedProp("analyse.study.form.tab", "init", (str) => str);
    this.editor = null;
    this.editorFen = prop(null);
    this.isDefaultName = toggle(true);
    this.chess960Position = prop(518);
    // 518 = standard chess starting position
    this.selectedVariant = prop("standard");
    this.open = () => {
      pubsub.emit("analysis.closeAll");
      this.orientation = this.root.bottomColor();
      this.isOpen(true);
      this.loadVariants();
      this.initial(false);
      this.isDefaultName(true);
      this.selectedVariant(this.currentChapter().setup.variant.key);
      this.chess960Position(518);
    };
    this.toggle = () => this.isOpen() ? this.isOpen(false) : this.open();
    this.setTab = (key) => {
      this.tab(key);
      if (key !== "pgn" && this.orientation === "automatic") this.orientation = "white";
      this.root.redraw();
    };
    this.loadVariants = () => {
      if (!this.variants.length)
        variants().then((vs) => {
          this.variants = vs;
          this.redraw();
        });
    };
    this.openInitial = () => {
      this.open();
      this.initial(true);
    };
    this.submit = (d) => {
      const study = this.root.study;
      const showRatings = study.data.showRatings ? void 0 : false;
      const dd = { ...d, sticky: study.vm.mode.sticky, showRatings, initial: this.initial() };
      if (!dd.pgn) this.send("addChapter", dd);
      else
        importPgn(study.data.id, dd).catch((e) => {
          if (e.message === "Too many requests") alert("Limit of 1000 pgn imports every 24 hours");
          if (e.message === "Too many chapters")
            alert("You have reached the maximum number of chapters (64). Some of the games were not imported.");
          throw e;
        });
      this.isOpen(false);
      this.setChaptersTab();
    };
    this.startTour = async () => {
      const [tour] = await Promise.all([
        site.asset.loadEsm("analyse.study.tour"),
        site.asset.loadCssPath("bits.shepherd")
      ]);
      tour.chapter((tab) => {
        this.tab(tab);
        this.redraw();
      });
    };
    this.redraw = this.root.redraw;
    pubsub.on("analysis.closeAll", () => this.isOpen(false));
    this.orientation = root.bottomColor();
  }
};
function view2(ctrl) {
  const study = ctrl.root.study;
  const activeTab = ctrl.tab();
  const makeTab = (key, name, title) => hl(
    "button." + key,
    {
      class: { active: activeTab === key },
      attrs: { type: "button", role: "tab", title, tabindex: "0" },
      hook: onInsert((el) => {
        el.addEventListener("click", (e) => {
          ctrl.setTab(key);
          e.preventDefault();
        });
      })
    },
    name
  );
  const gameOrPgn = activeTab === "game" || activeTab === "pgn";
  const currentChapter = study.data.chapter;
  const mode = currentChapter.practice ? "practice" : defined(currentChapter.conceal) ? "conceal" : currentChapter.gamebook ? "gamebook" : "normal";
  return snabDialog({
    class: "chapter-new",
    onClose() {
      ctrl.dialog = void 0;
      ctrl.isOpen(false);
      ctrl.redraw();
    },
    modal: true,
    onInsert: (dlg) => {
      ctrl.dialog = dlg;
      dlg.show();
    },
    vnodes: [
      activeTab !== "edit" && hl("h2", [
        i18n.study.newChapter,
        hl("icon.help", { attrs: dataIcon(licon.InfoCircle), hook: bind("click", ctrl.startTour) })
      ]),
      hl(
        "form.form3",
        {
          hook: bindSubmit((e) => {
            const tab = ctrl.tab();
            ctrl.submit({
              name: fieldValue(e, "name"),
              game: fieldValue(e, "game"),
              variant: fieldValue(e, "variant"),
              pgn: fieldValue(e, "pgn"),
              orientation: fieldValue(e, "orientation"),
              mode: fieldValue(e, "mode"),
              fen: tab === "init" && ctrl.selectedVariant() === "chess960" ? chess960IdToFEN(ctrl.chess960Position()) : fieldValue(e, "fen") || (tab === "edit" ? ctrl.editorFen() : null),
              isDefaultName: ctrl.isDefaultName()
            });
          }, ctrl.redraw)
        },
        [
          hl("div.form-group", [
            hl("label.form-label", { attrs: { for: "chapter-name" } }, i18n.site.name),
            hl("input#chapter-name.form-control", {
              attrs: { minlength: 2, maxlength: 80 },
              hook: onInsert((el) => {
                if (!el.value) {
                  el.value = i18n.study.chapterX(ctrl.initial() ? 1 : ctrl.chapters.size() + 1);
                  el.onchange = () => ctrl.isDefaultName(false);
                  el.select();
                }
                el.addEventListener("focus", () => el.select());
                setTimeout(() => el.focus());
              })
            })
          ]),
          hl("div.tabs-horiz", { attrs: { role: "tablist" } }, [
            makeTab("init", i18n.study.empty, i18n.study.startFromInitialPosition),
            makeTab("edit", i18n.study.editor, i18n.study.startFromCustomPosition),
            makeTab("game", "URL", i18n.study.loadAGameByUrl),
            makeTab("fen", "FEN", i18n.study.loadAPositionFromFen),
            makeTab("pgn", "PGN", i18n.study.loadAGameFromPgn)
          ]),
          activeTab === "edit" && hl(
            "div.board-editor-wrap",
            {
              hook: {
                insert(vnode) {
                  json("/editor.json").then(async (data) => {
                    data.el = vnode.elm;
                    data.fen = ctrl.root.node.fen;
                    data.embed = true;
                    data.options = {
                      inlineCastling: true,
                      orientation: ctrl.orientation,
                      onChange: ctrl.editorFen,
                      coordinates: true,
                      bindHotkeys: false
                    };
                    ctrl.editor = await site.asset.loadEsm("editor", { init: data });
                    ctrl.editorFen(ctrl.editor.getFen());
                    ctrl.editor.setVariant(currentChapter.setup.variant.key);
                  });
                },
                destroy: () => ctrl.editor = null
              }
            },
            [spinnerVdom()]
          ),
          activeTab === "game" && hl("div.form-group", [
            hl("label.form-label", { attrs: { for: "chapter-game" } }, "Load Lichess games"),
            hl("textarea#chapter-game.form-control", {
              attrs: { placeholder: i18n.study.urlOfTheGame },
              hook: onInsert((el) => {
                el.addEventListener("change", () => el.reportValidity());
                el.addEventListener("input", () => {
                  const ok = el.value.trim().split("\n").every(
                    (line) => line.trim().match(
                      new RegExp(
                        `^((.*${location.host}/\\w{8,12}.*)|\\w{8}|\\w{12}|(.*chessgames\\.com/.*[?&]gid=\\d+.*)|)$`
                      )
                    )
                  );
                  el.setCustomValidity(ok ? "" : "Invalid game ID(s) or URL(s)");
                });
              })
            })
          ]),
          activeTab === "fen" && hl("div.form-group", [
            hl("input#chapter-fen.form-control", {
              attrs: {
                value: ctrl.root.node.fen,
                placeholder: i18n.study.loadAPositionFromFen,
                spellcheck: "false"
              },
              hook: onInsert((el) => {
                el.addEventListener("change", () => el.reportValidity());
                el.addEventListener("input", (_) => {
                  if (parseFen(el.value.trim()).isOk) {
                    el.setCustomValidity("");
                    ctrl.root.node.fen = el.value;
                  } else el.setCustomValidity("Invalid FEN");
                });
              })
            }),
            hl(
              "a.preview-in-editor",
              {
                hook: bind("click", () => ctrl.tab("edit"), ctrl.root.redraw)
              },
              [icon(licon.Eye)(".text"), i18n.study.editor]
            )
          ]),
          activeTab === "pgn" && hl("div.form-group", [
            hl("textarea#chapter-pgn.form-control", {
              attrs: {
                placeholder: i18n.study.pasteYourPgnTextHereUpToNbGames(ctrl.multiPgnMax)
              }
            }),
            hl(
              "button.button.button-empty.import-from__chapter",
              {
                attrs: { type: "button" },
                hook: bind(
                  "click",
                  () => {
                    text(`/study/${study.data.id}/${study.vm.chapterId}.pgn`).then(
                      (pgnData) => $("#chapter-pgn").val(pgnData)
                    );
                    return false;
                  },
                  void 0,
                  false
                )
              },
              i18n.study.importFromChapterX(study.currentChapter().name)
            ),
            window.FileReader && hl("input#chapter-pgn-file.form-control", {
              attrs: { type: "file", accept: ".pgn" },
              hook: bind("change", (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = function() {
                  document.getElementById("chapter-pgn").value = reader.result;
                };
                reader.readAsText(file);
              })
            })
          ]),
          hl("div.form-split", [
            hl("div.form-group.form-half", [
              hl("label.form-label", { attrs: { for: "chapter-variant" } }, i18n.site.variant),
              hl(
                "select#chapter-variant.form-control",
                {
                  attrs: { disabled: gameOrPgn },
                  hook: bind("change", (e) => {
                    var _a2;
                    const v = e.target.value;
                    (_a2 = ctrl.editor) == null ? void 0 : _a2.setVariant(v);
                    ctrl.selectedVariant(v);
                    if (v !== "chess960") ctrl.chess960Position(518);
                    ctrl.redraw();
                  })
                },
                gameOrPgn ? [hl("option", { attrs: { value: "standard" } }, i18n.study.automatic)] : ctrl.variants.map((v) => option(v.key, currentChapter.setup.variant.key, v.name))
              )
            ]),
            hl("div.form-group.form-half", [
              hl("label.form-label", { attrs: { for: "chapter-orientation" } }, i18n.study.orientation),
              hl(
                "select#chapter-orientation.form-control",
                {
                  hook: bind("change", (e) => {
                    var _a2;
                    ctrl.orientation = e.target.value;
                    (_a2 = ctrl.editor) == null ? void 0 : _a2.setOrientation(ctrl.orientation);
                  })
                },
                [
                  ...activeTab === "pgn" ? [["automatic", i18n.study.automatic]] : [],
                  ["white", i18n.site.white],
                  ["black", i18n.site.black]
                ].map(([value, name]) => value && option(value, ctrl.orientation, name, { key: value }))
              )
            ])
          ]),
          activeTab === "init" && ctrl.selectedVariant() === "chess960" && hl("div.form-group.chess960-position", [
            hl("label.form-label", i18n.site.chess960StartPosition(ctrl.chess960Position())),
            hl("div.chess960-position__inputs", [
              hl("input.form-control", {
                attrs: { type: "number", min: 0, max: 959, value: ctrl.chess960Position() },
                hook: onInsert((el) => {
                  el.addEventListener("input", () => {
                    const pos = parseInt(el.value);
                    if (!isNaN(pos) && pos >= 0 && pos <= 959) {
                      ctrl.chess960Position(pos);
                      ctrl.redraw();
                    }
                  });
                })
              }),
              hl("button.button.button-empty", {
                attrs: {
                  type: "button",
                  title: i18n.site.randomChess960Position,
                  ...dataIcon(licon.DieSix)
                },
                hook: bind("click", () => {
                  ctrl.chess960Position(randomPositionId());
                  ctrl.redraw();
                })
              })
            ])
          ]),
          hl("div.form-group" + (ctrl.isBroadcast ? ".none" : ""), [
            hl("label.form-label", { attrs: { for: "chapter-mode" } }, i18n.study.analysisMode),
            hl(
              "select#chapter-mode.form-control",
              modeChoices.map((c) => option(c[0], mode, c[1]))
            )
          ]),
          hl(
            "div.form-actions.single",
            hl("button.button", { attrs: { type: "submit" } }, i18n.study.createChapter)
          )
        ]
      )
    ]
  });
}

// ../analyse/src/study/chapterEditForm.ts
var StudyChapterEditForm = class {
  constructor(send, chapterConfig2, isBroadcast, redraw) {
    this.send = send;
    this.chapterConfig = chapterConfig2;
    this.isBroadcast = isBroadcast;
    this.redraw = redraw;
    this.current = prop(null);
    this.open = (data) => {
      this.current(data);
      this.chapterConfig(data.id).then((d) => {
        this.current(d);
        this.redraw();
      });
    };
    this.isEditing = (id) => {
      var _a2;
      return ((_a2 = this.current()) == null ? void 0 : _a2.id) === id;
    };
    this.toggle = (data) => {
      if (this.isEditing(data.id)) this.current(null);
      else this.open(data);
    };
    this.submit = (data) => {
      const c = this.current();
      if (c) {
        this.send("editChapter", { id: c.id, ...data });
        this.current(null);
      }
    };
    this.delete = (id) => {
      this.send("deleteChapter", id);
      this.current(null);
    };
    this.clearAnnotations = (id) => {
      this.send("clearAnnotations", id);
      this.current(null);
    };
    this.clearVariations = (id) => {
      this.send("clearVariations", id);
      this.current(null);
    };
  }
};
function view3(ctrl) {
  const data = ctrl.current();
  return data ? snabDialog({
    class: "edit-" + data.id,
    // full redraw when changing chapter
    onClose() {
      ctrl.current(null);
      ctrl.redraw();
    },
    modal: true,
    vnodes: [
      h("h2", i18n.study.editChapter),
      h(
        "form.form3",
        {
          hook: bindSubmit((e) => {
            ctrl.submit({
              name: fieldValue(e, "name"),
              mode: fieldValue(e, "mode"),
              orientation: fieldValue(e, "orientation"),
              description: fieldValue(e, "description")
            });
          }, ctrl.redraw)
        },
        [
          h("div.form-group", [
            h("label.form-label", { attrs: { for: "chapter-name" } }, i18n.site.name),
            h("input#chapter-name.form-control", {
              attrs: { minlength: 2, maxlength: 80 },
              hook: onInsert((el) => {
                if (!el.value) {
                  el.value = data.name;
                  el.select();
                  el.focus();
                }
              })
            })
          ]),
          ...isLoaded(data) ? viewLoaded(ctrl, data) : [spinnerVdom()]
        ]
      )
    ]
  }) : void 0;
}
var isLoaded = (data) => "orientation" in data;
function viewLoaded(ctrl, data) {
  const mode = data.practice ? "practice" : defined(data.conceal) ? "conceal" : data.gamebook ? "gamebook" : "normal";
  return [
    h("div.form-split", [
      h("div.form-group.form-half", [
        h("label.form-label", { attrs: { for: "chapter-orientation" } }, i18n.study.orientation),
        h(
          "select#chapter-orientation.form-control",
          COLORS.map((color) => option(color, data.orientation, i18n.site[color]))
        )
      ]),
      h("div.form-group.form-half" + (ctrl.isBroadcast ? ".none" : ""), [
        h("label.form-label", { attrs: { for: "chapter-mode" } }, i18n.study.analysisMode),
        h(
          "select#chapter-mode.form-control",
          modeChoices.map((c) => option(c[0], mode, c[1]))
        )
      ])
    ]),
    h("div.form-group" + (ctrl.isBroadcast ? ".none" : ""), [
      h("label.form-label", { attrs: { for: "chapter-description" } }, i18n.study.pinnedChapterComment),
      h(
        "select#chapter-description.form-control",
        [
          ["", i18n.study.noPinnedComment],
          ["1", i18n.study.rightUnderTheBoard]
        ].map((v) => option(v[0], data.description ? "1" : "", v[1]))
      )
    ]),
    h("div.form-actions-secondary.destructive", [
      h(
        emptyRedButton,
        {
          hook: bind(
            "click",
            async () => {
              if (await confirm(i18n.study.clearAllCommentsInThisChapter)) ctrl.clearAnnotations(data.id);
            },
            ctrl.redraw
          ),
          attrs: { type: "button", title: i18n.study.clearAllCommentsInThisChapter }
        },
        i18n.study.clearAnnotations
      ),
      h(
        emptyRedButton,
        {
          hook: bind(
            "click",
            async () => {
              if (await confirm(i18n.study.clearVariations)) ctrl.clearVariations(data.id);
            },
            ctrl.redraw
          ),
          attrs: { type: "button" }
        },
        i18n.study.clearVariations
      )
    ]),
    h("div.form-actions", [
      h(
        emptyRedButton,
        {
          hook: bind(
            "click",
            async () => {
              if (await confirm(i18n.study.deleteThisChapter)) ctrl.delete(data.id);
            },
            ctrl.redraw
          ),
          attrs: { type: "button", title: i18n.study.deleteThisChapter }
        },
        i18n.study.deleteChapter
      ),
      h("button.button", { attrs: { type: "submit" } }, i18n.study.saveChapter)
    ])
  ];
}

// ../analyse/src/study/fideFeds.ts
var federations = {
  AFG: ["Afghanistan", "AF"],
  AHO: ["Netherlands Antilles", void 0],
  ALB: ["Albania", "AL"],
  ALG: ["Algeria", "DZ"],
  AND: ["Andorra", "AD"],
  ANG: ["Angola", "AO"],
  ANT: ["Antigua and Barbuda", "AG"],
  ARG: ["Argentina", "AR"],
  ARM: ["Armenia", "AM"],
  ARU: ["Aruba", "AW"],
  AUS: ["Australia", "AU"],
  AUT: ["Austria", "AT"],
  AZE: ["Azerbaijan", "AZ"],
  BAH: ["Bahamas", "BS"],
  BAN: ["Bangladesh", "BD"],
  BAR: ["Barbados", "BB"],
  BDI: ["Burundi", "BI"],
  BEL: ["Belgium", "BE"],
  BER: ["Bermuda", "BM"],
  BHU: ["Bhutan", "BT"],
  BIH: ["Bosnia & Herzegovina", "BA"],
  BIZ: ["Belize", "BZ"],
  BLR: ["Belarus", "BY"],
  BOL: ["Bolivia", "BO"],
  BOT: ["Botswana", "BW"],
  BRA: ["Brazil", "BR"],
  BRN: ["Bahrain", "BH"],
  BRU: ["Brunei Darussalam", "BN"],
  BUL: ["Bulgaria", "BG"],
  BUR: ["Burkina Faso", "BF"],
  CAF: ["Central African Republic", "CF"],
  CAM: ["Cambodia", "KH"],
  CAN: ["Canada", "CA"],
  CAY: ["Cayman Islands", "KY"],
  CGO: ["Congo", "CG"],
  CHA: ["Chad", "TD"],
  CHI: ["Chile", "CL"],
  CHN: ["China", "CN"],
  CIV: ["Cote d\u2019Ivoire", "CI"],
  CMR: ["Cameroon", "CM"],
  COD: ["Democratic Republic of the Congo", "CD"],
  COL: ["Colombia", "CO"],
  COM: ["Comoros Islands", "KM"],
  CPV: ["Cape Verde", "CV"],
  CRC: ["Costa Rica", "CR"],
  CRO: ["Croatia", "HR"],
  CUB: ["Cuba", "CU"],
  CUR: ["Curacao", "CW"],
  CYP: ["Cyprus", "CY"],
  CZE: ["Czech Republic", "CZ"],
  DEN: ["Denmark", "DK"],
  DJI: ["Djibouti", "DJ"],
  DMA: ["Dominica", "DM"],
  DOM: ["Dominican Republic", "DO"],
  ECU: ["Ecuador", "EC"],
  EGY: ["Egypt", "EG"],
  ENG: ["England", void 0],
  ERI: ["Eritrea", "ER"],
  ESA: ["El Salvador", "SV"],
  ESP: ["Spain", "ES"],
  EST: ["Estonia", "EE"],
  ETH: ["Ethiopia", "ET"],
  FAI: ["Faroe Islands", "FO"],
  FID: ["FIDE", void 0],
  FIJ: ["Fiji", "FJ"],
  FIN: ["Finland", "FI"],
  FRA: ["France", "FR"],
  GAB: ["Gabon", "GA"],
  GAM: ["Gambia", "GM"],
  GCI: ["Guernsey", "GG"],
  GEO: ["Georgia", "GE"],
  GEQ: ["Equatorial Guinea", "GQ"],
  GER: ["Germany", "DE"],
  GHA: ["Ghana", "GH"],
  GRE: ["Greece", "GR"],
  GRL: ["Greenland", "GL"],
  GRN: ["Grenada", "GD"],
  GUA: ["Guatemala", "GT"],
  GUI: ["Guinea", "GN"],
  GUM: ["Guam", "GU"],
  GUY: ["Guyana", "GY"],
  HAI: ["Haiti", "HT"],
  HKG: ["Hong Kong, China", "HK"],
  HON: ["Honduras", "HN"],
  HUN: ["Hungary", "HU"],
  INA: ["Indonesia", "ID"],
  IND: ["India", "IN"],
  IOM: ["Isle of Man", "IM"],
  IRI: ["Iran", "IR"],
  IRL: ["Ireland", "IE"],
  IRQ: ["Iraq", "IQ"],
  ISL: ["Iceland", "IS"],
  ISR: ["Israel", "IL"],
  ISV: ["US Virgin Islands", "VI"],
  ITA: ["Italy", "IT"],
  IVB: ["British Virgin Islands", "VG"],
  JAM: ["Jamaica", "JM"],
  JCI: ["Jersey", "JE"],
  JOR: ["Jordan", "JO"],
  JPN: ["Japan", "JP"],
  KAZ: ["Kazakhstan", "KZ"],
  KEN: ["Kenya", "KE"],
  KGZ: ["Kyrgyzstan", "KG"],
  KIR: ["Kiribati", "KI"],
  KOR: ["South Korea", "KR"],
  KOS: ["Kosovo *", void 0],
  KSA: ["Saudi Arabia", "SA"],
  KUW: ["Kuwait", "KW"],
  LAO: ["Laos", "LA"],
  LAT: ["Latvia", "LV"],
  LBA: ["Libya", "LY"],
  LBN: ["Lebanon", "LB"],
  LBR: ["Liberia", "LR"],
  LCA: ["Saint Lucia", "LC"],
  LES: ["Lesotho", "LS"],
  LIE: ["Liechtenstein", "LI"],
  LTU: ["Lithuania", "LT"],
  LUX: ["Luxembourg", "LU"],
  MAC: ["Macau", "MO"],
  MAD: ["Madagascar", "MG"],
  MAR: ["Morocco", "MA"],
  MAS: ["Malaysia", "MY"],
  MAW: ["Malawi", "MW"],
  MDA: ["Moldova", "MD"],
  MDV: ["Maldives", "MV"],
  MEX: ["Mexico", "MX"],
  MGL: ["Mongolia", "MN"],
  MHL: ["Marshall Islands", "MH"],
  MKD: ["North Macedonia", "MK"],
  MLI: ["Mali", "ML"],
  MLT: ["Malta", "MT"],
  MNC: ["Monaco", "MC"],
  MNE: ["Montenegro", "ME"],
  MOZ: ["Mozambique", "MZ"],
  MRI: ["Mauritius", "MU"],
  MTN: ["Mauritania", "MR"],
  MYA: ["Myanmar", "MM"],
  NAM: ["Namibia", "NA"],
  NCA: ["Nicaragua", "NI"],
  NCL: ["New Caledonia", "NC"],
  NED: ["Netherlands", "NL"],
  NEP: ["Nepal", "NP"],
  NGR: ["Nigeria", "NG"],
  NIG: ["Niger", "NE"],
  NOR: ["Norway", "NO"],
  NRU: ["Nauru", "NR"],
  NZL: ["New Zealand", "NZ"],
  OMA: ["Oman", "OM"],
  PAK: ["Pakistan", "PK"],
  PAN: ["Panama", "PA"],
  PAR: ["Paraguay", "PY"],
  PER: ["Peru", "PE"],
  PHI: ["Philippines", "PH"],
  PLE: ["Palestine", "PS"],
  PLW: ["Palau", "PW"],
  PNG: ["Papua New Guinea", "PG"],
  POL: ["Poland", "PL"],
  POR: ["Portugal", "PT"],
  PUR: ["Puerto Rico", "PR"],
  QAT: ["Qatar", "QA"],
  ROU: ["Romania", "RO"],
  RSA: ["South Africa", "ZA"],
  RUS: ["Russia", "RU"],
  RWA: ["Rwanda", "RW"],
  SCO: ["Scotland", void 0],
  SEN: ["Senegal", "SN"],
  SEY: ["Seychelles", "SC"],
  SGP: ["Singapore", "SG"],
  SKN: ["Saint Kitts and Nevis", "KN"],
  SLE: ["Sierra Leone", "SL"],
  SLO: ["Slovenia", "SI"],
  SMR: ["San Marino", "SM"],
  SOL: ["Solomon Islands", "SB"],
  SOM: ["Somalia", "SO"],
  SRB: ["Serbia", "RS"],
  SRI: ["Sri Lanka", "LK"],
  SSD: ["South Sudan", "SS"],
  STP: ["Sao Tome and Principe", "ST"],
  SUD: ["Sudan", "SD"],
  SUI: ["Switzerland", "CH"],
  SUR: ["Suriname", "SR"],
  SVK: ["Slovakia", "SK"],
  SWE: ["Sweden", "SE"],
  SWZ: ["Eswatini", "SZ"],
  SYR: ["Syria", "SY"],
  TAN: ["Tanzania", "TZ"],
  TGA: ["Tonga", "TO"],
  THA: ["Thailand", "TH"],
  TJK: ["Tajikistan", "TJ"],
  TKM: ["Turkmenistan", "TM"],
  TLS: ["Timor-Leste", "TL"],
  TOG: ["Togo", "TG"],
  TPE: ["Chinese Taipei", void 0],
  TTO: ["Trinidad and Tobago", "TT"],
  TUN: ["Tunisia", "TN"],
  TUR: ["Turkiye", "TR"],
  UAE: ["United Arab Emirates", "AE"],
  UGA: ["Uganda", "UG"],
  UKR: ["Ukraine", "UA"],
  URU: ["Uruguay", "UY"],
  USA: ["United States of America", "US"],
  UZB: ["Uzbekistan", "UZ"],
  VAN: ["Vanuatu", "VU"],
  VEN: ["Venezuela", "VE"],
  VIE: ["Vietnam", "VN"],
  VIN: ["Saint Vincent and the Grenadines", "VC"],
  WLS: ["Wales", void 0],
  YEM: ["Yemen", "YE"],
  ZAM: ["Zambia", "ZM"],
  ZIM: ["Zimbabwe", "ZW"]
};
var _a;
var displayFormatter = ((_a = window.Intl) == null ? void 0 : _a.DisplayNames) ? new Intl.DisplayNames(document.documentElement.lang, { type: "region" }) : void 0;
var localizedName = (fed) => {
  var _a2, _b;
  const isoAlpha2 = (_a2 = federations == null ? void 0 : federations[fed]) == null ? void 0 : _a2[1];
  return displayFormatter && isoAlpha2 && displayFormatter.of(isoAlpha2) || ((_b = federations[fed]) == null ? void 0 : _b[0]) || fed;
};

// ../analyse/src/study/studyChapters.ts
var StudyChapters = class {
  constructor(list) {
    this.list = list;
    this.all = () => this.list();
    this.get = (id) => {
      const str = id.toString();
      const number = str.length < 4 && parseInt(str);
      return number ? this.list()[number - 1] : this.list().find((c) => c.id === id);
    };
    this.size = () => this.list().length;
    this.first = () => this.list()[0];
    this.looksNew = () => {
      const cs = this.all();
      return cs.length === 1 && cs[0].name === "Chapter 1";
    };
  }
};
var StudyChaptersCtrl = class {
  constructor(initChapters, send, isBroadcast, setTab, chapterConfig2, root, currentChapter) {
    this.send = send;
    this.isBroadcast = isBroadcast;
    this.store = prop([]);
    this.localPaths = {};
    this.scroller = new StudyChapterScroller();
    this.sort = (ids) => this.send("sortChapters", ids);
    this.toggleNewForm = () => {
      if (this.newForm.isOpen() || this.list.size() < 64) this.newForm.toggle();
      else alert("You have reached the limit of 64 chapters per study. Please create a new study.");
    };
    this.loadFromServer = (chapters) => this.store(
      chapters.map((c) => ({
        ...c,
        fen: c.fen || INITIAL_FEN,
        players: c.players ? this.convertPlayersFromServer(c.players) : void 0,
        orientation: c.orientation || "white",
        playing: defined(c.lastMove) && c.status === "*",
        lastMoveAt: defined(c.thinkTime) ? Date.now() - 1e3 * c.thinkTime : void 0
      }))
    );
    this.convertPlayersFromServer = (players2) => {
      const conv = players2.map(convertPlayerFromServer);
      return { white: conv[0], black: conv[1] };
    };
    this.addNode = (d) => {
      var _a2, _b, _c;
      const pos = d.p, node = d.n;
      const cp = this.list.get(pos.chapterId);
      if (cp) {
        const onRelayPath = d.relayPath === d.p.path + d.n.id;
        if (onRelayPath || !d.relayPath) {
          cp.fen = node.fen;
          cp.lastMove = node.uci;
          cp.check = ((_a2 = node.san) == null ? void 0 : _a2.includes("#")) ? "#" : ((_b = node.san) == null ? void 0 : _b.includes("+")) ? "+" : void 0;
        }
        if (onRelayPath) {
          cp.lastMoveAt = Date.now();
          const playerWhoMoved = (_c = cp.players) == null ? void 0 : _c[opposite(fenColor(cp.fen))];
          if (playerWhoMoved) playerWhoMoved.clock = node.clock;
        }
      }
    };
    this.setTags = (id, tags) => {
      const chap = this.list.get(id), result = findTag(tags, "result");
      if (chap && result) chap.status = result.replace(/1\/2/g, "\xBD");
    };
    this.hasPlayingChapter = () => this.list.all().some((c) => c.playing);
    this.list = new StudyChapters(this.store);
    this.loadFromServer(initChapters);
    this.newForm = new StudyChapterNewForm(send, this.list, isBroadcast, setTab, root, currentChapter);
    this.editForm = new StudyChapterEditForm(send, chapterConfig2, isBroadcast, root.redraw);
  }
};
var convertPlayerFromServer = (player) => {
  var _a2, _b;
  const i18nName = player.fed && localizedName(player.fed);
  const fedName = player.fed && ((_b = (_a2 = federations) == null ? void 0 : _a2[player.fed]) == null ? void 0 : _b[0]);
  return {
    ...player,
    fed: player.fed && fedName ? { id: player.fed, name: fedName, i18nName } : void 0
  };
};
function isFinished(c) {
  const result = findTag(c.tags, "result");
  return !!result && result !== "*";
}
var findTag = (tags, name) => {
  var _a2;
  return (_a2 = tags.find((t) => t[0].toLowerCase() === name)) == null ? void 0 : _a2[1];
};
var looksLikeLichessGame = (tags) => {
  var _a2;
  return !!((_a2 = findTag(tags, "site")) == null ? void 0 : _a2.match(new RegExp(location.hostname + "/\\w{8}$")));
};
var gameLinkAttrs = (roundPath, game) => ({
  href: `${roundPath}/${game.id}`
});
var gameLinksListener = (select) => (elm) => elm.addEventListener(
  "click",
  async (e) => {
    var _a2;
    let target = e.target;
    while (target && target.tagName !== "A") target = target.parentNode;
    const href = target == null ? void 0 : target.href;
    const id = (target == null ? void 0 : target.dataset["board"]) || ((_a2 = href == null ? void 0 : href.match(/^[^?#]*/)) == null ? void 0 : _a2[0].slice(-8));
    if (id && select.is(id)) {
      if (!(href == null ? void 0 : href.match(/[?&]embed=/))) e.preventDefault();
      await select.set(id);
    }
  },
  { passive: false }
);
function onListUpdate({ chapters, members }, vnode) {
  const vData = vnode.data.li;
  const el = vnode.elm;
  chapters.scroller.scrollIfNeeded(el);
  if (members.canContribute() && chapters.list.size() > 1 && !vData.sortable) {
    site.asset.loadEsm("sortable.esm", { npm: true }).then((s) => {
      vData.sortable = s.create(el, {
        draggable: ".draggable",
        handle: "ontouchstart" in window ? "span" : void 0,
        onSort: () => chapters.sort(vData.sortable.toArray())
      });
    });
  }
}
function view4(ctrl) {
  const canContribute = ctrl.members.canContribute();
  const current = ctrl.currentChapter();
  return hl("div.study__chapters", [
    hl(
      "div.study-list",
      {
        hook: {
          insert(vnode) {
            vnode.elm.addEventListener("click", async (e) => {
              const target = e.target;
              const id = target.parentNode.dataset["id"] || target.dataset["id"];
              if (!id) return;
              if (target.className === "act") {
                const chapter = ctrl.chapters.list.get(id);
                if (chapter) ctrl.chapters.editForm.toggle(chapter);
              } else {
                await ctrl.setChapter(id);
              }
              blurIfPrimaryClick(e);
            });
            vnode.data.li = {};
            ctrl.chapters.scroller.request("instant");
            onListUpdate(ctrl, vnode);
          },
          postpatch(old, vnode) {
            vnode.data.li = old.data.li;
            onListUpdate(ctrl, vnode);
          },
          destroy: (vnode) => {
            const sortable = vnode.data.li.sortable;
            if (sortable) sortable.destroy();
          }
        }
      },
      ctrl.chapters.list.all().map((chapter, i) => {
        const editing = ctrl.chapters.editForm.isEditing(chapter.id);
        const active = !ctrl.vm.loading && (current == null ? void 0 : current.id) === chapter.id;
        return hl(
          "button",
          {
            key: chapter.id,
            attrs: { "data-id": chapter.id },
            class: { active, editing, draggable: canContribute }
          },
          [
            hl("span", i + 1),
            hl("h3", chapter.name),
            chapter.status && hl("res", chapter.status),
            canContribute && button(".act", icon(licon.Gear)({ title: i18n.study.editChapter }))
          ]
        );
      })
    ),
    ctrl.members.canContribute() && hl(
      "button.add",
      {
        hook: bind(
          "click",
          (e) => {
            blurIfPrimaryClick(e);
            ctrl.chapters.toggleNewForm();
          },
          ctrl.redraw
        )
      },
      [icon(licon.PlusButton)(), hl("h3", i18n.study.addNewChapter)]
    )
  ]);
}
var StudyChapterScroller = class {
  constructor() {
    this.request = prop("instant");
  }
  scrollIfNeeded(list) {
    var _a2;
    const request = this.request();
    if (!request) return;
    const active = list.querySelector(".active");
    if (!active) return;
    this.request(null);
    const [c, l] = [list.getBoundingClientRect(), active.getBoundingClientRect()];
    if (c.top < l.top || c.bottom > l.bottom) {
      cancelAnimationFrame((_a2 = this.rafId) != null ? _a2 : 0);
      this.rafId = requestAnimationFrame(() => {
        scrollToInnerSelector(list, ".active", false, request);
        this.rafId = void 0;
      });
    }
  }
};

// ../analyse/src/study/multiCloudEval.ts
var MultiCloudEval = class {
  constructor(redraw, variant, chapters, send) {
    this.redraw = redraw;
    this.variant = variant;
    this.chapters = chapters;
    this.send = send;
    this.observed = /* @__PURE__ */ new Set();
    this.observer = window.IntersectionObserver && new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        const el = entry.target;
        if (entry.isIntersecting) {
          this.observed.add(el);
          this.requestNewEvals();
        } else this.observed.delete(el);
      }),
      { threshold: 0.2 }
    );
    this.cloudEvals = /* @__PURE__ */ new Map();
    this.thisIfShowEval = () => this.showEval() ? this : void 0;
    this.observe = (el) => {
      var _a2;
      return (_a2 = this.observer) == null ? void 0 : _a2.observe(el);
    };
    this.observedIds = () => new Set(Array.from(this.observed).map((el) => el.dataset.id));
    this.lastRequestedFens = /* @__PURE__ */ new Set();
    this.sendRequestNow = () => {
      if (!this.showEval() || document.hidden) return;
      const ids = this.observedIds();
      const chapters = this.chapters.all().filter((c) => ids.has(c.id)).slice(0, 32);
      if (chapters.length) {
        const fensToRequest = new Set(chapters.map((c) => c.fen));
        const alreadyHasAllFens = [...fensToRequest].every((f) => this.lastRequestedFens.has(f));
        const worthSending = !alreadyHasAllFens || fensToRequest.size < this.lastRequestedFens.size / 1.5;
        if (worthSending) {
          this.lastRequestedFens = fensToRequest;
          const variant = this.variant();
          this.send("evalGetMulti", {
            fens: Array.from(fensToRequest),
            ...variant !== "standard" ? { variant } : {}
          });
        }
      }
    };
    this.requestNewEvals = debounce(this.sendRequestNow, 2e3);
    this.onCloudEval = (d) => {
      this.cloudEvals.set(d.fen, { ...d, chances: povChances("white", d) });
      this.redraw();
    };
    this.onLocalCeval = (node, ev) => {
      this.cloudEvals.set(node.fen, { ...ev, chances: povChances("white", ev) });
    };
    this.getCloudEval = (fen) => this.cloudEvals.get(fen);
    this.addNode = (d) => {
      if (this.observedIds().has(d.p.chapterId)) this.requestNewEvals();
    };
    this.showEval = storedBooleanPropWithEffect("analyse.multiboard.showEval", true, () => {
      this.redraw();
      this.requestNewEvals();
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.requestNewEvals();
    });
  }
};
var renderScore = (s) => s.mate ? "#" + s.mate : defined(s.cp) ? `${s.cp >= 0 ? "+" : ""}${s.cp / 100}` : "?";

// ../analyse/src/study/relay/customScoreStatus.ts
var points = (point) => parseFloat(point.replace("\xBD", ".5"));
var colorClass = (point) => points(point) === 1 ? "good" : points(point) === 0 ? "bad" : "status";
var withCustomScore = (point, color, customScoring) => {
  if (!defined(customScoring)) return point;
  const base = points(point);
  const p = typeof customScoring === "number" ? customScoring : base === 1 ? customScoring[color].win : base === 0.5 ? customScoring[color].draw : 0;
  return p === 0.5 ? "\xBD" : p;
};
var coloredStatusStr = (gamePoints, pov, round) => {
  const customScoring = round == null ? void 0 : round.customScoring;
  const points2 = gamePoints.split("-");
  if (pov === "black") points2.reverse();
  return points2.every((p) => isServerPoint(p)) && [
    hl(`${colorClass(points2[0])}.result`, withCustomScore(points2[0], pov, customScoring)),
    "-",
    hl(`${colorClass(points2[1])}.result`, withCustomScore(points2[1], opposite(pov), customScoring))
  ];
};
var playerColoredResult = (status2, color, customScoring) => {
  const resultPart = status2.split("-")[color === "white" ? 0 : 1];
  return isServerPoint(resultPart) && {
    tag: colorClass(resultPart),
    points: withCustomScore(resultPart, color, customScoring)
  };
};
var isServerPoint = (s) => s === "1" || s === "0" || s === "\xBD";

// ../analyse/src/study/multiBoard.ts
var MultiBoardCtrl = class {
  constructor(chapters, relay, multiCloudEval, redraw) {
    this.chapters = chapters;
    this.relay = relay;
    this.multiCloudEval = multiCloudEval;
    this.redraw = redraw;
    this.playing = toggle(false);
    this.pinned = toggle(false);
    this.teamSelect = prop("");
    this.page = 1;
    this.maxPerPageStorage = storage.make("study.multiBoard.maxPerPage");
    this.gameTeam = (id) => {
      var _a2, _b;
      return (_b = (_a2 = this.chapters.get(id)) == null ? void 0 : _a2.players) == null ? void 0 : _b.white.team;
    };
    this.maxPerPage = () => Math.min(32, parseInt(this.maxPerPageStorage.get() || "12"));
    this.chapterFilter = (c) => {
      var _a2, _b;
      const t = this.teamSelect();
      return (!this.playing() || c.playing) && (!this.relay || !this.pinned() || this.relay.players.pins.isChapterPinned(c)) && (!t || ((_a2 = c.players) == null ? void 0 : _a2.white.team) === t || ((_b = c.players) == null ? void 0 : _b.black.team) === t);
    };
    this.chapterTeamPov = (c) => {
      var _a2, _b;
      const t = this.teamSelect();
      return t && ((_a2 = c.players) == null ? void 0 : _a2.white.team) === t ? "white" : t && ((_b = c.players) == null ? void 0 : _b.black.team) === t ? "black" : void 0;
    };
    this.chapterSorter = (pins) => (a, b) => {
      const aPinned = pins.isChapterPinned(a);
      const bPinned = pins.isChapterPinned(b);
      return aPinned === bPinned ? 0 : aPinned ? -1 : 1;
    };
    this.setMaxPerPage = (nb) => {
      this.maxPerPageStorage.set(nb);
      this.page = 1;
      this.redraw();
    };
    this.pager = () => {
      var _a2;
      const maxPerPage = this.maxPerPage();
      const filteredResults = this.chapters.all().filter(this.chapterFilter);
      const withTeamPOV = filteredResults.map((c) => {
        var _a3;
        return {
          ...c,
          orientation: (_a3 = this.chapterTeamPov(c)) != null ? _a3 : c.orientation
        };
      });
      const sortedResults = ((_a2 = this.relay) == null ? void 0 : _a2.players.pins.anyPinned()) ? withTeamPOV.sort(this.chapterSorter(this.relay.players.pins)) : withTeamPOV;
      const currentPageResults = sortedResults.slice((this.page - 1) * maxPerPage, this.page * maxPerPage);
      const nbResults = sortedResults.length;
      const nbPages = Math.floor((nbResults + maxPerPage - 1) / maxPerPage);
      return {
        currentPage: this.page,
        maxPerPage,
        currentPageResults,
        nbResults,
        previousPage: this.page > 1 ? this.page - 1 : void 0,
        nextPage: this.page < nbPages && currentPageResults.length ? this.page + 1 : void 0,
        nbPages
      };
    };
    this.setPage = (page) => {
      if (this.page !== page) {
        this.page = page;
        this.redraw();
      }
    };
    this.nextPage = () => this.setPage(this.page + 1);
    this.prevPage = () => this.setPage(this.page - 1);
    this.lastPage = () => this.setPage(this.pager().nbPages);
    this.computeTeamList = () => {
      const teams2 = /* @__PURE__ */ new Set();
      this.chapters.all().forEach((c) => {
        var _a2, _b;
        if ((_a2 = c.players) == null ? void 0 : _a2.white.team) teams2.add(c.players.white.team);
        if ((_b = c.players) == null ? void 0 : _b.black.team) teams2.add(c.players.black.team);
      });
      return Array.from(teams2).sort();
    };
    this.showResults = this.relay ? storedBooleanProp("study.showResults", true) : toggle(true);
  }
};
function view5(ctrl, study) {
  var _a2, _b, _c, _d;
  const pager = ctrl.pager();
  const cloudEval = (_a2 = ctrl.multiCloudEval) == null ? void 0 : _a2.thisIfShowEval();
  const baseUrl2 = ((_b = study.relay) == null ? void 0 : _b.roundPath()) || study.baseUrl();
  return h("div.study__multiboard", [
    h("div.study__multiboard__top", [
      renderPagerNav(pager, ctrl),
      hl("div.study__multiboard__options", [
        ctrl.relay && cmnToggleWrapProp({
          id: "multiboard-playing",
          name: i18n.study.playing,
          prop: ctrl.playing,
          redraw: ctrl.redraw
        }),
        ctrl.relay && cmnToggleWrapProp({
          id: "multiboard-pinned",
          name: "Pinned",
          prop: ctrl.pinned,
          redraw: ctrl.redraw
        }),
        ctrl.multiCloudEval && cmnToggleWrapProp({
          id: "multiboard-eval",
          name: i18n.study.showEvalBar,
          prop: ctrl.multiCloudEval.showEval
        }),
        ctrl.relay && cmnToggleWrapProp({
          id: "multiboard-results",
          name: i18n.study.showResults,
          prop: ctrl.showResults,
          redraw: ctrl.redraw
        })
      ])
    ]),
    !ctrl.showResults() ? h(
      "div.empty-boards-note.text",
      { attrs: dataIcon(licon.InfoCircle) },
      i18n.broadcast.sinceHideResults
    ) : void 0,
    h(
      "div.now-playing",
      {
        hook: onInsert(gameLinksListener(study.chapterSelect))
      },
      makePreviews(
        pager.currentPageResults,
        baseUrl2,
        study.vm.chapterId,
        cloudEval,
        ctrl.showResults(),
        (_c = study.relay) == null ? void 0 : _c.round,
        (_d = study.relay) == null ? void 0 : _d.players.pins
      )
    ),
    ctrl.pinned() ? h(
      "div.go-to-pinned",
      h(
        "a",
        {
          on: {
            click: () => {
              var _a3;
              return (_a3 = ctrl.relay) == null ? void 0 : _a3.openTab("players");
            }
          }
        },
        "Pin broadcast players to show only their games here"
      )
    ) : void 0
  ]);
}
function renderPagerNav(pager, ctrl) {
  const page = ctrl.page, from = Math.min(pager.nbResults, (page - 1) * pager.maxPerPage + 1), to = Math.min(pager.nbResults, page * pager.maxPerPage), max = ctrl.maxPerPage();
  return h("div.study__multiboard__pager", [
    pagerButton(licon.JumpFirst, () => ctrl.setPage(1), page > 1, ctrl),
    pagerButton(licon.JumpPrev, ctrl.prevPage, page > 1, ctrl),
    h("span.page", `${from}-${to} / ${pager.nbResults}`),
    pagerButton(licon.JumpNext, ctrl.nextPage, page < pager.nbPages, ctrl),
    pagerButton(licon.JumpLast, ctrl.lastPage, page < pager.nbPages, ctrl),
    teamSelector(ctrl),
    h(
      "select.study__multiboard__pager__max-per-page",
      { hook: bind("change", (e) => ctrl.setMaxPerPage(e.target.value)) },
      [4, 6, 8, 10, 12, 16, 20, 24, 32].map(
        (nb) => h("option", { attrs: { value: nb, selected: nb === max } }, i18n.study.perPage(nb))
      )
    )
  ]);
}
var teamSelector = (ctrl) => {
  const allTeams = ctrl.computeTeamList();
  const currentTeam = ctrl.teamSelect();
  return allTeams.length ? requiresI18n(
    "broadcast",
    ctrl.redraw,
    (broadcast) => h(
      "select",
      {
        hook: bind("change", (e) => ctrl.teamSelect(e.target.value), ctrl.redraw)
      },
      [broadcast.allTeams, ...allTeams].map(
        (t, i) => h("option", { attrs: { value: i ? t : "", selected: i && t === currentTeam } }, t)
      )
    )
  ) : void 0;
};
function pagerButton(icon2, click, enable, ctrl) {
  return h("button.fbt", {
    attrs: { "data-icon": icon2, disabled: !enable },
    hook: bind("mousedown", click, ctrl.redraw)
  });
}
var previewToCgConfig = (cp) => ({
  fen: cp.fen,
  lastMove: uciToMove(cp.lastMove),
  turnColor: fenColor(cp.fen),
  check: !!cp.check
});
var makePreviews = (previews, roundPath, current, cloudEval, showResults, round, pins) => previews.map((preview, index) => {
  const extraCgConfig = index === 0 ? () => ({
    addDimensionsCssVarsTo: document.querySelector(".study__multiboard .now-playing")
  }) : void 0;
  return h(
    `a.mini-game.is2d.chap-${preview.id}${showResults ? "" : ".no-spoilers"}`,
    {
      class: { active: preview.id === current },
      attrs: gameLinkAttrs(roundPath, preview)
    },
    previewContent(preview, preview.orientation, cloudEval, showResults, round, extraCgConfig, pins)
  );
});
var previewContent = (preview, orientation, cloudEval, showResults, round, extraCgConfig, pins) => {
  const makeCgConfig = () => ({
    ...showResults ? previewToCgConfig(preview) : { fen: EMPTY_BOARD_FEN },
    ...extraCgConfig ? extraCgConfig() : {}
  });
  return [
    boardPlayer(preview, opposite2(orientation), showResults, round, pins),
    h("span.cg-gauge", [
      showResults ? cloudEval && verticalEvalGauge(preview, orientation, cloudEval) : void 0,
      h(
        "span.mini-game__board",
        h("span.cg-wrap", {
          hook: {
            insert(vnode) {
              const el = vnode.elm;
              vnode.data.cg = Chessground(el, {
                coordinates: false,
                viewOnly: true,
                orientation,
                drawable: { enabled: false, visible: false },
                ...makeCgConfig()
              });
              vnode.data.fen = preview.fen;
            },
            postpatch(old, vnode) {
              var _a2;
              if (!showResults) return;
              if (old.data.fen !== preview.fen) (_a2 = old.data.cg) == null ? void 0 : _a2.set(makeCgConfig());
              vnode.data.fen = preview.fen;
              vnode.data.cg = old.data.cg;
            }
          }
        })
      )
    ]),
    boardPlayer(preview, orientation, showResults, round, pins)
  ];
};
var verticalEvalGauge = (chap, orientation, cloudEval) => {
  const baseTag = `span.mini-game__gauge${orientation === "black" ? " mini-game__gauge--flip" : ""}`;
  return chap.check === "#" ? h(baseTag + ` mini-game__gauge--set`, { attrs: { "data-id": chap.id, title: "Checkmate" } }, [
    h("span.mini-game__gauge__black", {
      attrs: { style: `height: ${fenColor(chap.fen) === "white" ? 100 : 0}%` }
    }),
    h("tick")
  ]) : h(
    baseTag,
    {
      attrs: { "data-id": chap.id },
      hook: {
        ...onInsert(cloudEval.observe),
        postpatch(old, vnode) {
          var _a2;
          const elm = vnode.elm;
          const prevNodeCloud = (_a2 = old.data) == null ? void 0 : _a2.cloud;
          const cev = cloudEval.getCloudEval(chap.fen) || prevNodeCloud;
          if ((cev == null ? void 0 : cev.chances) !== (prevNodeCloud == null ? void 0 : prevNodeCloud.chances)) {
            elm.firstChild.style.height = `${Math.round(
              (1 - ((cev == null ? void 0 : cev.chances) || 0)) / 2 * 100
            )}%`;
            if (cev) {
              elm.title = renderScore(cev);
              elm.classList.add("mini-game__gauge--set");
            }
          }
          vnode.data.cloud = cev;
        }
      }
    },
    [h("span.mini-game__gauge__black"), h("tick")]
  );
};
var pinIcon = () => hl("img.pinned-icon", { attrs: { alt: "", src: site.asset.flairSrc("objects.pushpin") } });
var renderUser = (player, pinned) => h("span.mini-game__user", [
  playerFedFlag(player.fed),
  h("span.name", [userTitle(player), player.name || "?"]),
  player.rating ? h("span.rating", player.rating.toString()) : void 0,
  pinned ? pinIcon() : void 0
]);
var renderClock = (chapter, color) => {
  const timeleft = computeTimeLeft(chapter, color);
  if (!defined(timeleft)) return void 0;
  const turnColor = fenColor(chapter.fen);
  const ticking = turnColor === color && otbClockIsRunning(chapter.fen);
  return h(
    "span.mini-game__clock.mini-game__clock",
    { class: { "clock--run": ticking } },
    formatMs(timeleft * 1e3)
  );
};
var computeTimeLeft = (preview, color) => {
  var _a2, _b;
  const clock = (_b = (_a2 = preview.players) == null ? void 0 : _a2[color]) == null ? void 0 : _b.clock;
  if (notNull(clock)) {
    if (defined(preview.lastMoveAt) && defined(preview.lastMove) && fenColor(preview.fen) === color) {
      const spent = (Date.now() - preview.lastMoveAt) / 1e3;
      return Math.max(0, clock / 100 - spent);
    } else return clock / 100;
  } else return void 0;
};
var boardPlayer = (preview, color, showResults, round, pins) => {
  var _a2;
  const player = (_a2 = preview.players) == null ? void 0 : _a2[color];
  const coloredResult = preview.status && preview.status !== "*" && playerColoredResult(preview.status, color, round == null ? void 0 : round.customScoring);
  return h("span.mini-game__player", [
    player && renderUser(player, pins == null ? void 0 : pins.isPlayerPinned(player)),
    showResults ? coloredResult ? h(`${coloredResult.tag}.mini-game__result`, coloredResult.points) : renderClock(preview, color) : void 0
  ]);
};

// ../analyse/src/study/relay/deepLink.ts
var broadcasterDeepLink = (url2) => {
  const parsed = new URL(url2);
  return "lichess-broadcaster:/" + parsed.pathname;
};
var teamLinkData = (teamName) => ({
  attrs: {
    href: `#team-results/${encodeURIComponent(teamName)}`
  }
});

// ../analyse/src/study/relay/playerId.ts
var playerId = (p) => p.fideId || p.name;

// ../analyse/src/study/relay/relayPlayerPin.ts
var RelayPlayerPin = class {
  constructor(tourId, redraw) {
    this.tourId = tourId;
    this.redraw = redraw;
    this.pins = /* @__PURE__ */ new Set();
    this.store = storedMap(`relay.players.pins.${myUserId()}`, 50, () => []);
    this.isPinned = (id) => id !== void 0 && this.pins.has(id);
    this.isPlayerPinned = (p) => this.isPinned(playerId(p));
    this.isChapterPinned = (c) => this.anyPinned() && !!c.players && (this.isPlayerPinned(c.players.white) || this.isPlayerPinned(c.players.black));
    this.anyPinned = () => this.pins.size > 0;
    this.togglePin = (id) => {
      if (this.pins.has(id)) this.pins.delete(id);
      else this.pins.add(id);
      this.save();
      this.redraw();
    };
    this.pins = new Set(this.store(this.tourId));
  }
  save() {
    this.store(this.tourId, Array.from(this.pins));
  }
};

// ../analyse/src/study/relay/relayPlayers.ts
var RelayPlayers = class {
  constructor(tour, switchToPlayerTab, isEmbed, hideResultsSinceRoundId, fidePhoto, redraw) {
    this.tour = tour;
    this.switchToPlayerTab = switchToPlayerTab;
    this.isEmbed = isEmbed;
    this.hideResultsSinceRoundId = hideResultsSinceRoundId;
    this.fidePhoto = fidePhoto;
    this.redraw = redraw;
    this.loading = false;
    this.tabHash = () => this.show ? `#players/${this.show.id}` : "#players";
    this.switchTabAndShowPlayer = async (id) => {
      this.switchToPlayerTab();
      this.showPlayer(id);
      this.redraw();
    };
    this.showPlayer = async (id) => {
      this.show = { id };
      const player = await this.loadPlayerWithGames(id);
      this.show = { id, player };
      this.redraw();
    };
    this.closePlayer = () => {
      this.show = void 0;
    };
    this.loadFromXhr = async (onInsert2) => {
      var _a2;
      if (this.players && !onInsert2) {
        this.loading = true;
        this.redraw();
      }
      const players2 = await json(
        `/broadcast/${this.tour.id}/players`
      );
      this.players = players2.map(convertPlayerFromServer);
      (_a2 = this.table) == null ? void 0 : _a2.refresh();
      this.redraw();
    };
    this.loadPlayerWithGames = async (id) => {
      const full = await json(
        `/broadcast/${this.tour.id}/players/${encodeURIComponent(id)}`
      ).then(convertPlayerFromServer);
      full.games.forEach((g) => {
        g.opponent = convertPlayerFromServer(g.opponent);
      });
      return full;
    };
    this.playerLinkConfig = (p) => playerLinkConfig(this, p, true);
    this.pins = new RelayPlayerPin(tour.id, redraw);
    const locationPlayer = location.hash.startsWith("#players/") && location.hash.slice(9);
    if (locationPlayer) this.showPlayer(locationPlayer);
  }
};
var playersView = (ctrl) => ctrl.show ? playerView(ctrl, ctrl.show) : playersList(ctrl);
var ratingCategs = {
  standard: i18n.site.classical,
  rapid: i18n.site.rapid,
  blitz: i18n.site.blitz
};
var playerView = (ctrl, show2) => {
  var _a2, _b, _c, _d;
  const tour = ctrl.tour;
  const p = show2.player;
  const year = (((_a2 = tour.dates) == null ? void 0 : _a2[0]) ? new Date(tour.dates[0]) : /* @__PURE__ */ new Date()).getFullYear();
  const tc = tour.info.fideTC || "standard";
  const age = ((_b = p == null ? void 0 : p.fide) == null ? void 0 : _b.year) && year - p.fide.year;
  const fidePageAttrs = p ? fidePageLinkAttrs(p, ctrl.isEmbed) : {};
  const photo = (p == null ? void 0 : p.fideId) ? ctrl.fidePhoto(p.fideId) : void 0;
  return hl(
    "div.fide-player",
    {
      class: { loading: !show2.player }
    },
    p ? [
      hl(
        "div.fide-player__header",
        {
          hook: onInsert((el) => {
            site.asset.loadEsm("fidePlayerFollow");
            pubsub.emit("content-loaded", el);
          })
        },
        [
          photo && hl("div.fide-player__photo", playerPhotoOrFallback(p, photo, "medium", "fide-player__photo")),
          hl("div.fide-player__header__info", [
            hl("a.fide-player__header__name", { attrs: fidePageAttrs }, [
              hl("span", [userTitle(p), p.name]),
              p.user && userLink({ ...p.user, title: void 0 })
            ]),
            p.fide && hl("label.fide-player__follow", [
              hl("span.cmn-favourite", [
                hl(`input#fide-follow-${p.fideId}`, {
                  attrs: {
                    type: "checkbox",
                    "data-action": `/fide/${p.fideId}/follow?follow=true`,
                    checked: !!((_c = p.fide) == null ? void 0 : _c.follow)
                  }
                }),
                hl("label", { attrs: { for: `fide-follow-${p.fideId}` } })
              ]),
              i18n.site.follow
            ]),
            hl("table.fide-player__header__table", [
              hl("tbody", [
                p.fed && hl("tr", [
                  hl("th", i18n.broadcast.federation),
                  hl(
                    "td",
                    hl(
                      "a.fide-player__federation",
                      { attrs: { href: `/fide/federation/${p.fed.name}` } },
                      [playerFedFlag(p.fed), p.fed.i18nName]
                    )
                  )
                ]),
                p.team && hl("tr", [
                  hl("th", "Team"),
                  hl(
                    "td.text",
                    { attrs: dataIcon(licon.Group) },
                    hl("a", matchOrResultsTeamLink(ctrl, p.team), p.team)
                  )
                ]),
                age && hl("tr", [hl("th", i18n.broadcast.age), hl("td", age.toString())])
              ])
            ])
          ])
        ]
      ),
      hl("div.fide-player__cards", [
        ((_d = p.fide) == null ? void 0 : _d.ratings) && Object.entries(ratingCategs).map(
          ([key, name]) => {
            var _a3;
            return hl(`div.fide-player__card${key === tc ? ".active" : ""}`, [
              hl("em", fideTCAttrs(key), name),
              hl("span", [((_a3 = p.fide) == null ? void 0 : _a3.ratings[key]) || "-"])
            ]);
          }
        ),
        p.score !== void 0 && hl("div.fide-player__card", [
          hl("em", i18n.broadcast.score),
          hl("span", [p.score, " / ", p.played])
        ]),
        p.performances && hl("div.fide-player__card", [
          hl("em", i18n.site.performance),
          Object.entries(p.performances).sort(statByFideTCSort).map(
            ([tc2, value]) => hl(
              "div.performance",
              fideTCAttrs(tc2),
              `${value}${p.games.filter((g) => g.fideTC === tc2).length < 4 ? "?" : ""}`
            )
          )
        ]),
        p.ratingDiffs && hl("div.fide-player__card", [hl("em", i18n.broadcast.ratingDiff), ratingDiff(p)])
      ]),
      hl("table.relay-tour__player__games.slist.slist-pad", [
        hl("thead", hl("tr", hl("td", { attrs: { colspan: 69 } }, i18n.broadcast.gamesThisTournament))),
        renderPlayerGames(ctrl, p, true)
      ])
    ] : [spinnerVdom()]
  );
};
var playersList = (ctrl) => hl(
  "div.relay-tour__players",
  {
    class: { loading: ctrl.loading, nodata: !ctrl.players },
    hook: onInsert(() => ctrl.loadFromXhr(true))
  },
  ctrl.players ? renderPlayers(ctrl, ctrl.players) : [spinnerVdom()]
);
var sortByBoth = (x, y) => ({
  attrs: { "data-sort": (x || 0) * 1e5 + (y || 0) }
});
var renderPlayers = (ctrl, players2, forceEloSort = false) => {
  var _a2;
  const withRating = players2.some((p) => defined(p.rating));
  const withScores = players2.some((p) => defined(p.score));
  const withRank = players2.some((p) => defined(p.rank));
  const defaultSort = { attrs: { "data-sort-default": 1 } };
  const tbs = (_a2 = players2 == null ? void 0 : players2[0]) == null ? void 0 : _a2.tiebreaks;
  const hasPlayers = players2.length > 0;
  return [
    withRank && hl(
      "p.relay-tour__standings--disclaimer.text",
      { attrs: dataIcon(licon.InfoCircle) },
      i18n.broadcast.standingsDisclaimer
    ),
    hasPlayers ? hl(
      "table.relay-tour__players__table.fide-players-table.slist.slist-invert.slist-pad",
      {
        hook: onInsert(tableAugment)
      },
      [
        hl(
          "thead",
          hl("tr", [
            hl("th.pin", defaultSort),
            withRank && hl("th.rank", { attrs: { ...defaultSort["attrs"], ...dataIcon(licon.Trophy) } }),
            hl("th.player-name", { attrs: { "data-sort-reverse": true } }, i18n.site.player),
            withRating && hl("th", (!withScores && !withRank || forceEloSort) && defaultSort, "Elo"),
            withScores && hl("th.score", !withRank && !forceEloSort && defaultSort, i18n.broadcast.score),
            hl("th", i18n.site.games),
            tbs == null ? void 0 : tbs.map(
              (tb) => hl(
                "th.tiebreak",
                {
                  attrs: { "data-sort": tb.points, title: tb.description, "aria-label": tb.description }
                },
                tb.extendedCode
              )
            )
          ])
        ),
        hl(
          "tbody",
          players2.map((player) => {
            var _a3, _b, _c;
            const id = playerId(player);
            const pinned = ctrl.pins.isPinned(id);
            return hl("tr", [
              hl(
                "td.pin",
                { attrs: { "data-sort": pinned ? 1 : 0 } },
                id && hl(
                  "button",
                  {
                    class: { pinned },
                    attrs: {
                      title: "Pin player"
                    },
                    on: {
                      click() {
                        ctrl.pins.togglePin(id);
                      }
                    }
                  },
                  pinIcon()
                )
              ),
              withRank && hl("td.rank", { attrs: { "data-sort": player.rank ? -player.rank : 0 } }, player.rank),
              playerTd(player, ctrl, true),
              withRating && hl(
                "td",
                sortByBoth(player.rating, (player.score || 0) * 10),
                player.rating && ratingDiff(player)
              ),
              withScores && hl(
                "td.score",
                {
                  attrs: {
                    "data-sort": player.rank ? -player.rank : sortByBoth((player.score || 0) * 10, player.rating)["attrs"]["data-sort"]
                  }
                },
                `${(_a3 = player.score) != null ? _a3 : 0}`
              ),
              hl("td", sortByBoth(player.played, player.rating), `${(_b = player.played) != null ? _b : 0}`),
              (_c = player.tiebreaks) == null ? void 0 : _c.map(
                (tb) => hl(
                  "td.tiebreak",
                  {
                    attrs: {
                      "data-sort": tb.points,
                      title: tb.description,
                      "aria-label": tb.description
                    }
                  },
                  `${tb.points}`
                )
              )
            ]);
          })
        )
      ]
    ) : hl("div.relay-tour__note", i18n.broadcast.noPlayersYet)
  ];
};
var playerTipId = "tour-player-tip";
var playerLinkHook = (ctrl, player, withTip) => {
  const id = playerId(player);
  withTip = withTip && !isTouchDevice();
  if (!id) return {};
  return {
    ...onInsert((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        ctrl.switchTabAndShowPlayer(id);
      });
      if (withTip)
        $(el).powerTip({
          closeDelay: 200,
          popupId: playerTipId,
          defaultSize: [420, 150],
          preRender() {
            const tipEl = document.getElementById(playerTipId);
            const patch2 = init([attributesModule]);
            tipEl.style.visibility = "hidden";
            ctrl.loadPlayerWithGames(id).then((p) => {
              const vdom = renderPlayerTipWithGames(ctrl, p);
              tipEl.innerHTML = "";
              patch2(tipEl, hl(`div#${playerTipId}`, vdom));
              $.powerTip.reposition(el);
            });
          }
        });
    }),
    ...withTip ? { destroy: (vnode) => $.powerTip.destroy(vnode.elm) } : {}
  };
};
var playerLinkConfig = (ctrl, player, withTip) => {
  const id = playerId(player);
  return id ? {
    attrs: {
      href: `#players/${playerId(player)}`
    },
    key: id,
    hook: playerLinkHook(ctrl, player, withTip)
  } : {};
};
var fidePageLinkAttrs = (p, blank) => p.fideId ? { href: `/fide/${p.fideId}/redirect`, ...blank ? { target: "_blank" } : {} } : void 0;
var renderPlayerTipHead = (ctrl, p) => hl("div.tpp__player", [
  playerPhoto(p, ctrl, "medium"),
  hl("div.tpp__player__info", [
    hl(`a.tpp__player__name`, playerLinkConfig(ctrl, p, false), [userTitle(p), p.name]),
    hl("div.tpp__player__details", [
      p.team && hl("a.tpp__player__team", matchOrResultsTeamLink(ctrl, p.team), p.team),
      hl("div", [playerFedFlag(p.fed), !!p.rating && !ctrl.hideResultsSinceRoundId() && ratingDiff(p)]),
      !ctrl.hideResultsSinceRoundId() && defined(p.score) && hl("span", [i18n.broadcast.score, " ", hl("strong", p.score)])
    ])
  ])
]);
var renderPlayerTipWithGames = (ctrl, p) => hl("div.tpp", [
  renderPlayerTipHead(ctrl, p),
  hl("div.tpp__games", hl("table", renderPlayerGames(ctrl, p, false)))
]);
var renderPlayerGames = (ctrl, p, withTips) => {
  const hideResultsSinceRoundId = ctrl.hideResultsSinceRoundId();
  const hideResultsSinceIndex = hideResultsSinceRoundId && p.games.findIndex((g) => g.round === hideResultsSinceRoundId) || 999;
  const coloredPoint = ({ points: points2, customPoints, color, ongoing }, index) => {
    if (!points2) return ongoing && hl("strong", "*");
    if (hideResultsSinceIndex <= index) return hl("span", "?");
    const povResultStr = points2 === "1/2" ? "\xBD-\xBD" : points2 === "1" === (color === "white") ? "1-0" : "0-1";
    const coloredResult = playerColoredResult(povResultStr, color, customPoints);
    return coloredResult && hl(coloredResult.tag, coloredResult.points);
  };
  return hl(
    "tbody.fide-players-table",
    p.games.map((game, i) => {
      var _a2;
      return hl("tr", [
        hl(
          "td",
          hl(
            "a.game-link.is.color-icon.text." + game.color,
            { attrs: { href: `/broadcast/-/-/${game.round}/${game.id}` } },
            `${i + 1}`
          )
        ),
        playerTd(game.opponent, ctrl, withTips),
        hl("td", (_a2 = game.opponent.rating) == null ? void 0 : _a2.toString()),
        hl("td.game-point", coloredPoint(game, i)),
        hl(
          "td.rating-diff",
          defined(game.ratingDiff) && hideResultsSinceIndex > i && ratingDiff(game, p.ratingsMap && Object.keys(p.ratingsMap).length > 1)
        )
      ]);
    })
  );
};
var playerPhoto = (player, ctrl, which = "small") => playerPhotoOrFallback(
  player,
  player.fideId ? ctrl.fidePhoto(player.fideId) : void 0,
  which,
  "fide-players__photo"
);
var playerPhotoOrFallback = (player, photo, which, cls) => photo ? hl(`img.${cls}`, { attrs: { src: photo[which] } }) : hl(`img.${cls}.${cls}--fallback`, {
  attrs: { src: site.asset.url(`images/anon-${player.title === "BOT" ? "engine" : "face"}.webp`) }
});
var playerTd = (player, ctrl, withTips) => {
  const linkCfg = playerLinkConfig(ctrl, player, withTips);
  return hl(
    "td.player-intro-td",
    { attrs: { "data-sort": player.name || "" } },
    hl("span.player-intro", [
      hl("a.player-intro__photo", linkCfg, playerPhoto(player, ctrl)),
      hl("span.player-intro__info", [
        hl("a.player-intro__name", linkCfg, [userTitle(player), player.name]),
        player.fed && hl("span.player-intro__fed", [
          hl("img.mini-game__flag", {
            attrs: { src: site.asset.fideFedSrc(player.fed.id) }
          }),
          player.fed.i18nName
        ])
      ])
    ])
  );
};
var fideTCOrder = ["standard", "rapid", "blitz"];
var statByFideTCSort = (a, b) => fideTCOrder.indexOf(a[0]) - fideTCOrder.indexOf(b[0]);
var ratingDiff = (p, showIcons = false) => {
  if (isRelayPlayerGame(p)) return hl("div.diff", showIcons && fideTCAttrs(p.fideTC), diffNode(p.ratingDiff));
  if (!p.ratingDiffs) return p.rating;
  const rds = Object.entries(p.ratingDiffs).sort(statByFideTCSort);
  const isMultiTc = rds.length > 1;
  const diffNodes = rds.map(([tc, diff]) => {
    var _a2;
    const node = [(_a2 = p.ratingsMap) == null ? void 0 : _a2[tc], diffNode(diff)];
    return isMultiTc ? hl("div.diff", fideTCAttrs(tc), node) : node;
  });
  return isMultiTc ? hl("div.diffs", diffNodes) : hl("div.diff", diffNodes[0]);
};
var diffNode = (rd) => !defined(rd) ? void 0 : rd > 0 ? hl("good.rp", "+" + rd) : rd < 0 ? hl("bad.rp", "\u2212" + -rd) : hl("span.rp--same", " ==");
var isRelayPlayerGame = (p) => "round" in p && "opponent" in p;
var fideTCAttrs = (tc) => ({
  attrs: {
    "data-icon": perfIcons_default[tc === "standard" ? "classical" : tc],
    title: ratingCategs[tc]
  }
});
var tableAugment = (el) => {
  extendTablesortNumber();
  return sortTable(el, { descending: true });
};
var matchOrResultsTeamLink = (ctrl, teamName) => ctrl.tour.showTeamScores ? teamLinkData(teamName) : { attrs: { href: "#teams" } };

// ../analyse/src/view/clocks.ts
function renderClocks(ctrl, path) {
  var _a2, _b;
  const node = ctrl.tree.nodeAtPath(path), whitePov = ctrl.bottomIsWhite(), parentClock = ctrl.tree.getParentClock(node, path), isWhiteTurn = plyColor(node.ply) === "white", centis = (isWhiteTurn ? [parentClock, node.clock] : [node.clock, parentClock]).map((c) => defined(c) && c < 0 ? void 0 : c);
  if (!centis.some(notNull)) return void 0;
  const study = ctrl.study;
  const lastMoveAt = study ? study.isClockTicking(path) ? (_a2 = study.relay) == null ? void 0 : _a2.lastMoveAt(study.vm.chapterId) : void 0 : ctrl.autoplay.lastMoveAt;
  if (lastMoveAt) {
    const spent = (Date.now() - lastMoveAt) / 10;
    const i = isWhiteTurn ? 0 : 1;
    if (centis[i]) centis[i] = Math.max(0, centis[i] - spent);
  }
  const showTenths = !(study == null ? void 0 : study.relay);
  const pause = !!((_b = ctrl.study) == null ? void 0 : _b.isRelayAwayFromLive());
  return [
    renderClock2({
      centis: centis[0],
      active: isWhiteTurn,
      cls: whitePov ? "bottom" : "top",
      showTenths,
      pause
    }),
    renderClock2({
      centis: centis[1],
      active: !isWhiteTurn,
      cls: whitePov ? "top" : "bottom",
      showTenths,
      pause
    })
  ];
}
var renderClock2 = (opts) => h(
  "div.analyse__clock." + opts.cls,
  { class: { active: opts.active } },
  site.blindMode ? [clockContentNvui(opts)] : clockContent(opts)
);
function clockContent(opts) {
  if (!opts.centis && opts.centis !== 0) return ["-"];
  const date = new Date(opts.centis * 10), millis = date.getUTCMilliseconds(), sep = ":", baseStr = pad2(date.getUTCMinutes()) + sep + pad2(date.getUTCSeconds());
  const timeNodes = !opts.showTenths || opts.centis >= 36e4 ? [Math.floor(opts.centis / 36e4) + sep + baseStr] : opts.centis >= 6e3 ? [baseStr] : [baseStr, h("tenths", "." + Math.floor(millis / 100).toString())];
  if (opts.pause) {
    return [icon(licon.Pause)(), ...timeNodes];
  }
  return timeNodes;
}
var clockContentNvui = (opts) => !opts.centis && opts.centis !== 0 ? "None" : formatClockTimeVerbal(opts.centis * 10);
var pad2 = (num) => (num < 10 ? "0" : "") + num;

// ../analyse/src/pgnExport.ts
function renderPgnTags(game) {
  let txt = "";
  const tags = [];
  if (game.variant.key !== "standard") tags.push(["Variant", game.variant.name]);
  if (game.initialFen && game.initialFen !== INITIAL_FEN) tags.push(["FEN", game.initialFen]);
  if (tags.length) txt = tags.map((t) => "[" + t[0] + ' "' + t[1] + '"]').join("\n") + "\n\n";
  return txt;
}
var renderFullTxt = (ctrl) => renderPgnTags(ctrl.data.game) + renderNodesTxt(ctrl.tree.root, true);
function renderNodesHtml(nodes) {
  if (!nodes[0]) return [];
  if (!nodes[0].san) nodes = nodes.slice(1);
  if (!nodes[0]) return [];
  const tags = [];
  if (nodes[0].ply % 2 === 0) tags.push(h("index", Math.floor((nodes[0].ply + 1) / 2) + "..."));
  nodes.forEach((node) => {
    if (node.ply === 0) return;
    if (node.ply % 2 === 1) tags.push(h("index", (node.ply + 1) / 2 + "."));
    tags.push(h("san", fixCrazySan(node.san)));
  });
  return tags;
}
function renderNodesPgn(game, nodeList, includeSubVariations) {
  const nonRootNodes = nodeList.filter((node) => node.san);
  let pgn = "";
  if (nonRootNodes.length) {
    const first = nonRootNodes[0];
    pgn += `${plyPrefix(first)}${first.san} `;
    for (let i = 1; i < nonRootNodes.length; i++) {
      const node = nonRootNodes[i];
      if (node.ply % 2 === 1) {
        pgn += plyToTurn(node.ply) + ". ";
      }
      pgn += fixCrazySan(node.san) + " ";
    }
  }
  pgn += renderNodesTxt(nodeList[nodeList.length - 1], nonRootNodes.length === 0, includeSubVariations);
  return pgn ? renderPgnTags(game) + pgn : "";
}

// ../analyse/src/pgnImport.ts
var readNode = (variant, node, pos, ply, withChildren = true) => {
  const move = parseSan(pos, node.data.san);
  if (!move) throw new Error(`Can't play ${node.data.san} at move ${Math.ceil(ply / 2)}, ply ${ply}`);
  return completeNode(variant)({
    ply,
    san: makeSanAndPlay(pos, move),
    fen: makeFen(pos.toSetup()),
    uci: makeUci(move),
    children: withChildren ? node.children.map((child) => readNode(variant, child, pos.clone(), ply + 1)) : []
  });
};
function pgnImport_default(pgn) {
  const game = parsePgn(pgn)[0];
  const start = startingPosition(game.headers).unwrap();
  const fen = makeFen(start.toSetup());
  const variant = rulesToVariantKey[start.rules] || start.rules;
  const initialPly = (start.toSetup().fullmoves - 1) * 2 + (start.turn === "white" ? 0 : 1);
  const treeParts = [
    completeNode(variant)({
      id: "",
      ply: initialPly,
      fen,
      children: []
    })
  ];
  let tree = game.moves;
  const pos = start;
  const sidelines = [[]];
  let index = 0;
  while (tree.children.length) {
    const [mainline, ...variations] = tree.children;
    const ply = initialPly + index + 1;
    sidelines.push(variations.map((variation) => readNode(variant, variation, pos.clone(), ply)));
    treeParts.push(readNode(variant, mainline, pos, ply, false));
    tree = mainline;
    index += 1;
  }
  const variantName = makeVariant(start.rules) || variant;
  return {
    game: {
      fen,
      initialFen: fen,
      id: "synthetic",
      opening: void 0,
      // TODO
      player: start.turn,
      status: { id: 20, name: "started" },
      turns: treeParts.length,
      variant: {
        key: variant,
        name: variantName,
        short: variantName
      }
    },
    player: { color: "white" },
    opponent: { color: "black" },
    treeParts,
    sidelines,
    userAnalysis: true
  };
}
var rulesToVariantKey = {
  chess: "standard",
  kingofthehill: "kingOfTheHill",
  "3check": "threeCheck",
  racingkings: "racingKings"
};
var renderPgnError = (error = "") => {
  var _a2;
  return `PGN error: ${(_a2 = {
    [IllegalSetup.Empty]: "empty board",
    [IllegalSetup.OppositeCheck]: "king in check",
    [IllegalSetup.PawnsOnBackrank]: "pawns on back rank",
    [IllegalSetup.Kings]: "king(s) missing",
    [IllegalSetup.Variant]: "invalid Variant header"
  }[error]) != null ? _a2 : error}`;
};

// ../analyse/src/serverSideUnderboard.ts
var stockfishName = "Stockfish 18";
function serverSideUnderboard_default(element, ctrl) {
  var _a2;
  $(element).replaceWith(ctrl.opts.$underboard);
  const data = ctrl.data, $panels = $(".analyse__underboard__panels > div"), $menu = $(".analyse__underboard__menu"), inputFen = document.querySelector(".analyse__underboard__fen input"), positionGifLink = document.querySelector(".position-gif a");
  let lastInputHash;
  let advChart;
  let timeChartLoaded = false;
  const updateGifLinks = (fen) => {
    const ds = document.body.dataset;
    if (positionGifLink)
      positionGifLink.href = url(ds.assetUrl + "/export/fen.gif", {
        fen,
        color: ctrl.bottomColor(),
        lastMove: ctrl.node.uci,
        variant: ctrl.data.game.variant.key,
        theme: ds.board,
        piece: ds.pieceSet
      });
  };
  const onFenChange = (fen) => {
    const nextInputHash = `${fen}${ctrl.bottomColor()}`;
    if (fen && nextInputHash !== lastInputHash) {
      if (inputFen) inputFen.value = fen;
      if (!site.blindMode) updateGifLinks(fen);
      lastInputHash = nextInputHash;
    }
  };
  onFenChange(ctrl.node.fen);
  pubsub.on("analysis.change", onFenChange);
  if (!site.blindMode) {
    pubsub.on("board.change", () => inputFen && updateGifLinks(inputFen.value));
    pubsub.on("analysis.comp.toggle", (v) => {
      if (v) {
        setTimeout(() => $menu.find(".computer-analysis").first().trigger("click"), 50);
      } else {
        $menu.find("button:not(.computer-analysis)").first().trigger("click");
      }
    });
    pubsub.on("analysis.server.progress", (d) => {
      if (!advChart) startAdvantageChart();
      else advChart.updateData(d, ctrl.mainline);
      if (d.analysis && !d.analysis.partial) $("#acpl-chart-container-loader").remove();
    });
  }
  const chartLoader = () => `<div id="acpl-chart-container-loader"><span>${stockfishName}<br>server analysis</span>${spinnerHtml}</div>`;
  function startAdvantageChart() {
    if (advChart || site.blindMode) return;
    const loading = !ctrl.tree.root.eval || !Object.keys(ctrl.tree.root.eval).length;
    const $panel = $panels.filter(".computer-analysis");
    if (!$("#acpl-chart-container").length)
      $panel.html(
        '<div id="acpl-chart-container"><canvas id="acpl-chart"></canvas></div>' + (loading ? chartLoader() : "")
      );
    else if (loading && !$("#acpl-chart-container-loader").length) $panel.append(chartLoader());
    site.asset.loadEsm("chart.game").then((m) => {
      m.acpl($("#acpl-chart")[0], data, ctrl.serverMainline()).then((chart) => {
        advChart = chart;
      });
    });
  }
  const store = storage.make("analysis.panel");
  const setPanel = function(panel) {
    $menu.children(".active").removeClass("active");
    $menu.find(`[data-panel="${panel}"]`).addClass("active");
    $panels.removeClass("active").filter("." + panel).addClass("active");
    if ((panel === "move-times" || ctrl.opts.hunter) && !timeChartLoaded)
      site.asset.loadEsm("chart.game").then((m) => {
        $("#movetimes-chart").each(function() {
          timeChartLoaded = true;
          m.movetime(this, data, ctrl.opts.hunter);
        });
      });
    if ((panel === "computer-analysis" || ctrl.opts.hunter) && $("#acpl-chart-container").length)
      setTimeout(startAdvantageChart, 200);
  };
  $menu.on("click", "button", function() {
    const panel = this.dataset.panel;
    store.set(panel);
    setPanel(panel);
  });
  const stored = store.get();
  const foundStored = stored && $menu.children(`[data-panel="${stored}"]`).filter(function() {
    const display = window.getComputedStyle(this).display;
    return !!display && display !== "none";
  }).length;
  if (foundStored) setPanel(stored);
  else {
    const $menuCt = $menu.children('[data-panel="ctable"]');
    ($menuCt.length ? $menuCt : $menu.children(":first-child")).trigger("click");
  }
  if (!data.analysis) {
    $panels.find("form.future-game-analysis").on("submit", function() {
      if ($(this).hasClass("must-login")) {
        confirm(i18n.site.youNeedAnAccountToDoThat, i18n.site.signIn, i18n.site.cancel).then((yes) => {
          if (yes) location.href = "/login?referrer=" + window.location.pathname;
        });
        return false;
      }
      ctrl.settings.set("showStaticAnalysis", true);
      ctrl.redraw();
      textRaw(this.action, { method: this.method }).then((res) => {
        if (res.ok) startAdvantageChart();
        else
          res.text().then(async (t) => {
            if (t && !t.startsWith("<!DOCTYPE html>")) await alert(t);
            site.reload();
          });
      });
      return false;
    });
  }
  $panels.on("click", ".pgn", function() {
    const selection = window.getSelection(), range = document.createRange();
    range.selectNodeContents(this);
    const currentlyUnselected = selection.isCollapsed;
    selection.removeAllRanges();
    if (currentlyUnselected) selection.addRange(range);
  });
  $panels.on("click", ".embed-howto", function() {
    const url2 = `${baseUrl()}/embed/game/${data.game.id}?theme=auto&bg=auto${location.hash}`;
    const iframe = `<iframe src="${url2}"
width=600 height=397 frameborder=0></iframe>`;
    domDialog({
      modal: true,
      show: true,
      easyClose: "clickOutside",
      htmlText: '<div><strong style="font-size:1.5em">' + $(this).html() + "</strong><br /><br /><pre>" + escapeHtml(iframe) + "</pre><br />" + iframe + `<br /><br /><a class="text" data-icon="${licon.InfoCircle}" href="/developers#embed-game">Read more about embedding games</a></div>`
    });
  });
  (_a2 = document.querySelector("a.game-gif")) == null ? void 0 : _a2.addEventListener("click", (e) => {
    e.preventDefault();
    site.asset.loadEsm("analyse.gifDialog", { init: ctrl });
  });
}

// ../analyse/src/view/materialDiffs.ts
var renderMaterialDiffs2 = (ctrl) => renderMaterialDiffs(
  !!ctrl.data.pref.showCaptured,
  ctrl.bottomColor(),
  ctrl.node.fen,
  !!(ctrl.data.player.checks || ctrl.data.opponent.checks),
  // showChecks
  ctrl.nodeList,
  ctrl.node.ply
);

// ../analyse/src/view/components.ts
function viewContext(ctrl, deps) {
  var _a2, _b, _c, _d, _e;
  const playerBars = deps == null ? void 0 : deps.renderPlayerBars(ctrl);
  return {
    ctrl,
    deps,
    study: ctrl.study,
    relay: (_a2 = ctrl.study) == null ? void 0 : _a2.relay,
    concealOf: makeConcealOf(ctrl),
    showCevalPvs: !((_b = ctrl.retro) == null ? void 0 : _b.isSolving()) && !ctrl.practice,
    gamebookPlayView: ((_c = ctrl.study) == null ? void 0 : _c.gamebookPlay) && (deps == null ? void 0 : deps.gbPlay.render(ctrl.study.gamebookPlay)),
    playerBars,
    playerStrips: playerBars ? void 0 : renderPlayerStrips(ctrl),
    gaugeOn: ctrl.showEvalGauge(),
    needsInnerCoords: ctrl.data.pref.showCaptured || ctrl.showEvalGauge() || !!playerBars,
    hasRelayTour: ((_e = (_d = ctrl.study) == null ? void 0 : _d.relay) == null ? void 0 : _e.tourShow()) || false
  };
}
function renderMain({ ctrl, relay, playerBars, gaugeOn, gamebookPlayView, needsInnerCoords, hasRelayTour }, ...kids) {
  var _a2, _b;
  const isRelay = defined((_a2 = ctrl.study) == null ? void 0 : _a2.relay);
  return hl(
    "main.analyse.variant-" + ctrl.data.game.variant.key,
    {
      attrs: {
        "data-active-tool": ctrl.activeControlBarTool(),
        "data-active-mode": ctrl.activeControlMode()
      },
      hook: {
        insert: () => {
          forceInnerCoords(ctrl, needsInnerCoords);
          if (!relay && !!playerBars !== document.body.classList.contains("header-margin"))
            $("body").toggleClass("header-margin", !!playerBars);
        },
        update(_, _2) {
          forceInnerCoords(ctrl, needsInnerCoords);
        },
        postpatch(old, vnode) {
          if (old.data.gaugeOn !== gaugeOn) dispatchChessgroundResize();
          vnode.data.gaugeOn = gaugeOn;
        }
      },
      class: {
        "comp-off": !ctrl.settings.showStaticAnalysis,
        "gauge-on": gaugeOn,
        "has-players": !!playerBars,
        "gamebook-play": !!gamebookPlayView,
        "has-relay-tour": hasRelayTour,
        "is-relay": isRelay,
        "analyse-hunter": ctrl.opts.hunter,
        "analyse--wiki": !!ctrl.wiki && !ctrl.study,
        "relay-in-variation": !!((_b = ctrl.study) == null ? void 0 : _b.isRelayAndInVariation())
      }
    },
    kids
  );
}
var renderBoard = ({ ctrl, study, playerBars, playerStrips }) => hl(
  addChapterId(study, "div.analyse__board.main-board"),
  {
    hook: "ontouchstart" in window || !storage.boolean("scrollMoves").getOrDefault(true) ? void 0 : bindNonPassive(
      "wheel",
      stepwiseScroll(
        (e) => {
          if (e.deltaY > 0) ctrl.navigate.next();
          else if (e.deltaY < 0) ctrl.navigate.prev();
          ctrl.redraw();
        },
        (e) => !!ctrl.gamebookPlay() || !["PIECE", "SQUARE", "CG-BOARD"].includes(e.target.tagName)
      )
    )
  },
  [
    playerStrips,
    playerBars == null ? void 0 : playerBars[ctrl.bottomIsWhite() ? 1 : 0],
    render(ctrl),
    playerBars == null ? void 0 : playerBars[ctrl.bottomIsWhite() ? 0 : 1],
    ctrl.promotion.view(ctrl.data.game.variant.key === "antichess")
  ]
);
var renderUnderboard = ({ ctrl, deps, study }) => hl(
  "div.analyse__underboard",
  {
    hook: ctrl.synthetic || playable(ctrl.data) ? void 0 : onInsert((elm) => serverSideUnderboard_default(elm, ctrl))
  },
  study ? deps == null ? void 0 : deps.studyView.underboard(ctrl) : [renderInputs(ctrl)]
);
function renderInputs(ctrl) {
  if (ctrl.ongoing || !ctrl.data.userAnalysis) return void 0;
  if (ctrl.redirecting) return spinnerVdom();
  return hl("div.copyables", [
    hl("div.pair", [
      hl("label.name", "FEN"),
      hl("input.copyable", {
        attrs: { spellcheck: "false", enterkeyhint: "done" },
        hook: {
          ...onInsert((el) => {
            el.value = defined(ctrl.fenInput) ? ctrl.fenInput : ctrl.node.fen;
            el.addEventListener("change", () => {
              if (el.value !== ctrl.node.fen && el.reportValidity()) ctrl.changeFen(el.value.trim());
            });
            el.addEventListener("input", () => {
              ctrl.fenInput = el.value;
              el.setCustomValidity(parseFen(el.value.trim()).isOk ? "" : "Invalid FEN");
            });
          }),
          postpatch: (_, vnode) => {
            const el = vnode.elm;
            if (!defined(ctrl.fenInput)) {
              el.value = ctrl.node.fen;
              el.setCustomValidity("");
            } else if (el.value !== ctrl.fenInput) el.value = ctrl.fenInput;
          }
        }
      })
    ]),
    hl("div.pgn", [
      hl("div.pair", [
        hl("label.name", "PGN"),
        hl("textarea.copyable", {
          attrs: { spellcheck: "false" },
          class: { "is-error": !!ctrl.pgnError },
          hook: {
            ...onInsert((el) => {
              el.value = defined(ctrl.pgnInput) ? ctrl.pgnInput : renderFullTxt(ctrl);
              const changePgnIfDifferent = () => el.value !== renderFullTxt(ctrl) && ctrl.changePgn(el.value, true);
              el.addEventListener("input", () => ctrl.pgnInput = el.value);
              el.addEventListener("keypress", (e) => {
                if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || isMobile())
                  return void 0;
                else if (changePgnIfDifferent()) e.preventDefault();
                return void 0;
              });
              if (isMobile()) el.addEventListener("focusout", changePgnIfDifferent);
            }),
            postpatch: (_, vnode) => {
              vnode.elm.value = defined(ctrl.pgnInput) ? ctrl.pgnInput : renderFullTxt(ctrl);
            }
          }
        }),
        !isMobile() && hl(
          "button.button.button-thin.bottom-item.bottom-action.text",
          {
            attrs: dataIcon(licon.PlayTriangle),
            hook: bind("click", (_) => {
              const pgn = $(".copyables .pgn textarea").val();
              if (pgn !== renderFullTxt(ctrl)) ctrl.changePgn(pgn, true);
            })
          },
          i18n.site.importPgn
        ),
        hl(
          "div.bottom-item.bottom-error",
          { attrs: dataIcon(licon.CautionTriangle), class: { "is-error": !!ctrl.pgnError } },
          renderPgnError(ctrl.pgnError)
        )
      ])
    ])
  ]);
}
function renderResult(ctrl) {
  var _a2, _b;
  const termination = () => ctrl.study && findTag(ctrl.study.data.chapter.tags, "termination");
  const render2 = (result, status2) => [
    hl("div.result", result),
    hl("div.status", [termination() && `${termination()} \u2022 `, status2])
  ];
  if (ctrl.data.game.status.id >= 30) {
    const winner = ctrl.data.game.winner;
    const result = winner === "white" ? "1-0" : winner === "black" ? "0-1" : "\xBD-\xBD";
    return render2(result, status(ctrl.data));
  } else if ((_a2 = ctrl.study) == null ? void 0 : _a2.multiBoard.showResults()) {
    const result = (_b = findTag(ctrl.study.data.chapter.tags, "result")) == null ? void 0 : _b.replace("1/2", "\xBD");
    if (!result || result === "*") return [];
    if (result === "1-0") return render2(result, i18n.site.whiteIsVictorious);
    if (result === "0-1") return render2(result, i18n.site.blackIsVictorious);
    if (result === "0-0") return render2(result, i18n.study.doubleDefeat);
    if (result === "\xBD-0") return render2(result, i18n.study.blackDefeatWhiteCanNotWin);
    if (result === "0-\xBD") return render2(result, i18n.study.whiteDefeatBlackCanNotWin);
    return render2("\xBD-\xBD", i18n.site.draw);
  }
  return [];
}
var renderIndexAndMove = (node, withEval, withGlyphs) => node.san ? [renderIndex(node.ply, true), ...renderMoveNodes(node, withEval, withGlyphs)] : [];
var renderIndex = (ply, withDots) => h("index", plyToTurn(ply) + (withDots ? ply % 2 === 1 ? "." : "..." : ""));
function renderMoveNodes(node, withEval, withGlyphs, ev, glyphs2) {
  var _a2, _b;
  ev != null ? ev : ev = (_a2 = node.ceval) != null ? _a2 : node.eval;
  const evalText = !ev ? "" : (ev == null ? void 0 : ev.cp) !== void 0 ? renderEval(ev.cp) : (ev == null ? void 0 : ev.mate) !== void 0 ? `#${ev.mate}` : "";
  const nodes = [h("san", fixCrazySan(node.san))];
  const relevantGlyphs = glyphs2 != null ? glyphs2 : node.glyphs;
  if (withGlyphs && relevantGlyphs)
    relevantGlyphs.forEach((g) => nodes.push(h("glyph", { attrs: { title: g.name } }, g.symbol)));
  if (withEval && ((_b = node.shapes) == null ? void 0 : _b.length)) nodes.push(h("shapes"));
  if (withEval && evalText && ev)
    nodes.push(h("eval", { attrs: { title: evalInfo(ev) } }, evalText.replace("-", "\u2212")));
  return nodes;
}
function evalInfo(ev) {
  if ("knodes" in ev) return `Server eval \xB7 About ${(ev.knodes * 1e3).toLocaleString()} nodes searched`;
  if (!("nodes" in ev)) return "Unknown strength";
  const prelude = ev.cloud ? "Cloud eval" : "Local eval";
  return `${prelude} \xB7 ${ev.nodes.toLocaleString()} nodes searched`;
}
var addChapterId = (study, cssClass) => cssClass + ((study == null ? void 0 : study.data.chapter) ? "." + study.data.chapter.id : "");
function makeConcealOf(ctrl) {
  var _a2, _b;
  if (defined((_a2 = ctrl.study) == null ? void 0 : _a2.relay)) {
    if (!ctrl.study.multiBoard.showResults()) {
      return (_) => (path, _2) => path_exports.contains(ctrl.path, ctrl.onMainline ? path : path_exports.init(path)) ? null : "hide";
    }
    return void 0;
  }
  const conceal = ((_b = ctrl.study) == null ? void 0 : _b.data.chapter.conceal) !== void 0 ? {
    owner: ctrl.study.isChapterOwner(),
    ply: ctrl.study.data.chapter.conceal
  } : null;
  if (conceal)
    return (isMainline) => (path, node) => {
      if (!conceal || isMainline && conceal.ply >= node.ply || path_exports.contains(ctrl.path, path))
        return null;
      return conceal.owner ? "conceal" : "hide";
    };
  return void 0;
}
var prevForceInnerCoords;
function forceInnerCoords({ data }, v) {
  if (data.pref.coords === Coords.Outside) {
    if (prevForceInnerCoords !== v) {
      prevForceInnerCoords = v;
      $("body").toggleClass("coords-in", v).toggleClass("coords-out", !v);
    }
  }
}
function renderPlayerStrips(ctrl) {
  const renderPlayerStrip = (cls, materialDiff, clock) => hl("div.analyse__player_strip." + cls, [materialDiff, clock]);
  const clocks = renderClocks(ctrl, ctrl.path), whitePov = ctrl.bottomIsWhite(), materialDiffs = renderMaterialDiffs2(ctrl);
  return [
    renderPlayerStrip("top", materialDiffs[0], clocks == null ? void 0 : clocks[whitePov ? 1 : 0]),
    renderPlayerStrip("bottom", materialDiffs[1], clocks == null ? void 0 : clocks[whitePov ? 0 : 1])
  ];
}

// ../lib/src/view/verticalResize.ts
function verticalResize(o) {
  return hl(
    "div.vertical-resize",
    {
      hook: {
        ...onInsert((divider) => {
          function getSelectorElement(o2) {
            return o2.selector ? document.querySelector(o2.selector) : divider.previousElementSibling;
          }
          const onDomChange = () => {
            var _a2, _b;
            const el = getSelectorElement(o);
            if (el.style.height) return;
            let height = o.id && heightStore(`${o.key}.${o.id}`);
            if (typeof height !== "number") height = (_b = heightStore(o.key)) != null ? _b : (_a2 = o.initialMaxHeight) == null ? void 0 : _a2.call(o);
            if (typeof height !== "number") height = el.getBoundingClientRect().height;
            el.style.flex = "none";
            el.style.height = `${clamp(height, { min: o.min(), max: o.max() })}px`;
          };
          onDomChange();
          divider.observer = new MutationObserver(onDomChange);
          divider.observer.observe(divider.parentElement, { childList: true });
          divider.addEventListener("pointerdown", (down) => {
            safariHack(true);
            divider.classList.add("is-dragging");
            const el = getSelectorElement(o);
            const beginFrom = el.getBoundingClientRect().height - down.clientY;
            divider.setPointerCapture(down.pointerId);
            const move = (move2) => {
              el.style.height = `${clamp(beginFrom + move2.clientY, { min: o.min(), max: o.max() })}px`;
            };
            const up = () => {
              document.body.classList.remove("prevent-select");
              divider.classList.remove("is-dragging");
              divider.releasePointerCapture(down.pointerId);
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", up);
              window.removeEventListener("pointercancel", up);
              const height = parseInt(el.style.height);
              heightStore(o.key, height);
              if (o.id) heightStore(`${o.key}.${o.id}`, height);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
            window.addEventListener("pointercancel", up);
          });
        }),
        destroy: (vn) => {
          var _a2;
          return (_a2 = vn.elm.observer) == null ? void 0 : _a2.disconnect();
        }
      }
    },
    [o.kid, hl("hr", { attrs: { role: "separator" } })]
  );
}
var safariHack = (enable) => {
  if (isSafari()) {
    site.asset.loadCssPath("bits.safari-sucks");
    document.body.classList.toggle("prevent-select", enable);
  }
};
var heightStore = storedMap(
  `lib.view.verticalResize.height-store.${myUserId()}`,
  100,
  () => void 0
);

// ../analyse/src/study/relay/liveboardPlugin.ts
var LiveboardPlugin = class {
  constructor(ctrl, round, isDisabled, chapterId) {
    this.ctrl = ctrl;
    this.round = round;
    this.isDisabled = isDisabled;
    this.chapterId = chapterId;
    this.key = "liveboard";
    this.name = i18n.broadcast.liveboard;
    this.kidSafe = true;
  }
  setChapterId(id) {
    this.chapterId = id;
  }
  view() {
    var _a2;
    const preview = this.ctrl.chapters.list.get(this.chapterId);
    if (!preview) return spinnerVdom();
    const cloudEval = (_a2 = this.ctrl.multiCloudEval) == null ? void 0 : _a2.thisIfShowEval();
    const orientation = this.ctrl.bottomColor();
    const extraCgConfig = () => ({
      addDimensionsCssVarsTo: document.querySelector("section.mchat") || void 0
    });
    return hl(
      "div.chat-liveboard",
      hl(
        `span.mini-game.is2d.liveboard-chapter-${preview.id}.liveboard-orientation-${orientation}`,
        previewContent(preview, orientation, cloudEval, true, this.round, extraCgConfig)
      )
    );
  }
};

// ../analyse/src/study/relay/relayStats.ts
var RelayStats = class {
  constructor(round, redraw) {
    this.round = round;
    this.redraw = redraw;
    this.loadFromXhr = async () => {
      this.data = await json(`/broadcast/round/${this.round.id}/stats`);
      this.redraw();
      await site.asset.loadEsm("chart.relayStats", {
        init: {
          ...this.data,
          round: this.round
        }
      });
    };
  }
};
var statsView = (ctrl) => h(
  "div.relay-tour__stats",
  {
    class: { loading: !ctrl.data },
    hook: onInsert(() => ctrl.loadFromXhr())
  },
  ctrl.data ? [
    ctrl.data.unique ? h("div.relay-tour__stats__unique.box", [
      "Round unique viewers: ",
      h("strong", numberFormat(ctrl.data.unique))
    ]) : null,
    h("div", [h("canvas")])
  ] : [spinnerVdom()]
);

// ../analyse/src/study/relay/relayTeamStandings.ts
var finishedTeamMatchCount = (matches) => matches.filter((match) => match.points !== void 0).length;

// ../analyse/src/study/relay/relayTeamLeaderboard.ts
var RelayTeamLeaderboard = class {
  constructor(tourId, switchToTeamResultsTab, redraw, players2) {
    this.tourId = tourId;
    this.switchToTeamResultsTab = switchToTeamResultsTab;
    this.redraw = redraw;
    this.players = players2;
    this.loadFromXhr = throttle(3 * 1e3, async () => {
      var _a2, _b;
      this.standings = await json(`/broadcast/${this.tourId}/teams/standings`);
      const showFeds = this.looksLikeFederationTournament();
      this.standings = (_a2 = this.standings) == null ? void 0 : _a2.map((t) => this.convertTeamFromServer(t, showFeds));
      (_b = this.table) == null ? void 0 : _b.refresh();
      this.redraw();
    });
    this.tabHash = () => this.teamToShow ? `#team-results/${encodeURIComponent(this.teamToShow)}` : "#team-results";
    this.closeTeam = () => {
      this.teamToShow = void 0;
    };
    this.setTabHash = () => {
      const hash = this.tabHash();
      if (location.hash !== hash) history.replaceState({}, "", hash);
    };
    this.setTeamToShow = (team) => {
      this.switchToTeamResultsTab();
      this.teamToShow = team;
      this.setTabHash();
      this.redraw();
    };
    this.standingsView = () => !this.standings ? spinnerVdom() : hl(
      "table.relay-tour__teams__standings.slist.slist-pad",
      {
        hook: onInsert((el) => {
          this.table = tableAugment(el);
        })
      },
      [
        hl("thead", [
          hl("tr", [
            hl("th.text", { attrs: dataIcon(licon.Group) }, i18n.team.team),
            hl("th", i18n.broadcast.matches),
            hl("th", { attrs: { "data-sort-default": 1 } }, i18n.broadcast.matchPoints),
            hl("th", i18n.broadcast.gamePoints)
          ])
        ]),
        hl(
          "tbody",
          this.standings.map(
            (entry) => hl("tr", [
              hl("td", this.teamNameNode(entry)),
              hl("td", finishedTeamMatchCount(entry.matches)),
              hl(
                "td",
                { attrs: { "data-sort": entry.mp * 1e3 + entry.gp, title: i18n.broadcast.matchPoints } },
                `${entry.mp}`
              ),
              hl("td", { attrs: { title: i18n.broadcast.gamePoints } }, `${entry.gp}`)
            ])
          )
        )
      ]
    );
    this.teamView = () => {
      if (!this.standings) return spinnerVdom();
      const foundTeam = this.standings.find((t) => t.name === this.teamToShow);
      if (!foundTeam) {
        this.teamToShow = void 0;
        return this.standingsView();
      }
      return hl("div.relay-tour__team-summary", [
        hl("div.relay-tour__team-summary", [
          hl(
            "h2.relay-tour__team-summary__header.text",
            { attrs: !this.looksLikeFederationTournament() ? dataIcon(licon.Group) : {} },
            this.teamNameNode(foundTeam)
          ),
          hl(
            "table.relay-tour__team-summary__header__stats",
            hl("tbody", [
              hl("tr", [
                hl("th", i18n.broadcast.matches),
                hl("td", `${finishedTeamMatchCount(foundTeam.matches)}`)
              ]),
              hl("tr", [hl("th", i18n.broadcast.matchPoints), hl("td", `${foundTeam.mp}`)]),
              hl("tr", [hl("th", i18n.broadcast.gamePoints), hl("td", `${foundTeam.gp}`)]),
              foundTeam.averageRating && hl("tr", [hl("th", i18n.site.averageElo), hl("td", `${foundTeam.averageRating}`)])
            ])
          )
        ]),
        hl("div.relay-tour__team-summary__roster", renderPlayers(this.players, foundTeam.players, true)),
        hl("h2.relay-tour__team-summary__matches__header", i18n.broadcast.matchHistory),
        hl("div.relay-tour__team-summary__matches", [
          hl("table.relay-tour__team-summary__table.slist.slist-pad", [
            hl(
              "thead",
              hl("tr", [
                hl("th"),
                hl("th", i18n.team.team),
                hl("th", i18n.broadcast.matchPoints),
                hl("th", i18n.broadcast.gamePoints)
              ])
            ),
            hl(
              "tbody",
              foundTeam.matches.map((match, i) => {
                var _a2, _b, _c;
                const oppTeam = (_a2 = this.standings) == null ? void 0 : _a2.find((t) => t.name === match.opponent);
                return hl("tr", [
                  hl(
                    "td.game-link",
                    hl(
                      "a.game-link text",
                      {
                        attrs: { ...dataIcon(licon.StudyBoard), href: `/broadcast/-/-/${match.roundId}#teams` }
                      },
                      `${i + 1}`
                    )
                  ),
                  hl(
                    "td",
                    hl(
                      "a.team-name",
                      {
                        on: {
                          click: this.toggleTeam(match.opponent)
                        }
                      },
                      oppTeam ? this.teamNameNode(oppTeam) : match.opponent
                    )
                  ),
                  hl(
                    "td.score",
                    hl(match.points === "1" ? "good" : match.points === "0" ? "bad" : "draw", (_b = match.mp) != null ? _b : "*")
                  ),
                  hl("td.score", (_c = match.gp) != null ? _c : "*")
                ]);
              })
            )
          ])
        ])
      ]);
    };
    this.view = () => requiresI18n(
      "team",
      this.redraw,
      () => hl(
        "div.relay-tour__team__results",
        { hook: onInsert(this.loadFromXhr) },
        this.teamToShow ? this.teamView() : this.standingsView()
      )
    );
    this.teamNameNode = (team) => {
      var _a2;
      return hl(
        "a.team-name",
        {
          on: {
            click: this.toggleTeam(team.name)
          }
        },
        [
          playerFedFlag(team.fed),
          // Don't translate names like "Hungary B".
          team.name.toLowerCase() === ((_a2 = team.fed) == null ? void 0 : _a2.name.toLowerCase()) && team.fed.i18nName || team.name
        ]
      );
    };
    this.convertTeamFromServer = (team, showFeds) => ({
      ...team,
      fed: showFeds ? this.teamNameToFed(team.name) : void 0,
      players: team.players.map(
        (player) => convertPlayerFromServer(player)
      )
    });
    this.toggleTeam = (team) => (ev) => {
      ev.preventDefault();
      this.setTeamToShow(team);
    };
    this.teamNameToFed = (teamName) => {
      const teamNameLower = teamName.toLowerCase();
      const foundFed = Object.entries(federations).find(
        ([_, [engName, _2]]) => teamNameLower.startsWith(engName.toLowerCase())
      );
      return foundFed && {
        id: foundFed[0],
        name: foundFed[1][0],
        i18nName: foundFed[1][1] ? localizedName(foundFed[0]) : void 0
      };
    };
    this.looksLikeFederationTournament = memoize(() => {
      if (!this.standings) return false;
      const teamsWithFed = this.standings.filter((team) => !!this.teamNameToFed(team.name));
      return teamsWithFed.length / this.standings.length >= 0.8;
    });
    var _a2;
    const locationTeam = (_a2 = location.hash.match(/^#team-results\/(.+)$/)) == null ? void 0 : _a2[1];
    if (locationTeam) this.teamToShow = decodeURIComponent(locationTeam);
  }
};

// ../analyse/src/study/relay/relayTeams.ts
var RelayTeams = class {
  constructor(tour, round, multiCloudEval, chapterSelect, roundPath, redraw) {
    this.tour = tour;
    this.round = round;
    this.multiCloudEval = multiCloudEval;
    this.chapterSelect = chapterSelect;
    this.roundPath = roundPath;
    this.redraw = redraw;
    this.loading = false;
    this.loadFromXhr = async (onInsert2) => {
      if (this.teams && !onInsert2) {
        this.loading = true;
        this.redraw();
      }
      this.teams = await json(`/broadcast/${this.round.id}/teams`);
      this.redraw();
    };
    this.onNewTags = (chapter, newTags, chapters, cs) => {
      var _a2, _b, _c;
      const hasNewResult = newTags.find(([k]) => k.toLowerCase() === "result") !== ((_b = (_a2 = chapters.get(chapter)) == null ? void 0 : _a2.status) == null ? void 0 : _b.replace("\xBD", "1/2"));
      if (!hasNewResult) return;
      (_c = this.teams) == null ? void 0 : _c.table.map(
        (row) => COLORS.forEach((c, i) => {
          const teamPoints = row.games.reduce((acc, g) => {
            const chap = chapters.get(g.id);
            if (!(chap == null ? void 0 : chap.status) || chap.status === "*") return acc;
            const points2 = chap.status.split("-");
            if (c !== g.pov) points2.reverse();
            if (!points2.every(isServerPoint)) return acc;
            const point = withCustomScore(points2[0], c, cs);
            if (typeof point === "number") return acc + point;
            const parsed = parseFloat(point.replace("\xBD", ".5"));
            return Number.isNaN(parsed) ? acc : acc + parsed;
          }, 0);
          if (defined(teamPoints)) row.teams[i].points = teamPoints;
        })
      );
    };
  }
};
var teamsView = (ctrl, chapters, players2) => {
  var _a2;
  return hl(
    "div.relay-tour__team-table",
    {
      class: { loading: ctrl.loading, nodata: !ctrl.teams },
      hook: onInsert((elm) => {
        gameLinksListener(ctrl.chapterSelect)(elm);
        ctrl.loadFromXhr(true);
      })
    },
    ctrl.teams ? renderTeams(
      ctrl.teams,
      chapters,
      ctrl.roundPath(),
      players2,
      (_a2 = ctrl.multiCloudEval) == null ? void 0 : _a2.thisIfShowEval(),
      ctrl.round,
      ctrl.tour.showTeamScores
    ) : [spinnerVdom()]
  );
};
var renderTeams = (teams2, chapters, roundPath, playersCtrl, cloudEval, round, showTeamScores) => teams2.table.map((row) => {
  const firstTeam = row.teams[0];
  const secondTeam = row.teams[1];
  const isFinished2 = row.games.every((g) => {
    const chap = chapters.get(g.id);
    return (chap == null ? void 0 : chap.status) !== "*";
  });
  const resultClass = (team1, team2) => !isFinished2 ? "" : team1.points > team2.points ? "good." : team1.points < team2.points ? "bad." : "result.";
  return hl("div.relay-tour__team-match", [
    hl("div.relay-tour__team-match__teams", [
      hl(
        "strong.relay-tour__team-match__team",
        showTeamScores ? hl("a.team", teamLinkData(firstTeam.name), firstTeam.name) : firstTeam.name
      ),
      hl("span.relay-tour__team-match__team__points", [
        hl(`${resultClass(firstTeam, secondTeam)}result`, firstTeam.points),
        hl("vs", "vs"),
        hl(`${resultClass(secondTeam, firstTeam)}result`, secondTeam.points)
      ]),
      hl(
        "strong.relay-tour__team-match__team",
        showTeamScores ? hl("a.team", teamLinkData(secondTeam.name), secondTeam.name) : secondTeam.name
      )
    ]),
    hl(
      "div.relay-tour__team-match__games",
      row.games.map((game) => {
        const chap = chapters.get(game.id);
        const players2 = chap == null ? void 0 : chap.players;
        if (!players2) return void 0;
        const sortedPlayers = game.pov === "white" ? [players2.white, players2.black] : [players2.black, players2.white];
        return chap && hl("a.relay-tour__team-match__game", { attrs: gameLinkAttrs(roundPath, chap) }, [
          playerView2(playersCtrl, sortedPlayers[0]),
          statusView(chap, game.pov, chapters, cloudEval, round),
          playerView2(playersCtrl, sortedPlayers[1])
        ]);
      })
    )
  ]);
});
var playerView2 = (players2, p) => hl("span.relay-tour__team-match__game__player", [
  hl("span.mini-game__user", players2.playerLinkConfig(p), [
    playerFedFlag(p.fed),
    hl("span.name", [userTitle(p), p.name])
  ]),
  !!p.rating && hl("rating", `${p.rating}`)
]);
var statusView = (g, pov, chapters, cloudEval, round) => hl(
  "span.relay-tour__team-match__game__status",
  g.status && g.status !== "*" ? coloredStatusStr(g.status, pov, round) : cloudEval ? evalGauge(g, pov, chapters, cloudEval) : "*"
);
var evalGauge = (game, pov, chapters, cloudEval) => hl(
  `span.eval-gauge-horiz.pov-${pov}`,
  {
    attrs: { "data-id": game.id },
    hook: onInsert(cloudEval.observe)
  },
  [
    hl(`span.eval-gauge-horiz__black`, {
      hook: {
        postpatch(old, vnode) {
          var _a2, _b;
          const prevNodeCloud = (_a2 = old.data) == null ? void 0 : _a2.cloud;
          const fen = (_b = chapters.get(game.id)) == null ? void 0 : _b.fen;
          const cev = fen && cloudEval.getCloudEval(fen) || prevNodeCloud;
          if ((cev == null ? void 0 : cev.chances) !== (prevNodeCloud == null ? void 0 : prevNodeCloud.chances)) {
            const elm = vnode.elm;
            const gauge = elm.parentNode;
            elm.style.width = `${(1 - ((cev == null ? void 0 : cev.chances) || 0)) / 2 * 100}%`;
            if (cev) {
              gauge.title = renderScore(cev);
              gauge.classList.add("eval-gauge-horiz--set");
            }
          }
          vnode.data.cloud = cev;
        }
      }
    }),
    hl("tick.zero")
  ]
);

// ../analyse/src/study/relay/videoPlayer.ts
var VideoPlayer = class {
  constructor(o, redraw) {
    this.o = o;
    this.redraw = redraw;
    this.cover = (placeholder) => {
      if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = requestAnimationFrame(() => {
        if (!placeholder) {
          this.iframe.remove();
          this.close.remove();
          return;
        }
        const position = placeholder.getBoundingClientRect();
        this.iframe.style.display = "block";
        this.iframe.style.left = `${position.x}px`;
        this.iframe.style.top = `${position.y + window.scrollY}px`;
        this.iframe.style.width = `${position.width}px`;
        this.iframe.style.height = `${position.height}px`;
        this.close.style.left = `${position.x + position.width - 16}px`;
        this.close.style.top = `${position.y + window.scrollY - 4}px`;
        if (document.body.contains(this.iframe)) return;
        document.body.appendChild(this.iframe);
        document.body.appendChild(this.close);
      });
    };
    this.addWindowResizer = () => {
      let showingVideo = false;
      window.addEventListener(
        "resize",
        () => {
          var _a2;
          const allow = allowVideo();
          const placeholder = (_a2 = document.getElementById("video-player-placeholder")) != null ? _a2 : void 0;
          this.cover(allow ? placeholder : void 0);
          if (showingVideo === allow && !!placeholder) return;
          showingVideo = allow && !!placeholder;
          this.redraw();
        },
        { passive: true }
      );
    };
    this.render = () => {
      return this.o.embed ? hl("div#video-player-placeholder", {
        hook: {
          ...onInsert(this.cover),
          update: (_, vnode) => this.cover(vnode.elm)
        }
      }) : hl("div#video-player-placeholder.link", [
        hl("div.image", {
          attrs: { style: `background-image: url(${this.o.image})` },
          hook: onInsert((el) => {
            el.addEventListener("click", (e) => {
              if (e.ctrlKey || e.shiftKey) window.open(this.o.redirect, "_blank");
              else this.onEmbed("ps");
            });
            el.addEventListener("contextmenu", () => window.open(this.o.redirect, "_blank"));
          })
        }),
        hl("icon.video-player-close", {
          attrs: { "data-icon": licon.X },
          hook: onInsert((el) => el.addEventListener("click", () => this.onEmbed("no")))
        }),
        this.o.text && hl("div.text-box", hl("div", this.o.text)),
        hl(
          "svg.play-button",
          {
            attrs: {
              xmlns: "http://www.w3.org/2000/svg",
              viewBox: "0 0 200 200"
            }
          },
          [
            hl("circle", {
              attrs: {
                cx: "100",
                cy: "100",
                r: "90"
              }
            }),
            hl("path", {
              attrs: {
                d: "M 68 52 A 5 5 0 0 1 74 46 L 154 96 A 5 5 0 0 1 154 104 L 74 154 A 5 5 0 0 1 68 148 Z"
              }
            })
          ]
        )
      ]);
    };
    this.onEmbed = (stream) => {
      const urlWithEmbed = new URL(location.href);
      urlWithEmbed.searchParams.set("embed", stream);
      window.location.href = urlWithEmbed.toString();
    };
    if (!o.embed) return;
    this.iframe = document.createElement("iframe");
    this.iframe.setAttribute("credentialless", "");
    this.iframe.style.display = "none";
    this.iframe.id = "video-player";
    this.iframe.src = o.embed;
    this.iframe.allow = "autoplay";
    this.close = document.createElement("icon");
    this.close.dataset.icon = licon.X;
    this.close.className = "video-player-close";
    this.close.addEventListener("click", () => this.onEmbed("no"), true);
    this.addWindowResizer();
  }
};
var allowVideo = () => window.getComputedStyle(document.body).getPropertyValue("---allow-video") === "true";

// ../analyse/src/study/relay/relayCtrl.ts
var relayTabs = ["overview", "boards", "teams", "players", "stats", "team-results"];
var RelayCtrl = class {
  constructor(study, data) {
    this.study = study;
    this.data = data;
    this.log = [];
    this.cooldown = false;
    this.streams = [];
    this.showStreamerMenu = toggle(false);
    this.redraw = () => {
      this.study.ctrl.redraw();
      this.study.updateHistoryAndAddressBar();
    };
    this.openTab = (t) => {
      this.players.closePlayer();
      this.teamLeaderboard.closeTeam();
      this.tab(t);
      this.tourShow(true);
      this.redraw();
    };
    this.onChapterChange = (id) => {
      var _a2;
      if (this.tourShow()) {
        this.tourShow(false);
      }
      (_a2 = this.liveboardPlugin) == null ? void 0 : _a2.setChapterId(id);
      if (this.study.vm.toolTab() === "serverEval" && !this.study.members.canContribute() && !this.study.data.chapter.serverEval)
        this.study.vm.toolTab("multiBoard");
      this.redraw();
    };
    this.lastMoveAt = (id) => {
      var _a2;
      return (_a2 = this.study.chapters.list.get(id)) == null ? void 0 : _a2.lastMoveAt;
    };
    this.setSync = (v) => {
      this.study.ctrl.socket.send("relaySync", v);
      this.redraw();
    };
    this.loading = () => {
      var _a2;
      return !this.cooldown && ((_a2 = this.data.sync) == null ? void 0 : _a2.ongoing);
    };
    this.setClockToChapterPreview = (msg, clocks) => {
      const cp = this.study.chapters.list.get(msg.p.chapterId);
      if (cp == null ? void 0 : cp.players)
        COLORS.forEach((color, i) => {
          const clock = clocks[i];
          if (notNull(clock)) cp.players[color].clock = clock;
        });
    };
    this.fullRoundName = () => `${this.data.tour.name} - ${this.round.name}`;
    this.tourPath = () => `/broadcast/${this.data.tour.slug}/${this.data.tour.id}`;
    this.roundPath = (round) => {
      const r = round || this.round;
      return `/broadcast/${this.data.tour.slug}/${r.slug}/${r.id}`;
    };
    this.roundUrlWithHash = (round) => `${this.roundPath(round)}#${this.tab()}`;
    this.updateAddressBar = (tourUrl, roundUrl) => {
      const tab = this.tab();
      const tabHash = () => tab === "overview" ? "" : tab === "players" ? this.players.tabHash() : tab === "team-results" ? this.teamLeaderboard.tabHash() : `#${tab}`;
      const url2 = this.tourShow() ? `${tourUrl}${tabHash()}` : roundUrl;
      if (!this.tourShow() && location.href.includes("#")) history.pushState({}, "", url2);
      else history.replaceState({}, "", url2);
    };
    this.isOfficial = () => !!this.data.tour.tier;
    this.isStreamer = () => this.streams.some(([id]) => id === myUserId());
    this.isPinnedStreamOngoing = () => {
      if (!this.data.pinned) return false;
      if (this.round.finishedAt) return false;
      return Date.now() >= this.round.startsAt - 1e3 * 3600;
    };
    this.onAddNode = () => {
      if (!this.round.ongoing) {
        this.round.ongoing = true;
        this.round.startsAt = this.round.startsAt || Date.now();
        this.data.delayedUntil = void 0;
      }
    };
    this.onNewTags = (chap, tags) => {
      var _a2;
      return (_a2 = this.teams) == null ? void 0 : _a2.onNewTags(chap, tags, this.study.chapters.list, this.round.customScoring);
    };
    this.socketHandlers = {
      relaySync: (sync) => {
        var _a2;
        this.data.sync = {
          ...sync,
          log: ((_a2 = this.data.sync) == null ? void 0 : _a2.log) || sync.log
        };
        this.redraw();
      },
      relayLog: (event) => {
        if (!this.data.sync) return;
        this.data.sync.log.push(event);
        this.data.sync.log = this.data.sync.log.slice(-20);
        this.cooldown = true;
        setTimeout(() => {
          this.cooldown = false;
          this.redraw();
        }, 4500);
        this.redraw();
      }
    };
    this.socketHandler = (t, d) => {
      const handler = this.socketHandlers[t];
      if (handler && d.id === this.study.data.id) {
        handler(d);
        return true;
      }
      return false;
    };
    var _a2, _b, _c, _d, _e, _f;
    this.round = this.data.rounds.find((r) => r.id === this.study.data.id);
    this.tourShow = toggle(
      (location.pathname.split("/broadcast/")[1].match(/\//g) || []).length < 3,
      (v) => v ? study.ctrl.ceval.reset() : study.ctrl.startCeval()
    );
    this.tourSelectShow = toggle(false, this.study.ctrl.redraw);
    this.roundSelectShow = toggle(false, this.study.ctrl.redraw);
    if (study.ctrl.opts.chat) {
      const liveboardDisabled = () => site.blindMode || this.tourShow() || !study.multiBoard.showResults();
      this.liveboardPlugin = new LiveboardPlugin(
        study,
        this.round,
        liveboardDisabled,
        study.chapterSelect.get()
      );
      study.ctrl.opts.chat.plugin = this.liveboardPlugin;
    }
    const locationTab = location.hash.replace(/^#([\w-]+).*$/, "$1");
    const initialTab = relayTabs.includes(locationTab) ? locationTab : this.study.chapters.list.looksNew() ? "overview" : "boards";
    this.tab = prop(initialTab);
    this.teams = data.tour.teamTable ? new RelayTeams(
      this.data.tour,
      this.round,
      study.multiCloudEval,
      study.chapterSelect,
      this.roundPath,
      this.redraw
    ) : void 0;
    this.players = new RelayPlayers(
      data.tour,
      () => this.openTab("players"),
      study.ctrl.isEmbed,
      () => study.multiBoard.showResults() ? void 0 : this.round.id,
      (fideId) => data.photos[fideId],
      this.redraw
    );
    this.teamLeaderboard = new RelayTeamLeaderboard(
      this.data.tour.id,
      () => this.openTab("team-results"),
      this.redraw,
      this.players
    );
    this.stats = new RelayStats(this.round, this.redraw);
    if (((_a2 = data.videoUrls) == null ? void 0 : _a2[0]) || this.isPinnedStreamOngoing())
      this.videoPlayer = new VideoPlayer(
        {
          embed: ((_b = this.data.videoUrls) == null ? void 0 : _b[0]) || false,
          redirect: ((_c = this.data.videoUrls) == null ? void 0 : _c[1]) || ((_d = this.data.pinned) == null ? void 0 : _d.redirect),
          image: this.data.tour.image,
          text: (_e = this.data.pinned) == null ? void 0 : _e.text
        },
        this.redraw
      );
    const pinnedName = this.isPinnedStreamOngoing() && ((_f = data.pinned) == null ? void 0 : _f.name);
    if (pinnedName) this.streams.push(["ps", { name: pinnedName, lang: "" }]);
    pubsub.on("socket.in.crowd", (d) => {
      var _a3, _b2;
      const s = (_b2 = (_a3 = d.streams) == null ? void 0 : _a3.slice()) != null ? _b2 : [];
      if (pinnedName) s.unshift(["ps", { name: pinnedName, lang: "" }]);
      if (this.streams.length === s.length && this.streams.every(([id], i) => id === s[i][0])) return;
      this.streams = s;
      this.redraw();
    });
    setInterval(study.ctrl.redraw, 1e3);
  }
  userClosedTheVideoEmbed() {
    return document.cookie.includes("relayVideo=no");
  }
};

// ../analyse/src/study/relay/relayGames.ts
var gamesLists = (study, relay) => {
  var _a2;
  const cloudEval = (_a2 = study.multiCloudEval) == null ? void 0 : _a2.thisIfShowEval();
  const nonPinned = gamesList(study, relay, false, cloudEval);
  const pinned = relay.players.pins.anyPinned() ? gamesList(study, relay, true, cloudEval) : [];
  return hl(
    "div.relay-games",
    {
      class: { "relay-games__eval": defined(cloudEval) },
      hook: {
        postpatch(old, vnode) {
          const currentId = study.data.chapter.id;
          if (old.data.current !== currentId)
            scrollToInnerSelector(vnode.elm, ".relay-game--current");
          vnode.data.current = currentId;
        }
      }
    },
    pinned.length ? [pinned, hl("div.relay-games__separator"), nonPinned] : nonPinned
  );
};
var gamesList = (study, relay, pinned, cloudEval) => {
  var _a2;
  const chapters = study.chapters.list.all();
  const roundPath = relay.roundPath();
  const showResults = study.multiBoard.showResults();
  const round = (_a2 = study.relay) == null ? void 0 : _a2.round;
  if (chapters.length === 1 && chapters[0].name === "Chapter 1") {
    return [];
  }
  return chapters.map((c, i) => {
    var _a3, _b;
    if (relay.players.pins.isChapterPinned(c) !== pinned) return void 0;
    const clocks = renderClocks2(c);
    const players2 = [(_a3 = c.players) == null ? void 0 : _a3.black, (_b = c.players) == null ? void 0 : _b.white];
    if (c.orientation === "black") {
      players2.reverse();
      clocks.reverse();
    }
    const current = c.id === study.data.chapter.id && !relay.tourShow();
    return hl(
      `a.relay-game.relay-game--${c.id}`,
      {
        attrs: {
          ...gameLinkAttrs(roundPath, c),
          "data-n": i + 1
        },
        class: { "relay-game--current": current }
      },
      [
        showResults && cloudEval && verticalEvalGauge(c, c.orientation, cloudEval),
        hl(
          "span.relay-game__players",
          players2.map((p, i2) => {
            const playerColor = (c.orientation === "black" ? COLORS : COLORS.slice().reverse())[i2];
            const coloredResult = showResults && c.status && c.status !== "*" && playerColoredResult(c.status, playerColor, round == null ? void 0 : round.customScoring);
            return hl(
              "span.relay-game__player",
              p ? [
                hl("span.mini-game__user", [
                  playerFedFlag(p.fed),
                  hl("span.name", [userTitle(p), p.name]),
                  pinned && relay.players.pins.isPlayerPinned(p) ? pinIcon() : void 0
                ]),
                coloredResult ? hl(coloredResult.tag, [coloredResult.points]) : showResults && hl("span", clocks[i2])
              ] : [hl("span.mini-game__user", hl("span.name", "Unknown player"))]
            );
          })
        )
      ]
    );
  });
};
var renderClocks2 = (chapter) => ["black", "white"].map((color) => renderClock(chapter, color));

// ../analyse/src/study/relay/relayTourView.ts
function renderRelayTour(ctx) {
  const tab = ctx.relay.tab();
  const content = tab === "boards" ? games(ctx) : tab === "teams" ? teams(ctx) : tab === "team-results" ? teamResults(ctx) : tab === "stats" ? stats(ctx) : tab === "players" ? players(ctx) : overview(ctx);
  return hl("div.box.relay-tour", content);
}
var tourSide = (ctx, kid) => {
  const { ctrl, study, relay } = ctx;
  const empty = study.chapters.list.looksNew();
  const resizeId = !ctrl.isEmbed && displayColumns() > (ctx.hasRelayTour ? 1 : 2) && `relayTour/${relay.data.tour.id}`;
  return hl(
    "aside.relay-tour__side",
    {
      hook: {
        ...onInsert(gameLinksListener(study.chapterSelect)),
        update: (v) => {
          if (resizeId) return;
          v.elm.querySelectorAll(".relay-games, .mchat").forEach((el) => {
            el.style.height = el.style.flex = "";
          });
        }
      }
    },
    [
      empty ? [startCountdown(relay)] : [
        hl("div.relay-tour__side__header", [
          hl(
            "button.relay-tour__side__name",
            { hook: bind("mousedown", relay.tourShow.toggle, relay.redraw) },
            relay.round.name
          ),
          !ctrl.isEmbed && hl("button.streamer-show.data-count", {
            attrs: {
              "data-icon": licon.Mic,
              "data-count": relay.streams.length,
              title: i18n.site.streamersMenu
            },
            class: {
              disabled: !relay.streams.length,
              active: relay.showStreamerMenu(),
              streaming: relay.isStreamer()
            },
            hook: bind("click", relay.showStreamerMenu.toggle, relay.redraw)
          }),
          hl("button.relay-tour__side__search", {
            attrs: dataIcon(licon.Search),
            hook: bind("click", study.search.open.toggle)
          })
        ])
      ],
      !ctrl.isEmbed && relay.showStreamerMenu() && renderStreamerMenu(relay),
      !empty ? gamesLists(study, relay) : hl("div.vertical-spacer"),
      !empty && resizeId && verticalResize({
        key: `relay-games.${resizeId}`,
        min: () => 50,
        // Height of one .relay-game in _tour.scss
        max: () => 50 * study.chapters.list.size(),
        initialMaxHeight: () => window.innerHeight / 2
      }),
      ctx.ctrl.chatCtrl && renderChat(ctx.ctrl.chatCtrl),
      resizeId && verticalResize({
        key: "relay-chat",
        id: resizeId,
        min: () => 0,
        max: () => window.innerHeight,
        initialMaxHeight: () => window.innerHeight / 3,
        kid: hl("div.chat__members", { hook: onInsert((el) => watchers(el, false)) })
      }),
      kid
    ]
  );
};
var startCountdown = (relay) => {
  const round = relay.round, startsAt = defined(round.startsAt) && new Date(round.startsAt), date = startsAt && hl("time", commonDateFormat(startsAt));
  return hl("div.relay-tour__side__empty", { attrs: dataIcon(licon.RadioTower) }, [
    hl("strong", round.name),
    startsAt ? startsAt.getTime() < Date.now() + 1e3 * 10 * 60 ? [i18n.broadcast.startVerySoon, date] : [hl("strong", timeago(startsAt)), date] : [i18n.broadcast.notYetStarted]
  ]);
};
var players = (ctx) => [header(ctx), playersView(ctx.relay.players)];
var showInfo = (i, dates) => {
  const contents = [
    ["dates", dates && showDates(dates), "objects.spiral-calendar", "Dates"],
    ["format", i.format, "objects.crown", "Format"],
    ["tc", i.tc, "objects.mantelpiece-clock", "Time control"],
    ["location", i.location, "travel-places.globe-showing-europe-africa", "Location"],
    ["players", i.players, "activity.sparkles", "Star players"],
    ["website", i.website, null, null, i18n.broadcast.officialWebsite],
    ["standings", i.standings, null, null, i18n.site.standings],
    ["regulations", i.regulations, null, null, i18n.broadcast.regulations]
  ].map(
    ([key, value, icon2, textAlternative, linkName]) => key && value && hl("div.relay-tour__info__" + key, [
      icon2 && hl("img", { attrs: { src: site.asset.flairSrc(icon2), alt: textAlternative } }),
      linkName ? hl("a", { attrs: { href: value, target: "_blank", rel: "nofollow noreferrer" } }, linkName) : value
    ])
  ).filter(defined);
  return contents.length ? hl("div.relay-tour__info", contents) : void 0;
};
var dateFormat = memoize(
  () => window.Intl && Intl.DateTimeFormat ? new Intl.DateTimeFormat(site.displayLocale, {
    month: "short",
    day: "2-digit"
  }).format : (d) => d.toLocaleDateString()
);
var showDates = (dates) => {
  const rendered = dates.map((date) => dateFormat()(new Date(date)));
  return rendered[1] ? `${rendered[0]} - ${rendered[1]}` : rendered[0];
};
var overview = (ctx) => {
  const tour = ctx.relay.data.tour;
  return [
    header(ctx),
    showInfo(tour.info, tour.dates),
    tour.description && hl("div.relay-tour__markup", {
      hook: innerHTML(tour.description, () => tour.description)
    }),
    ctx.ctrl.isEmbed || share(ctx)
  ];
};
var relayIframe = (path) => `<iframe src="${baseUrl()}/embed${path}" style="width: 100%; aspect-ratio: 4/3;" frameborder="0"></iframe>`;
var share = (ctx) => {
  const iframeHelp = hl(
    "div.form-help",
    i18n.broadcast.iframeHelp.asArray(
      hl("a", { attrs: { href: "/developers#broadcast" } }, i18n.broadcast.webmastersPage)
    )
  );
  const link = (text2, path, help) => hl("div.form-group", [
    hl("label.form-label", text2),
    copyMeInput(path.startsWith("/") ? `${baseUrl()}${path}` : path, { inputAttrs: { readonly: true } }),
    help
  ]);
  const roundName = ctx.relay.round.name;
  const { tour, group } = ctx.relay.data;
  return hl(
    "div.relay-tour__share-all",
    {
      hook: onInsert((_) => pubsub.emit("content-loaded"))
    },
    [
      hl("fieldset.relay-tour__share.toggle-box.toggle-box--toggle", [
        hl("legend", { attrs: { tabindex: 0 } }, "Share this broadcast by URL"),
        group && link(group.name, `/broadcast/${group.slug}/${group.id}`),
        link(tour.name, ctx.relay.tourPath()),
        link(tour.name + " | " + roundName, ctx.relay.roundPath())
      ]),
      hl("fieldset.relay-tour__share.toggle-box.toggle-box--toggle.toggle-box--toggle-off", [
        hl("legend", { attrs: { tabindex: 0 } }, "Download PGN"),
        hl("p.form-group", [
          "We offer full PGN downloads for all our broadcasts.",
          hl("br"),
          "To synchronize ongoing games, use ",
          hl(
            "a",
            { attrs: { href: "/api#tag/broadcasts/GET/api/stream/broadcast/round/{broadcastRoundId}.pgn" } },
            "our free streaming API"
          ),
          " for stupendous speed and efficiency.",
          hl("br"),
          "To download all the broadcasts, use ",
          hl(
            "a",
            { attrs: { href: "https://database.lichess.org/#broadcasts" } },
            "our full database exports"
          ),
          ".",
          hl("br"),
          hl("p.form-help", [
            "You can remove clocks and evals from the PGN by adding query parameters, for example: ",
            hl("br"),
            hl("code", "?clocks=false&comments=false")
          ])
        ]),
        link("This round: " + roundName, `${ctx.relay.roundPath()}.pgn`),
        link(
          "This tournament: " + tour.name,
          `/api/broadcast/${tour.id}.pgn`,
          hl("div.form-help", "All games of all rounds of this tournament. It may take a while to download.")
        ),
        hl("p.form-group", "Individual game download is available on each game page.")
      ]),
      hl("fieldset.relay-tour__share.toggle-box.toggle-box--toggle.toggle-box--toggle-off", [
        hl("legend", { attrs: { tabindex: 0 } }, i18n.broadcast.embedThisBroadcast),
        group && link("Follow ongoing tournament", relayIframe(`/broadcast/${group.slug}/${group.id}`), iframeHelp),
        link("This tournament: " + tour.name, relayIframe(ctx.relay.tourPath()), iframeHelp),
        link("This round: " + roundName, relayIframe(ctx.relay.roundPath()), iframeHelp)
      ])
    ]
  );
};
var tourSelect = (ctx, group) => {
  var _a2;
  const { relay, study } = ctx;
  const inputId = "mselect-relay-tour";
  const updateCheckboxAndToggle = () => {
    const checkbox = document.querySelector(`#${inputId}`);
    if (checkbox) checkbox.checked = false;
    relay.tourSelectShow(!checkbox);
  };
  return hl(
    "div.mselect.relay-tour__mselect.relay-tour__tour-select",
    {
      class: { mselect__active: relay.tourSelectShow() }
    },
    [
      hl("input.mselect__toggle", {
        attrs: { type: "checkbox", id: inputId },
        on: { change: relay.tourSelectShow.toggle }
      }),
      hl(
        "label.mselect__label",
        { attrs: { for: inputId } },
        ((_a2 = group.tours.find((t) => t.id === relay.data.tour.id)) == null ? void 0 : _a2.name) || relay.data.tour.name
      ),
      relay.tourSelectShow() && [
        hl("label.fullscreen-mask", { on: { click: updateCheckboxAndToggle } }),
        hl(
          "nav.mselect__list",
          group.tours.map(
            (tour) => hl(
              "a.mselect__item",
              {
                class: {
                  current: tour.id === relay.data.tour.id
                },
                attrs: { href: study.embeddablePath(`/broadcast/-/${tour.id}`) }
              },
              [tour.name, tourStateIcon(tour, false)]
            )
          )
        )
      ]
    ]
  );
};
var tourStateIcon = (tour, titleAsText) => tour.live ? hl("span.tour-state.ongoing", {
  attrs: { ...dataIcon(licon.DiscBig), title: i18n.broadcast.ongoing }
}) : !tour.active ? hl(
  "span.tour-state.finished",
  { attrs: { ...dataIcon(licon.Checkmark), title: !titleAsText && i18n.site.finished } },
  titleAsText && i18n.site.finished
) : void 0;
var roundSelect = (relay, study) => {
  const { round } = relay;
  const icon2 = roundStateIcon(round, true);
  const inputId = "mselect-relay-round";
  const updateCheckboxAndToggle = () => {
    const checkbox = document.querySelector(`#${inputId}`);
    if (checkbox) checkbox.checked = false;
    relay.roundSelectShow(!checkbox);
  };
  const extractHrefAndNavigate = (e, round2) => {
    if (e.metaKey) return;
    const href = study.embeddablePath(relay.roundUrlWithHash(round2));
    if (href && href.split("#")[0] !== window.location.pathname) {
      site.redirect(href);
    } else {
      e.preventDefault();
      updateCheckboxAndToggle();
    }
  };
  return hl(
    "div.mselect.relay-tour__mselect.relay-tour__round-select",
    {
      class: { mselect__active: relay.roundSelectShow() }
    },
    [
      hl("input.mselect__toggle", {
        attrs: { type: "checkbox", id: inputId },
        on: { change: relay.roundSelectShow.toggle }
      }),
      hl(
        "label.mselect__label.relay-tour__round-select__label",
        {
          attrs: { for: inputId }
        },
        [
          hl("span.relay-tour__round-select__name", round.name),
          hl("span.relay-tour__round-select__status", icon2 || !!round.startsAt && timeago(round.startsAt))
        ]
      ),
      relay.roundSelectShow() && [
        hl("label.fullscreen-mask", { on: { click: updateCheckboxAndToggle } }),
        hl(
          "div.relay-tour__round-select__list.mselect__list",
          {
            hook: onInsert((el) => {
              var _a2, _b;
              const goTo = (_a2 = el.querySelector(".ongoing-round")) != null ? _a2 : el.querySelector(".current-round");
              (_b = goTo == null ? void 0 : goTo.closest(".relay-tour__round-select")) == null ? void 0 : _b.scrollIntoView({ behavior: "smooth", block: "nearest" });
            })
          },
          relay.data.rounds.map(
            (round2, i) => hl(
              "a.mselect__item",
              {
                attrs: { href: study.embeddablePath(relay.roundUrlWithHash(round2)) },
                class: {
                  "current-round": round2.id === study.data.id,
                  "ongoing-round": !!round2.ongoing
                },
                on: {
                  click: (e) => extractHrefAndNavigate(e, round2)
                }
              },
              [
                hl("span.name", round2.name),
                hl(
                  "span.time",
                  round2.startsAt ? commonDateFormat(new Date(round2.startsAt)) : round2.startsAfterPrevious && i18n.broadcast.startsAfter(
                    relay.data.rounds[i - 1] ? relay.data.rounds[i - 1].name : "the previous round"
                  )
                ),
                hl(
                  "span.status",
                  roundStateIcon(round2, false) || !!round2.startsAt && timeago(round2.startsAt)
                )
              ]
            )
          )
        )
      ]
    ]
  );
};
var games = (ctx) => [
  header(ctx),
  ctx.study.chapters.list.looksNew() ? renderNote(
    hl("div", i18n.broadcast.noBoardsYet),
    ctx.study.members.myMember() && hl(
      "small",
      i18n.broadcast.boardsCanBeLoaded.asArray(
        hl("a", { attrs: { href: "/broadcast/app" } }, "Broadcaster App")
      )
    )
  ) : view5(ctx.study.multiBoard, ctx.study)
];
var teams = (ctx) => [
  header(ctx),
  ctx.relay.teams && teamsView(ctx.relay.teams, ctx.study.chapters.list, ctx.relay.players)
];
var teamResults = (ctx) => [
  header(ctx),
  ctx.relay.teams && ctx.relay.teamLeaderboard.view()
];
var stats = (ctx) => [header(ctx), statsView(ctx.relay.stats)];
var renderNote = (title, desc) => hl("div.relay-tour__note", hl("div", [title, desc]));
var header = (ctx) => {
  var _a2;
  const { ctrl, relay } = ctx;
  const d = relay.data, group = d.group, studyD = (_a2 = ctrl.study) == null ? void 0 : _a2.data.description;
  return [
    hl("div.relay-tour__header", [
      hl("div.relay-tour__header__content", [
        hl("h1", (group == null ? void 0 : group.name) || d.tour.name),
        hl("div.relay-tour__header__selectors", [
          group && tourSelect(ctx, group),
          roundSelect(relay, ctx.study)
        ])
      ]),
      broadcastImageOrStream(ctx)
    ]),
    studyD && hl("div.relay-tour__note.pinned", hl("div", [hl("div", { hook: richHTML(studyD, false) })])),
    d.tour.communityOwner && renderNote(
      hl("div", i18n.broadcast.communityBroadcast),
      hl(
        "small",
        i18n.broadcast.createdAndManagedBy.asArray(
          userLink({
            ...d.tour.communityOwner,
            flair: void 0
          })
        )
      )
    ),
    d.note && renderNote(
      hl("div", { hook: richHTML(d.note, false) }),
      hl("small", "This note is visible to contributors only.")
    ),
    delayedUntil(ctx),
    hl("div.relay-tour__nav", [makeTabs(ctrl), subscribe(relay, ctrl)])
  ];
};
var delayedUntil = (ctx) => {
  const date = ctx.relay.data.delayedUntil;
  return date && renderNote(
    hl("div", ["Transmission will start ", date > Date.now() ? timeago(date) : "momentarily"]),
    hl("small", "The tournament organizers have requested that moves be delayed.")
  );
};
var subscribe = (relay, ctrl) => defined(relay.data.isSubscribed) ? [
  cmnToggleWrap({
    id: "tour-subscribe",
    name: i18n.site.subscribe,
    title: i18n.broadcast.subscribeTitle,
    checked: relay.data.isSubscribed,
    change(v) {
      text(`/broadcast/${relay.data.tour.id}/subscribe?set=${v}`, { method: "post" });
      relay.data.isSubscribed = v;
    },
    redraw: ctrl.redraw
  })
] : [];
var makeTabs = (ctrl) => {
  const study = ctrl.study, relay = study == null ? void 0 : study.relay;
  if (!relay) return void 0;
  const makeTab = (key, name) => hl(
    `button.relay-tour__tabs--${key}`,
    {
      class: { active: relay.tab() === key },
      attrs: { role: "tab" },
      on: {
        click: () => relay.openTab(key)
      }
    },
    name
  );
  return hl("nav.relay-tour__tabs", { attrs: { role: "tablist" } }, [
    makeTab("overview", i18n.broadcast.overview),
    makeTab("boards", i18n.broadcast.boards),
    makeTab("players", i18n.site.players),
    relay.teams && makeTab("teams", i18n.broadcast.teams),
    relay.data.tour.showTeamScores && makeTab("team-results", i18n.broadcast.teamResults),
    study.members.myMember() && !!relay.data.tour.tier ? makeTab("stats", i18n.site.stats) : ctrl.isEmbed && hl(
      "a.relay-tour__tabs--open.text",
      {
        attrs: { href: relay.tourPath(), target: "_blank", "data-icon": licon.Expand }
      },
      i18n.broadcast.openLichess
    )
  ]);
};
var roundStateIcon = (round, titleAsText) => round.ongoing ? hl(
  "span.round-state.ongoing",
  { attrs: { ...dataIcon(licon.DiscBig), title: !titleAsText && i18n.broadcast.ongoing } },
  titleAsText && i18n.broadcast.ongoing
) : round.finishedAt && hl(
  "span.round-state.finished",
  { attrs: { ...dataIcon(licon.Checkmark), title: !titleAsText && i18n.site.finished } },
  titleAsText && i18n.site.finished
);
var broadcastImageOrStream = (ctx) => {
  var _a2;
  const { relay, allowVideo: allowVideo2 } = ctx;
  const d = relay.data, embedVideo = (d.videoUrls || relay.isPinnedStreamOngoing()) && allowVideo2;
  return hl(
    `div.relay-tour__header__image${embedVideo ? ".video" : ""}`,
    embedVideo ? (_a2 = relay.videoPlayer) == null ? void 0 : _a2.render() : d.tour.image ? hl("img", { attrs: { src: d.tour.image, alt: "" } }) : ctx.study.members.isOwner() ? hl(
      "a.button.relay-tour__header__image-upload",
      { attrs: { href: `/broadcast/${d.tour.id}/edit` } },
      i18n.broadcast.uploadImage
    ) : void 0
  );
};
function renderStreamerMenu(relay) {
  const makeUrl = (id) => {
    const url2 = new URL(location.href);
    url2.searchParams.set("embed", id);
    return url2.toString();
  };
  return hl(
    "div.streamer-menu-anchor",
    hl(
      "div.streamer-menu",
      {
        hook: onInsert(
          onClickAway(() => {
            relay.showStreamerMenu(false);
            relay.redraw();
          })
        )
      },
      relay.streams.map(
        ([id, info]) => hl("a.streamer.text", { attrs: { "data-icon": licon.Mic, href: makeUrl(id) } }, [
          info.name,
          hl("icon", info.lang)
        ])
      )
    )
  );
}

export {
  MAX_ANALYSE_DEPTH,
  winnerOf,
  ExplorerConfigCtrl,
  clearLastShow,
  explorerView_default,
  makeConfig,
  patch,
  emptyRedButton,
  baseUrl,
  nodeFullName,
  plural,
  titleNameToId,
  option,
  playerFedFlag,
  reload,
  glyphs,
  chapterConfig,
  practiceComplete,
  view2 as view,
  view3 as view2,
  MultiCloudEval,
  playerColoredResult,
  StudyChaptersCtrl,
  isFinished,
  findTag,
  looksLikeLichessGame,
  view4 as view3,
  MultiBoardCtrl,
  view5 as view4,
  broadcasterDeepLink,
  playerId,
  playersView,
  fidePageLinkAttrs,
  playerPhotoOrFallback,
  verticalResize,
  renderFullTxt,
  renderNodesHtml,
  renderNodesPgn,
  pgnImport_default,
  stockfishName,
  renderClocks,
  renderMaterialDiffs2 as renderMaterialDiffs,
  viewContext,
  renderMain,
  renderBoard,
  renderUnderboard,
  renderResult,
  renderIndexAndMove,
  renderIndex,
  renderMoveNodes,
  addChapterId,
  allowVideo,
  RelayCtrl,
  renderRelayTour,
  tourSide,
  showInfo,
  relayIframe
};
//# sourceMappingURL=lib.UZWUG6PB.js.map
