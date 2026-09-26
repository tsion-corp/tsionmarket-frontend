import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
// The address is a public env var the browser also reads; the suite sets it so
// the route can build a call.
vi.stubEnv("NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS", "0xc14e74724eC79977Abe9Cc1c0dfaD9E160bAD1e0");
const { readEvm } = vi.hoisted(() => ({ readEvm: vi.fn() }));
vi.mock("@/lib/server/evm-read", () => ({ readEvm }));

import { GET } from "./route";

const req = (qs: string) => new NextRequest(`http://app.test/api/vault/privacy?${qs}`);

// games(uint256) returns eleven words on v5.1; isPrivate is the last.
function tuple(isPrivate: boolean) {
  return "0x" + "00".repeat(32).repeat(10) + (isPrivate ? "1".padStart(64, "0") : "0".repeat(64));
}

beforeEach(() => readEvm.mockReset());

describe("the vault privacy read", () => {
  // The keeper caches its ABI choice for the life of its process, so a keeper
  // started before the v5.1 upgrade reports every game public over the socket.
  // The contract cannot be stale, so it is asked directly.
  it("reads the flag straight off the contract", async () => {
    readEvm.mockResolvedValue([
      { id: 1, result: tuple(false) },
      { id: 2, result: tuple(true) },
    ]);

    const res = await GET(req("ids=259,261"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ private: { "259": false, "261": true } });
  });

  it("asks for one call per game, batched", async () => {
    readEvm.mockResolvedValue([{ id: 1, result: tuple(false) }]);
    await GET(req("ids=7"));
    const calls = readEvm.mock.calls[0][2] as { method: string }[];
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("eth_call");
  });

  // A refusal must never read as "public": that is the direction that exposes
  // somebody's private game. The caller keeps whatever it already had.
  it("omits a game it could not read rather than calling it public", async () => {
    readEvm.mockResolvedValue([
      { id: 1, error: { code: -32000, message: "boom" } },
      { id: 2, result: tuple(true) },
    ]);
    const body = (await (await GET(req("ids=1,2"))).json()) as { private: Record<string, boolean> };
    expect(body.private).toEqual({ "2": true });
  });

  it("answers nothing when the provider is down, rather than failing the lobby", async () => {
    readEvm.mockImplementationOnce(async () => {
      throw new Error("no provider");
    });
    const res = await GET(req("ids=1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ private: {} });
  });

  it("refuses ids that are not game numbers", async () => {
    expect((await GET(req("ids=abc"))).status).toBe(400);
    expect((await GET(req(""))).status).toBe(400);
    expect(readEvm).not.toHaveBeenCalled();
  });

  // One lobby's worth. An unbounded list would be a free way to make this
  // server hammer the RPC provider.
  it("refuses more ids than a lobby could hold", async () => {
    const many = Array.from({ length: 51 }, (_, i) => i + 1).join(",");
    expect((await GET(req(`ids=${many}`))).status).toBe(400);
    expect(readEvm).not.toHaveBeenCalled();
  });
});
