// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  consumeTourReplay,
  hasSeenDashboardTour,
  markDashboardTourSeen,
  requestTourReplay,
} from "./tour-storage";

describe("dashboard tour storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("shows the tour once: unseen at first, seen after marking", () => {
    expect(hasSeenDashboardTour()).toBe(false);
    markDashboardTourSeen();
    expect(hasSeenDashboardTour()).toBe(true);
  });

  it("hands a replay request over exactly once", () => {
    expect(consumeTourReplay()).toBe(false);
    requestTourReplay();
    expect(consumeTourReplay()).toBe(true);
    expect(consumeTourReplay()).toBe(false);
  });
});
