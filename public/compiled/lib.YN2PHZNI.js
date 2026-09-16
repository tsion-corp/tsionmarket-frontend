import {
  promote
} from "./lib.QGZVCTIP.js";
import {
  snabDialog
} from "./lib.MYPIOGN5.js";
import {
  charToRole
} from "./lib.53PYQRAK.js";
import {
  onInsert
} from "./lib.S3TIZ2HQ.js";
import {
  h
} from "./lib.LWF5S4ZV.js";
import {
  pubsub
} from "./lib.QPQZCXK2.js";
import {
  propWithEffect
} from "./lib.GMEH5BEF.js";

// ../keyboardMove/src/keyboardChecker.ts
var KeyboardChecker = class {
  constructor() {
    this.keys = [];
    this.oks = 0;
    this.kos = 0;
    this.prev = "";
    this.press = (e) => {
      const v = e.target.value;
      if (v === this.prev) return;
      this.prev = v;
      if (e.key.length === 1) this.keys.push(e.key);
      else {
        if (v === "") this.clear();
        else if (e.key === "Enter") {
          if (v.length > 1) {
            if (v.split("").every((c) => this.keys.includes(c))) this.oks++;
            else {
              this.kos++;
              if (this.kos === 9 && this.kos > this.oks) pubsub.emit("ab.rep", "kbc");
            }
          }
        }
      }
    };
    this.clear = () => {
      this.keys = [];
    };
  }
};

// ../keyboardMove/src/exports.ts
function render(ctrl2) {
  if (!ctrl2) return h("div.keyboard-move");
  return h("div.keyboard-move", [
    h("input", {
      attrs: { spellcheck: "false", autocomplete: "off" },
      hook: onInsert(
        (input) => site.asset.loadEsm("keyboardMove", { init: { input, ctrl: ctrl2 } }).then((m) => ctrl2.registerHandler(m))
      )
    }),
    ctrl2.isFocused() ? h("em", "Enter SAN (Nc3), ICCF (2133) or UCI (b1c3) moves, type ? to learn more") : h("strong", ["Press ", h("kbd", "m"), " to focus"]),
    ctrl2.helpModalOpen() ? snabDialog({
      class: "help.keyboard-move-help",
      htmlUrl: "/help/keyboard-move",
      onClose: () => ctrl2.helpModalOpen(false),
      modal: true,
      easyClose: "clickOutside"
    }) : null
  ]);
}
function ctrl(root) {
  var _a, _b;
  const isFocused = propWithEffect(false, root.redraw);
  const helpModalOpen = propWithEffect(false, root.redraw);
  let handler;
  let lastSelect = performance.now();
  let lastFen;
  let cg;
  const select = (key) => {
    if (cg.state.selected === key) cg.cancelMove();
    else {
      cg.selectSquare(key, true);
      lastSelect = performance.now();
    }
  };
  let usedSan = false;
  return {
    drop(key, piece) {
      var _a2;
      const role = charToRole(piece);
      const crazyhousePockets = (_a2 = root.getCrazyhousePockets) == null ? void 0 : _a2.call(root);
      const color = root.data.player.color === "both" ? cg.state.movable.color : root.data.player.color;
      if (!color || color === "both") return;
      if (!root.crazyValid || !root.sendNewPiece) return;
      if (!role || !crazyhousePockets || cg.state.pieces.has(key)) return;
      if (role === "king" || !crazyhousePockets[color === "white" ? 0 : 1][role]) return;
      if (!root.crazyValid(role, key)) return;
      cg.cancelMove();
      cg.newPiece({ role, color }, key);
      root.sendNewPiece(role, key, false);
    },
    promote(orig, dest, piece) {
      const role = charToRole(piece);
      const variant = root.data.game.variant.key;
      if (!role || role === "pawn" || role === "king" && variant !== "antichess") return;
      cg.cancelMove();
      promote(cg, dest, role);
      root.pluginMove(orig, dest, role);
    },
    update(up) {
      if (up.cg) cg = up.cg;
      if (handler) handler(up.fen, cg.state.movable.dests, up.canMove);
      lastFen = up.fen;
    },
    registerHandler(h2) {
      handler = h2;
      if (lastFen) handler(lastFen, cg.state.movable.dests);
    },
    san(orig, dest) {
      usedSan = true;
      cg.cancelMove();
      select(orig);
      select(dest);
      cg.cancelMove();
    },
    select,
    hasSelected: () => cg.state.selected,
    confirmMove: () => root.submitMove ? root.submitMove(true) : null,
    usedSan,
    legalSans: null,
    arrowNavigate(arrowKey) {
      var _a2, _b2;
      if (root.handleArrowKey) {
        (_a2 = root.handleArrowKey) == null ? void 0 : _a2.call(root, arrowKey);
        return;
      }
      const arrowKeyToPlyDelta = {
        ArrowUp: -999,
        ArrowDown: 999,
        ArrowLeft: -1,
        ArrowRight: 1
      };
      (_b2 = root.userJumpPlyDelta) == null ? void 0 : _b2.call(root, arrowKeyToPlyDelta[arrowKey]);
    },
    justSelected: () => performance.now() - lastSelect < 500,
    draw: () => root.offerDraw ? root.offerDraw(true, true) : null,
    resign: (v, immediately) => root.resign ? root.resign(v, immediately) : null,
    next: () => {
      var _a2;
      return (_a2 = root.nextPuzzle) == null ? void 0 : _a2.call(root);
    },
    vote: (v) => {
      var _a2;
      return (_a2 = root.vote) == null ? void 0 : _a2.call(root, v);
    },
    helpModalOpen,
    isFocused,
    checker: root.speakClock ? new KeyboardChecker() : void 0,
    opponent: (_b = (_a = root.data.opponent) == null ? void 0 : _a.user) == null ? void 0 : _b.username,
    speakClock: root.speakClock,
    goBerserk: root.goBerserk
  };
}

export {
  render,
  ctrl
};
//# sourceMappingURL=lib.YN2PHZNI.js.map
