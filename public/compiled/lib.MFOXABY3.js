import {
  isMac
} from "./lib.S3TIZ2HQ.js";

// ../lib/src/view/stepwiseScroll.ts
function stepwiseScroll(scrollAction, shouldSkip, ifSkipShouldStillPreventDefault) {
  let accumulatedDeltaPixelMode = 0;
  return (e) => {
    if (e.ctrlKey) return;
    if (shouldSkip(e)) {
      if (ifSkipShouldStillPreventDefault) e.preventDefault();
      return;
    }
    e.preventDefault();
    if (e.deltaMode === 0) {
      accumulatedDeltaPixelMode += e.deltaY;
      if (isMac() && Math.abs(accumulatedDeltaPixelMode) < 10) return;
    }
    accumulatedDeltaPixelMode = 0;
    scrollAction(e);
  };
}

export {
  stepwiseScroll
};
//# sourceMappingURL=lib.MFOXABY3.js.map
