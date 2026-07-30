import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";

// The screens are mocked at the API-client seam, not inside the components, so
// these tests exercise the real hooks, real query wiring and real render paths.
const chessApi = vi.hoisted(() => ({
  fetchOpenChallenges: vi.fn(),
  fetchLiveMatches: vi.fn(),
  fetchMatch: vi.fn(),
  acceptChallenge: vi.fn(),
  submitMove: vi.fn(),
  resignMatch: vi.fn(),
  createChallenge: vi.fn(),
  fetchMatchmakingTicket: vi.fn(),
  cancelMatchmaking: vi.fn(),
  fetchChallengeByInvite: vi.fn(),
  offerDraw: vi.fn(),
  cancelChallenge: vi.fn(),
}));
vi.mock("@/lib/casino/api/chess", () => chessApi);

const drawApi = vi.hoisted(() => ({
  fetchCurrentRound: vi.fn(),
  fetchPastResults: vi.fn(),
  fetchMyEntries: vi.fn(),
  createEntries: vi.fn(),
  claimDrawPrize: vi.fn(),
}));
vi.mock("@/lib/casino/api/draw", () => drawApi);

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/casino",
  useSearchParams: () => new URLSearchParams(),
}));

// The wallet is the platform's; these tests care about how screens react to
// its balance, not about Privy or the portfolio fetch beneath it.
const wallet = vi.hoisted(() => ({ balance: 10, balanceUsd: 20_000, unitPriceUsd: 2000 }));
vi.mock("@/hooks/use-casino-wallet", () => ({
  useCasinoWallet: () => ({
    address: "0xabc",
    connected: true,
    balance: wallet.balance,
    balanceUsd: wallet.balanceUsd,
    unitPriceUsd: wallet.unitPriceUsd,
    isLoading: false,
    canAfford: (weiIn: string | bigint) =>
      wallet.balance >= Number(BigInt(weiIn.toString())) / 1e18,
    refetch: vi.fn(),
    format: (usd: number) => `$${usd.toFixed(2)}`,
  }),
}));

vi.mock("@/lib/toast", () => ({
  toast: { loading: vi.fn(() => "t"), success: vi.fn(), error: vi.fn() },
}));

import { LobbySection } from "@/components/dashboard/casino/chess/lobby-section";
import { PlaySection } from "@/components/dashboard/casino/chess/play-section";
import { CreateSection } from "@/components/dashboard/casino/chess/create-section";
import { DrawSection } from "@/components/dashboard/casino/draw/draw-section";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const money = (usd: number, symbol = "ETH") => ({
  wei: BigInt(Math.round((usd / 2000) * 1e18)).toString(),
  tokenSymbol: symbol,
  usdValue: usd,
});

const challenge = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  creator: { id: "u1", username: "GrandmasterKay", rating: 2210, walletAddress: "0xdef" },
  timeControl: "5+3",
  stake: money(100),
  createdAt: new Date().toISOString(),
  inviteCode: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  wallet.balance = 10;
  chessApi.fetchOpenChallenges.mockResolvedValue([]);
  chessApi.fetchLiveMatches.mockResolvedValue([]);
  drawApi.fetchPastResults.mockResolvedValue([]);
  drawApi.fetchMyEntries.mockResolvedValue([]);
});

describe("chess lobby", () => {
  it("shows an empty state rather than inventing games", async () => {
    render(<LobbySection />, { wrapper });
    expect(await screen.findByText(/No games in play yet/)).toBeInTheDocument();
    expect(await screen.findByText(/No open challenges/)).toBeInTheDocument();
  });

  it("lists live challenges with the stake in the player's currency", async () => {
    chessApi.fetchOpenChallenges.mockResolvedValue([challenge()]);
    render(<LobbySection />, { wrapper });

    expect(await screen.findByText("GrandmasterKay")).toBeInTheDocument();
    expect(screen.getByText("$100.00")).toBeInTheDocument();
    expect(screen.getByText("5+3 Blitz")).toBeInTheDocument();
  });

  it("surfaces a gateway failure instead of an empty page", async () => {
    chessApi.fetchOpenChallenges.mockRejectedValue(
      Object.assign(new Error("boom"), { code: "UPSTREAM_ERROR" })
    );
    render(<LobbySection />, { wrapper });
    expect(await screen.findByText(/Couldn't load the chess lobby/)).toBeInTheDocument();
  });

  it("blocks joining a stake the balance can't cover", async () => {
    wallet.balance = 0.001;
    chessApi.fetchOpenChallenges.mockResolvedValue([challenge()]);
    render(<LobbySection />, { wrapper });

    const join = await screen.findByRole("button", { name: "Join" });
    expect(join).toBeDisabled();
    fireEvent.click(join);
    expect(chessApi.acceptChallenge).not.toHaveBeenCalled();
  });

  it("escrows the stake and opens the match when joining succeeds", async () => {
    chessApi.fetchOpenChallenges.mockResolvedValue([challenge()]);
    chessApi.acceptChallenge.mockResolvedValue({ id: "m9" });
    render(<LobbySection />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Join" }));
    await waitFor(() => expect(chessApi.acceptChallenge).toHaveBeenCalledWith("c1"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/casino/chess/play?match=m9"));
  });
});

describe("create staked game", () => {
  it("derives the fee and winnings from the typed stake", () => {
    render(<CreateSection />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "100" } });

    // $100 stake: $200 pot, 5% fee $10, winner takes $190.
    expect(screen.getByText("−$10.00")).toBeInTheDocument();
    expect(screen.getByText("$190.00")).toBeInTheDocument();
  });

  it("refuses to create a game the balance can't cover", () => {
    wallet.balance = 0.001;
    render(<CreateSection />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "100" } });

    const cta = screen.getByRole("button", { name: "Not enough balance" });
    expect(cta).toBeDisabled();
    fireEvent.click(cta);
    expect(chessApi.createChallenge).not.toHaveBeenCalled();
  });

  it("sends the exact wei amount, not a rounded dollar figure", async () => {
    chessApi.createChallenge.mockResolvedValue({
      challenge: challenge({ inviteCode: "kx82mQ" }),
      ticket: null,
    });
    render(<CreateSection />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: /Lock stake & get invite link/ }));

    await waitFor(() => expect(chessApi.createChallenge).toHaveBeenCalled());
    const sent = chessApi.createChallenge.mock.calls[0][0];
    // $100 at $2000 a unit is exactly 0.05 units.
    expect(sent.stakeWei).toBe((5n * 10n ** 16n).toString());
    expect(sent.timeControl).toBe("5+3");
  });
});

describe("draw", () => {
  const round = {
    id: "r1",
    closesAt: new Date(Date.now() + 3_600_000).toISOString(),
    jackpot: money(50_000),
    entryCost: money(1),
    mainPool: 49,
    mainPicks: 5,
    bonusPool: 10,
    state: "open" as const,
    prizeTiers: [{ matches: 5, bonusRequired: true, prize: money(50_000), label: "5 + bonus" }],
  };

  it("won't buy until five numbers and a bonus are chosen", async () => {
    drawApi.fetchCurrentRound.mockResolvedValue(round);
    const { container } = render(<DrawSection />, { wrapper });

    await screen.findByText("Prize tiers");
    expect(screen.getByRole("button", { name: "Pick 5 more" })).toBeDisabled();

    // 1-10 appear in both grids, so scope picks to the main one.
    const main = within(container.querySelector(".grid-cols-7") as HTMLElement);
    [1, 2, 3, 4, 5].forEach((n) => fireEvent.click(main.getByRole("button", { name: String(n) })));
    expect(screen.getByRole("button", { name: "Pick a bonus number" })).toBeDisabled();

    const bonus = within(container.querySelector(".grid-cols-10") as HTMLElement);
    fireEvent.click(bonus.getByRole("button", { name: "7" }));
    expect(screen.getByRole("button", { name: "Confirm entry" })).toBeEnabled();
  });

  it("buys the chosen numbers for the open round", async () => {
    drawApi.fetchCurrentRound.mockResolvedValue(round);
    drawApi.createEntries.mockResolvedValue([]);
    const { container } = render(<DrawSection />, { wrapper });

    await screen.findByText("Prize tiers");
    const main = within(container.querySelector(".grid-cols-7") as HTMLElement);
    [3, 1, 5, 2, 4].forEach((n) => fireEvent.click(main.getByRole("button", { name: String(n) })));
    const bonus = within(container.querySelector(".grid-cols-10") as HTMLElement);
    fireEvent.click(bonus.getByRole("button", { name: "7" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm entry" }));

    await waitFor(() => expect(drawApi.createEntries).toHaveBeenCalled());
    expect(drawApi.createEntries.mock.calls[0][0]).toEqual({
      roundId: "r1",
      // Sorted before submission regardless of pick order.
      mainNumbers: [1, 2, 3, 4, 5],
      bonusNumber: 7,
      quantity: 1,
    });
  });

  it("closes entry once the round is no longer open", async () => {
    drawApi.fetchCurrentRound.mockResolvedValue({ ...round, state: "drawing" as const });
    render(<DrawSection />, { wrapper });

    await screen.findByText("Prize tiers");
    expect(screen.getByRole("button", { name: "Round closed" })).toBeDisabled();
    expect(screen.getByText("Drawing now…")).toBeInTheDocument();
  });

  it("shows the casino as unavailable when the gateway isn't configured", async () => {
    drawApi.fetchCurrentRound.mockRejectedValue(
      Object.assign(new Error("nope"), { code: "NOT_CONFIGURED" })
    );
    render(<DrawSection />, { wrapper });
    expect(await screen.findByText(/the draw isn't available yet/i)).toBeInTheDocument();
  });
});

describe("a drawn game", () => {
  const player = (id: string, username: string) => ({
    id,
    username,
    rating: 1500,
    walletAddress: id,
  });

  // The signed-in wallet is 0xabc, so this is the player's own game.
  const drawnMatch = (over: Record<string, unknown> = {}) => ({
    id: "m1",
    state: "settled",
    white: player("0xabc", "you"),
    black: player("0xdef", "them"),
    timeControl: "5+3",
    stake: money(50),
    pot: money(100),
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    moves: [],
    clocks: { w: 300, b: 300 },
    clockUpdatedAt: new Date().toISOString(),
    turn: "w",
    result: { kind: "draw", reason: "agreement" },
    rematchId: "m2",
    rematchOf: null,
    drawOffered: null,
    spectatorCount: 0,
    createdAt: new Date().toISOString(),
    ...over,
  });

  it("tells the player their stake came back and a rematch is starting", async () => {
    chessApi.fetchMatch.mockResolvedValue(drawnMatch());
    render(<PlaySection matchId="m1" />, { wrapper });

    // The result reads in both the status line and the overlay.
    expect((await screen.findAllByText(/Draw · agreement/)).length).toBeGreaterThan(0);
    // The stake is returned in full, so that is the figure shown, not the pot.
    expect(screen.getByText("$50.00")).toBeInTheDocument();
    expect(screen.getByText(/Your stake came back in full/)).toBeInTheDocument();
    expect(screen.getByText(/Rematch starting, colours swapped/)).toBeInTheDocument();
  });

  it("says so plainly when a draw ends play without a rematch", async () => {
    chessApi.fetchMatch.mockResolvedValue(drawnMatch({ rematchId: null }));
    render(<PlaySection matchId="m1" />, { wrapper });

    expect(await screen.findByText(/No rematch this time/)).toBeInTheDocument();
    expect(screen.queryByText(/Rematch starting/)).not.toBeInTheDocument();
  });

  it("offers a draw, and switches to accepting one the opponent offered", async () => {
    const live = drawnMatch({ state: "in_progress", result: null, rematchId: null });
    chessApi.fetchMatch.mockResolvedValue(live);
    chessApi.offerDraw.mockResolvedValue({ ...live, drawOffered: "w" });

    const { unmount } = render(<PlaySection matchId="m1" />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Offer draw" }));
    await waitFor(() => expect(chessApi.offerDraw).toHaveBeenCalledWith("m1"));
    unmount();

    // With the opponent's offer outstanding, the same control accepts it.
    // A fresh client so the match is fetched again rather than served warm.
    chessApi.fetchMatch.mockResolvedValue({ ...live, drawOffered: "b" });
    render(<PlaySection matchId="m1" />, { wrapper });
    expect(await screen.findByRole("button", { name: "Accept draw" })).toBeInTheDocument();
  });
});
