import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.stubEnv("NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS", "0xc14e74724eC79977Abe9Cc1c0dfaD9E160bAD1e0");
const { readEvm } = vi.hoisted(() => ({ readEvm: vi.fn() }));
vi.mock("@/lib/server/evm-read", () => ({ readEvm }));

import { GET } from "./route";

const req = (qs: string) => new NextRequest(`http://app.test/api/vault/status?${qs}`);
const word = (hex: string) => hex.replace(/^0x/, "").padStart(64, "0");

const KING = "0x8517000000000000000000000000000000005784";

// starter, endTime, settled, king, then seven words the route does not read.
function tuple({ endTime, settled }: { endTime: number; settled: boolean }) {
  return (
    "0x" +
    word("0") +
    word(endTime.toString(16)) +
    word(settled ? "1" : "0") +
    word(KING) +
    word("0").repeat(7)
  );
}

const block = (timestamp: number) => ({ result: { timestamp: `0x${timestamp.toString(16)}` } });

beforeEach(() => readEvm.mockReset());

describe("the vault status read", () => {
  it("calls a round live while the contract's endTime is still ahead", async () => {
    readEvm.mockResolvedValue([
      { result: tuple({ endTime: 1_700_000_060, settled: false }) },
      block(1_700_000_000),
    ]);

    const res = await GET(req("id=274"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      known: true,
      live: true,
      endTime: 1_700_000_060,
      settled: false,
      king: KING,
      chainNow: 1_700_000_000,
    });
  });

  // The window the whole route exists for: a wager on the buzzer extends
  // endTime in its own transaction, so the chain says "running" while the
  // indexer still says the round is over.
  it("believes the contract over a clock that has run out", async () => {
    readEvm.mockResolvedValue([
      { result: tuple({ endTime: 1_700_000_045, settled: false }) },
      block(1_700_000_000),
    ]);
    expect(await (await GET(req("id=274"))).json()).toMatchObject({ live: true });
  });

  it("calls a round over once its endTime has passed on chain", async () => {
    readEvm.mockResolvedValue([
      { result: tuple({ endTime: 1_700_000_000, settled: false }) },
      block(1_700_000_001),
    ]);
    expect(await (await GET(req("id=274"))).json()).toMatchObject({ live: false });
  });

  it("calls a settled round over whatever its endTime says", async () => {
    readEvm.mockResolvedValue([
      { result: tuple({ endTime: 1_700_000_900, settled: true }) },
      block(1_700_000_000),
    ]);
    expect(await (await GET(req("id=274"))).json()).toMatchObject({ live: false, settled: true });
  });

  // Unknown is not "ended": the caller falls back to the service rather than
  // naming a winner on a read that failed.
  it("answers unknown when the chain cannot be read", async () => {
    readEvm.mockImplementationOnce(async () => {
      throw new Error("boom");
    });
    expect(await (await GET(req("id=274"))).json()).toEqual({ known: false });
  });

  it("answers unknown for a game that was never started", async () => {
    readEvm.mockResolvedValue([
      { result: tuple({ endTime: 0, settled: false }) },
      block(1_700_000_000),
    ]);
    expect(await (await GET(req("id=999999"))).json()).toEqual({ known: false });
  });

  it("answers unknown without a block to judge the time against", async () => {
    readEvm.mockResolvedValue([{ result: tuple({ endTime: 1_700_000_060, settled: false }) }, {}]);
    expect(await (await GET(req("id=274"))).json()).toEqual({ known: false });
  });

  it("refuses an id that is not a number", async () => {
    expect((await GET(req("id=12'or'1"))).status).toBe(400);
    expect(readEvm).not.toHaveBeenCalled();
  });

  it("asks the contract and the latest block in one batch", async () => {
    readEvm.mockResolvedValue([
      { result: tuple({ endTime: 1_700_000_060, settled: false }) },
      block(1_700_000_000),
    ]);
    await GET(req("id=274"));
    const calls = readEvm.mock.calls[0][2] as { method: string }[];
    expect(calls.map((c) => c.method)).toEqual(["eth_call", "eth_getBlockByNumber"]);
  });
});
