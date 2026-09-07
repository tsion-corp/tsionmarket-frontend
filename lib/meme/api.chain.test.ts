import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemeToken } from "@/lib/meme/types";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch }));

import {
  createSolanaWalletChallenge,
  fetchToken,
  fetchTokenCatalog,
  fetchTradability,
  fetchTrendingTokens,
  previewSwap,
  quoteSolanaSwap,
  registerSolanaSubmission,
  searchTokens,
  verifySolanaWallet,
} from "@/lib/meme/api";
import { BASE_CHAIN_ID, SOLANA_CHAIN_ID } from "@/lib/meme/chain";

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
    volume24hUsd: "1",
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

  it("keeps Base and Solana rows in trending and drops any other chain", async () => {
    apiFetch.mockResolvedValueOnce(
      ok({
        items: [sol(1), base(1), eth(1), ...Array.from({ length: 8 }, (_, i) => sol(10 + i))],
        meta: { page: 1, limit: 50, total: 11 },
      })
    );
    const page = await fetchTrendingTokens();
    expect(page.items).toHaveLength(10);
    expect(page.items.some((t) => t.chainId === 1)).toBe(false);
    expect(page.items.some((t) => t.chainId === SOLANA_CHAIN_ID)).toBe(true);
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

  it("keeps Solana rows in search", async () => {
    apiFetch.mockResolvedValueOnce(ok([sol(1), base(1), eth(1)]));
    const rows = await searchTokens("bonk");
    expect(rows.map((t) => t.chainId)).toEqual([SOLANA_CHAIN_ID, BASE_CHAIN_ID]);
  });

  // The contract: "Always pass chain." A Solana mint sent without it is
  // rejected as an invalid EVM address, which is what broke production.
  it("names the token's own chain on the detail routes", async () => {
    apiFetch.mockResolvedValueOnce(ok(sol(1)));
    await fetchToken(sol(1).address, SOLANA_CHAIN_ID);
    expect(lastUrl()).toMatch(/\/tokens\/So1[1]+\?chain=solana$/);

    apiFetch.mockResolvedValueOnce(ok({ buyEnabled: true, sellEnabled: true }));
    await fetchTradability(base(1).address, BASE_CHAIN_ID);
    expect(lastUrl()).toMatch(/\/tradability\?chain=base$/);
  });

  it("never lowercases a Solana address on the way out", async () => {
    apiFetch.mockResolvedValueOnce(ok(sol(1)));
    await fetchToken("SoMeMiXeDCaSe1111111111111111111111111111111", SOLANA_CHAIN_ID);
    expect(lastUrl()).toContain("SoMeMiXeDCaSe");
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
    apiFetch.mockResolvedValueOnce(ok({}));
    await previewSwap(body, SOLANA_CHAIN_ID);
    expect(lastUrl()).toMatch(/\/solana\/swaps\/preview$/);

    apiFetch.mockResolvedValueOnce(ok({}));
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
