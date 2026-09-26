import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch }));

import { readChainGameStatus } from "./chain-status";

const answer = (body: unknown, ok = true) => ({ ok, json: async () => body });
const full = {
  known: true,
  endTime: 1_700_000_060,
  settled: false,
  king: "0x8517000000000000000000000000000000005784",
  chainNow: 1_700_000_000,
  live: true,
};

beforeEach(() => apiFetch.mockReset());

describe("the contract's view of a game", () => {
  it("asks for the game it was given", async () => {
    apiFetch.mockResolvedValue(answer(full));
    await readChainGameStatus(274);
    expect(apiFetch).toHaveBeenCalledWith("/api/vault/status?id=274");
  });

  it("reads back the fields the round-end check needs", async () => {
    apiFetch.mockResolvedValue(answer(full));
    expect(await readChainGameStatus(274)).toEqual({
      endTime: 1_700_000_060,
      settled: false,
      king: "0x8517000000000000000000000000000000005784",
      chainNow: 1_700_000_000,
    });
  });

  // Null is "no answer", never "ended". Anything else would name a winner off
  // a failed read, which is the defect this whole path exists to stop.
  it.each([
    ["an unknown answer", answer({ known: false })],
    ["a failed request", answer(full, false)],
    ["a missing endTime", answer({ ...full, endTime: undefined })],
    ["an endTime that is not a number", answer({ ...full, endTime: "1700000060" })],
    ["a missing chainNow", answer({ ...full, chainNow: undefined })],
    ["a settled flag that is not a boolean", answer({ ...full, settled: "false" })],
  ])("answers null for %s", async (_label, response) => {
    apiFetch.mockResolvedValue(response);
    expect(await readChainGameStatus(274)).toBeNull();
  });
});
