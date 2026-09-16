import {
  bind,
  dataIcon,
  hl
} from "./lib.S3TIZ2HQ.js";
import {
  licon
} from "./lib.5I4BSVKX.js";

// ../lib/src/view/blindfold.ts
function renderBlindfoldToggle(toggle) {
  return toggle() ? hl("div#blindfoldzone", [
    hl(
      "a#blindfoldtog.text",
      {
        attrs: dataIcon(licon.CautionCircle),
        hook: bind("click", () => toggle(false))
      },
      i18n.preferences.blindfold
    )
  ]) : void 0;
}

export {
  renderBlindfoldToggle
};
//# sourceMappingURL=lib.2CE2G4BN.js.map
