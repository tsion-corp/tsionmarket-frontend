import { describe, expect, it } from "vitest";
import { checkUpstream } from "@/lib/server/validate-upstream";
import { buildSchema, quoteSchema, rwaSchemaFor } from "@/lib/api/schemas/rwa";

const where = { service: "rwa", path: "assets" };
const ok = (data: unknown) => ({ success: true, data });

// Both captured verbatim from the live registry. The first is the shape that
// broke the first draft of this schema: the gateway's spec types yieldApyBps as
// a plain integer, but 29 of the 45 assets return null.
const TBILL = {
  id: "ethereum:0xdd50C053C096CB04A3e3362E2b622529EC5f2e8a",
  chain: "ethereum",
  address: "0xdd50C053C096CB04A3e3362E2b622529EC5f2e8a",
  symbol: "TBILL",
  name: "OpenEden T-Bills",
  issuer: "OpenEden",
  category: "treasury",
  yieldApyBps: null,
  priceUsd: null,
  freelyTradable: false,
  assetGroup: "tbill",
  accessMode: "issuer",
  kycRequired: true,
  transferRestrictions: "contract-level KYC manager; accredited investors only",
  issuerUrl: "https://openeden.com",
  deprecated: false,
  meta: { note: "Tracks short-dated US T-bills." },
};

const USDY = {
  id: "ethereum:0x96F6eF951840721AdBF46Ac996b59E0235CB985C",
  chain: "ethereum",
  address: "0x96F6eF951840721AdBF46Ac996b59E0235CB985C",
  symbol: "USDY",
  name: "Ondo US Dollar Yield",
  issuer: "Ondo Finance",
  category: "treasury",
  yieldApyBps: 355,
  priceUsd: "1.13498325529049",
  freelyTradable: true,
  accessMode: "hybrid",
  kycRequired: true,
  minInvestmentUsd: "100000",
};

describe("rwa asset schema", () => {
  it("accepts a null yieldApyBps and a null priceUsd", () => {
    expect(checkUpstream(rwaSchemaFor("assets"), ok([TBILL]), where).ok).toBe(true);
  });

  it("accepts a fully populated asset", () => {
    expect(checkUpstream(rwaSchemaFor("assets"), ok([USDY]), where).ok).toBe(true);
  });

  it("keeps fields the schema does not model, such as assetGroup and meta", () => {
    // Guard against a future tightening: extra keys must never fail the check.
    expect(checkUpstream(rwaSchemaFor("assets"), ok([TBILL, USDY]), where).ok).toBe(true);
  });

  it("rejects an asset missing an identifier the table renders", () => {
    const noSymbol = Object.fromEntries(Object.entries(USDY).filter(([k]) => k !== "symbol"));
    const check = checkUpstream(rwaSchemaFor("assets"), ok([noSymbol]), where);
    expect(check.ok).toBe(false);
    expect(check.problem).toContain("symbol");
  });
});

describe("rwa trade schemas", () => {
  const quote = {
    provider: "jupiter",
    input: { chain: "solana", address: "So111", amount: "1000000" },
    output: { chain: "solana", address: "TSLAx", amount: "4200", amountMin: "4100" },
    priceImpactBps: 12,
  };

  it("accepts a quote whose price impact is unknown", () => {
    const body = ok({ best: { ...quote, priceImpactBps: null }, all: [quote], failed: [] });
    expect(checkUpstream(quoteSchema, body, { service: "rwa", path: "quote" }).ok).toBe(true);
  });

  it("accepts a quote result with no route at all", () => {
    const body = ok({ best: null, all: [], failed: [{ provider: "x", reason: "NO_ROUTE" }] });
    expect(checkUpstream(quoteSchema, body, { service: "rwa", path: "quote" }).ok).toBe(true);
  });

  it("rejects a build step whose kind the client cannot handle", () => {
    const body = ok({
      actionId: "a1",
      chain: "solana",
      expiresAt: "2026-08-10T00:00:00Z",
      steps: [{ id: "s1", kind: "sign-with-vibes", chain: "solana", description: "?" }],
    });
    const check = checkUpstream(buildSchema, body, { service: "rwa", path: "build" });
    expect(check.ok).toBe(false);
    expect(check.problem).toContain("kind");
  });

  it("accepts a well-formed build", () => {
    const body = ok({
      actionId: "a1",
      chain: "base",
      expiresAt: "2026-08-10T00:00:00Z",
      steps: [
        {
          id: "s1",
          kind: "sign-transaction",
          chain: "base",
          description: "Swap USDC for USDY",
          tx: { format: "evm", to: "0xabc", data: "0x", value: "0" },
        },
      ],
      warnings: ["UNVERIFIED"],
    });
    expect(checkUpstream(buildSchema, body, { service: "rwa", path: "build" }).ok).toBe(true);
  });
});
