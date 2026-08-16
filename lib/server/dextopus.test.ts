import { describe, expect, it } from "vitest";
import { isAllowedPath, splitPurpose } from "@/lib/server/dextopus";

describe("splitPurpose", () => {
  it("signs a plain Dextopus path with the deposit key", () => {
    expect(splitPurpose("deposit/quote")).toEqual({ purpose: "deposit", path: "deposit/quote" });
  });

  it("routes a withdraw-prefixed path to the withdrawal key, prefix stripped", () => {
    // Withdrawals are a second Dextopus integration; a request created under
    // its key can only be read back under the same key.
    expect(splitPurpose("withdraw/deposit/status")).toEqual({
      purpose: "withdrawal",
      path: "deposit/status",
    });
  });

  it("still allowlists what is left after the prefix", () => {
    expect(isAllowedPath(splitPurpose("withdraw/deposit/quote").path)).toBe(true);
    expect(isAllowedPath(splitPurpose("withdraw/admin/keys").path)).toBe(false);
    // The prefix alone does not open a door: "withdraw/" is not a Dextopus path.
    expect(isAllowedPath(splitPurpose("withdraw/").path)).toBe(false);
  });
});
