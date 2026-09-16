import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeFunctionResult, parseAbi } from "viem";

const readEvm = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/evm-read", () => ({ readEvm }));

import { LOBBY_WINDOW, readLobbyFromChain } from "@/lib/server/vault-chain";

const VAULT = "0xc14e74724eC79977Abe9Cc1c0dfaD9E160bAD1e0";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const multicall3Abi = parseAbi([
  "struct Result { bool success; bytes returnData; }",
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) returns (Result[] returnData)",
]);

function uint(value: bigint): `0x${string}` {
  return encodeAbiParameters([{ type: "uint256" }], [value]);
}

interface GameStatus {
  active: boolean;
  token: string;
  decimals: number;
  pot: bigint;
  timeRemaining: bigint;
  king: string;
  starter: string;
  minWager: bigint;
}

// getGameStatus(gameId) -> (active, token, decimals, pot, timeRemaining, king, starter, minWager)
function status(over: Partial<GameStatus> = {}): `0x${string}` {
  const s: GameStatus = {
    active: true,
    token: USDC,
    decimals: 6,
    pot: 20_000_000n,
    timeRemaining: 43n,
    king: "0x1111111111111111111111111111111111111111",
    starter: "0x2222222222222222222222222222222222222222",
    minWager: 100_000n,
    ...over,
  };
  return encodeAbiParameters(
    [
      { type: "bool" },
      { type: "address" },
      { type: "uint8" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "address" },
      { type: "address" },
      { type: "uint256" },
    ],
    [
      s.active,
      s.token as `0x${string}`,
      s.decimals,
      s.pot,
      s.timeRemaining,
      s.king as `0x${string}`,
      s.starter as `0x${string}`,
      s.minWager,
    ]
  );
}

function aggregate(results: { success: boolean; returnData: `0x${string}` }[]): `0x${string}` {
  return encodeFunctionResult({
    abi: multicall3Abi,
    functionName: "aggregate3",
    result: results,
  }) as `0x${string}`;
}

afterEach(() => vi.clearAllMocks());

describe("readLobbyFromChain", () => {
  // The whole point of the fallback: one round trip for the id range, one for
  // every game in it, whatever the window holds. A read per game would be a
  // cost that grows with every game ever played, which is the shape the
  // backend's own notes call out as never coming back down.
  it("asks the chain exactly twice, whatever the window holds", async () => {
    readEvm.mockResolvedValueOnce([{ id: 1, result: uint(6n) }]).mockResolvedValueOnce([
      {
        id: 1,
        result: aggregate([1, 2, 3, 4, 5].map(() => ({ success: true, returnData: status() }))),
      },
    ]);

    await readLobbyFromChain(VAULT);

    expect(readEvm).toHaveBeenCalledTimes(2);
    // Second call is a single eth_call to Multicall3, not one per game.
    const [, , calls] = readEvm.mock.calls[1];
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("eth_call");
  });

  it("reads the live games with their own asset and scale", async () => {
    readEvm
      .mockResolvedValueOnce([{ id: 1, result: uint(2n) }])
      .mockResolvedValueOnce([
        { id: 1, result: aggregate([{ success: true, returnData: status() }]) },
      ]);

    const games = await readLobbyFromChain(VAULT);

    expect(games).toEqual([
      expect.objectContaining({
        gameId: 1,
        token: USDC,
        tokenSymbol: "USDC",
        tokenDecimals: 6,
        active: true,
        settled: false,
      }),
    ]);
    // The amount is formatted at the game's own decimals, never at 18.
    expect(games[0].pot).toMatchObject({ raw: "20000000", amount: "20", decimals: 6 });
    expect(games[0].minWager).toMatchObject({ raw: "100000", amount: "0.1" });
  });

  // An ETH game can exist on v5 even though we never start one. It must read at
  // 18 decimals, not be relabelled as the asset we happen to prefer.
  it("reads a native game at eighteen decimals", async () => {
    const native = "0x0000000000000000000000000000000000000000";
    readEvm.mockResolvedValueOnce([{ id: 1, result: uint(2n) }]).mockResolvedValueOnce([
      {
        id: 1,
        result: aggregate([
          {
            success: true,
            returnData: status({ token: native, decimals: 18, pot: 200_000_000_000_000n }),
          },
        ]),
      },
    ]);

    const [game] = await readLobbyFromChain(VAULT);

    expect(game).toMatchObject({ token: native, tokenSymbol: "ETH", tokenDecimals: 18 });
    expect(game.pot).toMatchObject({ raw: "200000000000000", amount: "0.0002" });
  });

  it("drops a game the chain could not answer for rather than inventing one", async () => {
    readEvm.mockResolvedValueOnce([{ id: 1, result: uint(3n) }]).mockResolvedValueOnce([
      {
        id: 1,
        result: aggregate([
          { success: false, returnData: "0x" },
          { success: true, returnData: status() },
        ]),
      },
    ]);

    const games = await readLobbyFromChain(VAULT);

    expect(games.map((g) => g.gameId)).toEqual([2]);
  });

  it("leaves out games whose clock has run out", async () => {
    readEvm.mockResolvedValueOnce([{ id: 1, result: uint(3n) }]).mockResolvedValueOnce([
      {
        id: 1,
        result: aggregate([
          { success: true, returnData: status({ active: false, timeRemaining: 0n }) },
          { success: true, returnData: status() },
        ]),
      },
    ]);

    const games = await readLobbyFromChain(VAULT);

    expect(games.map((g) => g.gameId)).toEqual([2]);
  });

  // A fresh contract has nothing to read, and asking Multicall3 for an empty
  // list is a wasted round trip.
  it("asks nothing more when no game exists yet", async () => {
    readEvm.mockResolvedValueOnce([{ id: 1, result: uint(1n) }]);

    expect(await readLobbyFromChain(VAULT)).toEqual([]);
    expect(readEvm).toHaveBeenCalledTimes(1);
  });

  // The window bounds the cost: a contract with thousands of games must not
  // read thousands, it reads the most recent ones a lobby could show.
  it("reads at most one window of the most recent ids", async () => {
    readEvm.mockResolvedValueOnce([{ id: 1, result: uint(5_000n) }]).mockResolvedValueOnce([
      {
        id: 1,
        result: aggregate(
          Array.from({ length: LOBBY_WINDOW }, () => ({ success: true, returnData: status() }))
        ),
      },
    ]);

    const games = await readLobbyFromChain(VAULT);

    expect(games).toHaveLength(LOBBY_WINDOW);
    // The newest id in the range is nextGameId - 1.
    expect(games.at(-1)?.gameId).toBe(4_999);
    expect(games[0].gameId).toBe(4_999 - LOBBY_WINDOW + 1);
  });
});
