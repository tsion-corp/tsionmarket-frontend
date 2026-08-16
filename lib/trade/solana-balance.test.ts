import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", () => api);

const { fetchConfirmedSolanaBalance, SolanaBalanceChangedError } =
  await import("@/lib/trade/solana-balance");

beforeEach(() => {
  vi.clearAllMocks();
});

function rpcResult(result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
}

describe("fetchConfirmedSolanaBalance", () => {
  it("reads native lamports at confirmed commitment", async () => {
    api.apiFetch.mockResolvedValue(rpcResult({ value: 6_749_892 }));

    await expect(fetchConfirmedSolanaBalance("owner", null)).resolves.toBe(6_749_892n);
    const body = JSON.parse(api.apiFetch.mock.calls[0][1].body as string);
    expect(body).toMatchObject({
      method: "getBalance",
      params: ["owner", { commitment: "confirmed" }],
    });
  });

  it("sums exact integer balances across SPL token accounts", async () => {
    api.apiFetch.mockResolvedValue(
      rpcResult({
        value: [
          { account: { data: { parsed: { info: { tokenAmount: { amount: "400000" } } } } } },
          { account: { data: { parsed: { info: { tokenAmount: { amount: "217425" } } } } } },
        ],
      })
    );

    await expect(fetchConfirmedSolanaBalance("owner", "mint")).resolves.toBe(617_425n);
    const body = JSON.parse(api.apiFetch.mock.calls[0][1].body as string);
    expect(body).toMatchObject({
      method: "getTokenAccountsByOwner",
      params: ["owner", { mint: "mint" }, { encoding: "jsonParsed", commitment: "confirmed" }],
    });
  });

  it("does not accept a native balance that lost integer precision", async () => {
    api.apiFetch.mockResolvedValue(rpcResult({ value: Number.MAX_SAFE_INTEGER + 1 }));
    await expect(fetchConfirmedSolanaBalance("owner", null)).rejects.toThrow(
      "invalid native balance"
    );
  });

  it("surfaces JSON-RPC failures before constructing a sale", async () => {
    api.apiFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "offline" } }),
        { status: 200 }
      )
    );
    await expect(fetchConfirmedSolanaBalance("owner", null)).rejects.toThrow(
      "Solana RPC rejected getBalance"
    );
  });
});

describe("SolanaBalanceChangedError", () => {
  it("carries the exact amount the UI should ask the user to review", () => {
    const error = new SolanaBalanceChangedError(4_249_892n, true);
    expect(error.availableAmount).toBe(4_249_892n);
    expect(error.message).toContain("updated Max amount");
  });
});
