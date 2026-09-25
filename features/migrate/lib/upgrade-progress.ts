import type { MigrationProgress } from "@/features/migrate/components/move-old-money-panel";

/**
 * ONE BAR, AND WHAT TO WRITE UNDER IT.
 *
 * The upgrade modal used to draw three labelled steps. The design draws one
 * progress bar with a line beneath saying what is happening — so the panel's
 * many states have to fold into a phase, a percentage and a caption. Pure, so
 * the mapping can be pinned without mounting the panel.
 *
 *   intro     the old sign-in has not happened; the estimated time and the
 *             start button show, no bar
 *   progress  signed in and working: the bar moves, the caption says what on
 *   done      the gate's conditions are met; full bar, "Go to Market"
 */
export type UpgradePhase = "intro" | "progress" | "done";

export type UpgradeCaption =
  | "captionCopying"
  | "captionChecking"
  | "captionMoving"
  | "captionRetrying"
  | "captionReview"
  | "captionLeft"
  | "updateComplete";

export interface UpgradeView {
  phase: UpgradePhase;
  /** 0–100. Never goes backwards within a phase. */
  pct: number;
  /** The i18n key of the line under the bar; null in the intro. */
  caption: UpgradeCaption | null;
  /** For `captionMoving`. */
  step: { done: number; total: number } | null;
}

/**
 * The percentages are honest about ORDER, not about time: linking comes
 * before discovery, discovery before the sweep, the sweep before the rest.
 * The sweep is the long part and gets most of the bar.
 */
export function upgradeView(progress: MigrationProgress | null, canFinish: boolean): UpgradeView {
  if (canFinish) return { phase: "done", pct: 100, caption: "updateComplete", step: null };
  if (!progress || progress.stage === "signIn") {
    return { phase: "intro", pct: 0, caption: null, step: null };
  }
  if (!progress.linked) return { phase: "progress", pct: 6, caption: "captionCopying", step: null };
  if (!progress.discovered) {
    return { phase: "progress", pct: 14, caption: "captionChecking", step: null };
  }
  // Going round again after a miss: the bar holds where the sweep left it.
  if (progress.retrying) {
    return { phase: "progress", pct: 60, caption: "captionRetrying", step: null };
  }
  if (progress.running && progress.step) {
    const { done, total } = progress.step;
    const share = total === 0 ? 0 : Math.min(1, Math.max(0, done / total));
    return {
      phase: "progress",
      pct: 20 + Math.round(70 * share),
      caption: "captionMoving",
      step: { done, total },
    };
  }
  if (progress.stage === "finish") {
    return { phase: "progress", pct: 92, caption: "captionLeft", step: null };
  }
  return { phase: "progress", pct: 20, caption: "captionReview", step: null };
}
