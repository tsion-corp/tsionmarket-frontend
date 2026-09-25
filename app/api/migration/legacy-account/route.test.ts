import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({ verifyRequest: vi.fn() }));
const privy = vi.hoisted(() => ({ getByEmailAddress: vi.fn(), getByTwitterSubject: vi.fn() }));

vi.mock("@/lib/server/auth", () => ({ verifyRequest: auth.verifyRequest }));
const alchemy = vi.hoisted(() => ({ fetchPortfolio: vi.fn() }));
vi.mock("@/lib/server/alchemy", () => ({ fetchPortfolio: alchemy.fetchPortfolio }));

const directory = vi.hoisted(() => ({ lookupLegacyIdentifiers: vi.fn() }));
vi.mock("@/lib/server/legacy-directory", async (importOriginal) => ({
  // The real normalisers: only the lookup is stubbed, so the identifiers the
  // route builds are the ones it would really build.
  ...(await importOriginal<typeof import("@/lib/server/legacy-directory")>()),
  lookupLegacyIdentifiers: directory.lookupLegacyIdentifiers,
}));
const service = vi.hoisted(() => ({ state: null as string | null }));
vi.mock("@/lib/server/migration", () => ({
  migrationServiceEnabled: () => true,
  forwardMigration: async () =>
    new Response(
      JSON.stringify(
        service.state
          ? { success: true, data: { state: service.state } }
          : { success: false, error: { code: "UPSTREAM_ERROR" } }
      ),
      { status: service.state ? 200 : 502 }
    ),
}));
vi.mock("@/lib/server/privy", () => ({
  getPrivyClient: () => ({
    users: () => ({
      getByEmailAddress: privy.getByEmailAddress,
      getByTwitterSubject: privy.getByTwitterSubject,
    }),
  }),
}));

const { POST } = await import("@/app/api/migration/legacy-account/route");

const req = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest;

const walletUser = {
  linked_accounts: [{ type: "wallet", chain_type: "ethereum", address: "0xabc" }],
};

beforeEach(() => {
  auth.verifyRequest.mockReset();
  privy.getByEmailAddress.mockReset();
  privy.getByTwitterSubject.mockReset();
  auth.verifyRequest.mockResolvedValue({ provider: "decane", userId: "u1" });
  // The service could not say, so the existing cases exercise what comes after it.
  service.state = null;
  // Unknown by default, so the existing cases exercise the Privy fallback.
  directory.lookupLegacyIdentifiers.mockResolvedValue({ known: null, entry: null });
});

/*
  The offer used to wait on the directory and then a provider round trip.
  user-management holds the identity map and answers in one lookup — the
  same answer the Square's sign-in gets — so it is asked first.
*/
describe("the service is asked first", () => {
  it("offers on a legacy answer without touching the directory or the provider", async () => {
    service.state = "legacy";
    const res = await POST(req({ email: "a@b.com" }));
    expect(await res.json()).toMatchObject({ hasLegacyAccount: true, certain: true });
    expect(directory.lookupLegacyIdentifiers).not.toHaveBeenCalled();
    expect(privy.getByEmailAddress).not.toHaveBeenCalled();
  });

  it("retires the offer on a definite new", async () => {
    service.state = "new";
    const res = await POST(req({ email: "a@b.com" }));
    expect(await res.json()).toMatchObject({ hasLegacyAccount: false, certain: true });
    expect(directory.lookupLegacyIdentifiers).not.toHaveBeenCalled();
  });

  it("falls through to the directory when the service cannot say", async () => {
    service.state = "linked";
    directory.lookupLegacyIdentifiers.mockResolvedValue({ known: false, entry: null });
    const res = await POST(req({ email: "a@b.com" }));
    expect(await res.json()).toMatchObject({ hasLegacyAccount: false, certain: true });
    expect(directory.lookupLegacyIdentifiers).toHaveBeenCalled();
  });
});

describe("POST /api/migration/legacy-account", () => {
  it("refuses without a verified session, so it is not an open lookup", async () => {
    auth.verifyRequest.mockResolvedValue(null);
    const res = await POST(req({ email: "a@b.com" }));
    expect(res.status).toBe(401);
    expect(privy.getByEmailAddress).not.toHaveBeenCalled();
  });

  it("reports a legacy account that held an embedded wallet", async () => {
    privy.getByEmailAddress.mockResolvedValue(walletUser);
    const res = await POST(req({ email: "A@B.com" }));
    // No balance read is attempted in this test's mock, so it stays unknown.
    await expect(res.json()).resolves.toEqual({
      hasLegacyAccount: true,
      legacyFundsUsd: null,
      certain: true,
    });
    // Normalised, so a capitalised address is not a different user.
    expect(privy.getByEmailAddress).toHaveBeenCalledWith({ address: "a@b.com" });
  });

  it("says no for an account that never held one — offering the sweep would dead-end", async () => {
    privy.getByEmailAddress.mockResolvedValue({ linked_accounts: [{ type: "email" }] });
    await expect((await POST(req({ email: "a@b.com" }))).json()).resolves.toEqual({
      hasLegacyAccount: false,
      legacyFundsUsd: null,
      certain: true,
    });
  });

  it("says no when Privy has no such user", async () => {
    privy.getByEmailAddress.mockRejectedValue(new Error("not found"));
    await expect((await POST(req({ email: "a@b.com" }))).json()).resolves.toEqual({
      hasLegacyAccount: false,
      legacyFundsUsd: null,
      certain: false,
    });
  });

  // An outage answers the same as "no such user" on purpose: false means "no
  // reason to offer it", never "you have nothing". The caller ORs it.
  it("says no, not an error, when the lookup itself fails", async () => {
    privy.getByEmailAddress.mockRejectedValue(new Error("privy down"));
    const res = await POST(req({ email: "a@b.com" }));
    expect(res.status).toBe(200);
  });

  it("never queries Privy with rubbish", async () => {
    for (const email of [undefined, "", "not-an-email", "x".repeat(400) + "@b.com"]) {
      await POST(req({ email }));
    }
    expect(privy.getByEmailAddress).not.toHaveBeenCalled();
  });
});

describe("the balance behind the offer", () => {
  beforeEach(() => {
    alchemy.fetchPortfolio.mockReset();
    privy.getByEmailAddress.mockResolvedValue(walletUser);
  });

  it("reports what the old wallet still holds", async () => {
    alchemy.fetchPortfolio.mockResolvedValue({ totalUsd: 12.5, tokens: [] });
    await expect((await POST(req({ email: "a@b.com" }))).json()).resolves.toEqual({
      hasLegacyAccount: true,
      legacyFundsUsd: 12.5,
      certain: true,
    });
  });

  // The whole point of the balance read: `privy:` keys outlive a sweep, so a
  // migrated user would keep being told to migrate.
  it("reports a confident zero, which retires the offer", async () => {
    alchemy.fetchPortfolio.mockResolvedValue({ totalUsd: 0, tokens: [] });
    await expect((await POST(req({ email: "a@b.com" }))).json()).resolves.toEqual({
      hasLegacyAccount: true,
      legacyFundsUsd: 0,
      certain: true,
    });
  });

  // A floor is not a balance. Reporting 0 here would take the door away from
  // someone whose money is sitting right there.
  it("refuses to call a partial read zero", async () => {
    alchemy.fetchPortfolio.mockResolvedValue({
      totalUsd: 0,
      tokens: [],
      missing: ["base-mainnet"],
    });
    await expect((await POST(req({ email: "a@b.com" }))).json()).resolves.toEqual({
      hasLegacyAccount: true,
      legacyFundsUsd: null,
      certain: true,
    });
  });

  it("stays unknown when the read throws", async () => {
    alchemy.fetchPortfolio.mockRejectedValue(new Error("alchemy down"));
    await expect((await POST(req({ email: "a@b.com" }))).json()).resolves.toEqual({
      hasLegacyAccount: true,
      legacyFundsUsd: null,
      certain: true,
    });
  });
});

describe("the directory comes first", () => {
  beforeEach(() => alchemy.fetchPortfolio.mockReset());

  it("answers from the snapshot without calling Privy at all", async () => {
    directory.lookupLegacyIdentifiers.mockResolvedValue({
      known: true,
      entry: { evm: "0xabc", solana: null },
    });
    alchemy.fetchPortfolio.mockResolvedValue({ totalUsd: 3, tokens: [] });

    await expect((await POST(req({ email: "a@b.com" }))).json()).resolves.toEqual({
      hasLegacyAccount: true,
      legacyFundsUsd: 3,
      certain: true,
    });
    // The point of the snapshot: it keeps answering after Privy is gone.
    expect(privy.getByEmailAddress).not.toHaveBeenCalled();
  });

  it("trusts a definite no from the snapshot", async () => {
    directory.lookupLegacyIdentifiers.mockResolvedValue({ known: false, entry: null });

    await expect((await POST(req({ email: "a@b.com" }))).json()).resolves.toEqual({
      hasLegacyAccount: false,
      legacyFundsUsd: null,
      certain: true,
    });
    expect(privy.getByEmailAddress).not.toHaveBeenCalled();
  });

  // Unreadable is not "no": falling through is what stops a missing sheet from
  // telling every user they have nothing.
  it("falls through to Privy when the snapshot cannot be read", async () => {
    directory.lookupLegacyIdentifiers.mockResolvedValue({ known: null, entry: null });
    privy.getByEmailAddress.mockResolvedValue(walletUser);
    alchemy.fetchPortfolio.mockResolvedValue({ totalUsd: 7, tokens: [] });

    await expect((await POST(req({ email: "a@b.com" }))).json()).resolves.toEqual({
      hasLegacyAccount: true,
      legacyFundsUsd: 7,
      certain: true,
    });
    expect(privy.getByEmailAddress).toHaveBeenCalled();
  });
});

describe("a legacy user who never had an email", () => {
  // Privy allowed signing in with Twitter, and those accounts carry a handle
  // and nothing else. Asking only for an email would strand every one of them.
  beforeEach(() => {
    alchemy.fetchPortfolio.mockReset();
    // Call history accumulates across tests in this file, and these assertions
    // are about what THIS test asked for.
    directory.lookupLegacyIdentifiers.mockReset();
    directory.lookupLegacyIdentifiers.mockResolvedValue({ known: null, entry: null });
  });

  it("looks the user up by their X id", async () => {
    directory.lookupLegacyIdentifiers.mockResolvedValue({
      known: true,
      entry: { evm: "0xabc", solana: null },
    });
    alchemy.fetchPortfolio.mockResolvedValue({ totalUsd: 5, tokens: [] });

    await expect((await POST(req({ xId: "1234567890" }))).json()).resolves.toEqual({
      hasLegacyAccount: true,
      legacyFundsUsd: 5,
      certain: true,
    });
    // Namespaced, so an X id cannot collide with anything else in the file.
    expect(directory.lookupLegacyIdentifiers).toHaveBeenCalledWith(["x:1234567890"]);
  });

  it("asks Privy by twitter subject when the snapshot cannot be read", async () => {
    privy.getByTwitterSubject.mockResolvedValue(walletUser);
    alchemy.fetchPortfolio.mockResolvedValue({ totalUsd: 1, tokens: [] });

    await expect((await POST(req({ xId: "1234567890" }))).json()).resolves.toMatchObject({
      hasLegacyAccount: true,
    });
    expect(privy.getByTwitterSubject).toHaveBeenCalledWith({ subject: "1234567890" });
    expect(privy.getByEmailAddress).not.toHaveBeenCalled();
  });

  it("sends both identifiers when it knows both", async () => {
    await POST(req({ email: "a@b.com", xId: "42" }));
    expect(directory.lookupLegacyIdentifiers).toHaveBeenCalledWith(["a@b.com", "x:42"]);
  });

  // An X id is digits. Anything else is not one, and would only ever miss —
  // but it must not reach a lookup as if it were an identifier.
  it("refuses a malformed X id", async () => {
    await expect((await POST(req({ xId: "not-an-id" }))).json()).resolves.toEqual({
      hasLegacyAccount: false,
      legacyFundsUsd: null,
      certain: false,
    });
    expect(directory.lookupLegacyIdentifiers).not.toHaveBeenCalled();
  });
});
