import {
  sanToUci,
  sanToWords,
  sanWriter,
  transRole
} from "./lib.GD6YSPBF.js";
import {
  destsToUcis,
  plyToTurn
} from "./lib.LRP46MC3.js";
import {
  key2pos,
  pos2key
} from "./lib.RPQH5UYI.js";
import {
  files
} from "./lib.XAEDCBGD.js";
import {
  chessgroundDests,
  lichessRules,
  parseFen,
  setupPosition
} from "./lib.X7H2PLEK.js";
import {
  COLORS,
  RANK_NAMES,
  ROLES,
  charToRole,
  opposite,
  parseUci,
  roleToChar
} from "./lib.53PYQRAK.js";
import {
  isMac,
  onInsert
} from "./lib.S3TIZ2HQ.js";
import {
  h
} from "./lib.LWF5S4ZV.js";
import {
  storage
} from "./lib.NFSQQWN5.js";
import {
  memoize,
  requestIdleCallbackSafe
} from "./lib.GMEH5BEF.js";

// ../lib/src/nvui/notify.ts
var Notify = class {
  constructor(redraw) {
    this.redraw = redraw;
    this.text = "";
    this.set = (msg) => {
      this.text = msg + (this.text === msg ? "\xA0" : "");
      this.date = /* @__PURE__ */ new Date();
      requestIdleCallbackSafe(() => {
        var _a;
        return (_a = this.redraw) == null ? void 0 : _a.call(this);
      }, 500);
    };
    this.render = () => liveText(this.text, "assertive", "div.notify", this.date);
  }
};
function liveText(text, live = "polite", sel = "p", forceKey) {
  const data = isMac() ? { key: (forceKey == null ? void 0 : forceKey.getTime().toString()) || text, attrs: { role: "alert" } } : { attrs: { "aria-live": live, "aria-atomic": "true" } };
  return h(sel, data, text);
}

// ../lib/src/nvui/render.ts
var renderPieceStyle = (ch, pieceStyle) => pieceStyle === "letter" ? ch.toLowerCase() : pieceStyle === "white uppercase letter" ? ch : pieceStyle === "name" ? charToRole(ch) : `${ch.replace("N", "K").replace("n", "k")}${charToRole(ch).slice(1)}`;
var renderPrefixStyle = (color, prefixStyle) => prefixStyle === "letter" ? color[0] : prefixStyle === "name" ? `${color} ` : "";
var renderPieceStr = (ch, pieceStyle, c, prefixStyle) => `${renderPrefixStyle(c, prefixStyle)} ${renderPieceStyle(c === "white" ? ch.toUpperCase() : ch, pieceStyle)}`;
var renderSan = (san, uci, style) => !san ? i18n.nvui.gameStart : style === "uci" ? uci != null ? uci : "" : style === "san" ? san : sanToWords(san).split(" ").map(
  (f) => files.includes(f.toLowerCase()) ? renderFile(f.toLowerCase(), style) : f
).join(" ");
var renderPieces = (pieces, style, pov) => h(
  "div.pieces",
  COLORS.map(
    (color) => h(`div.${color}-pieces`, [
      h("h3", i18n.site[color]),
      ...renderPiecesByColorAsVNodes(pieces, style, color, pov)
    ])
  )
);
var renderPockets = (pockets) => h(
  "div.pieces",
  COLORS.map(
    (color, i) => {
      var _a;
      return h(`div.${color}-pieces`, [h("h3", i18n.site[color]), (_a = pocketsStr(pockets[i])) != null ? _a : "0"]);
    }
  )
);
var pocketsStr = (pocket) => Object.entries(pocket).map(([role, count]) => `${i18n.nvui[role]}: ${count}`).join(", ");
function renderPieceKeys(pieces, p, style, pov) {
  const color = p === p.toUpperCase() ? "white" : "black";
  if (p.toLowerCase() === "a") return renderPiecesByColorAsString(pieces, style, color);
  const role = charToRole(p);
  const keys = keysWithPiece(pieces, role, color, pov);
  let pieceStr2 = transPieceStr(role, color, i18n);
  if (!pieceStr2) {
    console.error(`Missing piece name for ${color} ${role}`);
    pieceStr2 = `${color} ${role}`;
  }
  return `${pieceStr2}: ${keys.length ? keys.map((k) => renderKey(k, style)).join(", ") : i18n.site.none}`;
}
function renderPiecesOn(pieces, rankOrFile, style, pov) {
  const renderedKeysWithPiece = Array.from(pieces).sort(
    pov === "black" ? ([key1], [key2]) => key2.localeCompare(key1) : ([key1], [key2]) => key1.localeCompare(key2)
  ).reduce(
    (acc, [key, p]) => key.includes(rankOrFile) ? acc.concat(`${renderKey(key, style)} ${transPieceStr(p.role, p.color, i18n)}`) : acc,
    []
  );
  return renderedKeysWithPiece.length ? renderedKeysWithPiece.join(", ") : i18n.site.none;
}
function renderBoard(pieces, pov, pieceStyle, prefixStyle, positionStyle, boardStyle) {
  const doRankHeader = (rank) => h("th", { attrs: { scope: "row" } }, rank);
  const doFileHeaders = () => {
    const ths = files.map((file) => h("th", { attrs: { scope: "col" } }, file));
    return h("tr", [h("td"), ...pov === "black" ? ths.reverse() : ths, h("td")]);
  };
  const renderPositionStyle = (rank, file, orig) => positionStyle === "before" ? file.toUpperCase() + rank + " " + orig : positionStyle === "after" ? orig + " " + file.toUpperCase() + rank : orig;
  const doPieceButton = (rank, file, letter, color, text, isLightSquare) => {
    const pieceClass = {
      [color]: letter !== "-" && letter !== "+",
      [charToRole(letter.toLowerCase())]: letter !== "-" && letter !== "+",
      dark: !isLightSquare,
      light: isLightSquare
    };
    return h(
      "button",
      {
        class: pieceClass,
        attrs: {
          text: renderPositionStyle(rank, file, text),
          rank,
          file,
          piece: letter.toLowerCase(),
          color,
          "trap-bypass": true
        }
      },
      renderPositionStyle(rank, file, text)
    );
  };
  const doPiece = (rank, file) => {
    const key = `${file}${rank}`;
    const piece = pieces.get(key);
    const pieceWrapper = boardStyle === "table" ? "td" : "span";
    const plusOrMinus = (key.charCodeAt(0) + key.charCodeAt(1)) % 2 ? "-" : "+";
    if (piece) {
      const roleCh = roleToChar(piece.role);
      const pieceText = pieceStyle === "name" || pieceStyle === "white uppercase name" ? transPieceStr(piece.role, piece.color, i18n) : renderPieceStr(roleCh, pieceStyle, piece.color, prefixStyle);
      return h(pieceWrapper, doPieceButton(rank, file, roleCh, piece.color, pieceText, plusOrMinus === "-"));
    } else {
      return h(
        pieceWrapper,
        doPieceButton(rank, file, plusOrMinus, "none", plusOrMinus, plusOrMinus === "-")
      );
    }
  };
  const doRank = (pov2, rank) => {
    const rankElements = [];
    if (boardStyle === "table") rankElements.push(doRankHeader(rank));
    rankElements.push(...files.map((file) => doPiece(rank, file)));
    if (boardStyle === "table") rankElements.push(doRankHeader(rank));
    if (pov2 === "black") rankElements.reverse();
    return h(boardStyle === "table" ? "tr" : "div", rankElements);
  };
  const ranks = [];
  if (boardStyle === "table") ranks.push(doFileHeaders());
  ranks.push(
    ...RANK_NAMES.slice().reverse().map((rank) => doRank(pov, rank))
  );
  if (boardStyle === "table") ranks.push(doFileHeaders());
  if (pov === "black") ranks.reverse();
  return h(boardStyle === "table" ? "table.board-wrapper" : "div.board-wrapper", ranks);
}
var renderFile = (f, style) => style === "nato" ? nato[f] : style === "anna" ? anna[f] : f;
var renderKey = (key, style) => style === "nato" || style === "anna" ? `${renderFile(key[0], style)} ${key[1]}` : key;
function castlingFlavours(input) {
  switch (input.toLowerCase().replace(/[-\s]+/g, "")) {
    case "oo":
    case "00":
      return "o-o";
    case "ooo":
    case "000":
      return "o-o-o";
  }
  return input;
}
function renderMainline(nodes, currentPath, style, withComments = true) {
  const res = [];
  let path = "";
  nodes.forEach((node) => {
    if (!node.san || !node.uci) return;
    path += node.id;
    const content = [
      node.ply & 1 ? plyToTurn(node.ply) + ". " : null,
      renderSan(node.san, node.uci, style)
    ];
    res.push(h("move", { attrs: { p: path }, class: { active: path === currentPath } }, content));
    if (withComments) res.push(renderComments(node, style));
    res.push(", ");
    if (node.ply % 2 === 0) res.push(h("br"));
  });
  return res;
}
var renderComments = (node, style) => {
  var _a, _b;
  return (_b = (_a = node.comments) == null ? void 0 : _a.map((c) => ` ${augmentLichessComment(c, style)}`).join(".")) != null ? _b : "";
};
var isKey = (maybeKey) => !!maybeKey.match(/^[a-h][1-8]$/);
var keyFromAttrs = (el) => {
  var _a, _b;
  const maybeKey = `${(_a = el.getAttribute("file")) != null ? _a : ""}${(_b = el.getAttribute("rank")) != null ? _b : ""}`;
  return isKey(maybeKey) ? maybeKey : void 0;
};
var pieceStr = (role, color) => transPieceStr(role, color, i18n);
var transPieceStr = (role, color, i18n2) => i18n2.nvui[`${color}${role.charAt(0).toUpperCase()}${role.slice(1)}`];
var getPiecesByColor = (pieces, color, pov) => {
  return ROLES.slice().reverse().reduce(
    (lists, role) => lists.concat({
      role,
      keys: keysWithPiece(pieces, role, color, pov)
    }),
    []
  ).filter((l) => l.keys.length);
};
var renderPiecesByColorAsString = (pieces, style, color) => {
  return getPiecesByColor(pieces, color).map((l) => `${transRole(l.role)}: ${l.keys.map((k) => renderKey(k, style)).join(", ")}`).join(", ");
};
var renderPiecesByColorAsVNodes = (pieces, style, color, pov) => {
  return getPiecesByColor(pieces, color).map((l) => {
    const sortedKeys = l.keys.sort((a, b) => a[0].localeCompare(b[0]));
    if (pov === "black") sortedKeys.reverse();
    return h("p", `${transRole(l.role)}: ${sortedKeys.map((k) => renderKey(k, style)).join(", ")}`);
  });
};
var keysWithPiece = (pieces, role, color, pov) => {
  return Array.from(pieces).filter(([_, p]) => (!color || p.color === color) && (!role || p.role === role)).map(([key]) => key).sort((a, b) => pov === "black" ? b.localeCompare(a) : a.localeCompare(b));
};
var augmentLichessComment = (comment, style) => comment.by === "lichess" ? comment.text.replace(
  /([^\s]+) was best\./,
  (_, san) => `Best move was ${renderSan(san, void 0, style)}`
) : comment.text;
var nato = {
  a: "alpha",
  b: "bravo",
  c: "charlie",
  d: "delta",
  e: "echo",
  f: "foxtrot",
  g: "golf",
  h: "hotel"
};
var anna = {
  a: "anna",
  b: "bella",
  c: "cesar",
  d: "david",
  e: "eva",
  f: "felix",
  g: "gustav",
  h: "hector"
};

// ../lib/src/nvui/setting.ts
function makeSetting(opts) {
  return {
    choices: opts.choices,
    get: () => opts.storage.get() || opts.default,
    set(v) {
      opts.storage.set(v);
      return v;
    }
  };
}
function renderSetting(setting, redraw) {
  const v = setting.get();
  return h(
    "select",
    {
      hook: onInsert((el) => {
        el.addEventListener("change", (e) => {
          setting.set(e.target.value);
          redraw();
        });
      })
    },
    setting.choices.map((choice) => {
      const [key, name] = choice;
      return h("option", { attrs: { value: String(key), selected: key === v } }, name);
    })
  );
}
var moveStyles = ["uci", "san", "literate", "nato", "anna"];
var pieceStyles = ["letter", "white uppercase letter", "name", "white uppercase name"];
var prefixStyles = ["letter", "name", "none"];
function boardSetting() {
  return makeSetting({
    choices: [
      ["plain", "plain: layout with no semantic rows or columns"],
      ["table", "table: layout using a table with rank and file columns and row headers"]
    ],
    default: "plain",
    storage: storage.make("nvui.boardLayout")
  });
}
function pageSetting() {
  return makeSetting({
    choices: [
      ["actions-board", `${i18n.nvui.actions} ${i18n.site.board}`],
      ["board-actions", `${i18n.site.board} ${i18n.nvui.actions}`]
    ],
    default: "actions-board",
    storage: storage.make("nvui.pageLayout")
  });
}
function styleSetting() {
  return makeSetting({
    choices: moveStyles.map((s) => [s, `${s}: ${renderSan("Nxf3", "g1f3", s)}`]),
    default: "literate",
    storage: storage.make("nvui.moveNotation")
  });
}
function pieceSetting() {
  return makeSetting({
    choices: pieceStyles.map((p) => [p, `${p}: ${renderPieceStyle("P", p)}`]),
    default: "white uppercase name",
    storage: storage.make("nvui.pieceStyle")
  });
}
function prefixSetting() {
  return makeSetting({
    choices: prefixStyles.map((p) => [p, `${p}: ${renderPrefixStyle("white", p)}`]),
    default: "name",
    storage: storage.make("nvui.prefixStyle")
  });
}
function positionSetting() {
  return makeSetting({
    choices: [
      ["before", "before: c2: wp"],
      ["after", "after: wp: c2"],
      ["none", "none"]
    ],
    default: "before",
    storage: storage.make("nvui.positionStyle")
  });
}

// ../lib/src/nvui/handler.ts
function leaveSquareHandler(buttons) {
  return (ev) => {
    const $currBtn = $(ev.target);
    $currBtn.removeAttr("ray");
    buttons.removeClass("active");
    $currBtn.addClass("active");
  };
}
function positionJumpHandler() {
  return (ev) => {
    var _a;
    const key = keyFromAttrs(ev.target);
    const digitMatch = ev.code.match(/^Digit([1-8])$/);
    if (!digitMatch || !key) return;
    const newRank = ev.shiftKey ? key[1] : digitMatch[1];
    const newFile = ev.shiftKey ? files[Number(digitMatch[1]) - 1] : key[0];
    (_a = document.querySelector(squareSelector(newRank, newFile))) == null ? void 0 : _a.focus();
  };
}
function pieceJumpingHandler(selectSound, errorSound, isAntichess = false) {
  return (ev) => {
    var _a, _b;
    const $currBtn = $(ev.target);
    if ($currBtn.attr("promotion") === "true") {
      const $moveBox = $("input.move");
      const $boardLive = $(".boardstatus");
      const promotionPiece = ev.key.toLowerCase();
      const promotionChoice = isAntichess ? /^[kqnrb]$/ : /^[qnrb]$/;
      if (!promotionPiece.match(promotionChoice)) {
        const msg = "Invalid promotion piece. q for queen, n for knight, r for rook, b for bishop";
        $boardLive.text(msg + (isAntichess ? ", k for king" : ""));
        return;
      }
      $moveBox.val($moveBox.val() + promotionPiece);
      $currBtn.removeAttr("promotion");
      $("#move-form").trigger("submit");
    }
    const myBtnAttrs = squareSelector((_a = $currBtn.attr("rank")) != null ? _a : "", (_b = $currBtn.attr("file")) != null ? _b : "");
    const $allPieces = $(`.board-wrapper [piece="${ev.key.toLowerCase()}"], ${myBtnAttrs}`);
    const myPieceIndex = $allPieces.index(myBtnAttrs);
    const next = ev.key.toLowerCase() === ev.key;
    const $prevNextPieces = next ? $allPieces.slice(myPieceIndex + 1) : $allPieces.slice(0, myPieceIndex);
    const pieceEl = next ? $prevNextPieces.get(0) : $prevNextPieces.get($prevNextPieces.length - 1);
    if (pieceEl) pieceEl.focus();
    else if ($allPieces.length >= 2) {
      const wrapPieceEl = next ? $allPieces.get(0) : $allPieces.get($allPieces.length - 1);
      wrapPieceEl == null ? void 0 : wrapPieceEl.focus();
      selectSound();
    } else errorSound();
  };
}
function arrowKeyHandler(pov, borderSound) {
  return (ev) => {
    const isWhite = pov === "white";
    const key = keyFromAttrs(ev.target);
    if (!key) return;
    let file = key[0];
    let rank = Number(key[1]);
    if (ev.key === "ArrowUp") rank = isWhite ? rank += 1 : rank -= 1;
    else if (ev.key === "ArrowDown") rank = isWhite ? rank -= 1 : rank += 1;
    else if (ev.key === "ArrowLeft")
      file = String.fromCharCode(isWhite ? file.charCodeAt(0) - 1 : file.charCodeAt(0) + 1);
    else if (ev.key === "ArrowRight")
      file = String.fromCharCode(isWhite ? file.charCodeAt(0) + 1 : file.charCodeAt(0) - 1);
    const newSqEl = document.querySelector(squareSelector(`${rank}`, file));
    newSqEl ? newSqEl.focus() : borderSound();
    ev.preventDefault();
  };
}
function selectionHandler(getOpponentColor, isTouchDevice = false, isAntichess = false) {
  return (ev) => {
    var _a, _b;
    const opponentColor = getOpponentColor();
    const $evBtn = $(ev.target);
    const rank = $evBtn.attr("rank");
    const file = $evBtn.attr("file");
    const pos = ((_a = $evBtn.attr("file")) != null ? _a : "") + rank;
    const $boardLive = $(".boardstatus");
    const promotionRank = opponentColor === "black" ? "8" : "1";
    const $moveBox = $("input.move");
    if (!$moveBox.length) return;
    if ($moveBox.val() !== "" && $evBtn.attr("color") === opposite(opponentColor) && !$evBtn.attr("promoteTo")) {
      $moveBox.val("");
    }
    if ($moveBox.val() === "") {
      if ($evBtn.attr("color") === opponentColor || $evBtn.attr("piece") === "-" || $evBtn.attr("piece") === "+") {
        $boardLive.text(keyText(ev.target) + " not selectable");
      } else {
        $moveBox.val(pos);
        clear("selection");
        $evBtn.addClass("selected");
        $evBtn.text($evBtn.attr("text") + " selected");
      }
    } else {
      const input = $moveBox.val();
      if (typeof input !== "string") return;
      if (isKey(input)) {
        const $firstPiece = $(squareSelector(input[1], input[0]));
        $moveBox.val($moveBox.val() + pos);
        if (rank === promotionRank && file && ((_b = $firstPiece.attr("piece")) == null ? void 0 : _b.toLowerCase()) === "p") {
          $evBtn.attr("promotion", "true");
          if (!isTouchDevice) {
            const msg = "Promote to: q for queen, n for knight, r for rook, b for bishop";
            $boardLive.text(msg + (isAntichess ? ", k for king" : ""));
          } else {
            const promotions = [
              { role: "q", text: "promote to queen" },
              { role: "n", text: "promote to knight" },
              { role: "r", text: "promote to rook" },
              { role: "b", text: "promote to bishop" }
            ];
            if (isAntichess) promotions.push({ role: "k", text: "promote to king" });
            promotions.push({ role: "x", text: "cancel" });
            promotions.forEach(({ role, text }, index) => {
              const rank2 = promotionRank === "8" ? 8 - index : 1 + index;
              const piecePromotionEl = $(squareSelector(rank2.toString(), file));
              piecePromotionEl.attr("promoteTo", role);
              piecePromotionEl.text(text);
            });
          }
          return;
        }
        clear("selection");
        $("#move-form").trigger("submit");
      } else {
        const first = input.substring(0, 2);
        const second = input.substring(2, 4);
        if (isKey(first) && isKey(second)) {
          const promoteTo = $evBtn.attr("promoteTo");
          if (promoteTo) {
            if (promoteTo === "x") {
              clear("promotion");
              $moveBox.val("");
              $boardLive.text("promotion cancelled");
            } else {
              $moveBox.val($moveBox.val() + promoteTo);
              clear("all");
              $("#move-form").trigger("submit");
            }
          }
        }
      }
    }
  };
}
function clear(what) {
  const $allSquares = $(`.board-wrapper button`);
  $allSquares.each(function() {
    if (what === "promotion" || what === "all") this.removeAttribute("promoteTo");
    if (what === "selection" || what === "all") this.classList.remove("selected");
    this.textContent = this.getAttribute("text");
  });
}
function keyText(target) {
  const color = target.getAttribute("color");
  const piece = target.getAttribute("piece");
  const key = keyFromAttrs(target);
  return key && color && piece && color !== "none" && piece !== "-" ? key + " " + pieceStr(charToRole(piece), color) + (target.classList.contains("selected") ? " selected" : "") : key ? key : "";
}
function boardCommandsHandler() {
  return (ev) => {
    const target = ev.target;
    const $boardLive = $(".boardstatus");
    if (ev.key === "o") {
      $boardLive.text(keyText(target));
    } else if (ev.key === "l") $boardLive.text($("p.lastMove").text());
    else if (ev.key === "t") $boardLive.text(`${$(".nvui .botc").text()} - ${$(".nvui .topc").text()}`);
  };
}
function lastCapturedCommandHandler(fensteps, pieceStyle, prefixStyle) {
  const lastCaptured = () => {
    const fens = fensteps();
    const oldFen = fens[fens.length - 2];
    const currentFen = fens[fens.length - 1];
    if (!oldFen || !currentFen) return "none";
    const oldBoardFen = oldFen.split(" ")[0];
    const currentBoardFen = currentFen.split(" ")[0];
    for (const p of "kKqQrRbBnNpP") {
      const diff = oldBoardFen.split(p).length - 1 - (currentBoardFen.split(p).length - 1);
      const pcolor = p.toUpperCase() === p ? "white" : "black";
      if (diff === 1) return renderPieceStr(p, pieceStyle, pcolor, prefixStyle);
    }
    return "none";
  };
  return () => $(".boardstatus").text(lastCaptured());
}
function possibleMovesHandler(yourColor, cg, variant, steps) {
  return (ev) => {
    var _a, _b;
    if (ev.key.toLowerCase() !== "m") return;
    const pos = keyFromAttrs(ev.target);
    if (!pos) return;
    const $boardLive = $(".boardstatus");
    const playThroughToFinalDests = () => {
      {
        const fromSetup = setupPosition(lichessRules(variant), parseFen(steps[0].fen).unwrap()).unwrap();
        steps.forEach((s) => {
          if (s.uci) {
            const move = parseUci(s.uci);
            if (move) fromSetup.play(move);
          }
        });
        fromSetup.turn = yourColor;
        return chessgroundDests(fromSetup);
      }
    };
    const rawMoves = cg.state.turnColor === yourColor ? cg.state.movable.dests : playThroughToFinalDests();
    const possibleMoves = (_b = (_a = rawMoves == null ? void 0 : rawMoves.get(pos)) == null ? void 0 : _a.map((i) => {
      const p = cg.state.pieces.get(i);
      return p && p.color !== yourColor ? `${i} captures ${p.role}` : i;
    })) == null ? void 0 : _b.filter((i) => ev.key === "m" || i.includes("captures"));
    $boardLive.text(
      !possibleMoves ? "None" : !possibleMoves.length ? "No captures" : possibleMoves.join(", ")
    );
  };
}
var promotionRegex = /^([a-h]x?)?[a-h](1|8)=[kqnbr]$/;
var uciPromotionRegex = /^([a-h][1-8])([a-h](1|8))[kqnbr]$/;
var dropRegex = /^(([qrnb])@([a-h][1-8])|p?@([a-h][2-7]))$/;
function inputToMove(input, fen, chessground) {
  var _a;
  const dests = chessground.state.movable.dests;
  if (!dests || input.length < 1) return void 0;
  const legalUcis = destsToUcis(dests), legalSans = sanWriter(fen, legalUcis), cleanedMixedCase = input[0] + input.slice(1).replace(/\+|#/g, "").toLowerCase();
  let uci = (sanToUci(cleanedMixedCase, legalSans) || cleanedMixedCase).toLowerCase(), promotion = "";
  const cleaned = cleanedMixedCase.toLowerCase();
  const drop = cleaned.match(dropRegex);
  if (drop)
    return {
      role: charToRole(cleaned[0]) || "pawn",
      key: cleaned.split("@")[1].slice(0, 2)
    };
  if (cleaned.match(promotionRegex)) {
    uci = sanToUci(cleaned.slice(0, -2), legalSans) || cleaned;
    promotion = cleaned.slice(-1);
  } else if (cleaned.match(uciPromotionRegex)) {
    uci = cleaned.slice(0, -1);
    promotion = cleaned.slice(-1);
  } else if ("18".includes(uci[3]) && ((_a = chessground.state.pieces.get(uci.slice(0, 2))) == null ? void 0 : _a.role) === "pawn")
    promotion = "q";
  return legalUcis.includes(uci) ? `${uci}${promotion}` : void 0;
}
var squareSelector = (rank, file) => `.board-wrapper button[rank="${rank}"][file="${file}"]`;

// ../lib/src/nvui/chess.ts
function makeContext(ctx, redraw) {
  return {
    notify: new Notify(redraw),
    moveStyle: styleSetting(),
    pieceStyle: pieceSetting(),
    prefixStyle: prefixSetting(),
    positionStyle: positionSetting(),
    boardStyle: boardSetting(),
    pageStyle: pageSetting(),
    ...ctx
  };
}

// ../lib/src/nvui/command.ts
var commands = memoize(() => ({
  piece: {
    help: i18n.nvui.announcePieceLocations,
    apply(c, pieces, style, pov) {
      return tryC(c, /^\/?p ([apnbrqk])$/i, (p) => renderPieceKeys(pieces, p, style, pov));
    }
  },
  scan: {
    help: i18n.nvui.announcePiecesOnRankOrFile,
    apply(c, pieces, style, pov) {
      return tryC(c, /^\/?s ([a-h1-8])$/i, (p) => renderPiecesOn(pieces, p, style, pov));
    }
  },
  board: {
    help: i18n.nvui.goToBoard,
    apply(c, _pieces, _style) {
      var _a, _b;
      const words = c.split(" ");
      const file = ((_a = words[1]) == null ? void 0 : _a.charAt(0)) || "e";
      const rank = ((_b = words[1]) == null ? void 0 : _b.charAt(1)) || "4";
      const button = !words[1] && $("button.active").get(0) || $('button[file="' + file + '"][rank="' + rank + '"]').get(0);
      if (button) {
        button.focus();
        return "";
      } else {
        return file + "." + rank + " is not a valid square";
      }
    }
  }
}));
function tryC(c, regex, f) {
  return c.match(regex) ? f(c.replace(regex, "$1")) : void 0;
}
var boardCommands = () => [
  h("h2", i18n.nvui.boardCommandList),
  h("p", [
    `i: ${i18n.nvui.goToInputForm}`,
    ...[
      `o: ${i18n.nvui.announceCurrentSquare}`,
      `c: ${i18n.nvui.announceLastMoveCapture}`,
      `l: ${i18n.nvui.announceLastMove}`,
      `t: ${i18n.keyboardMove.readOutClocks}`,
      `m: ${i18n.nvui.announcePossibleMoves}`,
      `arrow keys: ${i18n.nvui.moveWithArrows}`,
      `k-q-r-b-n-p: ${i18n.nvui.moveToPieceByType}`,
      `1 to 8: ${i18n.nvui.moveToRank}`,
      `shift+1 to 8: ${i18n.nvui.moveToFile}`,
      `shift+a/d: ${i18n.site.keyMoveBackwardOrForward}`,
      "x: announce pieces around this square (try shift and alt)",
      `shift+m: ${i18n.nvui.announcePossibleCaptures}`,
      "v: announce computer evaluation",
      "g: announce computer best move",
      "shift+g: play computer best move",
      `alt+shift+a/d: ${i18n.site.cyclePreviousOrNextVariation}`
    ].reduce(addBreaks, [])
  ])
];
var addBreaks = (acc, strOrVNode) => acc.concat([h("br"), strOrVNode]);

// ../lib/src/nvui/directionScan.ts
var directions = ["top", "topRight", "right", "bottomRight", "bottom", "bottomLeft", "left", "topLeft"];
function getKeysOnRay(originKey, direction, pov) {
  const originPos = key2pos(originKey);
  const [fileIndex, rankIndex] = originPos;
  const asWhite = pov === "white";
  const result = [];
  for (let d = 1; d < 8; d++) {
    let pos = [-1, -1];
    switch (direction) {
      case "top":
        pos = asWhite ? [fileIndex, rankIndex + d] : [fileIndex, rankIndex - d];
        break;
      case "topRight":
        pos = asWhite ? [fileIndex + d, rankIndex + d] : [fileIndex - d, rankIndex - d];
        break;
      case "right":
        pos = asWhite ? [fileIndex + d, rankIndex] : [fileIndex - d, rankIndex];
        break;
      case "bottomRight":
        pos = asWhite ? [fileIndex + d, rankIndex - d] : [fileIndex - d, rankIndex + d];
        break;
      case "bottom":
        pos = asWhite ? [fileIndex, rankIndex - d] : [fileIndex, rankIndex + d];
        break;
      case "bottomLeft":
        pos = asWhite ? [fileIndex - d, rankIndex - d] : [fileIndex + d, rankIndex + d];
        break;
      case "left":
        pos = asWhite ? [fileIndex - d, rankIndex] : [fileIndex + d, rankIndex];
        break;
      case "topLeft":
        pos = asWhite ? [fileIndex - d, rankIndex + d] : [fileIndex + d, rankIndex - d];
        break;
    }
    const key = pos2key(pos);
    if (key) result.push(key);
    else break;
  }
  return result;
}
function scanDirectionsHandler(pov, pieces, style) {
  return (ev) => {
    const target = ev.target;
    const originKey = keyFromAttrs(target);
    const currentDirection = target.getAttribute("ray");
    let nextRay = [];
    let nextDirectionIndex = 0;
    if (currentDirection === null) {
      nextDirectionIndex = ev.altKey ? 0 : 1;
    } else {
      nextDirectionIndex = directions.indexOf(currentDirection);
      if (ev.altKey && nextDirectionIndex % 2 === 0 || !ev.altKey && nextDirectionIndex % 2 === 1)
        nextDirectionIndex = (nextDirectionIndex + (ev.shiftKey ? 6 : 2)) % 8;
      else nextDirectionIndex = (nextDirectionIndex + (ev.shiftKey ? 7 : 1)) % 8;
    }
    for (let i = 0; i < 4; i++) {
      const rayKeys = getKeysOnRay(originKey, directions[nextDirectionIndex], pov);
      if (rayKeys.length === 0) {
        nextDirectionIndex = (nextDirectionIndex + (ev.shiftKey ? 6 : 2)) % 8;
      } else {
        nextRay = rayKeys;
        target.setAttribute("ray", directions[nextDirectionIndex]);
        break;
      }
    }
    const $boardLive = $(".boardstatus");
    const renderedPieces = nextRay.reduce(
      (acc, key) => pieces.get(key) ? acc.concat(
        `${renderKey(key, style)} ${transPieceStr(pieces.get(key).role, pieces.get(key).color, i18n)}`
      ) : acc,
      []
    );
    $boardLive.text(
      `${renderKey(originKey, style)}: ${directions[nextDirectionIndex]}: ${renderedPieces.length > 0 ? renderedPieces.join(" , ") : i18n.site.none}`
    );
  };
}

export {
  liveText,
  renderSan,
  renderPieces,
  renderPockets,
  pocketsStr,
  renderBoard,
  castlingFlavours,
  renderMainline,
  renderComments,
  renderSetting,
  leaveSquareHandler,
  positionJumpHandler,
  pieceJumpingHandler,
  arrowKeyHandler,
  selectionHandler,
  boardCommandsHandler,
  lastCapturedCommandHandler,
  possibleMovesHandler,
  inputToMove,
  makeContext,
  commands,
  boardCommands,
  addBreaks,
  scanDirectionsHandler
};
//# sourceMappingURL=lib.KNM37UUI.js.map
