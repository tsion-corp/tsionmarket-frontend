import { describe, expect, it } from "vitest";
import { upgradeView } from "./upgrade-progress";
import type { MigrationProgress } from "@/features/migrate/components/move-old-money-panel";

const base: MigrationProgress = {
  stage: "move",
  linked: true,
  discovered: true,
  remaining: 0,
  coreRemaining: 0,
  blocked: false,
  failures: 0,
  walletBlocked: false,
  running: false,
  step: null,
  retrying: false,
  settled: true,
};

describe("one bar for the whole upgrade", () => {
  it("shows the intro until the old sign-in has happened", () => {
    expect(upgradeView(null, false).phase).toBe("intro");
    expect(upgradeView({ ...base, stage: "signIn" }, false)).toMatchObject({
      phase: "intro",
      pct: 0,
    });
  });

  // Order, not time: link, then discovery, then the sweep, then whatever is left.
  it("moves forward through the steps and says which one is on", () => {
    const copying = upgradeView({ ...base, linked: false, discovered: false }, false);
    const checking = upgradeView({ ...base, discovered: false }, false);
    const moving = upgradeView({ ...base, running: true, step: { done: 2, total: 4 } }, false);
    const left = upgradeView({ ...base, stage: "finish", coreRemaining: 1 }, false);
    expect(copying).toMatchObject({ phase: "progress", caption: "captionCopying" });
    expect(checking).toMatchObject({ caption: "captionChecking" });
    expect(moving).toMatchObject({ caption: "captionMoving", step: { done: 2, total: 4 } });
    expect(left).toMatchObject({ caption: "captionLeft" });
    expect(copying.pct).toBeLessThan(checking.pct);
    expect(checking.pct).toBeLessThan(moving.pct);
    expect(moving.pct).toBeLessThan(left.pct);
    expect(left.pct).toBeLessThan(100);
  });

  it("gives the sweep most of the bar, and never overshoots", () => {
    const start = upgradeView({ ...base, running: true, step: { done: 0, total: 5 } }, false).pct;
    const end = upgradeView({ ...base, running: true, step: { done: 5, total: 5 } }, false).pct;
    expect(start).toBe(20);
    expect(end).toBe(90);
    expect(upgradeView({ ...base, running: true, step: { done: 9, total: 5 } }, false).pct).toBe(
      90
    );
  });

  // A miss is not shown as a list of what failed; the card goes round again.
  it("says checking again while a run is repeated, with the bar still up", () => {
    const view = upgradeView({ ...base, stage: "finish", retrying: true }, false);
    expect(view).toMatchObject({ phase: "progress", caption: "captionRetrying" });
    expect(view.pct).toBeGreaterThan(20);
    expect(view.pct).toBeLessThan(100);
  });

  it("is full only when the gate says the upgrade is done", () => {
    expect(upgradeView(base, true)).toEqual({
      phase: "done",
      pct: 100,
      caption: "updateComplete",
      step: null,
    });
    expect(upgradeView({ ...base, stage: "finish" }, false).pct).toBeLessThan(100);
  });
});
