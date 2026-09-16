export interface ReplayWheelEvent {
  ctrlKey: boolean;
  deltaMode: number;
  deltaY: number;
  preventDefault: () => void;
}

type ReplayDirection = -1 | 1;

export function replayTargetForKey(
  key: string,
  viewingPly: number,
  currentPly: number
): number | null {
  switch (key) {
    case "ArrowLeft":
    case "k":
      return Math.max(0, viewingPly - 1);
    case "ArrowRight":
    case "j":
      return Math.min(currentPly, viewingPly + 1);
    case "ArrowUp":
    case "0":
    case "Home":
      return 0;
    case "ArrowDown":
    case "$":
    case "End":
      return currentPly;
    default:
      return null;
  }
}

export function createStepwiseReplayScroll(
  onStep: (direction: ReplayDirection) => void,
  shouldSkip: (event: ReplayWheelEvent) => boolean,
  isMac: boolean
): (event: ReplayWheelEvent) => void {
  let accumulatedPixelDelta = 0;

  return (event) => {
    // Trackpad pinch-to-zoom is represented as a ctrl-wheel gesture.
    if (event.ctrlKey) return;
    if (shouldSkip(event)) return;

    event.preventDefault();
    if (event.deltaMode === 0) {
      accumulatedPixelDelta += event.deltaY;
      if (isMac && Math.abs(accumulatedPixelDelta) < 10) return;
    }

    accumulatedPixelDelta = 0;
    if (event.deltaY !== 0) onStep(event.deltaY > 0 ? 1 : -1);
  };
}
