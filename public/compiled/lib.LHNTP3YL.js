import {
  game
} from "./lib.GIUNMRJU.js";
import {
  formatClockTimeVerbal,
  renderClock,
  status
} from "./lib.5Q3MW527.js";
import {
  resizeHandle
} from "./lib.SPSB7AAJ.js";
import {
  Coords,
  MoveEvent,
  ShowResizeHandle
} from "./lib.CHCAIC5O.js";
import {
  abortable,
  aborted,
  berserkableBy,
  bothPlayersHavePlayed,
  drawableSwiss,
  finished,
  isPlayerTurn,
  moretimeable,
  playable,
  rematchable,
  replayable,
  resignable,
  takebackable,
  userAnalysable
} from "./lib.67VUYMDO.js";
import {
  ratingDiff,
  userLink
} from "./lib.BMKV23O2.js";
import {
  addPointerListeners,
  boardMenu,
  boolPrefXhrToggle,
  cmnToggleWrap,
  snabDialog,
  spinnerVdom,
  toggleButton
} from "./lib.MYPIOGN5.js";
import {
  plyColor
} from "./lib.LRP46MC3.js";
import {
  Chessground
} from "./lib.AEOHBIQD.js";
import {
  adjacentSquares,
  bishopDir,
  diff,
  key2pos,
  kingDirNonCastling,
  knightDir,
  pawnDirAdvance,
  pawnDirCapture,
  pos2key,
  queenDir,
  rookDir,
  samePiece,
  squareShiftedVertically,
  squaresBetween,
  uciToMove
} from "./lib.RPQH5UYI.js";
import {
  wsAverageLag
} from "./lib.PNHYIP7B.js";
import {
  bind,
  dataIcon,
  displayColumns,
  hl,
  isSafari,
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
  storage,
  throttle
} from "./lib.NFSQQWN5.js";
import {
  blurIfPrimaryClick,
  defined,
  elemAt,
  repeater,
  toggle
} from "./lib.GMEH5BEF.js";

// ../round/src/view/button.ts
function analysisBoardOrientation(data) {
  return data.game.variant.key === "racingKings" ? "white" : data.player.color;
}
function poolUrl(clock, blocking) {
  return "/#pool/" + clock.initial / 60 + "+" + clock.increment + (blocking ? "/" + blocking.id : "");
}
function analysisButton(ctrl) {
  const d = ctrl.data, url = game(d, analysisBoardOrientation(d)) + "#" + ctrl.ply;
  return replayable(d) && hl(
    "a.fbt",
    {
      attrs: { href: url },
      hook: bind(
        "click",
        (e) => {
          if (d.local) {
            d.local.analyse();
            return e.preventDefault();
          }
          if (location.pathname === url.split("#")[0]) location.reload();
        },
        void 0,
        false
      )
    },
    i18n.site.analysis
  );
}
function rematchButtons(ctrl) {
  const d = ctrl.data, me = !!d.player.offeringRematch, disabled = !me && !d.opponent.onGame && (!!d.clock || !d.player.user || !d.opponent.user), them = !!d.opponent.offeringRematch && !disabled;
  if (!rematchable(d)) return [];
  return [
    them && hl(
      "button.rematch-decline",
      {
        attrs: { "data-icon": licon.X, title: i18n.site.decline },
        hook: bind("click", () => ctrl.socket.send("rematch-no"))
      },
      ctrl.nvui ? i18n.site.decline : ""
    ),
    hl(
      "button.fbt.rematch.white",
      {
        class: { me, glowing: them },
        attrs: {
          disabled,
          title: them ? i18n.site.yourOpponentWantsToPlayANewGameWithYou : me ? i18n.site.rematchOfferSent : ""
        },
        hook: bind(
          "click",
          () => {
            const d2 = ctrl.data;
            if (d2.game.rematch) location.href = game(d2.game.rematch, d2.opponent.color);
            else if (d2.player.offeringRematch) {
              d2.player.offeringRematch = false;
              ctrl.socket.send("rematch-no");
            } else if (d2.opponent.onGame || !d2.clock) {
              d2.player.offeringRematch = true;
              if (d2.opponent.onGame) ctrl.socket.send("rematch-yes");
              else if (!disabled && !d2.opponent.onGame) ctrl.challengeRematch();
            }
          },
          ctrl.redraw
        )
      },
      [me ? spinnerVdom() : hl("span", i18n.site.rematch)]
    )
  ];
}
function standard(ctrl, condition, icon, hint, socketMsg, onclick) {
  const enabled = () => !condition || condition(ctrl.data).enabled;
  const hintFn = () => {
    var _a;
    return ((_a = condition == null ? void 0 : condition(ctrl.data)) == null ? void 0 : _a.overrideHint) || hint;
  };
  return hl(
    "button.fbt." + socketMsg,
    {
      attrs: { disabled: !enabled(), ...!ctrl.nvui ? { title: hintFn() } : {} },
      hook: bind("click", () => {
        if (enabled()) onclick ? onclick() : ctrl.socket.sendLoading(socketMsg);
      })
    },
    ctrl.nvui ? [hintFn()] : [hl("span", { attrs: dataIcon(icon) })]
  );
}
function opponentGone(ctrl) {
  var _a;
  const gone = ctrl.opponentGone();
  if ((_a = ctrl.data.game.rules) == null ? void 0 : _a.includes("noClaimWin")) return null;
  return gone === true ? hl("div.suggestion", [
    hl("p", { hook: onSuggestionHook }, i18n.site.opponentLeftChoices),
    hl(
      "button.button",
      { hook: bind("click", () => ctrl.socket.sendLoading("resign-force")) },
      i18n.site.forceResignation
    ),
    hl(
      "button.button",
      { hook: bind("click", () => ctrl.socket.sendLoading("draw-force")) },
      i18n.site.forceDraw
    )
  ]) : gone !== false && hl(
    "div.suggestion.opponent-left-counter",
    hl("p", i18n.site.opponentLeftCounter.asArray(gone, hl("strong", gone)))
  );
}
var fbtCancel = (f) => hl("button.fbt.no", {
  attrs: { title: i18n.site.cancel, "data-icon": licon.X },
  hook: bind("click", () => f(false))
});
var resignConfirm = (ctrl) => hl("div.act-confirm", [
  hl("button.fbt.yes", {
    attrs: { title: i18n.site.resign, "data-icon": licon.FlagOutline },
    hook: bind("click", () => ctrl.resign(true))
  }),
  fbtCancel(ctrl.resign)
]);
var drawConfirm = (ctrl) => hl("div.act-confirm", [
  hl("button.fbt.yes.draw-yes", {
    attrs: { title: i18n.site.offerDraw, "data-icon": licon.OneHalf },
    hook: bind("click", () => ctrl.offerDraw(true))
  }),
  fbtCancel(ctrl.offerDraw)
]);
var claimThreefold = (ctrl, condition) => {
  var _a;
  return hl(
    "button.button.draw-yes",
    {
      hook: bind(
        "click",
        () => condition(ctrl.data).enabled ? ctrl.socket.sendLoading("draw-claim") : void 0
      ),
      attrs: {
        title: ((_a = condition(ctrl.data)) == null ? void 0 : _a.overrideHint) || i18n.site.claimADraw,
        disabled: !condition(ctrl.data).enabled
      },
      class: { disabled: !condition(ctrl.data).enabled }
    },
    hl("span", "\xBD")
  );
};
function threefoldSuggestion(ctrl) {
  return ctrl.data.game.threefold && hl("div.suggestion", [hl("p", { hook: onSuggestionHook }, i18n.site.threefoldRepetition)]);
}
function backToTournament(ctrl) {
  var _a;
  const d = ctrl.data;
  return ((_a = d.tournament) == null ? void 0 : _a.running) && hl("div.follow-up", [
    hl(
      "a.text.fbt.strong.glowing",
      {
        attrs: { "data-icon": licon.PlayTriangle, href: "/tournament/" + d.tournament.id },
        hook: bind("click", ctrl.setRedirecting)
      },
      i18n.site.backToTournament
    ),
    hl("form", { attrs: { method: "post", action: "/tournament/" + d.tournament.id + "/withdraw" } }, [
      hl("button.text.fbt.weak", { attrs: dataIcon(licon.Pause) }, i18n.site.pause)
    ]),
    analysisButton(ctrl)
  ]);
}
function backToSwiss(ctrl) {
  var _a;
  const d = ctrl.data;
  return ((_a = d.swiss) == null ? void 0 : _a.running) && hl("div.follow-up", [
    hl(
      "a.text.fbt.strong.glowing",
      {
        attrs: { "data-icon": licon.PlayTriangle, href: "/swiss/" + d.swiss.id },
        hook: bind("click", ctrl.setRedirecting)
      },
      i18n.site.backToTournament
    ),
    analysisButton(ctrl)
  ]);
}
function moretime(ctrl) {
  return moretimeable(ctrl.data) && hl("a.moretime", {
    attrs: {
      title: ctrl.data.clock ? i18n.site.giveNbSeconds(ctrl.data.clock.moretime) : i18n.preferences.giveMoreTime,
      "data-icon": licon.PlusButton
    },
    hook: bind("click", ctrl.socket.moreTime)
  });
}
function followUp(ctrl) {
  const d = ctrl.data, rematchable2 = !d.game.rematch && (finished(d) || aborted(d) && (!d.game.rated || !["lobby", "pool"].includes(d.game.source))) && !d.tournament && !d.simul && !d.swiss && !d.game.boosted, newable = (finished(d) || aborted(d)) && ["lobby", "pool", "local"].includes(d.game.source), rematchZone = rematchable2 || d.game.rematch ? rematchButtons(ctrl) : [];
  return hl("div.follow-up", [
    rematchZone,
    d.tournament && hl("a.fbt", { attrs: { href: "/tournament/" + d.tournament.id } }, i18n.site.viewTournament),
    d.swiss && hl("a.fbt", { attrs: { href: "/swiss/" + d.swiss.id } }, i18n.site.viewTournament),
    newable && hl(
      "button.fbt.new-opponent",
      {
        hook: bind("click", () => {
          var _a;
          if (d.game.source === "local") (_a = d.local) == null ? void 0 : _a.newOpponent();
          else if (d.game.source === "pool") location.href = poolUrl(d.clock, d.opponent.user);
          else location.href = "/?hook_like=" + d.game.id;
        })
      },
      i18n.site.newOpponent
    ),
    analysisButton(ctrl)
  ]);
}
function watcherFollowUp(ctrl) {
  const d = ctrl.data, content = [
    d.game.rematch && hl(
      "a.fbt.text",
      { attrs: { href: `/${d.game.rematch}/${d.opponent.color}` } },
      i18n.site.viewRematch
    ),
    d.tournament && hl("a.fbt", { attrs: { href: "/tournament/" + d.tournament.id } }, i18n.site.viewTournament),
    d.swiss && hl("a.fbt", { attrs: { href: "/swiss/" + d.swiss.id } }, i18n.site.viewTournament),
    analysisButton(ctrl)
  ];
  return content.find((x) => !!x) && hl("div.follow-up", content);
}
var onSuggestionHook = onInsert((el) => pubsub.emit("round.suggestion", el.textContent));

// ../round/src/corresClock/corresClockView.ts
var prefixInteger = (num, length) => (num / Math.pow(10, length)).toFixed(length).slice(2);
var bold = (x) => `<b>${x}</b>`;
function formatClockTime(time) {
  const date = new Date(time), minutes = prefixInteger(date.getUTCMinutes(), 2), seconds = prefixInteger(date.getSeconds(), 2);
  let hours, str = "";
  if (time >= 86400 * 1e3) {
    const days = date.getUTCDate() - 1;
    hours = date.getUTCHours();
    str += (days === 1 ? i18n.site.oneDay : i18n.site.nbDays(days)) + " ";
    if (hours !== 0) str += i18n.site.nbHours(hours);
  } else if (time >= 3600 * 1e3) {
    hours = date.getUTCHours();
    str += bold(prefixInteger(hours, 2)) + ":" + bold(minutes);
  } else {
    str += bold(minutes) + ":" + bold(seconds);
  }
  return str;
}
function corresClockView_default(ctrl, color, position, runningColor) {
  const millis = ctrl.millisOf(color), update = (el) => {
    el.innerHTML = site.blindMode ? formatClockTimeVerbal(millis) : formatClockTime(millis);
  }, isPlayer = ctrl.root.data.player.color === color, direction = document.dir === "rtl" && millis < 86400 * 1e3 ? "ltr" : void 0;
  return hl(
    "div.rclock.rclock-correspondence.rclock-" + position,
    { class: { outoftime: millis <= 0, running: runningColor === color } },
    [
      ctrl.data.showBar && hl("div.bar", [hl("span", { attrs: { style: `width: ${ctrl.timePercent(color)}%` } })]),
      hl("div.time", {
        attrs: direction && { style: `direction: ${direction}` },
        hook: {
          insert: (vnode) => update(vnode.elm),
          postpatch: (_, vnode) => update(vnode.elm)
        }
      }),
      !isPlayer && moretime(ctrl.root)
    ]
  );
}

// ../round/src/util.ts
function parsePossibleMoves(dests) {
  const dec = /* @__PURE__ */ new Map();
  if (!dests) return dec;
  if (typeof dests === "string")
    for (const ds of dests.split(" ")) {
      dec.set(ds.slice(0, 2), ds.slice(2).match(/.{2}/g) || []);
    }
  else for (const k in dests) dec.set(k, dests[k].match(/.{2}/g) || []);
  return dec;
}
var firstPly = (d) => d.steps[0].ply;
var lastPly = (d) => lastStep(d).ply;
var lastStep = (d) => d.steps[d.steps.length - 1];
var plyStep = (d, ply) => d.steps[ply - firstPly(d)];
var upgradeServerData = (d) => {
  if (d.correspondence) d.correspondence.showBar = d.pref.clockBar;
  if (["horde", "crazyhouse"].includes(d.game.variant.key)) d.pref.showCaptured = false;
  if (d.expiration) d.expiration.movedAt = Date.now() - d.expiration.idleMillis;
};

// ../round/src/premove.ts
var Premove = class {
  constructor(variant, rookCastle) {
    this.variant = variant;
    this.rookCastle = rookCastle;
    this.isDestOccupiedByFriendly = (ctx) => ctx.friendlies.has(ctx.dest.key);
    this.isDestOccupiedByEnemy = (ctx) => ctx.enemies.has(ctx.dest.key);
    this.anyPieceBetween = (orig, dest, pieces) => squaresBetween(...orig, ...dest).some((s) => pieces.has(s));
    this.canEnemyPawnAdvanceToSquare = (pawnStart, dest, ctx) => {
      const piece = ctx.enemies.get(pawnStart);
      if ((piece == null ? void 0 : piece.role) !== "pawn") return false;
      const step = piece.color === "white" ? 1 : -1;
      const startPos = key2pos(pawnStart);
      const destPos = key2pos(dest);
      return pawnDirAdvance(...startPos, ...destPos, piece.color === "white") && !this.anyPieceBetween(startPos, [destPos[0], destPos[1] + step], ctx.allPieces);
    };
    this.canEnemyPawnCaptureOnSquare = (pawnStart, dest, ctx) => {
      const enemyPawn = ctx.enemies.get(pawnStart);
      return (enemyPawn == null ? void 0 : enemyPawn.role) === "pawn" && pawnDirCapture(...key2pos(pawnStart), ...key2pos(dest), enemyPawn.color === "white") && (ctx.friendlies.has(dest) || this.canBeCapturedBySomeEnemyEnPassant(
        ctx,
        squareShiftedVertically(dest, enemyPawn.color === "white" ? -1 : 1)
      ));
    };
    this.canSomeEnemyPawnAdvanceToDest = (ctx) => [...ctx.enemies.keys()].some((key) => this.canEnemyPawnAdvanceToSquare(key, ctx.dest.key, ctx));
    this.isDestControlledByEnemy = (ctx, pieceRolesExclude, specificEnemies) => {
      const square = ctx.dest.pos;
      return [...specificEnemies != null ? specificEnemies : ctx.enemies].some(([key, piece]) => {
        const piecePos = key2pos(key);
        return !(pieceRolesExclude == null ? void 0 : pieceRolesExclude.includes(piece.role)) && (piece.role === "pawn" && pawnDirCapture(...piecePos, ...square, piece.color === "white") || piece.role === "knight" && knightDir(...piecePos, ...square) || piece.role === "bishop" && bishopDir(...piecePos, ...square) || piece.role === "rook" && rookDir(...piecePos, ...square) || piece.role === "queen" && queenDir(...piecePos, ...square) || piece.role === "king" && kingDirNonCastling(...piecePos, ...square)) && (!["bishop", "rook", "queen"].includes(piece.role) || !this.anyPieceBetween(piecePos, square, ctx.allPieces));
      });
    };
    this.canBeCapturedBySomeEnemyEnPassant = (ctx, potentialSquareOfFriendlyPawn, specificEnemies, forbiddenEnPassantSquares) => {
      var _a;
      if (!potentialSquareOfFriendlyPawn || ctx.lastMove && potentialSquareOfFriendlyPawn !== ctx.lastMove[1])
        return false;
      const pos = key2pos(potentialSquareOfFriendlyPawn);
      return ((_a = ctx.friendlies.get(potentialSquareOfFriendlyPawn)) == null ? void 0 : _a.role) === "pawn" && pos[1] === (ctx.color === "white" ? 3 : 4) && (!ctx.lastMove || diff(key2pos(ctx.lastMove[0])[1], pos[1]) === 2) && [1, -1].some((delta) => {
        var _a2;
        const k = pos2key([pos[0] + delta, pos[1]]);
        return k && ((_a2 = (specificEnemies != null ? specificEnemies : ctx.enemies).get(k)) == null ? void 0 : _a2.role) === "pawn";
      }) && !(forbiddenEnPassantSquares == null ? void 0 : forbiddenEnPassantSquares.includes(
        squareShiftedVertically(potentialSquareOfFriendlyPawn, ctx.color === "white" ? -1 : 1)
      ));
    };
    this.isPathClearEnoughForPremove = (ctx, isPawnAdvance) => {
      var _a;
      if (this.unrestrictedPremoves) return true;
      const squaresBetween2 = squaresBetween(...ctx.orig.pos, ...ctx.dest.pos);
      if (isPawnAdvance) squaresBetween2.push(ctx.dest.key);
      const squaresOfFriendliesBetween = squaresBetween2.filter((s) => ctx.friendlies.has(s));
      const squaresOfEnemiesBetween = squaresBetween2.filter((s) => ctx.enemies.has(s));
      if (squaresOfEnemiesBetween.length > 1 || squaresOfFriendliesBetween.length > 1) return false;
      const friendlySqBetween = elemAt(squaresOfFriendliesBetween, 0);
      const enemySqBetween = elemAt(squaresOfEnemiesBetween, 0);
      if (enemySqBetween) {
        if (((_a = ctx.enemies.get(enemySqBetween)) == null ? void 0 : _a.role) === "pawn") {
          const enemyStep = ctx.color === "white" ? -1 : 1;
          const squareAbove = squareShiftedVertically(enemySqBetween, enemyStep);
          const enemyPawnDests = squareAbove ? [
            ...adjacentSquares(squareAbove).filter((s) => this.canEnemyPawnCaptureOnSquare(enemySqBetween, s, ctx)),
            ...[squareAbove, squareShiftedVertically(squareAbove, enemyStep)].filter((s) => !!s).filter((s) => this.canEnemyPawnAdvanceToSquare(enemySqBetween, s, ctx))
          ] : [];
          const badSquares = /* @__PURE__ */ new Set([...squaresBetween2, ctx.orig.key]);
          if (enemyPawnDests.every((square) => badSquares.has(square))) return false;
        }
      }
      const enemies = enemySqBetween ? new Map([...ctx.enemies].filter(([sq]) => sq === enemySqBetween)) : ctx.enemies;
      return !isPawnAdvance && this.isDestOccupiedByFriendly(ctx) ? !friendlySqBetween && (this.isDestControlledByEnemy(ctx, void 0, enemies) || this.canBeCapturedBySomeEnemyEnPassant(ctx, ctx.dest.key, enemies, squaresBetween2)) : !friendlySqBetween || this.canBeCapturedBySomeEnemyEnPassant(ctx, friendlySqBetween, enemies, squaresBetween2);
    };
    this.pawn = (ctx) => {
      const step = ctx.color === "white" ? 1 : -1;
      if (diff(ctx.orig.pos[0], ctx.dest.pos[0]) > 1) return false;
      if (!diff(ctx.orig.pos[0], ctx.dest.pos[0]))
        return pawnDirAdvance(...ctx.orig.pos, ...ctx.dest.pos, ctx.color === "white") && this.isPathClearEnoughForPremove(ctx, true);
      if (ctx.dest.pos[1] !== ctx.orig.pos[1] + step) return false;
      if (this.unrestrictedPremoves || this.isDestOccupiedByEnemy(ctx)) return true;
      if (this.isDestOccupiedByFriendly(ctx)) return this.isDestControlledByEnemy(ctx);
      else
        return this.canSomeEnemyPawnAdvanceToDest(ctx) || this.canBeCapturedBySomeEnemyEnPassant(
          ctx,
          pos2key([ctx.dest.pos[0], ctx.dest.pos[1] + step])
        ) || this.isDestControlledByEnemy(ctx, ["pawn"]);
    };
    this.king = (ctx) => kingDirNonCastling(...ctx.orig.pos, ...ctx.dest.pos) && (this.unrestrictedPremoves || !this.isDestOccupiedByFriendly(ctx) || this.canBeCapturedBySomeEnemyEnPassant(ctx, ctx.dest.key) || this.isDestControlledByEnemy(ctx)) || this.variant !== "antichess" && ctx.orig.pos[1] === ctx.dest.pos[1] && ctx.orig.pos[1] === (ctx.color === "white" ? 0 : 7) && (ctx.orig.pos[0] === 4 && this.variant !== "chess960" && (ctx.dest.pos[0] === 2 && ctx.rookFilesFriendlies.includes(0) || ctx.dest.pos[0] === 6 && ctx.rookFilesFriendlies.includes(7)) || (this.rookCastle || this.variant === "chess960") && ctx.rookFilesFriendlies.includes(ctx.dest.pos[0])) && (this.unrestrictedPremoves || /* The following checks if no non-rook friendly piece is in the way between the king and its castling destination.
     Note that for the Chess960 edge case of Kb1 "long castling", the check passes even if there is a piece in the way
     on c1. But this is fine, since premoving from b1 to a1 as a normal move would have already returned true. */
    squaresBetween(...ctx.orig.pos, ctx.dest.pos[0] > ctx.orig.pos[0] ? 7 : 1, ctx.dest.pos[1]).map((s) => ctx.allPieces.get(s)).every((p) => !p || samePiece(p, { role: "rook", color: ctx.color })));
    this.basicPieceMobility = (dir) => (ctx) => dir(...ctx.orig.pos, ...ctx.dest.pos) && this.isPathClearEnoughForPremove(ctx, false);
    this.mobilityByRole = {
      pawn: this.pawn,
      knight: this.basicPieceMobility(knightDir),
      bishop: this.basicPieceMobility(bishopDir),
      rook: this.basicPieceMobility(rookDir),
      queen: this.basicPieceMobility(queenDir),
      king: this.king
    };
    this.additionalPremoveRequirements = (ctx) => {
      try {
        return this.mobilityByRole[ctx.role](ctx);
      } catch (e) {
        console.error(e);
        return true;
      }
    };
    this.unrestrictedPremoves = ["atomic", "crazyhouse"].includes(variant);
  }
};

// ../round/src/ground.ts
function makeConfig(ctrl) {
  const data = ctrl.data, hooks = ctrl.makeCgHooks(), step = plyStep(data, ctrl.ply), playing = ctrl.isPlaying(), premove = new Premove(data.game.variant.key, !!data.pref.rookCastle);
  return {
    fen: step.fen,
    orientation: boardOrientation(data, ctrl.flip),
    turnColor: plyColor(step.ply),
    lastMove: uciToMove(step.uci),
    check: !!step.check,
    coordinates: data.pref.coords !== Coords.Hidden,
    coordinatesOnSquares: data.pref.coords === Coords.All,
    addPieceZIndex: ctrl.data.pref.is3d,
    addDimensionsCssVarsTo: document.body,
    touchIgnoreRadius: data.correspondence ? 0 : 1,
    jsHover: isSafari(),
    highlight: {
      lastMove: data.pref.highlight,
      check: data.pref.highlight
    },
    events: {
      move: hooks.onMove,
      dropNewPiece: hooks.onNewPiece,
      insert(elements) {
        const firstPly2 = firstPly(ctrl.data);
        const isSecond = plyColor(firstPly2) !== data.player.color;
        const showUntil = firstPly2 + 2 + Number(isSecond);
        resizeHandle(
          elements,
          playing ? ctrl.data.pref.resizeHandle : ShowResizeHandle.Always,
          ctrl.ply,
          (p) => p <= showUntil
        );
      }
    },
    movable: {
      free: false,
      ...movableState(data, playing),
      showDests: data.pref.destination && !ctrl.blindfold(),
      rookCastle: data.pref.rookCastle,
      events: {
        after: hooks.onUserMove,
        afterNewPiece: hooks.onUserNewPiece
      }
    },
    animation: {
      enabled: true,
      duration: data.pref.animationDuration
    },
    premovable: {
      enabled: data.pref.enablePremove,
      showDests: data.pref.destination && !ctrl.blindfold(),
      events: {
        set: hooks.onPremove,
        unset: hooks.onCancelPremove
      },
      additionalPremoveRequirements: premove.additionalPremoveRequirements
    },
    predroppable: {
      enabled: data.pref.enablePremove && data.game.variant.key === "crazyhouse",
      events: {
        set: hooks.onPredrop,
        unset() {
          hooks.onPredrop(void 0);
        }
      }
    },
    draggable: {
      enabled: data.pref.moveEvent !== MoveEvent.Click,
      showGhost: data.pref.highlight
    },
    selectable: {
      enabled: data.pref.moveEvent !== MoveEvent.Drag
    },
    drawable: {
      enabled: true,
      defaultSnapToValidMove: storage.boolean("arrow.snap").getOrDefault(true)
    },
    disableContextMenu: true
  };
}
var movableState = (data, playing) => ({
  color: playing ? data.player.color : void 0,
  dests: playing ? parsePossibleMoves(data.possibleMoves) : /* @__PURE__ */ new Map()
});
var reload = (ctrl) => ctrl.chessground.set(makeConfig(ctrl));
var sync = (ctrl, step, playing) => ctrl.chessground.set({
  fen: step.fen,
  lastMove: uciToMove(step.uci),
  check: !!step.check,
  turnColor: plyColor(step.ply),
  movable: movableState(ctrl.data, playing)
});
var boardOrientation = (data, flip) => data.game.variant.key === "racingKings" ? flip ? "black" : "white" : flip ? data.opponent.color : data.player.color;
var render = (ctrl) => h("div.cg-wrap", {
  hook: onInsert((el) => ctrl.setChessground(Chessground(el, makeConfig(ctrl))))
});

// ../round/src/keyboard.ts
var prev = (ctrl) => ctrl.userJump(ctrl.ply - 1);
var next = (ctrl) => ctrl.userJump(ctrl.ply + 1);
var init = (ctrl) => site.mousetrap.bind(["left", "k"], () => {
  prev(ctrl);
  ctrl.redraw();
}).bind(["right", "j"], () => {
  next(ctrl);
  ctrl.redraw();
}).bind(["up", "0", "home"], () => {
  ctrl.userJump(0);
  ctrl.redraw();
}).bind(["down", "$", "end"], () => {
  ctrl.userJump(ctrl.data.steps.length - 1);
  ctrl.redraw();
}).bind("f", ctrl.flipNow).bind("z", () => pubsub.emit("zen")).bind("F", ctrl.yeet).bind("G", ctrl.googlyEyesStart).bind("?", () => {
  ctrl.keyboardHelp = !ctrl.keyboardHelp;
  ctrl.redraw();
}).bind("h", ctrl.menu.toggle);
var view = (ctrl) => snabDialog({
  class: "help",
  htmlUrl: "/round/help",
  onClose() {
    ctrl.keyboardHelp = false;
    ctrl.redraw();
  },
  modal: true,
  easyClose: "clickOutside"
});

// ../round/src/view/boardMenu.ts
function boardMenu_default(ctrl) {
  return boardMenu(ctrl.redraw, ctrl.menu, (menu) => {
    const d = ctrl.data, spectator = d.player.spectator, portraitMobile = displayColumns() === 1 && isTouchDevice(), swapClockStorage = storage.boolean("swapClock");
    return [
      hl("section", [
        menu.flip(i18n.site.flipBoard, ctrl.flip, () => {
          ctrl.flipNow();
          ctrl.menu.toggle();
        })
      ]),
      hl("section", [
        menu.zenMode(true),
        menu.blindfold(
          toggle(ctrl.blindfold(), (v) => ctrl.blindfold(v)),
          !spectator
        ),
        "vibrate" in navigator && cmnToggleWrap({
          id: "haptics",
          name: "Vibration feedback",
          checked: ctrl.vibration(),
          change: (v) => ctrl.vibration(v),
          redraw: ctrl.redraw
        }),
        portraitMobile && cmnToggleWrap({
          id: "swapClock",
          name: "Show clock on left",
          checked: swapClockStorage.get(),
          change: (v) => swapClockStorage.set(v),
          redraw: ctrl.redraw
        }),
        menu.voiceInput(boolPrefXhrToggle("voice", !!ctrl.voiceMove), !spectator),
        !portraitMobile && menu.keyboardInput(boolPrefXhrToggle("keyboardMove", !!ctrl.keyboardMove), !spectator),
        !spectator && (d.pref.submitMove || ctrl.voiceMove) ? menu.confirmMove(ctrl.confirmMoveToggle) : void 0
      ]),
      hl("section.board-menu__links", [
        hl(
          "a",
          { attrs: { target: "_blank", href: "/account/preferences/display" } },
          i18n.preferences.display
        ),
        hl(
          "a",
          { attrs: { target: "_blank", href: "/account/preferences/game-behavior " } },
          i18n.preferences.gameBehavior
        )
      ])
    ];
  });
}

// ../round/src/view/replay.ts
var scrollMax = 99999;
var moveTag = "Z7yx";
var indexTag = "qZM";
var indexTagUC = indexTag.toUpperCase();
var movesTag = "aPp";
var rmovesTag = "i5d";
var rbuttonsTag = "bo3";
var autoScroll = throttle(
  100,
  (movesEl, ctrl) => window.requestAnimationFrame(() => {
    if (ctrl.data.steps.length < 7 && !finished(ctrl.data)) return;
    let st;
    if (ctrl.ply < 3) st = 0;
    else if (ctrl.ply === lastPly(ctrl.data)) st = scrollMax;
    else {
      const plyEl = movesEl.querySelector(".a1t");
      if (plyEl)
        st = displayColumns() === 1 ? plyEl.offsetLeft - movesEl.offsetWidth / 2 + plyEl.offsetWidth / 2 : plyEl.offsetTop - movesEl.offsetHeight / 2 + plyEl.offsetHeight / 2;
    }
    if (typeof st === "number") {
      if (st === scrollMax) movesEl.scrollLeft = movesEl.scrollTop = st;
      else if (displayColumns() === 1) movesEl.scrollLeft = st;
      else movesEl.scrollTop = st;
    }
  })
);
var renderDrawOffer = () => hl("draw", { attrs: { title: "Draw offer" } }, "\xBD?");
var renderMove = (step, curPly, orEmpty, drawOffers) => step ? hl(moveTag, { class: { a1t: step.ply === curPly } }, [
  step.san.startsWith("P") ? step.san.slice(1) : step.san,
  drawOffers.has(step.ply) ? renderDrawOffer() : void 0
]) : orEmpty && hl(moveTag, "\u2026");
function renderResult(ctrl) {
  let result;
  if (finished(ctrl.data))
    switch (ctrl.data.game.winner) {
      case "white":
        result = "1-0";
        break;
      case "black":
        result = "0-1";
        break;
      default:
        result = "\xBD-\xBD";
    }
  if (result || aborted(ctrl.data)) {
    return hl("div.result-wrap", [
      hl("p.result", result || ""),
      hl(
        "p.status",
        {
          hook: onInsert(() => {
            if (ctrl.autoScroll) ctrl.autoScroll();
            else setTimeout(() => ctrl.autoScroll(), 200);
          })
        },
        status(ctrl.data)
      )
    ]);
  }
  return void 0;
}
function renderMoves(ctrl) {
  const pending = ctrl.pendingStep(), steps = pending ? [...ctrl.data.steps, pending] : ctrl.data.steps, firstPly2 = firstPly(ctrl.data), lastPly2 = lastPly(ctrl.data), indexOffset = Math.trunc(firstPly2 / 2) + 1, drawPlies = new Set(ctrl.data.game.drawOffers || []);
  if (typeof lastPly2 === "undefined") return [];
  const pairs = [];
  let startAt = 1;
  if (firstPly2 % 2 === 1) {
    pairs.push([null, steps[1]]);
    startAt = 2;
  }
  for (let i = startAt; i < steps.length; i += 2) pairs.push([steps[i], steps[i + 1]]);
  const els = [], curPly = pending ? pending.ply : ctrl.ply;
  for (let i = 0; i < pairs.length; i++) {
    els.push(
      hl(indexTag, i + indexOffset),
      renderMove(pairs[i][0], curPly, true, drawPlies),
      renderMove(pairs[i][1], curPly, false, drawPlies)
    );
  }
  els.push(renderResult(ctrl));
  return els;
}
function analysisButton2(ctrl) {
  const forecastCount = ctrl.data.forecastCount;
  return userAnalysable(ctrl.data) && !ctrl.data.local && hl(
    "a.fbt.analysis",
    {
      class: { text: !!forecastCount },
      attrs: {
        title: i18n.site.analysis,
        href: game(ctrl.data, ctrl.data.player.color) + "/analysis#" + ctrl.ply,
        "data-icon": licon.Microscope
      }
    },
    !!forecastCount && String(forecastCount)
  );
}
var goThroughMoves = (ctrl, e) => {
  const targetPly = () => parseInt(e.target.getAttribute("data-ply") || "");
  repeater(
    () => {
      const ply = targetPly();
      if (!isNaN(ply)) ctrl.userJump(ply);
      ctrl.redraw();
    },
    () => isNaN(targetPly())
  );
};
function renderButtons(ctrl) {
  const firstPly2 = firstPly(ctrl.data), lastPly2 = lastPly(ctrl.data);
  return hl(rbuttonsTag, [
    analysisButton2(ctrl) || hl("div.noop"),
    [
      ["JumpFirst", firstPly2],
      ["JumpPrev", ctrl.ply - 1],
      ["JumpNext", ctrl.ply + 1],
      ["JumpLast", lastPly2]
    ].map((b, i) => {
      const enabled = ctrl.ply !== b[1] && b[1] >= firstPly2 && b[1] <= lastPly2;
      return hl("button.fbt.repeatable", {
        class: { glowing: i === 3 && ctrl.isLate() },
        attrs: { disabled: !enabled, "data-icon": licon[b[0]], "data-ply": enabled ? b[1] : "-" },
        hook: onInsert(
          (el) => addPointerListeners(el, {
            click: (e) => {
              goThroughMoves(ctrl, e);
              blurIfPrimaryClick(e);
            },
            hold: "click"
          })
        )
      });
    }),
    toggleButton(ctrl.menu, i18n.site.menu)
  ]);
}
function initMessage(ctrl) {
  const d = ctrl.data;
  return (ctrl.replayEnabledByPref() || displayColumns() > 1) && playable(d) && d.game.turns === 0 && !d.player.spectator && hl("div.message", { attrs: dataIcon(licon.InfoCircle) }, [
    hl("div", [
      i18n.site[d.player.color === "white" ? "youPlayTheWhitePieces" : "youPlayTheBlackPieces"],
      d.player.color === "white" && [hl("br"), hl("strong", i18n.site.itsYourTurn)]
    ])
  ]);
}
var col1Button = (ctrl, dir, icon, disabled) => hl("button.fbt", {
  attrs: { disabled, "data-icon": icon, "data-ply": ctrl.ply + dir },
  hook: onInsert((el) => addPointerListeners(el, { click: (e) => goThroughMoves(ctrl, e), hold: "click" }))
});
function render2(ctrl) {
  const d = ctrl.data, moves = ctrl.replayEnabledByPref() && hl(
    movesTag,
    {
      hook: onInsert((el) => {
        el.addEventListener("mousedown", (e) => {
          let node = e.target, offset = -2;
          if (node.tagName !== moveTag.toUpperCase()) return;
          while (node = node.previousSibling) {
            offset++;
            if (node.tagName === indexTagUC) {
              if (ctrl.toSubmit) ctrl.submitMove(false);
              ctrl.userJump(2 * parseInt(node.textContent || "") + offset);
              ctrl.redraw();
              break;
            }
          }
        });
        ctrl.autoScroll = () => autoScroll(el, ctrl);
        if (ctrl.ply > 2) {
          ctrl.autoScroll();
          if (displayColumns() === 1) ctrl.autoScroll();
        }
      })
    },
    renderMoves(ctrl)
  );
  const renderMovesOrResult = moves ? moves : renderResult(ctrl);
  return !ctrl.nvui && hl(rmovesTag, [
    renderButtons(ctrl),
    boardMenu_default(ctrl),
    initMessage(ctrl) || (displayColumns() === 1 ? hl("div.col1-moves", [
      col1Button(ctrl, -1, licon.JumpPrev, ctrl.ply === firstPly(d)),
      renderMovesOrResult,
      col1Button(ctrl, 1, licon.JumpNext, ctrl.ply === lastPly(d))
    ]) : renderMovesOrResult)
  ]);
}

// ../round/src/view/user.ts
function userHtml(ctrl, player, position) {
  var _a, _b, _c;
  const d = ctrl.data, user = player.user, perf = (_a = user == null ? void 0 : user.perfs) == null ? void 0 : _a[d.game.perf], rating = player.rating || (perf == null ? void 0 : perf.rating), showSignals = defined(d.opponentSignal) && defined(user == null ? void 0 : user.id) && ctrl.isPlaying(), signal = showSignals ? user.id === ((_b = d.opponent.user) == null ? void 0 : _b.id) ? d.opponentSignal : user.id === ((_c = d.player.user) == null ? void 0 : _c.id) ? myWsLagAsSignal() : void 0 : void 0;
  if (user) {
    const connecting2 = !player.onGame && ctrl.firstSeconds && user.online;
    return hl(
      `div.ruser-${position}.ruser.user-link`,
      {
        class: {
          online: player.onGame,
          offline: !player.onGame,
          long: user.username.length > 16,
          connecting: connecting2
        }
      },
      [
        hl("icon.line", {
          class: user.patron ? {
            patron: true,
            ...user.patronColor ? { [`paco${user.patronColor}`]: true } : {}
          } : {},
          attrs: {
            title: connecting2 ? "Connecting to the game" : player.onGame ? "Joined the game" : "Left the game"
          }
        }),
        userLink({
          name: user.username,
          ...user,
          attrs: { "data-pt-pos": "s", ...ctrl.isPlaying() ? { target: "_blank" } : {} },
          online: false,
          line: false
        }),
        !!signal && signalBars(signal),
        !!rating && hl("rating", rating + (player.provisional ? "?" : "")),
        !!rating && ratingDiff(player),
        player.engine && hl("span", {
          attrs: { ...dataIcon(licon.CautionCircle), title: i18n.site.thisAccountViolatedTos }
        })
      ]
    );
  }
  const connecting = !player.onGame && ctrl.firstSeconds;
  return hl(
    `div.ruser-${position}.ruser.user-link`,
    { class: { online: player.onGame, offline: !player.onGame, connecting } },
    [
      hl("icon.line", {
        attrs: {
          title: connecting ? "Connecting to the game" : player.onGame ? "Joined the game" : "Left the game"
        }
      }),
      hl("name", player.name || i18n.site.anonymous)
    ]
  );
}
var signalBars = (signal) => {
  const bars = [];
  for (let i = 1; i <= 4; i++) bars.push(hl(i <= signal ? "icon" : "icon.off"));
  return hl("signal.q" + signal, bars);
};
var myWsLagAsSignal = () => {
  const ping = wsAverageLag();
  return !ping ? 0 : ping < 150 ? 4 : ping < 300 ? 3 : ping < 500 ? 2 : 1;
};
var userTxt = (player) => player.user ? (player.user.title ? player.user.title + " " : "") + player.user.username : player.ai ? i18n.site.aiNameLevelAiLevel("Stockfish", player.ai) : i18n.site.anonymous;

// ../round/src/view/clock.ts
var anyClockView = (ctrl, position) => {
  const player = ctrl.playerAt(position);
  if (ctrl.clock) return renderClock(ctrl.clock, player.color, position, onTheSide(ctrl));
  else if (ctrl.data.correspondence && ctrl.data.game.turns > 1)
    return corresClockView_default(ctrl.corresClock, player.color, position, ctrl.data.game.player);
  else return whosTurn(ctrl, player.color, position);
};
var onTheSide = (round) => (color, position) => {
  var _a, _b;
  const isPlayer = !round.data.player.spectator && round.data.player.color === color;
  const ranks = ((_a = round.data.tournament) == null ? void 0 : _a.ranks) || ((_b = round.data.swiss) == null ? void 0 : _b.ranks);
  return [
    renderBerserk(round, color, position) || (isPlayer ? goBerserk(round, color) : moretime(round)),
    clockSide(round, color, position, ranks)
  ];
};
function whosTurn(ctrl, color, position) {
  const d = ctrl.data;
  if (finished(d) || aborted(d)) return void 0;
  return hl(
    "div.rclock.rclock-turn.rclock-" + position,
    d.game.player === color && hl(
      "div.rclock-turn__text",
      d.player.spectator ? i18n.site[d.game.player === "white" ? "whitePlays" : "blackPlays"] : i18n.site[d.game.player === d.player.color ? "yourTurn" : "waitingForOpponent"]
    )
  );
}
var showBerserk = (ctrl, color) => ctrl.hasGoneBerserk(color) && !bothPlayersHavePlayed(ctrl.data) && playable(ctrl.data);
var renderBerserk = (ctrl, color, position) => showBerserk(ctrl, color) ? hl("div.berserked." + position, { attrs: dataIcon(licon.Berserk) }) : null;
var goBerserk = (ctrl, color) => berserkableBy(ctrl.data) && !ctrl.hasGoneBerserk(color) && hl("button.fbt.go-berserk", {
  attrs: { title: "GO BERSERK! Half the time, no increment, bonus point", ...dataIcon(licon.Berserk) },
  hook: bind("click", ctrl.goBerserk)
});
var clockSide = (ctrl, color, position, ranks) => ranks && !showBerserk(ctrl, color) && hl("div.tour-rank." + position, { attrs: { title: "Current tournament rank" } }, "#" + ranks[color]);

// ../round/src/view/expiration.ts
var rang = false;
function expiration_default(ctrl) {
  const d = playable(ctrl.data) && ctrl.data.expiration;
  if (!d) return void 0;
  const timeLeft = Math.max(0, d.movedAt - Date.now() + d.millisToMove), secondsLeft = Math.floor(timeLeft / 1e3), myTurn = isPlayerTurn(ctrl.data), emerg = myTurn && timeLeft < 8e3;
  if (!rang && emerg) {
    site.sound.play("lowTime");
    rang = true;
  }
  const side = myTurn !== ctrl.flip ? "bottom" : "top";
  return h(
    "div.expiration.expiration-" + side,
    { class: { emerg, "bar-glider": myTurn } },
    i18n.site.nbSecondsToPlayTheFirstMove.asArray(secondsLeft, h("strong", secondsLeft))
  );
}

// ../round/src/view/table.ts
function renderPlayer(ctrl, position) {
  if (ctrl.nvui) return void 0;
  const player = ctrl.playerAt(position);
  return player.ai ? h("div.user-link.online.ruser.ruser-" + position, [
    h("icon.line"),
    h("name", i18n.site.aiNameLevelAiLevel("Stockfish", player.ai))
  ]) : userHtml(ctrl, player, position);
}
var isLoading = (ctrl) => ctrl.loading || ctrl.redirecting;
var loader = () => h("icon.ddloader");
var renderTableWith = (ctrl, buttons) => [
  render2(ctrl),
  buttons.find((x) => !!x) && hl("div.rcontrols", buttons)
];
var renderTableEnd = (ctrl) => renderTableWith(ctrl, [
  isLoading(ctrl) ? loader() : backToTournament(ctrl) || backToSwiss(ctrl) || followUp(ctrl)
]);
var renderTableWatch = (ctrl) => renderTableWith(ctrl, [
  isLoading(ctrl) ? loader() : playable(ctrl.data) ? void 0 : watcherFollowUp(ctrl)
]);
var prompt = (ctrl) => {
  const o = ctrl.question();
  if (!o) return {};
  const btn = (tpe, icon, text, action) => ctrl.nvui ? hl("button", { hook: bind("click", action) }, text) : hl(`a.${tpe}`, { attrs: dataIcon(icon), hook: bind("click", action) });
  const noBtn = o.no && btn("no", o.no.icon || licon.X, o.no.text || i18n.site.decline, o.no.action);
  const yesBtn = o.yes && btn("yes", o.yes.icon || licon.Checkmark, o.yes.text || i18n.site.accept, o.yes.action);
  return {
    promptVNode: hl("div.question", { key: o.prompt }, [noBtn, hl("p", o.prompt), yesBtn]),
    isQuestion: o.no !== void 0 || o.yes !== void 0
  };
};
var renderTablePlay = (ctrl) => {
  const d = ctrl.data, loading = isLoading(ctrl), { promptVNode, isQuestion } = prompt(ctrl), icons = loading || isQuestion ? [] : [
    abortable(d) ? standard(ctrl, void 0, licon.X, i18n.site.abortGame, "abort") : standard(
      ctrl,
      (d2) => ({ enabled: takebackable(d2) }),
      licon.Back,
      i18n.site.proposeATakeback,
      "takeback-yes",
      ctrl.takebackYes
    ),
    ctrl.drawConfirm ? drawConfirm(ctrl) : ctrl.data.game.threefold ? claimThreefold(ctrl, (d2) => {
      const threefoldable = drawableSwiss(d2);
      return {
        enabled: threefoldable,
        overrideHint: threefoldable ? void 0 : i18n.site.noDrawBeforeSwissLimit
      };
    }) : standard(
      ctrl,
      (d2) => ({
        enabled: ctrl.canOfferDraw(),
        overrideHint: drawableSwiss(d2) ? void 0 : i18n.site.noDrawBeforeSwissLimit
      }),
      licon.OneHalf,
      i18n.site.offerDraw,
      "draw-yes",
      () => ctrl.offerDraw(true)
    ),
    ctrl.resignConfirm ? resignConfirm(ctrl) : standard(
      ctrl,
      (d2) => ({ enabled: resignable(d2) }),
      licon.FlagOutline,
      i18n.site.resign,
      "resign",
      () => ctrl.resign(true)
    ),
    analysisButton2(ctrl),
    toggleButton(ctrl.menu, i18n.site.menu)
  ], buttons = loading ? [loader()] : [promptVNode, opponentGone(ctrl), threefoldSuggestion(ctrl)];
  return [
    render2(ctrl),
    hl("div.rcontrols", [
      hl(
        "div.ricons",
        { class: { confirm: !!(ctrl.drawConfirm || ctrl.resignConfirm), empty: !icons.length } },
        icons
      ),
      buttons
    ])
  ];
};
var renderTable = (ctrl) => [
  hl("div.round__app__table"),
  ctrl.data.player.spectator ? hl("div.round__app__betting", {
    attrs: { "data-ark-spectator-betting-slot": "true" }
  }) : void 0,
  expiration_default(ctrl),
  renderPlayer(ctrl, "top"),
  ctrl.data.player.spectator ? renderTableWatch(ctrl) : playable(ctrl.data) ? renderTablePlay(ctrl) : renderTableEnd(ctrl),
  renderPlayer(ctrl, "bottom"),
  /* render clocks after players so they display on top of them in col1,
   * since they occupy the same grid cell. This is required to avoid
   * having two columns with min-content, which causes the horizontal moves
   * to overflow: it couldn't be contained in the parent anymore */
  anyClockView(ctrl, "top"),
  anyClockView(ctrl, "bottom")
];

export {
  corresClockView_default,
  parsePossibleMoves,
  firstPly,
  lastPly,
  lastStep,
  plyStep,
  upgradeServerData,
  makeConfig,
  reload,
  sync,
  boardOrientation,
  render,
  prev,
  next,
  init,
  view,
  renderResult,
  userTxt,
  renderTableEnd,
  renderTableWatch,
  renderTablePlay,
  renderTable
};
//# sourceMappingURL=lib.LHNTP3YL.js.map
