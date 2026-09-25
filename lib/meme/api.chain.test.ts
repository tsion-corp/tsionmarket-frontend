import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemeToken } from "@/lib/meme/types";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch }));

import {
  createSolanaWalletChallenge,
  fetchToken,
  fetchTokenCatalog,
  fetchTokenCatalogPage,
  fetchTradability,
  fetchTrendingTokens,
  previewSwap,
  quoteSolanaSwap,
  registerSolanaSubmission,
  searchTokens,
  verifySolanaWallet,
} from "@/lib/meme/api";
import { BASE_CHAIN_ID, SOLANA_CHAIN_ID } from "@/lib/meme/chain";
import { LIVE_TRADABILITY, SWAP_PREVIEW } from "@/lib/api/schemas/trade.fixtures";

function token(chainId: number, address: string): MemeToken {
  return {
    chainId,
    address,
    name: address,
    symbol: address.slice(0, 4),
    decimals: chainId === BASE_CHAIN_ID ? 18 : 9,
    logoUrl: null,
    priceUsd: "1",
    liquidityUsd: "1000000",
    // A live pool: discovery drops rows under $100 of daily volume.
    volume24hUsd: "25000",
    priceChange24hPercent: "0",
    marketCapUsd: null,
    fdvUsd: null,
    pairAddress: null,
    dexName: null,
    riskLevel: "LOW",
    buyEnabled: true,
    sellEnabled: true,
    warnings: [],
  } as MemeToken;
}

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => ({ success: true, data }) };
}

const base = (n: number) => token(BASE_CHAIN_ID, `0x${String(n).padStart(40, "0")}`);
const sol = (n: number) => token(SOLANA_CHAIN_ID, `So1${String(n).padStart(41, "1")}`);
const eth = (n: number) => token(1, `0xe${String(n).padStart(39, "0")}`);
const SOL_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const lastUrl = () => String(apiFetch.mock.calls.at(-1)?.[0]);
const lastInit = () => apiFetch.mock.calls.at(-1)?.[1] as RequestInit;

// The trade service executes on Base and Solana, and this client now does
// too. Rows from any other chain it indexes are still dead cards and are
// dropped at the boundary; so is each chain's quote currency.
describe("meme discovery across the supported chains", () => {
  beforeEach(() => apiFetch.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it("scopes the catalog to one chain when a lane asks for it", async () => {
    apiFetch.mockResolvedValueOnce(ok({ items: [sol(1)], meta: { page: 1, limit: 20, total: 1 } }));
    await fetchTokenCatalog(1, 20, "solana");
    expect(lastUrl()).toContain("/tokens?page=1&limit=20&chain=solana");
  });

  it("asks for every chain when no lane is chosen", async () => {
    apiFetch.mockResolvedValueOnce(ok({ items: [], meta: { page: 1, limit: 20, total: 0 } }));
    await fetchTokenCatalog(1, 20);
    expect(lastUrl()).not.toContain("chain=");
  });

  // TEMPORARY: while the Solana gas sponsor is unfunded, discovery shows Base
  // only. Trending is mostly Solana, so after the gate it is thin and the
  // Base catalogue fallback fills it, as when trending is down.
  it("shows Base rows only in trending while discovery is Base-only", async () => {
    apiFetch.mockResolvedValueOnce(
      ok({
        items: [sol(1), base(1), eth(1), ...Array.from({ length: 8 }, (_, i) => sol(10 + i))],
        meta: { page: 1, limit: 50, total: 11 },
      })
    );
    apiFetch.mockResolvedValueOnce(
      ok({
        items: Array.from({ length: 9 }, (_, i) => base(10 + i)),
        meta: { page: 1, limit: 40, total: 9 },
      })
    );
    const page = await fetchTrendingTokens();
    expect(page.items.some((t) => t.chainId !== BASE_CHAIN_ID)).toBe(false);
    expect(lastUrl()).toContain("chain=base");
  });

  it("drops the quote currency on each chain", async () => {
    apiFetch.mockResolvedValueOnce(
      ok({
        items: [
          token(SOLANA_CHAIN_ID, SOL_USDC),
          token(BASE_CHAIN_ID, "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"),
          base(1),
        ],
        meta: { page: 1, limit: 21, total: 3 },
      })
    );
    const page = await fetchTokenCatalog(1, 21);
    expect(page.items.map((t) => t.address)).toEqual([base(1).address]);
  });

  it("no longer asks the catalog for one chain", async () => {
    apiFetch.mockResolvedValueOnce(ok({ items: [], meta: { page: 1, limit: 21, total: 0 } }));
    await fetchTokenCatalog(1, 21);
    expect(lastUrl()).not.toContain("chain=");
  });

  it("shows Base rows only in search while discovery is Base-only", async () => {
    apiFetch.mockResolvedValueOnce(ok([sol(1), base(1), eth(1)]));
    const rows = await searchTokens("bonk");
    expect(rows.map((t) => t.chainId)).toEqual([BASE_CHAIN_ID]);
  });

  // The contract: "Always pass chain." A Solana mint sent without it is
  // rejected as an invalid EVM address, which is what broke production.
  it("names the token's own chain on the detail routes", async () => {
    apiFetch.mockResolvedValueOnce(ok(sol(1)));
    await fetchToken(sol(1).address, SOLANA_CHAIN_ID);
    expect(lastUrl()).toMatch(/\/tokens\/So1[1]+\?chain=solana$/);

    apiFetch.mockResolvedValueOnce(ok(LIVE_TRADABILITY));
    await fetchTradability(base(1).address, BASE_CHAIN_ID);
    expect(lastUrl()).toMatch(/\/tradability\?chain=base$/);
  });

  it("never lowercases a Solana address on the way out", async () => {
    apiFetch.mockResolvedValueOnce(ok(sol(1)));
    await fetchToken("SoMeMiXeDCaSe1111111111111111111111111111111", SOLANA_CHAIN_ID);
    expect(lastUrl()).toContain("SoMeMiXeDCaSe");
  });
});

// Slice 4: the catalogue is walked a page of 500 at a time, and each page
// comes back as the service sent it, meta and all. The discovery view is
// applied over the merged pages, so switching views never refetches.
describe("the paged catalogue", () => {
  beforeEach(() => apiFetch.mockReset());
  afterEach(() => vi.unstubAllEnvs());

  it("asks for one page at the contract's maximum of 500", async () => {
    apiFetch.mockResolvedValueOnce(
      ok({ items: [base(1)], meta: { page: 2, limit: 500, total: 11_502 } })
    );
    const page = await fetchTokenCatalogPage(2);
    expect(lastUrl()).toMatch(/\/tokens\?page=2&limit=500$/);
    expect(page.meta).toEqual({ page: 2, limit: 500, total: 11_502 });
  });

  it("scopes a page to one chain when asked", async () => {
    apiFetch.mockResolvedValueOnce(ok({ items: [], meta: { page: 1, limit: 500, total: 0 } }));
    await fetchTokenCatalogPage(1, "base");
    expect(lastUrl()).toContain("/tokens?page=1&limit=500&chain=base");
  });

  it("hands back every row of the page for the view to judge, not a pre-filtered one", async () => {
    const risky = { ...base(7), riskLevel: "HIGH" } as MemeToken;
    apiFetch.mockResolvedValueOnce(
      ok({ items: [base(1), risky], meta: { page: 1, limit: 500, total: 2 } })
    );
    const page = await fetchTokenCatalogPage(1);
    expect(page.items).toHaveLength(2);
  });

  it("never asks the old per-surface catalogue for more than 500", async () => {
    apiFetch.mockResolvedValueOnce(ok({ items: [], meta: { page: 1, limit: 500, total: 0 } }));
    await fetchTokenCatalog(1, 2_000);
    expect(lastUrl()).toContain("limit=500");
  });

  it("searches in the view it is asked for", async () => {
    const risky = { ...base(7), riskLevel: "HIGH" } as MemeToken;
    apiFetch.mockResolvedValueOnce(ok([base(1), risky]));
    expect((await searchTokens("x")).map((t) => t.address)).toEqual([base(1).address]);
    apiFetch.mockResolvedValueOnce(ok([base(1), risky]));
    expect((await searchTokens("x", "all")).map((t) => t.address)).toEqual([
      base(1).address,
      risky.address,
    ]);
  });

  it("admits Solana rows to search once NEXT_PUBLIC_MEME_SOLANA_DISCOVERY is 1", async () => {
    vi.stubEnv("NEXT_PUBLIC_MEME_SOLANA_DISCOVERY", "1");
    apiFetch.mockResolvedValueOnce(ok([sol(1), base(1), eth(1)]));
    const rows = await searchTokens("bonk");
    expect(rows.map((t) => t.chainId)).toEqual([SOLANA_CHAIN_ID, BASE_CHAIN_ID]);
  });

  // The "Find the next 100X" card and the phone's trending shelf read this.
  // They stay curated whatever view a list has been switched to.
  it("keeps a high risk, thin liquidity coin, because the rail is not curated", async () => {
    const thin = {
      ...base(99),
      riskLevel: "HIGH",
      liquidityUsd: "4000",
      warnings: [{ code: "LOW_LIQUIDITY", message: "Liquidity is below $50,000." }],
    } as MemeToken;
    apiFetch.mockResolvedValueOnce(
      ok({
        items: [thin, ...Array.from({ length: 8 }, (_, i) => base(20 + i))],
        meta: { page: 1, limit: 500, total: 9 },
      })
    );
    // The rail runs the "all" view: trending rows carry no risk assessment, so
    // "curated" kept none of them and the strip fell back to arbitrary Base
    // coins on every load. Turning the risk filter off also turns off the
    // liquidity and volume floors, which is why this thin row now appears. That
    // cost was put to the maintainer with the numbers and accepted on
    // 2026-09-17. See fetchTrendingTokens in lib/meme/api.ts.
    const page = await fetchTrendingTokens();
    expect(page.items.map((t) => t.address)).toContain(thin.address);
    expect(page.items).toHaveLength(9);
  });
});

describe("Solana trade calls", () => {
  beforeEach(() => apiFetch.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it("links a Solana wallet through the solana challenge and verify routes", async () => {
    apiFetch.mockResolvedValueOnce(ok({ challengeId: "c1", message: "sign me", expiresAt: "x" }));
    await createSolanaWalletChallenge("So1111");
    expect(lastUrl()).toMatch(/\/solana\/wallets\/challenges$/);

    apiFetch.mockResolvedValueOnce(ok({ linked: true }));
    await verifySolanaWallet("c1", "5sig");
    expect(lastUrl()).toMatch(/\/solana\/wallets\/verify$/);
    expect(JSON.parse(String(lastInit().body))).toEqual({ challengeId: "c1", signature: "5sig" });
  });

  it("routes preview and quote by chain", async () => {
    const body = { side: "BUY" as const, tokenAddress: "So1", amount: "10", walletAddress: "w" };
    apiFetch.mockResolvedValueOnce(ok(SWAP_PREVIEW));
    await previewSwap(body, SOLANA_CHAIN_ID);
    expect(lastUrl()).toMatch(/\/solana\/swaps\/preview$/);

    apiFetch.mockResolvedValueOnce(ok(SWAP_PREVIEW));
    await previewSwap(body, BASE_CHAIN_ID);
    expect(lastUrl()).toMatch(/\/swaps\/preview$/);
    expect(lastUrl()).not.toContain("solana");

    apiFetch.mockResolvedValueOnce(
      ok({
        swapId: "s1",
        unsignedTransactionBase64: "AAAA",
        platformFeeTokenAddress: null,
        platformFeeAmountAtomic: "0",
        expiresAt: "x",
      })
    );
    const quote = await quoteSolanaSwap(body, "idem-1");
    expect(lastUrl()).toMatch(/\/solana\/swaps\/quote$/);
    expect((lastInit().headers as Record<string, string>)["Idempotency-Key"]).toBe("idem-1");
    expect(quote.unsignedTransactionBase64).toBe("AAAA");
  });

  // The Solana submission is a signature, not a call index + tx hash.
  it("registers a Solana submission as wallet + base58 signature", async () => {
    apiFetch.mockResolvedValueOnce(ok({ swapId: "s1", status: "SUBMITTED" }));
    await registerSolanaSubmission("s1", "So1wallet", "5sig");
    expect(lastUrl()).toMatch(/\/solana\/swaps\/s1\/submissions$/);
    expect(JSON.parse(String(lastInit().body))).toEqual({
      walletAddress: "So1wallet",
      signature: "5sig",
    });
  });
});
