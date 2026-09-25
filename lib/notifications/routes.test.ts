import { describe, expect, it } from "vitest";
import { NOTIFICATION_ROUTES } from "@/lib/notifications/routes";

// The five notification paths are written down once, here, so a caller can
// never assemble one by hand and miss the encoding.

const DID = "did:privy:cm1abcdefghijklmnop";

describe("NOTIFICATION_ROUTES", () => {
  it("builds the four proxy paths", () => {
    expect(NOTIFICATION_ROUTES.inbox(DID)).toBe(
      "/api/user-management/users/did%3Aprivy%3Acm1abcdefghijklmnop/notifications"
    );
    expect(NOTIFICATION_ROUTES.read(DID)).toBe(
      "/api/user-management/users/did%3Aprivy%3Acm1abcdefghijklmnop/notifications/read"
    );
    expect(NOTIFICATION_ROUTES.vapidKey(DID)).toBe(
      "/api/user-management/users/did%3Aprivy%3Acm1abcdefghijklmnop/push/vapid-public-key"
    );
    expect(NOTIFICATION_ROUTES.subscriptions(DID)).toBe(
      "/api/user-management/users/did%3Aprivy%3Acm1abcdefghijklmnop/push/subscriptions"
    );
  });

  it("never goes through the gateway directly", () => {
    for (const route of Object.values(NOTIFICATION_ROUTES)) {
      expect(route(DID).startsWith("/api/user-management/users/")).toBe(true);
    }
  });

  it("keeps a hostile id inside one segment", () => {
    const hostile = "did:privy:a/b/../../admin/campaigns";
    for (const route of Object.values(NOTIFICATION_ROUTES)) {
      const path = route(hostile);
      expect(path).toContain("did%3Aprivy%3Aa%2Fb%2F..%2F..%2Fadmin%2Fcampaigns");
      expect(path).not.toContain("/admin/");
      // Only the separators this module wrote itself are left.
      expect(path.split("/").length).toBeLessThanOrEqual(7);
    }
  });

  it("encodes a space and a plus sign", () => {
    expect(NOTIFICATION_ROUTES.inbox("a b+c")).toBe(
      "/api/user-management/users/a%20b%2Bc/notifications"
    );
  });
});
