import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cashierMigrationAdapter,
  classifyCashier,
  classifyVault,
} from "@/features/casino/lib/migration-adapter";
import { fetchChessBalance, type CashierBalance } from "@/features/casino/lib/api/cashier";
import { fetchLotteryTickets, type LotteryTicket } from "@/features/casino/lib/api/lottery";
import type { DiscoverContext } from "@/lib/migration/types";

vi.mock("@/features/casino/lib/api/cashier", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/casino/lib/api/cashier")>()),
  fetchChessBalance: vi.fn(),
}));
vi.mock("@/features/casino/lib/api/lottery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/casino/lib/api/lottery")>()),
  fetchLotteryTickets: vi.fn(),
}));

function ticket(overrides: Partial<LotteryTicket>): LotteryTicket {
  return {
    id: "t1",
    drawId: "d1",
    player: "0xOld",
    receiptHash: "0xabc",
    priceUsdc: "2",
    whiteNumbers: [1, 2, 3, 4, 5],
    powerNumber: 6,
    status: "active",
    payoutUsdc: "0",
    acceptedAt: "2026-01-01T00:00:00Z",
    settledAt: null,
    ...overrides,
  };
}

describe("classifyCashier", () => {
  it("withdraws the available balance and hands every lock to the backend", () => {
    const balance: CashierBalance = {
      player: "0xOld",
      availableUsdc: "12.5",
      lockedUsdc: "7",
      lockedMatchUsdc: "5",
      lockedSwissUsdc: "0",
      lockedBetUsdc: "0",
      pendingWithdrawalUsdc: "2",
      lockedOtherUsdc: "0",
      totalUsdc: "19.5",
    };
    const holdings = classifyCashier(balance, []);

    expect(holdings.map((h) => [h.id, h.amount, h.settleability])).toEqual([
      ["cashier:available:balance", 12_500_000n, { state: "now" }],
      [
        "cashier:locked:lockedMatchUsdc",
        5_000_000n,
        { state: "needsBackend", reason: "lockedBucket" },
      ],
      [
        "cashier:locked:pendingWithdrawalUsdc",
        2_000_000n,
        { state: "needsBackend", reason: "pendingWithdrawal" },
      ],
    ]);
  });

  it("lists active and won tickets, ignores lost and refunded ones", () => {
    const holdings = classifyCashier(null, [
      ticket({ id: "a", status: "active" }),
      ticket({ id: "w", status: "won", payoutUsdc: "50" }),
      ticket({ id: "l", status: "lost" }),
      ticket({ id: "r", status: "refunded" }),
    ]);
    expect(holdings.map((h) => [h.id, h.amount])).toEqual([
      ["cashier:ticket:a", 2_000_000n],
      ["cashier:ticket:w", 50_000_000n],
    ]);
    expect(holdings.every((h) => h.settleability.state === "needsBackend")).toBe(true);
  });

  it("is empty with a zero balance and no tickets", () => {
    const balance: CashierBalance = {
      player: "0xOld",
      availableUsdc: "0",
      lockedUsdc: "0",
      totalUsdc: "0",
    };
    expect(classifyCashier(balance, [])).toEqual([]);
  });
});

describe("cashierMigrationAdapter.discover", () => {
  afterEach(() => vi.restoreAllMocks());

  const ctx = {
    legacy: { evm: "0xOld", solana: null },
    current: { evm: "0xNew", solana: null },
    hasLegacySession: true,
    signer: null,
    ethPriceUsd: 0,
  } as unknown as DiscoverContext;

  const balance: CashierBalance = {
    player: "0xOld",
    availableUsdc: "12.5",
    lockedUsdc: "0",
    totalUsdc: "12.5",
  };

  it("keeps the withdrawable balance when the lottery read fails", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(fetchChessBalance).mockResolvedValue(balance);
    vi.mocked(fetchLotteryTickets).mockRejectedValue(new Error("Chess is unreachable."));

    const holdings = await cashierMigrationAdapter.discover(ctx);

    expect(holdings.map((h) => h.id)).toEqual(["cashier:available:balance"]);
    expect(holdings[0].amount).toBe(12_500_000n);
    expect(logged).toHaveBeenCalled();
  });

  it("fails the venue when the balance itself cannot be read", async () => {
    vi.mocked(fetchChessBalance).mockRejectedValue(new Error("Chess is unreachable."));
    vi.mocked(fetchLotteryTickets).mockResolvedValue([]);

    await expect(cashierMigrationAdapter.discover(ctx)).rejects.toThrow("Chess is unreachable.");
  });
});

describe("classifyVault", () => {
  const NOW = 1_700_000_000;
  const me = "0xAbCdEf0000000000000000000000000000000001";
  const game = (overrides: Partial<Parameters<typeof classifyVault>[0]["games"][number]>) => ({
    gameId: 7,
    starter: "0x0000000000000000000000000000000000000002",
    king: me.toLowerCase(),
    // v5 games are USDC, 6 decimals: 2 USDC, not 2 ETH.
    pot: 2n * 10n ** 6n,
    decimals: 6,
    endTime: NOW - 10,
    settled: false,
    ...overrides,
  });

  it("settles an expired game the wallet won or started, and claims what is pending", () => {
    const holdings = classifyVault({
      wallet: me,
      games: [game({}), game({ gameId: 8, king: "0x03", starter: me })],
      pending: 10n ** 6n,
      nowSeconds: NOW,
    });
    // A dollar a unit: USDC is not priced through an oracle.
    expect(holdings.map((h) => [h.id, h.valueUsd])).toEqual([
      ["vault:settle:7", 2],
      ["vault:settle:8", 2],
      ["vault:claim:pending", 1],
    ]);
    expect(holdings.every((h) => h.symbol === "USDC" && h.decimals === 6)).toBe(true);
  });

  it("skips running, settled, and other people's games", () => {
    const holdings = classifyVault({
      wallet: me,
      games: [
        game({ endTime: NOW + 60 }),
        game({ gameId: 9, settled: true }),
        game({ gameId: 10, king: "0x03" }),
      ],
      pending: 0n,
      nowSeconds: NOW,
    });
    expect(holdings).toEqual([]);
  });
});
