import { describe, expect, it } from "vitest";
import { marketSquareHref } from "./market-square";

describe("marketSquareHref", () => {
  it("returns null when the deployment has no Market Square, so no dead link renders", () => {
    // The module reads the env at import time; with it unset in tests the
    // helper must refuse rather than build "undefined/live".
    expect(marketSquareHref()).toBeNull();
    expect(marketSquareHref("live")).toBeNull();
  });
});
