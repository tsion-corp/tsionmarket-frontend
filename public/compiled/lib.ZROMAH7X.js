import {
  form,
  text
} from "./lib.TT4QSUKQ.js";
import {
  throttlePromiseDelay
} from "./lib.NFSQQWN5.js";

// ../lib/src/view/zen.ts
var setZen = throttlePromiseDelay(
  () => 1e3,
  (zen) => text("/pref/zen", {
    method: "post",
    body: form({ zen: zen ? 1 : 0 })
  })
);
function toggleZenMode({ unconditional } = {}) {
  const $body = $("body");
  const zen = $body.toggleClass("zen").hasClass("zen");
  window.dispatchEvent(new Event("resize"));
  if (unconditional || !$body.hasClass("zen-auto")) {
    setZen(zen);
  }
}

export {
  toggleZenMode
};
//# sourceMappingURL=lib.ZROMAH7X.js.map
