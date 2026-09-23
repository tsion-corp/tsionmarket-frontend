import { afterEach, describe, expect, it, vi } from "vitest";
import { guardNavigation, hasNavigationGuard, setNavigationGuard } from "@/lib/navigation-guard";

afterEach(() => {
  setNavigationGuard(null);
});

describe("guardNavigation", () => {
  it("lets navigation through when nothing is registered", () => {
    expect(guardNavigation("/portfolio")).toBe(false);
  });

  it("blocks when the guard takes over, and hands it the destination", () => {
    const guard = vi.fn(() => true);
    setNavigationGuard(guard);
    expect(guardNavigation("/portfolio")).toBe(true);
    expect(guard).toHaveBeenCalledWith("/portfolio");
  });

  it("lets navigation through when the guard declines it", () => {
    setNavigationGuard(() => false);
    expect(guardNavigation("/spot")).toBe(false);
  });

  it("stops asking once cleared", () => {
    setNavigationGuard(() => true);
    setNavigationGuard(null);
    expect(guardNavigation("/spot")).toBe(false);
    expect(hasNavigationGuard()).toBe(false);
  });

  // A screen unmounting after another has taken over must not remove the
  // newer guard and leave the app unguarded.
  it("unregistering an old guard leaves a newer one in place", () => {
    const releaseFirst = setNavigationGuard(() => true);
    setNavigationGuard(() => true);
    releaseFirst();
    expect(hasNavigationGuard()).toBe(true);
  });

  it("releasing the current guard clears it", () => {
    const release = setNavigationGuard(() => true);
    release();
    expect(hasNavigationGuard()).toBe(false);
  });

  // Navigation is how somebody leaves a page. A broken guard must never be
  // the reason they cannot.
  it("lets navigation through when the guard throws", () => {
    setNavigationGuard(() => {
      throw new Error("bad guard");
    });
    expect(guardNavigation("/spot")).toBe(false);
  });
});
