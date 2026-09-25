import { describe, expect, it } from "vitest";
import { userManagementProxyPath } from "./user-management-proxy-paths";

// The proxy forwards the caller's own Privy token, so anything this list
// admits is performed AS them. The allowlist covers the notification inbox,
// browser push and the wallet balance read, and nothing else on the
// user-management service is reachable from this app.

const DID = "did:privy:cm1abcdef0000000000000000";
const ENCODED = encodeURIComponent(DID);

const ALLOWED = [
  { method: "GET" as const, tail: ["notifications"], path: `users/${ENCODED}/notifications` },
  {
    method: "POST" as const,
    tail: ["notifications", "read"],
    path: `users/${ENCODED}/notifications/read`,
  },
  {
    method: "GET" as const,
    tail: ["push", "vapid-public-key"],
    path: `users/${ENCODED}/push/vapid-public-key`,
  },
  {
    method: "POST" as const,
    tail: ["push", "subscriptions"],
    path: `users/${ENCODED}/push/subscriptions`,
  },
  {
    method: "DELETE" as const,
    tail: ["push", "subscriptions"],
    path: `users/${ENCODED}/push/subscriptions`,
  },
  { method: "GET" as const, tail: ["balance"], path: `users/${ENCODED}/balance` },
];

describe("user management proxy allowlist", () => {
  it("relays every route on the allowlist", () => {
    for (const { method, tail, path } of ALLOWED) {
      const result = userManagementProxyPath(["users", DID, ...tail], method);
      expect(result, `${method} ${tail.join("/")} must be relayed`).toEqual({ ok: true, path });
    }
  });

  it("refuses an allowed path asked for with the wrong method", () => {
    const wrong = [
      { method: "POST" as const, tail: ["notifications"] },
      { method: "DELETE" as const, tail: ["notifications"] },
      { method: "GET" as const, tail: ["notifications", "read"] },
      { method: "DELETE" as const, tail: ["notifications", "read"] },
      { method: "POST" as const, tail: ["push", "vapid-public-key"] },
      { method: "DELETE" as const, tail: ["push", "vapid-public-key"] },
      { method: "GET" as const, tail: ["push", "subscriptions"] },
      // The balance is a read. Nothing in this app writes one, and admitting a
      // write would be admitting it AS the caller.
      { method: "POST" as const, tail: ["balance"] },
      { method: "DELETE" as const, tail: ["balance"] },
    ];
    for (const { method, tail } of wrong) {
      const result = userManagementProxyPath(["users", DID, ...tail], method);
      expect(result.ok, `${method} ${tail.join("/")} must be refused`).toBe(false);
    }
  });

  // The admin broadcast surface needs x-admin-api-key, a secret this app must
  // never hold. It lives in the separate admin dashboard, and no method here
  // may reach it even by path.
  it("refuses /admin/* for every method, because that surface needs an admin key", () => {
    const adminPaths = [
      ["admin"],
      ["admin", "users"],
      ["admin", "campaigns"],
      ["admin", "campaigns", "c-1", "publish"],
    ];
    for (const segments of adminPaths) {
      for (const method of ["GET", "POST", "DELETE"] as const) {
        const result = userManagementProxyPath(segments, method);
        expect(result.ok, `${method} ${segments.join("/")} must be refused`).toBe(false);
      }
    }
  });

  it("relays a Decane user id, which is a UUID rather than a did", () => {
    const uuid = "f14caba3-5969-416f-b547-3abaa87745fe";
    expect(userManagementProxyPath(["users", uuid, "balance"], "GET")).toEqual({
      ok: true,
      path: `users/${uuid}/balance`,
    });
    expect(userManagementProxyPath(["users", uuid.toUpperCase(), "notifications"], "GET").ok).toBe(
      true
    );
    // Nearly a UUID is not one: a bare hex run, a hyphen short, or a wallet.
    for (const bad of [
      "f14caba35969416fb5473abaa87745fe",
      "f14caba3-5969-416f-b547-3abaa87745f",
      "f14caba3-5969-416f-b547-3abaa87745fe-1",
      "0xc58b29a50ccd557d33b6149b6fb8df5079fdd828",
    ]) {
      expect(userManagementProxyPath(["users", bad, "balance"], "GET").ok, bad).toBe(false);
    }
  });

  it("refuses a did that could climb out of its own segment", () => {
    const bad = [
      "..",
      "../admin",
      "did:privy:abc/../../admin/users",
      "did:privy:abc/extra",
      "did:privy:..",
      "",
      "   ",
      // Not a Privy DID at all, so it is not a user id this app ever holds.
      "privy:abc",
      "0x1234",
      // Control characters split a request line at the gateway.
      "did:privy:a\nb",
      `did:privy:a${String.fromCharCode(0)}b`,
      `did:privy:${"a".repeat(256)}`,
    ];
    for (const did of bad) {
      const result = userManagementProxyPath(["users", did, "notifications"], "GET");
      expect(result.ok, `did ${JSON.stringify(did)} must be refused`).toBe(false);
    }
  });

  it("refuses anything outside the allowlisted shapes", () => {
    const shapes = [
      ["users"],
      ["users", DID],
      ["users", DID, "profile"],
      ["users", DID, "notifications", "read", "extra"],
      ["users", DID, "push"],
      ["users", DID, "push", "subscriptions", "extra"],
      ["users", DID, "push", "vapid-private-key"],
      ["users", DID, "balance", "history"],
      ["users", DID, "balances"],
      ["health"],
      [],
    ];
    for (const segments of shapes) {
      for (const method of ["GET", "POST", "DELETE"] as const) {
        const result = userManagementProxyPath(segments, method);
        expect(result.ok, `${method} ${segments.join("/")} must be refused`).toBe(false);
      }
    }
  });

  // The did is matched and then encoded as one segment, never pasted into the
  // URL as it arrived.
  it("encodes the did as a single segment", () => {
    const result = userManagementProxyPath(["users", DID, "notifications"], "GET");
    expect(result.ok && result.path).toBe(
      `users/did%3Aprivy%3Acm1abcdef0000000000000000/notifications`
    );
  });
});
