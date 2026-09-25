import { describe, expect, it } from "vitest";
import {
  inboxPageSchema,
  readResultSchema,
  subscribeResultSchema,
  userBalanceSchema,
  userManagementSchemaFor,
  vapidKeySchema,
} from "./user-management";
import { TAILS, userManagementProxyPath } from "@/lib/api/user-management-proxy-paths";

const DID = "did:privy:cm1abcdef0000000000000000";
const ENCODED_DID = encodeURIComponent(DID);

// A real response body from the service, kept whole so a field nobody reads
// yet still has to keep parsing.
const BALANCE = {
  generatedAt: "2026-09-23T15:11:29.600Z",
  staleAt: "2026-09-23T15:11:44.600Z",
  cached: false,
  chains: ["0x2105"],
  totalUsdValue: null,
  wallets: [
    {
      chain: "0x2105",
      address: "0x72f2578ade01ca5a844cb0a46dc1943bbd233aca",
      native: {
        symbol: "ETH",
        name: "Ether",
        decimals: 18,
        address: null,
        balance: "504709067444182",
        balanceFormatted: "0.000504709067444182",
        usdValue: null,
      },
      tokens: [
        {
          symbol: "USDC",
          name: "USD Coin",
          decimals: 6,
          address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
          balance: "128718",
          balanceFormatted: "0.128718",
          usdValue: null,
        },
      ],
      blockNumber: "51693471",
      slot: null,
    },
  ],
};

const NOTIFICATION = {
  id: "n-1",
  campaignId: "c-1",
  title: "Markets are open",
  body: "Trading starts in ten minutes.",
  url: "/perps",
  imageUrl: null,
  readAt: null,
  createdAt: "2026-09-21T09:00:00.000Z",
};

describe("inboxPageSchema", () => {
  it("accepts a page whose rows carry no image and have not been read", () => {
    const parsed = inboxPageSchema.parse({
      items: [NOTIFICATION],
      unreadCount: 1,
      nextCursor: null,
    });
    expect(parsed.items[0].imageUrl).toBeNull();
    expect(parsed.nextCursor).toBeNull();
  });

  it("accepts a read row, an image and a cursor", () => {
    const parsed = inboxPageSchema.parse({
      items: [
        {
          ...NOTIFICATION,
          imageUrl: "https://cdn.test/a.png",
          readAt: "2026-09-21T10:00:00.000Z",
        },
      ],
      unreadCount: 0,
      nextCursor: "2026-09-21T09:00:00.000Z",
    });
    expect(parsed.nextCursor).toBe("2026-09-21T09:00:00.000Z");
    expect(parsed.items[0].readAt).toBe("2026-09-21T10:00:00.000Z");
  });

  it("rejects a drifted page, so the badge can never be NaN", () => {
    expect(
      inboxPageSchema.safeParse({ items: [], unreadCount: "3", nextCursor: null }).success
    ).toBe(false);
    expect(inboxPageSchema.safeParse({ items: {}, unreadCount: 0, nextCursor: null }).success).toBe(
      false
    );
    expect(inboxPageSchema.safeParse({ items: [], unreadCount: 0 }).success).toBe(false);
  });

  it("rejects a row missing a field the bell renders", () => {
    for (const field of ["id", "title", "body", "url", "createdAt", "campaignId"]) {
      const row: Record<string, unknown> = { ...NOTIFICATION };
      delete row[field];
      expect(
        inboxPageSchema.safeParse({ items: [row], unreadCount: 0, nextCursor: null }).success,
        `a row without ${field} must be refused`
      ).toBe(false);
    }
  });

  it("refuses a row whose nullable fields arrive as the wrong type", () => {
    const row = { ...NOTIFICATION, imageUrl: 7 };
    expect(
      inboxPageSchema.safeParse({ items: [row], unreadCount: 0, nextCursor: null }).success
    ).toBe(false);
  });
});

describe("the small result schemas", () => {
  it("reads a mark-read count", () => {
    expect(readResultSchema.parse({ updated: 3 }).updated).toBe(3);
    expect(readResultSchema.safeParse({ updated: "3" }).success).toBe(false);
  });

  // A null key is the answer from a deployment whose VAPID keys are unset. It
  // is a valid contract, not a failure: the UI says push is off server-side.
  it("accepts a null vapid public key", () => {
    expect(vapidKeySchema.parse({ publicKey: null }).publicKey).toBeNull();
    expect(vapidKeySchema.parse({ publicKey: "BPk..." }).publicKey).toBe("BPk...");
    expect(vapidKeySchema.safeParse({}).success).toBe(false);
  });

  it("reads both sides of the subscription toggle", () => {
    expect(subscribeResultSchema.parse({ subscribed: true }).subscribed).toBe(true);
    expect(subscribeResultSchema.parse({ subscribed: false }).subscribed).toBe(false);
    expect(subscribeResultSchema.safeParse({ subscribed: "true" }).success).toBe(false);
  });
});

describe("userBalanceSchema", () => {
  it("accepts the service's real answer whole", () => {
    const parsed = userBalanceSchema.parse(BALANCE);
    expect(parsed.wallets[0].native.balance).toBe("504709067444182");
    expect(parsed.wallets[0].tokens[0].balanceFormatted).toBe("0.128718");
    expect(parsed.cached).toBe(false);
  });

  // A new account has linked no wallet yet. That is an ordinary state, not a
  // drifted contract, and turning it into a 502 would break sign-up.
  it("accepts a user with no wallets and a wallet with no tokens", () => {
    expect(userBalanceSchema.parse({ ...BALANCE, chains: [], wallets: [] }).wallets).toEqual([]);
    const bare = {
      ...BALANCE,
      wallets: [{ ...BALANCE.wallets[0], tokens: [] }],
    };
    expect(userBalanceSchema.parse(bare).wallets[0].tokens).toEqual([]);
  });

  // Every usdValue is null today, so the populated type is unknown. Whichever
  // it turns out to be must not be the thing that 502s a balance read.
  it("accepts any shape of usdValue, because nobody knows which it will be", () => {
    for (const value of [null, 1.23, "1.23", { amount: "1.23", currency: "USD" }]) {
      const wallet = {
        ...BALANCE.wallets[0],
        native: { ...BALANCE.wallets[0].native, usdValue: value },
      };
      expect(
        userBalanceSchema.safeParse({ ...BALANCE, totalUsdValue: value, wallets: [wallet] })
          .success,
        `usdValue ${JSON.stringify(value)} must parse`
      ).toBe(true);
    }
  });

  // A base-unit balance at 18 decimals is past what a float holds exactly. A
  // number here is a contract change that has to fail loudly, not round.
  it("refuses a balance that arrives as a number", () => {
    const wallet = {
      ...BALANCE.wallets[0],
      native: { ...BALANCE.wallets[0].native, balance: 504709067444182 },
    };
    expect(userBalanceSchema.safeParse({ ...BALANCE, wallets: [wallet] }).success).toBe(false);
  });

  it("refuses a blockNumber that arrives as a number", () => {
    const wallet = { ...BALANCE.wallets[0], blockNumber: 51693471 };
    expect(userBalanceSchema.safeParse({ ...BALANCE, wallets: [wallet] }).success).toBe(false);
  });

  // The native coin has no contract; a token has one. That null is what tells
  // them apart, so it may be null but never absent or the wrong type.
  it("keeps the native address nullable and the token address a string", () => {
    expect(userBalanceSchema.parse(BALANCE).wallets[0].native.address).toBeNull();
    const wallet = {
      ...BALANCE.wallets[0],
      tokens: [{ ...BALANCE.wallets[0].tokens[0], address: 7 }],
    };
    expect(userBalanceSchema.safeParse({ ...BALANCE, wallets: [wallet] }).success).toBe(false);
  });

  it("accepts a Solana slot where today's EVM wallets send null", () => {
    const wallet = { ...BALANCE.wallets[0], slot: "301553311" };
    expect(userBalanceSchema.parse({ ...BALANCE, wallets: [wallet] }).wallets[0].slot).toBe(
      "301553311"
    );
  });

  it("refuses a row missing a field the balance is made of", () => {
    for (const field of ["generatedAt", "staleAt", "cached", "chains", "wallets"]) {
      const body: Record<string, unknown> = { ...BALANCE };
      delete body[field];
      expect(
        userBalanceSchema.safeParse(body).success,
        `a balance without ${field} must be refused`
      ).toBe(false);
    }
    for (const field of ["chain", "address", "native", "tokens", "blockNumber", "slot"]) {
      const wallet: Record<string, unknown> = { ...BALANCE.wallets[0] };
      delete wallet[field];
      expect(
        userBalanceSchema.safeParse({ ...BALANCE, wallets: [wallet] }).success,
        `a wallet without ${field} must be refused`
      ).toBe(false);
    }
  });

  // An object a field was added to is not a drift. Nothing here is .strict().
  it("accepts a field the service adds later", () => {
    expect(
      userBalanceSchema.safeParse({ ...BALANCE, pricedAt: "2026-09-23T15:11:29.600Z" }).success
    ).toBe(true);
  });
});

describe("userManagementSchemaFor", () => {
  it("judges each route by its own shape", () => {
    expect(userManagementSchemaFor(`users/${ENCODED_DID}/notifications`, "GET")).toBe(
      inboxPageSchema
    );
    expect(userManagementSchemaFor(`users/${ENCODED_DID}/notifications/read`, "POST")).toBe(
      readResultSchema
    );
    expect(userManagementSchemaFor(`users/${ENCODED_DID}/push/vapid-public-key`, "GET")).toBe(
      vapidKeySchema
    );
    expect(userManagementSchemaFor(`users/${ENCODED_DID}/push/subscriptions`, "POST")).toBe(
      subscribeResultSchema
    );
    expect(userManagementSchemaFor(`users/${ENCODED_DID}/push/subscriptions`, "DELETE")).toBe(
      subscribeResultSchema
    );
    expect(userManagementSchemaFor(`users/${ENCODED_DID}/balance`, "GET")).toBe(userBalanceSchema);
  });

  // checkUpstream (lib/server/validate-upstream.ts) treats a null schema as a
  // pass, so a tail added to the allowlist without a schema relays whatever
  // the gateway says and is never judged — silently, and only in production.
  // This walks the allowlist itself so the omission fails here instead.
  it("models every route the allowlist admits, so none can relay unjudged", () => {
    for (const { tail, methods } of TAILS) {
      for (const method of methods) {
        const route = userManagementProxyPath(["users", DID, ...tail], method);
        expect(route.ok, `${method} ${tail.join("/")} must be on the allowlist`).toBe(true);
        if (!route.ok) continue;
        expect(
          userManagementSchemaFor(route.path, method),
          `${method} ${tail.join("/")} is allowlisted with no schema: it would relay unjudged`
        ).not.toBeNull();
      }
    }
  });

  // A count is always a whole number. The client parser
  // (lib/notifications/schema.ts) already insists on that, so a fractional
  // count that slipped through here would pass the boundary and then blow up
  // in the hook, which is the wrong place to find out.
  it("refuses a count that is not a whole number", () => {
    expect(
      inboxPageSchema.safeParse({ items: [], unreadCount: 1.5, nextCursor: null }).success
    ).toBe(false);
    expect(readResultSchema.safeParse({ updated: 2.5 }).success).toBe(false);
    expect(readResultSchema.safeParse({ updated: 2 }).success).toBe(true);
  });

  it("models nothing it does not know", () => {
    expect(userManagementSchemaFor("users/x/profile", "GET")).toBeNull();
    expect(userManagementSchemaFor("admin/campaigns", "GET")).toBeNull();
  });
});
