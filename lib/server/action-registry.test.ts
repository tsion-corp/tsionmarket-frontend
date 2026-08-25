import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchActionRegistry, actionFor } from "@/lib/server/action-registry";

const BASE = "base-mainnet";
const VAULT = "0x1111111111111111111111111111111111111111";
const PREDICTION = "0x2222222222222222222222222222222222222222";
const STRANGER = "0x3333333333333333333333333333333333333333";

describe("action registry", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS = VAULT;
    process.env.NEXT_PUBLIC_PREDICTION_CONTRACT_ADDRESS = PREDICTION;
    // The KASH treasury is resolved from the engine's /status; keep it out of
    // these cases by failing that fetch.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS;
    delete process.env.NEXT_PUBLIC_PREDICTION_CONTRACT_ADDRESS;
  });

  it("names a wager to the vault and winnings from it", async () => {
    const registry = await fetchActionRegistry();
    expect(actionFor(registry, BASE, VAULT, "out")).toBe("entered_game");
    // Lookup is case-insensitive: a checksummed address still matches.
    expect(actionFor(registry, BASE, VAULT.toUpperCase(), "in")).toBe("claimed_winnings");
  });

  it("names prediction buys and payouts", async () => {
    const registry = await fetchActionRegistry();
    expect(actionFor(registry, BASE, PREDICTION, "out")).toBe("prediction_buy");
    expect(actionFor(registry, BASE, PREDICTION, "in")).toBe("prediction_payout");
  });

  it("labels the retired prediction contract the same way", async () => {
    const registry = await fetchActionRegistry();
    const legacy = "0xF9A870d3C3c597Fe167a5c8DB8394dec7B2a2Aa5";
    expect(actionFor(registry, BASE, legacy, "out")).toBe("prediction_buy");
  });

  it("labels a perp margin deposit and its return", async () => {
    const registry = await fetchActionRegistry();
    const perp = "0x8a311D7048c35985aa31C131B9A13e03a5f7422d";
    expect(actionFor(registry, BASE, perp, "out")).toBe("perp_margin");
    expect(actionFor(registry, BASE, perp, "in")).toBe("perp_return");
  });

  it("returns undefined for a stranger, a null counterparty, or an absent side", async () => {
    const registry = await fetchActionRegistry();
    expect(actionFor(registry, BASE, STRANGER, "out")).toBeUndefined();
    expect(actionFor(registry, BASE, null, "out")).toBeUndefined();
    // The KASH treasury only tags the outgoing payment leg, never an arrival.
    expect(actionFor(registry, BASE, VAULT, "out")).toBe("entered_game");
  });

  it("degrades to env-only when /status is unreachable, without throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const registry = await fetchActionRegistry();
    expect(actionFor(registry, BASE, VAULT, "out")).toBe("entered_game");
  });

  it("labels the Arkade cashier both ways from its runtime deposit address", async () => {
    const cashier = "0x4444444444444444444444444444444444444444";
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      // Only the chess cashier config resolves; the KASH /status stays down.
      if (url.includes("/cashier/config")) {
        return Promise.resolve(
          new Response(JSON.stringify({ data: { depositAddress: cashier } }), { status: 200 })
        );
      }
      return Promise.resolve(new Response(null, { status: 503 }));
    });
    const registry = await fetchActionRegistry();
    expect(actionFor(registry, BASE, cashier, "out")).toBe("arkade_deposit");
    expect(actionFor(registry, BASE, cashier, "in")).toBe("arkade_withdraw");
  });
});
