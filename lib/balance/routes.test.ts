import { describe, expect, it } from "vitest";
import { BALANCE_ROUTES } from "@/lib/balance/routes";

const DID = "did:privy:cm1abcdefghijklmnop";

describe("BALANCE_ROUTES", () => {
  it("builds the proxy path for one user's balance", () => {
    expect(BALANCE_ROUTES.userBalance(DID)).toBe(
      "/api/user-management/users/did%3Aprivy%3Acm1abcdefghijklmnop/balance"
    );
  });

  it("never goes through the gateway directly", () => {
    expect(BALANCE_ROUTES.userBalance(DID).startsWith("/api/user-management/users/")).toBe(true);
  });

  it("keeps a hostile id inside one segment", () => {
    const path = BALANCE_ROUTES.userBalance("did:privy:a/b/../../admin/campaigns");
    expect(path).toContain("did%3Aprivy%3Aa%2Fb%2F..%2F..%2Fadmin%2Fcampaigns");
    expect(path).not.toContain("/admin/");
    // Only the separators this module wrote itself are left.
    expect(path.split("/").length).toBe(6);
  });

  it("encodes a space and a plus sign", () => {
    expect(BALANCE_ROUTES.userBalance("a b+c")).toBe(
      "/api/user-management/users/a%20b%2Bc/balance"
    );
  });
});
