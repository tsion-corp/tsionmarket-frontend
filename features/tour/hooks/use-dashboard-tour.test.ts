// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ seen: false, replay: false }));

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@/features/tour/lib/tour-storage", () => ({
  hasSeenDashboardTour: () => store.seen,
  consumeTourReplay: vi.fn(() => store.replay),
  markDashboardTourSeen: vi.fn(),
  requestTourReplay: vi.fn(),
}));

import { useDashboardTour } from "@/features/tour/hooks/use-dashboard-tour";
import { consumeTourReplay } from "@/features/tour/lib/tour-storage";

beforeEach(() => {
  store.seen = false;
  store.replay = false;
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

describe("useDashboardTour — suppression", () => {
  // The migration gate covers the screen; the tour must not fire, and a queued
  // replay must NOT be consumed, so it still runs once the gate clears.
  it("does nothing and preserves a queued replay while suppressed", () => {
    store.replay = true;
    renderHook(({ s }) => useDashboardTour({ suppressed: s }), {
      initialProps: { s: true },
    });
    expect(consumeTourReplay).not.toHaveBeenCalled();
  });

  it("proceeds past the guard once not suppressed", () => {
    const { rerender } = renderHook(({ s }) => useDashboardTour({ suppressed: s }), {
      initialProps: { s: true },
    });
    expect(consumeTourReplay).not.toHaveBeenCalled();
    rerender({ s: false }); // gate finished
    expect(consumeTourReplay).toHaveBeenCalledTimes(1);
  });

  it("runs normally for a fresh user with nothing suppressing it", () => {
    renderHook(() => useDashboardTour());
    expect(consumeTourReplay).toHaveBeenCalledTimes(1);
  });
});
