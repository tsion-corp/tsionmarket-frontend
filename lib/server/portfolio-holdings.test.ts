import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeFunctionData, encodeAbiParameters, erc20Abi, multicall3Abi } from "viem";
import { EVM_NETWORKS } from "@/lib/server/alchemy";

const WALLET = "0x1111111111111111111111111111111111111111";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const CBBTC = "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bodyOf(call: unknown): { id: number; method: string; params: unknown[] }[] {
  const [, init] = call as [unknown, RequestInit];
  const parsed = JSON.parse(init.body as string);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function aggregate3Result(balances: (bigint | null)[]): `0x${string}` {
  return encodeAbiParameters(
    [{ type: "tuple[]", components: [{ type: "bool" }, { type: "bytes" }] }],
    [
      balances.map((b) =>
        b === null
          ? ([false, "0x"] as const)
          : ([true, encodeAbiParameters([{ type: "uint256" }], [b])] as const)
      ),
    ]
  );
}

// One batch per network: the native balance and one Multicall3 call that
// names every allowed contract. Nothing vendor-specific, no pagination.
function answerBatch(native: bigint, balances: (bigint | null)[]): Response {
  return json(200, [
    { jsonrpc: "2.0", id: 1, result: `0x${native.toString(16)}` },
    { jsonrpc: "2.0", id: 2, result: aggregate3Result(balances) },
  ]);
}

describe("readHoldings", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("ZERODEV_PROJECT_ID", "test-project-id-123");
    vi.stubEnv("ALCHEMY_API_KEY", "alchemy-key");
    vi.stubGlobal("fetch", vi.fn());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T12:00:00Z"));
  });
  afterEach(async () => {
    const { resetResponseCache } = await import("./response-cache");
    const { resetHoldingsState } = await import("./portfolio-holdings");
    resetResponseCache();
    resetHoldingsState();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("asks one batch per network: native balance plus a Multicall3 balanceOf for every allowed contract", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(answerBatch(10n ** 18n, [5_000_000n, 0n]));
    const { readHoldings, MULTICALL3 } = await import("./portfolio-holdings");

    const rows = await readHoldings(WALLET, "base-mainnet", [USDC, CBBTC]);

    expect(fetch).toHaveBeenCalledTimes(1);
    const batch = bodyOf(vi.mocked(fetch).mock.calls[0]);
    expect(batch.map((c) => c.method)).toEqual(["eth_getBalance", "eth_call"]);
    expect(batch[0].params[0]).toBe(WALLET);
    const call = batch[1].params[0] as { to: string; data: `0x${string}` };
    expect(call.to.toLowerCase()).toBe(MULTICALL3.toLowerCase());
    const decoded = decodeFunctionData({ abi: multicall3Abi, data: call.data });
    expect(decoded.functionName).toBe("aggregate3");
    const targets = (
      decoded.args[0] as unknown as { target: string; callData: `0x${string}` }[]
    ).map((c) => ({
      target: c.target.toLowerCase(),
      call: decodeFunctionData({ abi: erc20Abi, data: c.callData }),
    }));
    expect(targets.map((t) => t.target)).toEqual([USDC, CBBTC]);
    expect(targets[0].call.functionName).toBe("balanceOf");
    expect(targets[0].call.args?.[0]).toBe(WALLET);

    // Native row always; token rows only where the balance is above zero.
    expect(rows).toEqual([
      {
        network: "base-mainnet",
        tokenAddress: null,
        tokenBalance: `0x${(10n ** 18n).toString(16)}`,
      },
      { network: "base-mainnet", tokenAddress: USDC, tokenBalance: "0x4c4b40" },
    ]);
  });

  it("skips a contract whose balanceOf reverted instead of failing the network", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(answerBatch(0n, [null, 7n]));
    const { readHoldings } = await import("./portfolio-holdings");
    const rows = await readHoldings(WALLET, "base-mainnet", [USDC, CBBTC]);
    expect(rows.filter((r) => r.tokenAddress)).toEqual([
      { network: "base-mainnet", tokenAddress: CBBTC, tokenBalance: "0x7" },
    ]);
  });

  it("sends only the native read when a network has no allowed contracts", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json(200, [{ jsonrpc: "2.0", id: 1, result: "0x0" }]));
    const { readHoldings } = await import("./portfolio-holdings");
    await readHoldings(WALLET, "zora-mainnet", []);
    expect(bodyOf(vi.mocked(fetch).mock.calls[0]).map((c) => c.method)).toEqual(["eth_getBalance"]);
  });

  it("re-reads a hot network after its short cache and a cold one only after ten minutes", async () => {
    vi.mocked(fetch).mockImplementation(async () => answerBatch(0n, [0n]));
    const { readHoldings, HOT_TTL_MS, COLD_TTL_MS } = await import("./portfolio-holdings");

    await readHoldings(WALLET, "base-mainnet", [USDC]);
    await readHoldings(WALLET, "linea-mainnet", [USDC]);
    expect(fetch).toHaveBeenCalledTimes(2);

    vi.setSystemTime(Date.now() + HOT_TTL_MS + 1);
    await readHoldings(WALLET, "base-mainnet", [USDC]);
    await readHoldings(WALLET, "linea-mainnet", [USDC]);
    expect(fetch).toHaveBeenCalledTimes(3); // only Base

    vi.setSystemTime(Date.now() + COLD_TTL_MS);
    await readHoldings(WALLET, "linea-mainnet", [USDC]);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("reads a cold network as hot once the wallet was seen holding something there", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(answerBatch(0n, [12n]))
      .mockImplementation(async () => answerBatch(0n, [12n]));
    const { readHoldings, HOT_TTL_MS } = await import("./portfolio-holdings");

    await readHoldings(WALLET, "linea-mainnet", [USDC]);
    // The first snapshot was written under the cold TTL; `fresh` after the
    // buy is what makes it visible at once. From then on the network is hot.
    await readHoldings(WALLET, "linea-mainnet", [USDC], true);
    vi.setSystemTime(Date.now() + HOT_TTL_MS + 1);
    await readHoldings(WALLET, "linea-mainnet", [USDC]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("bypasses the cache when the caller just changed state", async () => {
    vi.mocked(fetch).mockImplementation(async () => answerBatch(0n, [0n]));
    const { readHoldings } = await import("./portfolio-holdings");
    await readHoldings(WALLET, "base-mainnet", [USDC]);
    await readHoldings(WALLET, "base-mainnet", [USDC], true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("refresh deadline", () => {
  // A cold load measured 18.6 s on the dev server because one slow network
  // was allowed the full 15 s; the deadline is per network, so it bounds the
  // whole refresh. Ten seconds still clears the slowest healthy answer seen
  // (3.2 s) three times over.
  it("is ten seconds", async () => {
    const { REFRESH_DEADLINE_MS } = await import("./portfolio-holdings");
    expect(REFRESH_DEADLINE_MS).toBe(10_000);
  });
});

describe("network chain ids", () => {
  it("covers every network the portfolio reads", async () => {
    const { NETWORK_CHAIN_ID } = await import("./portfolio-holdings");
    for (const network of EVM_NETWORKS) {
      expect(NETWORK_CHAIN_ID[network], network).toBeTypeOf("number");
    }
  });
});

describe("readEvmPortfolioTokens", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("ZERODEV_PROJECT_ID", "test-project-id-123");
    vi.stubEnv("ALCHEMY_API_KEY", "alchemy-key");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T12:00:00Z"));
  });
  afterEach(async () => {
    const { resetResponseCache } = await import("./response-cache");
    const { resetHoldingsState } = await import("./portfolio-holdings");
    resetResponseCache();
    resetHoldingsState();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("attaches on-chain metadata and a by-address price to each held token", async () => {
    const metadataResult = encodeAbiParameters(
      [{ type: "tuple[]", components: [{ type: "bool" }, { type: "bytes" }] }],
      [
        [
          [true, encodeAbiParameters([{ type: "uint8" }], [8])],
          [true, encodeAbiParameters([{ type: "string" }], ["cbBTC"])],
          [true, encodeAbiParameters([{ type: "string" }], ["Coinbase Wrapped BTC"])],
        ],
      ]
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : ((input as URL).href ?? (input as Request).url);
        const body = init?.body ? JSON.parse(init.body as string) : null;
        if (url.includes("rpc.zerodev.app")) {
          const calls = Array.isArray(body) ? body : [body];
          if (calls[0].method === "eth_getBalance") return answerBatch(0n, [123n]);
          // metadata multicall
          return json(200, [{ jsonrpc: "2.0", id: calls[0].id, result: metadataResult }]);
        }
        if (url.includes("/prices/v1/") && url.endsWith("/tokens/by-address")) {
          return json(200, {
            data: [
              {
                network: "base-mainnet",
                address: CBBTC,
                prices: [{ currency: "usd", value: "65000" }],
              },
            ],
          });
        }
        if (url.includes("g.alchemy.com/v2/")) {
          // logo lookup, best effort
          return json(200, { jsonrpc: "2.0", id: 1, result: { logo: "https://logo/cbbtc.png" } });
        }
        throw new Error(`unexpected fetch ${url}`);
      })
    );
    const { readEvmPortfolioTokens } = await import("./portfolio-holdings");

    const { tokens } = await readEvmPortfolioTokens(WALLET, ["base-mainnet"], () => [CBBTC], null);

    const held = tokens.find((t) => t.tokenAddress === CBBTC);
    expect(held?.tokenBalance).toBe("0x7b");
    expect(held?.tokenMetadata).toMatchObject({
      decimals: 8,
      symbol: "cbBTC",
      name: "Coinbase Wrapped BTC",
    });
    expect(held?.tokenPrices).toEqual([{ currency: "usd", value: "65000" }]);
    expect(tokens.find((t) => t.tokenAddress === null)?.network).toBe("base-mainnet");
  });

  // Audit: metadata and logos for the tokens not yet seen on a network are
  // one multicall and one Alchemy batch, not one of each per token.
  it("reads metadata for all new tokens on a network in one multicall and one logo batch", async () => {
    const OTHER = "0xdddd000000000000000000000000000000000004";
    const twoTokensMeta = encodeAbiParameters(
      [{ type: "tuple[]", components: [{ type: "bool" }, { type: "bytes" }] }],
      [
        [
          [true, encodeAbiParameters([{ type: "uint8" }], [8])],
          [true, encodeAbiParameters([{ type: "string" }], ["cbBTC"])],
          [true, encodeAbiParameters([{ type: "string" }], ["Coinbase Wrapped BTC"])],
          [true, encodeAbiParameters([{ type: "uint8" }], [6])],
          [true, encodeAbiParameters([{ type: "string" }], ["OTH"])],
          [true, encodeAbiParameters([{ type: "string" }], ["Other"])],
        ],
      ]
    );
    const calls: { url: string; methods: string[] }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : ((input as URL).href ?? (input as Request).url);
        const body = init?.body ? JSON.parse(init.body as string) : null;
        const batch = Array.isArray(body) ? body : body ? [body] : [];
        calls.push({ url, methods: batch.map((c: { method?: string }) => c.method ?? "rest") });
        if (url.includes("rpc.zerodev.app")) {
          if (batch[0].method === "eth_getBalance") return answerBatch(0n, [1n, 2n]);
          return json(200, [{ jsonrpc: "2.0", id: batch[0].id, result: twoTokensMeta }]);
        }
        if (url.endsWith("/tokens/by-address")) return json(200, { data: [] });
        return json(
          200,
          batch.map((c: { id: number }) => ({ jsonrpc: "2.0", id: c.id, result: { logo: null } }))
        );
      })
    );
    const { readEvmPortfolioTokens } = await import("./portfolio-holdings");

    await readEvmPortfolioTokens(WALLET, ["base-mainnet"], () => [CBBTC, OTHER], null);

    const metaCalls = calls.filter(
      (c) => c.url.includes("rpc.zerodev.app") && c.methods[0] === "eth_call"
    );
    expect(metaCalls).toHaveLength(1);
    const logoCalls = calls.filter((c) => c.methods.every((m) => m === "alchemy_getTokenMetadata"));
    expect(logoCalls).toHaveLength(1);
    expect(logoCalls[0].methods).toHaveLength(2);
  });

  // Audit: a refresh has to end. One network that never answers must not
  // hold the whole portfolio past the deadline; it is logged and skipped.
  it("returns what answered when a network runs past the refresh deadline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === "string" ? input : ((input as URL).href ?? (input as Request).url);
        if (url.includes("/chain/8453")) return answerBatch(5n, []);
        if (url.includes("/chain/59144")) return new Promise<Response>(() => {}); // never
        if (url.endsWith("/tokens/by-address")) return json(200, { data: [] });
        return json(200, {});
      })
    );
    const { readEvmPortfolioTokens, REFRESH_DEADLINE_MS } = await import("./portfolio-holdings");
    const pending = readEvmPortfolioTokens(
      WALLET,
      ["base-mainnet", "linea-mainnet"],
      () => [],
      null
    );
    await vi.advanceTimersByTimeAsync(REFRESH_DEADLINE_MS + 10);
    const { tokens, missing } = await pending;
    expect(tokens.map((t) => t.network)).toEqual(["base-mainnet"]);
    // The caller is told which network is absent, not left to guess.
    expect(missing).toEqual(["linea-mainnet"]);
  });
});

describe("holdings cache", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("ZERODEV_PROJECT_ID", "test-project-id-123");
    vi.stubEnv("ALCHEMY_API_KEY", "alchemy-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answerBatch(0n, []))
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T12:00:00Z"));
  });
  afterEach(async () => {
    const { resetResponseCache } = await import("./response-cache");
    const { resetHoldingsState } = await import("./portfolio-holdings");
    resetResponseCache();
    resetHoldingsState();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // Audit: the shared response cache caps at 500 entries; 28 networks per
  // wallet overran it with 18 wallets and evicted cold snapshots inside their
  // TTL, which quietly turned the ten-minute cadence back into 75 seconds.
  it("keeps a cold snapshot for its full TTL while dozens of other wallets refresh", async () => {
    const { readHoldings, NETWORK_CHAIN_ID } = await import("./portfolio-holdings");
    const networks = Object.keys(NETWORK_CHAIN_ID);
    await readHoldings(WALLET, "linea-mainnet", []);
    const before = vi.mocked(fetch).mock.calls.length;
    for (let w = 0; w < 40; w++) {
      const other = `0x${(w + 2).toString(16).padStart(40, "0")}`;
      for (const network of networks) await readHoldings(other, network, []);
    }
    const afterOthers = vi.mocked(fetch).mock.calls.length;
    expect(afterOthers - before).toBe(40 * networks.length);
    await readHoldings(WALLET, "linea-mainnet", []);
    expect(vi.mocked(fetch).mock.calls.length).toBe(afterOthers);
  });

  it("reads an empty native answer as zero instead of dropping the network", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json(200, [{ jsonrpc: "2.0", id: 1, result: "0x" }]));
    const { readHoldings } = await import("./portfolio-holdings");
    const rows = await readHoldings(WALLET, "zora-mainnet", []);
    expect(rows).toEqual([{ network: "zora-mainnet", tokenAddress: null, tokenBalance: "0x0" }]);
  });
});
