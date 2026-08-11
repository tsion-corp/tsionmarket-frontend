import { beforeEach, describe, expect, it } from "vitest";
import { clearInterest, loadInterest, saveInterest } from "@/lib/preferences";

describe("interest preference persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns null when nothing has been saved", () => {
    expect(loadInterest()).toBeNull();
  });

  it("round-trips a saved interest key", () => {
    saveInterest("stocks");
    expect(loadInterest()).toBe("stocks");
  });

  it("overwrites a previous choice", () => {
    saveInterest("stocks");
    saveInterest("gold");
    expect(loadInterest()).toBe("gold");
  });

  it("clears the stored choice", () => {
    saveInterest("crypto");
    clearInterest();
    expect(loadInterest()).toBeNull();
  });

  it("stores under the versioned key", () => {
    saveInterest("yield");
    expect(window.localStorage.getItem("ws.interest.v1")).toBe("yield");
  });
});
