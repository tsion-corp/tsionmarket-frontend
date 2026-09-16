import {
  displayColumns,
  hl
} from "./lib.S3TIZ2HQ.js";

// ../lib/src/game/view/status.ts
function bishopOnColor(expandedFen, offset) {
  if (expandedFen.length !== 64) throw new Error("Expanded FEN expected to be 64 characters");
  for (let row = 0; row < 8; row++) {
    for (let col = row % 2 === offset ? 0 : 1; col < 8; col += 2) {
      if (/[bB]/.test(expandedFen[row * 8 + col])) return true;
    }
  }
  return false;
}
function expandFen(fullFen) {
  return fullFen.split(" ")[0].replace(/\d/g, (n) => "1".repeat(Number(n))).replace(/\//g, "");
}
function insufficientMaterial(variant, fullFen) {
  if (variant === "horde" || variant === "kingOfTheHill" || variant === "racingKings" || variant === "crazyhouse" || variant === "atomic" || variant === "antichess" || variant === "threeCheck")
    return false;
  const pieces = fullFen.split(" ")[0].replace(/[^a-z]/gi, "");
  if (/^[Kk]{2}$/.test(pieces)) return true;
  if (/[prq]/i.test(pieces)) return false;
  if (/^[KkNn]{3}$/.test(pieces)) return true;
  if (/b/i.test(pieces)) {
    const expandedFen = expandFen(fullFen);
    return (!bishopOnColor(expandedFen, 0) || !bishopOnColor(expandedFen, 1)) && !/[nN]/.test(pieces);
  }
  return false;
}
function status(d) {
  return statusOf({
    winner: d.game.winner,
    status: d.game.status.name,
    abortedBy: d.game.abortedBy,
    ply: d.game.turns,
    fen: d.game.fen,
    variant: d.game.variant.key,
    fiftyMoves: d.game.fiftyMoves,
    threefold: d.game.threefold,
    drawOffers: d.game.drawOffers,
    source: d.game.source
  });
}
function statusOf(d) {
  var _a;
  const winnerSuffix = d.winner ? " \u2022 " + i18n.site[d.winner === "white" ? "whiteIsVictorious" : "blackIsVictorious"] : "";
  switch (d.status) {
    case "started":
      return i18n.site.playingRightNow;
    case "aborted":
      const abortReasonText = d.abortedBy ? i18n.site[d.abortedBy === "white" ? "whiteAborted" : "blackAborted"] : d.ply === 0 ? i18n.site.whiteDidntMove : i18n.site.blackDidntMove;
      return `${abortReasonText}${winnerSuffix}`;
    case "mate":
      return i18n.site.checkmate + winnerSuffix;
    case "resign":
      return i18n.site[d.winner === "white" ? "blackResigned" : "whiteResigned"] + winnerSuffix;
    case "stalemate":
      return i18n.site.stalemate + winnerSuffix;
    case "timeout":
      switch (d.winner) {
        case "white":
          return i18n.site.blackLeftTheGame + winnerSuffix;
        case "black":
          return i18n.site.whiteLeftTheGame + winnerSuffix;
        default:
          return `${d.ply % 2 === 0 ? i18n.site.whiteLeftTheGame : i18n.site.blackLeftTheGame} \u2022 ${i18n.site.draw}`;
      }
    case "draw": {
      if (d.fiftyMoves || d.fen.split(" ")[4] === "100")
        return `${i18n.site.fiftyMovesWithoutProgress} \u2022 ${i18n.site.draw}`;
      if (d.threefold) return `${i18n.site.threefoldRepetition} \u2022 ${i18n.site.draw}`;
      if (insufficientMaterial(d.variant, d.fen))
        return `${i18n.site.insufficientMaterial} \u2022 ${i18n.site.draw}`;
      if ((_a = d.drawOffers) == null ? void 0 : _a.some((turn) => turn >= d.ply)) return i18n.site.drawByMutualAgreement;
      return i18n.site.draw;
    }
    case "insufficientMaterialClaim":
      return `${i18n.site.drawClaimed} \u2022 ${i18n.site.insufficientMaterial}`;
    case "outoftime":
      return `${d.ply % 2 === 0 ? i18n.site.whiteTimeOut : i18n.site.blackTimeOut}${winnerSuffix || ` \u2022 ${i18n.site.draw}`}`;
    case "noStart":
      return (d.winner === "white" ? i18n.site.blackDidntMove : i18n.site.whiteDidntMove) + winnerSuffix;
    case "cheat":
      return i18n.site.cheatDetected + winnerSuffix;
    case "variantEnd":
      switch (d.variant) {
        case "kingOfTheHill":
          return i18n.site.kingInTheCenter + winnerSuffix;
        case "threeCheck":
          return i18n.site.threeChecks + winnerSuffix;
      }
      return i18n.site.variantEnding + winnerSuffix;
    case "unknownFinish":
      return d.winner ? i18n.site[d.winner === "white" ? "whiteIsVictorious" : "blackIsVictorious"] : i18n.site.finished;
    default:
      return d.status + winnerSuffix;
  }
}

// ../lib/src/game/clock/clockView.ts
function renderClock(ctrl, color, position, onTheSide) {
  const millis = ctrl.millisOf(color), isRunning = color === ctrl.times.activeColor;
  const update = (el) => {
    const els = ctrl.elements[color], millis2 = ctrl.millisOf(color), isRunning2 = color === ctrl.times.activeColor;
    els.time = el;
    els.clock = el.parentElement;
    el.innerHTML = formatClockTime(millis2, ctrl.showTenths(millis2), isRunning2);
  };
  const timeHook = {
    insert: (vnode) => update(vnode.elm),
    postpatch: (_, vnode) => update(vnode.elm)
  };
  return hl(
    // the player.color class ensures that when the board is flipped, the clock is redrawn. solves bug where clock
    // would be incorrectly latched to red color: https://github.com/lichess-org/lila/issues/10774
    `div.rclock.rclock-${position}.rclock-${color}`,
    { class: { outoftime: millis <= 0, running: isRunning, emerg: millis < ctrl.emergMs } },
    site.blindMode ? [hl("div.time", { attrs: { role: "timer" }, hook: timeHook })] : [
      ctrl.showBar && ctrl.opts.bothPlayersHavePlayed() ? showBar(ctrl, color) : void 0,
      hl("div.time", { class: { hour: millis > 3600 * 1e3 }, hook: timeHook }),
      onTheSide(color, position)
    ]
  );
}
var pad2 = (num) => (num < 10 ? "0" : "") + num;
var sepHigh = "<sep>:</sep>";
var sepLow = '<sep class="low">:</sep>';
function parseClockTime(time) {
  const totalSeconds = time / 1e3;
  return {
    millis: Math.floor(time % 1e3),
    seconds: Math.floor(totalSeconds % 60),
    minutes: Math.floor(totalSeconds / 60 % 60),
    hours: Math.floor(totalSeconds / 3600)
  };
}
function formatClockTimeVerbal(time) {
  const { seconds, minutes, hours } = parseClockTime(time);
  const hoursOfDay = hours % 24;
  const days = Math.floor(hours / 24);
  const parts = [];
  if (days > 0) {
    parts.push(i18n.site.nbDays(days));
    if (hoursOfDay > 0) parts.push(i18n.site.nbHours(hoursOfDay));
  } else if (hours > 0) {
    parts.push(i18n.site.nbHours(hours));
    if (minutes > 0) parts.push(i18n.site.nbMinutes(minutes));
  } else {
    if (minutes > 0) parts.push(i18n.site.nbMinutes(minutes));
    if (seconds > 0 || parts.length === 0) parts.push(i18n.site.nbSeconds(seconds));
  }
  return parts.join(" ");
}
function formatClockTime(time, showTenths, isRunning) {
  if (site.blindMode) return formatClockTimeVerbal(time);
  const { millis, seconds, minutes, hours } = parseClockTime(time);
  const sep = isRunning && millis < 500 ? sepLow : sepHigh, baseStr = pad2(minutes) + sep + pad2(seconds);
  if (hours > 0) {
    return pad2(hours) + sepHigh + baseStr;
  } else if (showTenths) {
    let tenthsStr = Math.floor(millis / 100).toString();
    if (!isRunning && time < 1e3) {
      tenthsStr += `<huns>${Math.floor(millis / 10) % 10}</huns>`;
    }
    return `${baseStr}<tenths><sep>.</sep>${tenthsStr}</tenths>`;
  } else {
    return baseStr;
  }
}
function showBar(ctrl, color) {
  const update = (el) => {
    if (el.animate !== void 0) {
      let anim = ctrl.elements[color].barAnim;
      if (!(anim == null ? void 0 : anim.effect) || anim.effect.target !== el) {
        anim = el.animate([{ transform: "scale(1)" }, { transform: "scale(0, 1)" }], {
          duration: ctrl.barTime,
          fill: "both"
        });
        ctrl.elements[color].barAnim = anim;
      }
      const remaining = ctrl.millisOf(color);
      anim.currentTime = ctrl.barTime - remaining;
      if (color === ctrl.times.activeColor) {
        if (remaining > ctrl.barTime) {
          el.style.animationDuration = `${remaining}ms`;
        } else if (remaining > 0) {
          anim.play();
        }
      } else anim.pause();
    } else {
      ctrl.elements[color].bar = el;
      el.style.transform = "scale(" + ctrl.timeRatio(ctrl.millisOf(color)) + ",1)";
    }
  };
  return displayColumns() === 1 ? void 0 : hl("div.bar", {
    class: { berserk: ctrl.opts.hasGoneBerserk(color) },
    hook: {
      insert: (vnode) => update(vnode.elm),
      postpatch: (_, vnode) => update(vnode.elm)
    }
  });
}
function updateElements(clock, els, millis) {
  if (els.time) els.time.innerHTML = formatClockTime(millis, clock.showTenths(millis), true);
  if (els.clock) {
    const cl = els.clock.classList;
    if (millis < clock.emergMs) cl.add("emerg");
    else if (cl.contains("emerg")) cl.remove("emerg");
  }
}

export {
  status,
  statusOf,
  renderClock,
  formatClockTimeVerbal,
  updateElements
};
//# sourceMappingURL=lib.5Q3MW527.js.map
