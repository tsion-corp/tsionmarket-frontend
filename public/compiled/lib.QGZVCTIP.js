import {
  AutoQueen
} from "./lib.CHCAIC5O.js";
import {
  key2pos,
  opposite
} from "./lib.RPQH5UYI.js";
import {
  bind,
  onInsert
} from "./lib.S3TIZ2HQ.js";
import {
  h
} from "./lib.LWF5S4ZV.js";

// ../lib/src/game/promotion.ts
var PROMOTABLE_ROLES = ["queen", "knight", "rook", "bishop"];
function promote(g, key, role) {
  const piece = g.state.pieces.get(key);
  if ((piece == null ? void 0 : piece.role) === "pawn") g.setPieces(/* @__PURE__ */ new Map([[key, { color: piece.color, role, promoted: true }]]));
}
var PromotionCtrl = class {
  constructor(withGround, onCancel, redraw, autoQueenPref = AutoQueen.Never) {
    this.withGround = withGround;
    this.onCancel = onCancel;
    this.redraw = redraw;
    this.autoQueenPref = autoQueenPref;
    this.start = (orig, dest, hooks, meta, forceAutoQueen = false) => this.withGround((g) => {
      const premovePiece = g.state.pieces.get(orig);
      const piece = premovePiece || g.state.pieces.get(dest);
      if ((piece == null ? void 0 : piece.role) === "pawn" && (dest[1] === "8" && g.state.turnColor === "black" || dest[1] === "1" && g.state.turnColor === "white")) {
        if (this.prePromotionRole && (meta == null ? void 0 : meta.premove)) {
          this.doPromote({ orig, dest, hooks }, this.prePromotionRole);
          return true;
        }
        if (!(meta == null ? void 0 : meta.ctrlKey) && !this.promoting && (this.autoQueenPref === AutoQueen.Always || this.autoQueenPref === AutoQueen.OnPremove && premovePiece || forceAutoQueen)) {
          if (premovePiece) this.setPrePromotion(dest, "queen");
          else this.doPromote({ orig, dest, hooks }, "queen");
          return true;
        }
        this.promoting = { orig, dest, pre: !!premovePiece, hooks };
        this.redraw();
        return true;
      }
      return false;
    }) || false;
    this.cancel = () => {
      if (this.dismiss()) this.onCancel();
    };
    this.dismiss = () => {
      const promoting = this.promoting;
      this.promoting = void 0;
      this.cancelPrePromotion(promoting);
      if (promoting) {
        this.redraw();
      }
      return !!promoting;
    };
    this.cancelPrePromotion = (promoting = this.promoting) => {
      var _a, _b;
      (_b = promoting == null ? void 0 : (_a = promoting.hooks).show) == null ? void 0 : _b.call(_a, this, false);
      if (this.prePromotionRole) {
        this.withGround((g) => g.setAutoShapes([]));
        this.prePromotionRole = void 0;
        this.redraw();
      }
    };
    this.view = (antichess) => {
      var _a, _b;
      const promoting = this.promoting;
      if (!promoting) return void 0;
      (_b = (_a = promoting.hooks).show) == null ? void 0 : _b.call(_a, this, antichess ? [...PROMOTABLE_ROLES, "king"] : PROMOTABLE_ROLES);
      return this.withGround(
        (g) => this.renderPromotion(
          promoting.dest,
          antichess ? PROMOTABLE_ROLES.concat("king") : PROMOTABLE_ROLES,
          opposite(g.state.turnColor),
          g.state.orientation
        )
      ) || null;
    };
  }
  finish(role) {
    var _a, _b;
    const promoting = this.promoting;
    if (promoting) {
      this.promoting = void 0;
      if (promoting.pre) this.setPrePromotion(promoting.dest, role);
      else this.doPromote(promoting, role);
      (_b = (_a = promoting.hooks).show) == null ? void 0 : _b.call(_a, this, false);
      this.redraw();
    }
  }
  doPromote(promoting, role) {
    this.withGround((g) => promote(g, promoting.dest, role));
    promoting.hooks.submit(promoting.orig, promoting.dest, role);
  }
  setPrePromotion(dest, role) {
    this.prePromotionRole = role;
    this.withGround(
      (g) => g.setAutoShapes([
        {
          orig: dest,
          piece: { color: opposite(g.state.turnColor), role },
          brush: ""
        }
      ])
    );
  }
  renderPromotion(dest, pieces, color, orientation) {
    let left = (7 - key2pos(dest)[0]) * 12.5;
    if (orientation === "white") left = 87.5 - left;
    const vertical = color === orientation ? "top" : "bottom";
    return h(
      "div#promotion-choice." + vertical,
      {
        hook: onInsert((el) => {
          el.addEventListener("click", this.cancel);
          el.oncontextmenu = () => false;
        })
      },
      pieces.map((serverRole, i) => {
        const top = (color === orientation ? i : 7 - i) * 12.5;
        return h(
          "square",
          {
            attrs: { style: "top: " + top + "%;left: " + left + "%" },
            hook: bind("click", (e) => {
              e.stopPropagation();
              this.finish(serverRole);
            })
          },
          [h("piece." + serverRole + "." + color)]
        );
      })
    );
  }
};

export {
  promote,
  PromotionCtrl
};
//# sourceMappingURL=lib.QGZVCTIP.js.map
