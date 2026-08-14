import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";

// The screens are mocked at the API-client seam, not inside the components, so
// these tests exercise the real hooks, real query wiring and real render paths.
const chessApi = vi.hoisted(() => ({
  fetchLobbyChallenges: vi.fn(),
  fetchOpenChallenges: vi.fn(),
  fetchLiveMatches: vi.fn(),
  fetchPlayerMatches: vi.fn(),
  fetchJoinableMatches: vi.fn(),
  fetchWaitingMatches: vi.fn(),
  fetchMatch: vi.fn(),
  acceptChallenge: vi.fn(),
  submitMove: vi.fn(),
  resignMatch: vi.fn(),
  createChallenge: vi.fn(),
  createComputerMatch: vi.fn(),
  fetchMatchmakingTicket: vi.fn(),
  cancelMatchmaking: vi.fn(),
  fetchChallengeByInvite: vi.fn(),
  offerDraw: vi.fn(),
  respondToDraw: vi.fn(),
  claimTimeout: vi.fn(),
  abortMatch: vi.fn(),
  requestRematch: vi.fn(),
  declineRematch: vi.fn(),
  requestTakeback: vi.fn(),
  declineTakeback: vi.fn(),
  fetchMatchChat: vi.fn(),
  postMatchChatMessage: vi.fn(),
  fetchMatchNote: vi.fn(),
  saveMatchNote: vi.fn(),
  fetchMatchComments: vi.fn(),
  upsertMatchComment: vi.fn(),
  deleteMatchComment: vi.fn(),
  cancelChallenge: vi.fn(),
  requestComputerHint: vi.fn(),
  extendMatchTime: vi.fn(),
}));
vi.mock("@/features/casino/lib/api/chess", () => chessApi);

const chessProducts = vi.hoisted(() => ({
  access: {
    player: "0xabc",
    coachActive: false,
    coachUntil: null,
    hintCredits: 0,
    timeExtensionCredits: 0,
    premiumReviewCredits: 0,
    updatedAt: "2026-08-13T00:00:00.000Z",
  },
  purchase: vi.fn(),
}));
vi.mock("@/features/casino/hooks/use-chess-products", () => ({
  CHESS_PRODUCT_KEYS: {
    catalog: ["casino", "chess", "products", "catalog"],
    access: (player: string) => ["casino", "chess", "products", "access", player],
  },
  useChessProducts: () => ({
    products: [],
    access: chessProducts.access,
    isLoading: false,
    error: null,
    purchase: chessProducts.purchase,
    purchasing: false,
    purchasingKey: null,
  }),
}));

const chessSocket = vi.hoisted(() => ({
  listener: null as ((frame: { type?: string; topic?: string; data?: unknown }) => void) | null,
}));
vi.mock("@/features/casino/lib/chess/live-socket", () => ({
  subscribeChessTopic: vi.fn(
    (
      _topic: string,
      listener: (frame: { type?: string; topic?: string; data?: unknown }) => void
    ) => {
      chessSocket.listener = listener;
      return () => {
        if (chessSocket.listener === listener) chessSocket.listener = null;
      };
    }
  ),
}));

vi.mock("@privy-io/react-auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@privy-io/react-auth")>();
  return {
    ...original,
    usePrivy: () => ({ ready: true, authenticated: true }),
  };
});

const bettingHooks = vi.hoisted(() => ({
  useMatchMarket: vi.fn(),
  placeBetMutateAsync: vi.fn(),
}));
vi.mock("@/features/casino/hooks/use-casino-betting", () => ({
  useMatchMarket: bettingHooks.useMatchMarket,
  usePlaceBet: () => ({
    isPending: false,
    mutateAsync: bettingHooks.placeBetMutateAsync,
  }),
}));

vi.mock("@/features/casino/hooks/use-chess-cashier", () => ({
  CASHIER_KEYS: {
    balance: (player: string) => ["casino", "chess", "cashier", "balance", player],
  },
  useChessCashierStatus: () => ({
    configured: false,
    config: null,
    wallet: "0xabc",
    feePct: null,
    available: "0",
    locked: "0",
    lockBuckets: [],
    balanceLoading: false,
  }),
}));

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/casino",
  useSearchParams: () => new URLSearchParams(),
}));

// The wallet is the platform's; these tests care about how screens react to
// its balance, not about Privy or the portfolio fetch beneath it.
const wallet = vi.hoisted(() => ({ balance: 10, balanceUsd: 20_000, unitPriceUsd: 2000 }));
vi.mock("@/features/casino/hooks/use-casino-wallet", () => ({
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

import { NextIntlClientProvider } from "next-intl";
import { LobbySection } from "@/features/casino/components/chess/lobby-section";
import { PlaySection } from "@/features/casino/components/chess/play-section";
import { SpectateSection } from "@/features/casino/components/chess/spectate-section";
import { CreateSection } from "@/features/casino/components/chess/create-section";
import messages from "@/messages/en.json";

// The screens read their copy through next-intl, so the wrapper provides the
// English catalog; assertions below match the en.json strings.
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

const challenge = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  creator: { id: "u1", username: "GrandmasterKay", rating: 2210, walletAddress: "0xdef" },
  timeControl: "5+3",
  createdAt: new Date().toISOString(),
  inviteCode: null,
  ...over,
});

const activeMatch = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  state: "in_progress",
  white: { id: "0xabc", username: "0xabc", rating: 0, walletAddress: "0xabc" },
  black: { id: "0xdef", username: "GrandmasterKay", rating: 2210, walletAddress: "0xdef" },
  timeControl: "30s",
  clockMode: "real_time",
  computer: null,
  fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  moves: ["e4"],
  clocks: { w: 26, b: 56 },
  clockUpdatedAt: new Date().toISOString(),
  turn: "b",
  result: null,
  drawOffered: null,
  takeback: { white: false, black: false, takebackable: true },
  rematch: { offeredBy: null, nextMatchId: null },
  timeExtensions: {
    allowed: false,
    used: 0,
    totalSeconds: 0,
    maxUses: 3,
    maxTotalSeconds: 1_800,
  },
  stakeUsdc: null,
  wagerStatus: null,
  liveTopic: "chess:match:m1",
  createdAt: new Date().toISOString(),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  chessSocket.listener = null;
  wallet.balance = 10;
  chessProducts.access.timeExtensionCredits = 0;
  chessProducts.access.hintCredits = 0;
  chessProducts.purchase.mockReset();
  chessApi.fetchLobbyChallenges.mockResolvedValue({ challenges: [], myOpenGames: [] });
  chessApi.fetchOpenChallenges.mockResolvedValue([]);
  chessApi.fetchLiveMatches.mockResolvedValue([]);
  chessApi.fetchPlayerMatches.mockResolvedValue([]);
  chessApi.fetchJoinableMatches.mockResolvedValue([]);
  chessApi.fetchWaitingMatches.mockResolvedValue([]);
  chessApi.fetchMatchChat.mockResolvedValue([]);
  chessApi.fetchMatchNote.mockResolvedValue({
    matchId: "m1",
    player: "0xabc",
    text: "",
    createdAt: null,
    updatedAt: null,
  });
  chessApi.fetchMatchComments.mockResolvedValue([]);
  bettingHooks.useMatchMarket.mockReturnValue({
    odds: null,
    myBets: [],
    isLoading: false,
    error: null,
  });
  bettingHooks.placeBetMutateAsync.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("chess lobby", () => {
  it("shows an empty state rather than inventing games", async () => {
    render(<LobbySection />, { wrapper });
    expect(await screen.findByText(/No games in play yet/)).toBeInTheDocument();
    expect(await screen.findByText(/No open challenges/)).toBeInTheDocument();
  });

  it("creates an unlimited computer game and opens its board", async () => {
    chessApi.createComputerMatch.mockResolvedValue(
      activeMatch({
        id: "computer-1",
        timeControl: "Unlimited",
        clockMode: "unlimited",
        computer: {
          player: "0x00000000000000000000000000000000000000b1",
          name: "Stockfish level 1",
          side: "black",
          level: 1,
        },
      })
    );
    render(<LobbySection />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Set up a computer game" }));
    expect(screen.getByRole("heading", { name: "Game setup" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Unlimited" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("computer-game-setup-scroll-region")).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-y-auto"
    );
    expect(screen.getByTestId("computer-game-setup-actions")).toHaveClass("shrink-0");
    fireEvent.click(screen.getByRole("button", { name: "Play against computer" }));

    await waitFor(() =>
      expect(chessApi.createComputerMatch).toHaveBeenCalledWith({
        player: "0xabc",
        level: 1,
        color: "random",
        timeMode: "unlimited",
        coachEnabled: true,
      })
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/casino/chess/play?match=computer-1"));
  });

  it("lists an open challenge with its time control", async () => {
    chessApi.fetchLobbyChallenges.mockResolvedValue({
      challenges: [challenge()],
      myOpenGames: [],
    });
    render(<LobbySection />, { wrapper });

    expect(await screen.findByText("GrandmasterKay")).toBeInTheDocument();
    expect(screen.getByText("5+3 Blitz")).toBeInTheDocument();
  });

  // The service settles nothing, so no screen may show an amount.
  it("shows no money anywhere in the lobby", async () => {
    chessApi.fetchLobbyChallenges.mockResolvedValue({
      challenges: [challenge()],
      myOpenGames: [],
    });
    const { container } = render(<LobbySection />, { wrapper });

    await screen.findByText("GrandmasterKay");
    expect(container.textContent).not.toMatch(/\$|stake|pot|escrow/i);
  });

  it("surfaces a gateway failure instead of an empty page", async () => {
    chessApi.fetchLobbyChallenges.mockRejectedValue(
      Object.assign(new Error("boom"), { code: "UPSTREAM_ERROR" })
    );
    render(<LobbySection />, { wrapper });
    expect(await screen.findByText(/Couldn't load the chess lobby/)).toBeInTheDocument();
  });

  // Nothing is escrowed, so a thin balance is not a reason to refuse a seat.
  it("lets a player join regardless of balance", async () => {
    wallet.balance = 0.001;
    chessApi.fetchLobbyChallenges.mockResolvedValue({
      challenges: [challenge()],
      myOpenGames: [],
    });
    chessApi.acceptChallenge.mockResolvedValue({ id: "m9" });
    render(<LobbySection />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Join" }));
    await waitFor(() => expect(chessApi.acceptChallenge).toHaveBeenCalledWith("c1", "0xabc"));
  });

  it("opens the match when joining succeeds", async () => {
    chessApi.fetchLobbyChallenges.mockResolvedValue({
      challenges: [challenge()],
      myOpenGames: [],
    });
    chessApi.acceptChallenge.mockResolvedValue({ id: "m9" });
    render(<LobbySection />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Join" }));
    await waitFor(() => expect(chessApi.acceptChallenge).toHaveBeenCalledWith("c1", "0xabc"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/casino/chess/play?match=m9"));
  });

  it("reports a failed join instead of navigating to a game that isn't there", async () => {
    chessApi.fetchLobbyChallenges.mockResolvedValue({
      challenges: [challenge()],
      myOpenGames: [],
    });
    chessApi.acceptChallenge.mockRejectedValue(
      Object.assign(new Error("gone"), { code: "CONFLICT" })
    );
    render(<LobbySection />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Join" }));
    await waitFor(() => expect(chessApi.acceptChallenge).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
  });

  it("does not surface your own waiting game as a landing-rail resume card", async () => {
    chessApi.fetchLobbyChallenges.mockResolvedValue({
      challenges: [],
      myOpenGames: [
        challenge({
          id: "mine-1",
          creator: {
            id: "u-self",
            username: "0xabc",
            rating: 0,
            walletAddress: "0xabc",
          },
        }),
      ],
    });
    render(<LobbySection />, { wrapper });

    await screen.findByText("Live Now");
    expect(screen.queryByText("Your open games")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resume" })).not.toBeInTheDocument();
  });

  it("does not surface your own active game as a landing-rail resume card", async () => {
    chessApi.fetchLiveMatches.mockResolvedValue([activeMatch()]);
    render(<LobbySection />, { wrapper });

    await screen.findByText("Live Now");
    expect(screen.queryByText("Your active games")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resume" })).not.toBeInTheDocument();
  });

  it("hides finished games from the live lobby lists", async () => {
    chessApi.fetchLiveMatches.mockResolvedValue([
      activeMatch({
        id: "done-1",
        state: "settled",
        result: { kind: "resignation", winner: "w" },
      }),
    ]);
    render(<LobbySection />, { wrapper });

    expect(
      await screen.findByText("No games in play yet. Create one and it shows up here.")
    ).toBeInTheDocument();
    expect(screen.queryByText("GrandmasterKay")).not.toBeInTheDocument();
  });

  it("lets a spectator open a live market from the lobby", async () => {
    chessApi.fetchLiveMatches.mockResolvedValue([
      activeMatch({
        id: "watch-1",
        white: { id: "0x111", username: "WhiteSide", rating: 1650, walletAddress: "0x111" },
        black: { id: "0x222", username: "BlackSide", rating: 1710, walletAddress: "0x222" },
        timeControl: "5+3",
        stakeUsdc: "5",
      }),
    ]);
    render(<LobbySection />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Open live games" }));
    expect(await screen.findByText("WhiteSide vs BlackSide")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Watch" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/casino/chess/watch?match=watch-1"));
  });
});

describe("create a game", () => {
  it("creates with the chosen time control, named by the caller's wallet", async () => {
    chessApi.createChallenge.mockResolvedValue({
      challenge: challenge({ inviteCode: "c1" }),
      match: activeMatch({
        id: "c1",
        state: "awaiting_opponent",
        black: null,
        moves: [],
        turn: "w",
      }),
      ticket: null,
    });
    render(<CreateSection />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: "15 min" }));
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));

    await waitFor(() => expect(chessApi.createChallenge).toHaveBeenCalled());
    const sent = chessApi.createChallenge.mock.calls[0][0];
    expect(sent.timeControl).toBe("15+0");
    expect(sent.mode).toBe("invite");
    expect(sent.creator).toBe("0xabc");
    expect(sent.rated).toBe(true);
    expect(sent.allowTimeExtensions).toBe(true);
  });

  it("asks for nothing but a time control", () => {
    const { container } = render(<CreateSection />, { wrapper });
    expect(container.textContent).not.toMatch(/\$|stake|escrow|winnings|fee/i);
    expect(screen.queryByPlaceholderText("0.00")).not.toBeInTheDocument();
  });

  it("opens the created board straight away", async () => {
    chessApi.createChallenge.mockResolvedValue({
      challenge: challenge({ inviteCode: "c1" }),
      match: activeMatch({
        id: "c1",
        state: "awaiting_opponent",
        black: null,
        moves: [],
        turn: "w",
      }),
      ticket: null,
    });
    render(<CreateSection />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));

    // The creator lands on the board (id c1); the invite link is shared from there.
    await waitFor(() => expect(push).toHaveBeenCalledWith("/casino/chess/play?match=c1"));
  });

  it("moves the creator from the waiting screen into play when the opponent joins", async () => {
    const waiting = activeMatch({
      state: "awaiting_opponent",
      black: null,
      moves: [],
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      turn: "w",
      clocks: { w: 300, b: 300 },
    });
    // The second response deliberately remains stale. The socket acceptance
    // must win even when its Lichess-style follow-up reload races an older
    // waiting snapshot from HTTP.
    chessApi.fetchMatch.mockResolvedValue(waiting);
    render(<PlaySection matchId="m1" />, { wrapper });

    expect((await screen.findAllByRole("button", { name: "Abort" })).length).toBeGreaterThan(0);
    await waitFor(() => expect(chessSocket.listener).not.toBeNull());

    act(() => {
      chessSocket.listener?.({
        type: "state",
        topic: "chess:match:m1",
        data: {
          id: "m1",
          status: "active",
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          turn: "white",
          ply: 0,
          timeControl: { initialSeconds: 300, incrementSeconds: 0 },
          clocks: { whiteMs: 300_000, blackMs: 300_000 },
          white: "0xabc",
          black: "0xdef",
          drawOfferBy: null,
          result: null,
          resultReason: null,
          createdAt: "2026-08-13T09:00:00.000Z",
          startedAt: "2026-08-13T09:01:00.000Z",
          finishedAt: null,
        },
      });
    });

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Offer draw" }).length).toBeGreaterThan(0)
    );
    await waitFor(() => expect(chessApi.fetchMatch.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(screen.queryAllByRole("button", { name: "Abort" })).toHaveLength(0);
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
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    moves: [],
    clocks: { w: 300, b: 300 },
    clockUpdatedAt: new Date().toISOString(),
    turn: "w",
    result: { kind: "draw", reason: "agreement" },
    drawOffered: null,
    takeback: { white: false, black: false, takebackable: false },
    rematch: { offeredBy: null, nextMatchId: null },
    clockMode: "real_time",
    computer: null,
    timeExtensions: {
      allowed: false,
      used: 0,
      totalSeconds: 0,
      maxUses: 3,
      maxTotalSeconds: 1_800,
    },
    stakeUsdc: null,
    wagerStatus: null,
    liveTopic: "chess:match:m1",
    createdAt: new Date().toISOString(),
    ...over,
  });

  it("reports the result and does not claim money changed hands", async () => {
    chessApi.fetchMatch.mockResolvedValue(drawnMatch());
    const { container } = render(<PlaySection matchId="m1" />, { wrapper });

    // The result reads in both the status line and the overlay.
    expect((await screen.findAllByText(/Draw · agreement/)).length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/\$|stake|pot|escrow|balance|winnings/i);
  });

  it("offers a rematch rather than moving the player on by itself", async () => {
    chessApi.fetchMatch.mockResolvedValue(drawnMatch());
    chessApi.requestRematch.mockResolvedValue(
      drawnMatch({ rematch: { offeredBy: "0xabc", nextMatchId: null } })
    );
    render(<PlaySection matchId="m1" />, { wrapper });

    fireEvent.click((await screen.findAllByRole("button", { name: "Rematch" }))[0]);
    await waitFor(() => expect(chessApi.requestRematch).toHaveBeenCalledWith("m1", "0xabc"));
    expect(push).not.toHaveBeenCalled();
    expect(
      (await screen.findAllByText(/Rematch offered. Waiting for your opponent./)).length
    ).toBeGreaterThan(0);
  });

  it("accepts the opponent's rematch on the same finished match", async () => {
    chessApi.fetchMatch.mockResolvedValue(
      drawnMatch({ rematch: { offeredBy: "0xdef", nextMatchId: null } })
    );
    chessApi.requestRematch.mockResolvedValue(
      drawnMatch({ rematch: { offeredBy: "0xdef", nextMatchId: "rematch-1" } })
    );
    render(<PlaySection matchId="m1" />, { wrapper });

    expect((await screen.findAllByText(/Your opponent wants a rematch/)).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: "Rematch" })).toHaveLength(0);

    fireEvent.click(screen.getAllByRole("button", { name: "Accept rematch" })[0]);
    await waitFor(() => expect(chessApi.requestRematch).toHaveBeenCalledWith("m1", "0xabc"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/casino/chess/play?match=rematch-1"));
  });

  it("lets a player cancel their pending rematch offer", async () => {
    chessApi.fetchMatch.mockResolvedValue(
      drawnMatch({ rematch: { offeredBy: "0xabc", nextMatchId: null } })
    );
    chessApi.declineRematch.mockResolvedValue(
      drawnMatch({ rematch: { offeredBy: null, nextMatchId: null } })
    );
    render(<PlaySection matchId="m1" />, { wrapper });

    fireEvent.click((await screen.findAllByRole("button", { name: "Cancel rematch" }))[0]);
    await waitFor(() => expect(chessApi.declineRematch).toHaveBeenCalledWith("m1", "0xabc"));
  });

  it("accepts a takeback the opponent offered", async () => {
    const live = drawnMatch({
      state: "in_progress",
      result: null,
      takeback: { white: false, black: true, takebackable: true },
    });
    chessApi.fetchMatch.mockResolvedValue(live);
    chessApi.requestTakeback.mockResolvedValue({
      ...live,
      takeback: { white: false, black: false, takebackable: true },
    });
    render(<PlaySection matchId="m1" />, { wrapper });

    fireEvent.click((await screen.findAllByRole("button", { name: "Accept takeback" }))[0]);
    await waitFor(() => expect(chessApi.requestTakeback).toHaveBeenCalledWith("m1", "0xabc"));
  });

  it("renders spectator chat and sends a new chat line from the play rail", async () => {
    const live = drawnMatch({ state: "in_progress", result: null });
    chessApi.fetchMatch.mockResolvedValue(live);
    chessApi.fetchMatchChat.mockResolvedValue([
      {
        id: 1,
        matchId: "m1",
        room: "spectator",
        author: "0xdef",
        text: "gl hf",
        createdAt: "2026-08-03T00:00:00.000Z",
      },
    ]);
    chessApi.postMatchChatMessage.mockResolvedValue({
      id: 2,
      matchId: "m1",
      room: "spectator",
      author: "0xabc",
      text: "nice move",
      createdAt: "2026-08-03T00:01:00.000Z",
    });
    render(<PlaySection matchId="m1" />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Chat" }));
    // The line renders twice: once in the laptop live-feed rail beside the
    // board and once in the in-tab feed shown below xl; CSS keeps exactly one
    // visible per breakpoint.
    expect((await screen.findAllByText("gl hf")).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText("Message your opponent…"), {
      target: { value: "nice move" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(chessApi.postMatchChatMessage).toHaveBeenCalledWith("m1", "player", "nice move", null)
    );
  });

  it("loads and saves a private note plus current-position comments", async () => {
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 760 });
    const live = drawnMatch({ state: "in_progress", result: null });
    chessApi.fetchMatch.mockResolvedValue(live);
    chessApi.fetchMatchNote.mockResolvedValue({
      matchId: "m1",
      player: "0xabc",
      text: "prep line",
      createdAt: "2026-08-03T00:00:00.000Z",
      updatedAt: "2026-08-03T00:00:00.000Z",
    });
    chessApi.fetchMatchComments.mockResolvedValue([
      {
        id: "c1",
        matchId: "m1",
        ply: 0,
        fen: live.fen,
        author: "0xdef",
        text: "looks equal",
        createdAt: "2026-08-03T00:00:00.000Z",
        updatedAt: "2026-08-03T00:00:00.000Z",
      },
    ]);
    chessApi.saveMatchNote.mockResolvedValue({
      matchId: "m1",
      player: "0xabc",
      text: "updated prep",
      createdAt: "2026-08-03T00:00:00.000Z",
      updatedAt: "2026-08-03T00:01:00.000Z",
    });
    chessApi.upsertMatchComment.mockResolvedValue({
      id: "c2",
      matchId: "m1",
      ply: 0,
      fen: live.fen,
      author: "0xabc",
      text: "play c4 soon",
      createdAt: "2026-08-03T00:02:00.000Z",
      updatedAt: "2026-08-03T00:02:00.000Z",
    });
    const { unmount } = render(<PlaySection matchId="m1" />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Info" }));
    expect(await screen.findByDisplayValue("prep line")).toBeInTheDocument();
    expect(screen.getByText("looks equal")).toBeInTheDocument();

    fireEvent.change(
      screen.getByPlaceholderText(
        "Write down prep, reminders, or anything you want to keep private."
      ),
      {
        target: { value: "updated prep" },
      }
    );
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() =>
      expect(chessApi.saveMatchNote).toHaveBeenCalledWith("m1", "updated prep", null)
    );

    fireEvent.change(screen.getByPlaceholderText("Add a comment on this position."), {
      target: { value: "play c4 soon" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save comment" }));

    await waitFor(() =>
      expect(chessApi.upsertMatchComment).toHaveBeenCalledWith(
        "m1",
        {
          ply: 0,
          text: "play c4 soon",
        },
        null
      )
    );
    unmount();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: previousWidth });
  });

  it("offers a draw, then answers the one the opponent offered", async () => {
    const live = drawnMatch({ state: "in_progress", result: null });
    chessApi.fetchMatch.mockResolvedValue(live);
    chessApi.offerDraw.mockResolvedValue({ ...live, drawOffered: "w" });

    const { unmount } = render(<PlaySection matchId="m1" />, { wrapper });
    fireEvent.click((await screen.findAllByRole("button", { name: "Offer draw" }))[0]);
    await waitFor(() => expect(chessApi.offerDraw).toHaveBeenCalledWith("m1", "0xabc"));
    unmount();

    // With the opponent's offer outstanding, accepting and declining are both
    // offered. A fresh client so the match is fetched again, not served warm.
    chessApi.fetchMatch.mockResolvedValue({ ...live, drawOffered: "b" });
    chessApi.respondToDraw.mockResolvedValue({ ...live, drawOffered: null });
    render(<PlaySection matchId="m1" />, { wrapper });

    fireEvent.click((await screen.findAllByRole("button", { name: "Accept draw" }))[0]);
    await waitFor(() => expect(chessApi.respondToDraw).toHaveBeenCalledWith("m1", "0xabc", true));
  });

  it("declines a draw without ending the game", async () => {
    const live = drawnMatch({ state: "in_progress", result: null, drawOffered: "b" });
    chessApi.fetchMatch.mockResolvedValue(live);
    chessApi.respondToDraw.mockResolvedValue({ ...live, drawOffered: null });
    render(<PlaySection matchId="m1" />, { wrapper });

    fireEvent.click((await screen.findAllByRole("button", { name: "Decline" }))[0]);
    await waitFor(() => expect(chessApi.respondToDraw).toHaveBeenCalledWith("m1", "0xabc", false));
  });

  it("aborts a game nobody has joined", async () => {
    chessApi.fetchMatch.mockResolvedValue(
      drawnMatch({ state: "awaiting_opponent", result: null, black: null })
    );
    chessApi.abortMatch.mockResolvedValue(drawnMatch({ state: "cancelled", result: null }));
    render(<PlaySection matchId="m1" />, { wrapper });

    fireEvent.click((await screen.findAllByRole("button", { name: "Abort" }))[0]);
    await waitFor(() => expect(chessApi.abortMatch).toHaveBeenCalledWith("m1", "0xabc"));
  });

  // The service does not end a game on time by itself, so a game whose clock
  // expired would sit unfinished until somebody claims it.
  it("claims a flag fall exactly once when the opponent's clock runs out", async () => {
    const flagged = drawnMatch({
      state: "in_progress",
      result: null,
      turn: "b",
      clocks: { w: 300, b: 0 },
      clockUpdatedAt: new Date(Date.now() - 5_000).toISOString(),
    });
    chessApi.fetchMatch.mockResolvedValue(flagged);
    chessApi.claimTimeout.mockResolvedValue(
      drawnMatch({ result: { kind: "timeout", winner: "w" } })
    );
    render(<PlaySection matchId="m1" />, { wrapper });

    await waitFor(() => expect(chessApi.claimTimeout).toHaveBeenCalledWith("m1", "0xabc"));
    await waitFor(() => expect(screen.getAllByText(/Flag fall/).length).toBeGreaterThan(0));
    expect(chessApi.claimTimeout).toHaveBeenCalledTimes(1);
  });

  it("does not claim a flag fall against itself", async () => {
    chessApi.fetchMatch.mockResolvedValue(
      drawnMatch({
        state: "in_progress",
        result: null,
        turn: "w",
        clocks: { w: 0, b: 300 },
        clockUpdatedAt: new Date(Date.now() - 5_000).toISOString(),
      })
    );
    render(<PlaySection matchId="m1" />, { wrapper });

    expect((await screen.findAllByText("Your time ran out")).length).toBeGreaterThan(0);
    expect(chessApi.claimTimeout).not.toHaveBeenCalled();
  });

  it("does not claim a flag fall just because an old snapshot was reopened", async () => {
    chessApi.claimTimeout.mockResolvedValue(
      drawnMatch({ result: { kind: "timeout", winner: "w" } })
    );
    chessApi.fetchMatch.mockResolvedValue(
      drawnMatch({
        state: "in_progress",
        result: null,
        turn: "b",
        clocks: { w: 300, b: 30 },
        clockUpdatedAt: new Date(Date.now() - 86_400_000).toISOString(),
      })
    );
    render(<PlaySection matchId="m1" />, { wrapper });

    await waitFor(() => expect(chessApi.claimTimeout).toHaveBeenCalledWith("m1", "0xabc"));
  });

  it("extends both clocks from the live action rail", async () => {
    const live = drawnMatch({
      state: "in_progress",
      result: null,
      timeExtensions: {
        allowed: true,
        used: 0,
        totalSeconds: 0,
        maxUses: 3,
        maxTotalSeconds: 1_800,
      },
    });
    chessProducts.access.timeExtensionCredits = 1;
    chessApi.fetchMatch.mockResolvedValue(live);
    chessApi.extendMatchTime.mockResolvedValue({
      ...live,
      clocks: { w: 360, b: 360 },
      timeExtensions: { ...live.timeExtensions, used: 1, totalSeconds: 60 },
    });
    render(<PlaySection matchId="m1" />, { wrapper });

    fireEvent.click((await screen.findAllByRole("button", { name: "+1m" }))[0]);

    await waitFor(() =>
      expect(chessApi.extendMatchTime).toHaveBeenCalledWith("m1", "0xabc", 60, expect.any(String))
    );
  });

  it("keeps the same clock running through a tab switch on the same snapshot", async () => {
    vi.useFakeTimers();
    const start = new Date("2026-08-02T12:00:00.000Z");
    vi.setSystemTime(start);

    const originalVisibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
    let visibility: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });

    try {
      chessApi.fetchMatch.mockResolvedValue(
        drawnMatch({
          state: "in_progress",
          result: null,
          timeControl: "10+0",
          turn: "w",
          clocks: { w: 600, b: 600 },
          clockUpdatedAt: start.toISOString(),
        })
      );

      render(<PlaySection matchId="m1" />, { wrapper });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(screen.getAllByText("Your move").length).toBeGreaterThan(0);
      expect(screen.getAllByText("10:00").length).toBeGreaterThan(0);

      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      expect(screen.getAllByText("09:30").length).toBeGreaterThan(0);

      act(() => {
        visibility = "hidden";
        document.dispatchEvent(new Event("visibilitychange"));
      });
      act(() => {
        vi.advanceTimersByTime(20_000);
      });
      act(() => {
        visibility = "visible";
        document.dispatchEvent(new Event("visibilitychange"));
      });

      expect(
        screen.queryAllByText("09:10").length + screen.queryAllByText("09:09").length
      ).toBeGreaterThan(0);
    } finally {
      if (originalVisibility) {
        Object.defineProperty(document, "visibilityState", originalVisibility);
      }
      vi.useRealTimers();
    }
  });
});

describe("spectator screen", () => {
  it("shows the public room in the live feed and posts from there", async () => {
    chessApi.fetchMatch.mockResolvedValue(
      activeMatch({
        white: { id: "0x111", username: "TableOne", rating: 1650, walletAddress: "0x111" },
        black: { id: "0xdef", username: "GrandmasterKay", rating: 1710, walletAddress: "0xdef" },
      })
    );
    chessApi.fetchMatchChat.mockResolvedValue([
      {
        id: 1,
        matchId: "m1",
        room: "spectator",
        author: "0xdef",
        text: "gl hf",
        createdAt: "2026-08-04T00:00:00.000Z",
      },
      {
        id: 2,
        matchId: "m1",
        room: "spectator",
        author: "0x111",
        text: "sharp line",
        createdAt: "2026-08-04T00:00:30.000Z",
      },
    ]);
    chessApi.postMatchChatMessage.mockResolvedValue({
      id: 3,
      matchId: "m1",
      room: "spectator",
      author: "0xabc",
      text: "wild tactic",
      createdAt: "2026-08-04T00:01:00.000Z",
    });

    render(<SpectateSection matchId="m1" />, { wrapper });

    // No tab to click any more: the spectator feed floats beside the board.
    expect(await screen.findByText("gl hf")).toBeInTheDocument();
    expect(screen.getByText("sharp line")).toBeInTheDocument();
    expect(screen.getAllByText("gl hf")).toHaveLength(1);
    expect(screen.getAllByText("sharp line")).toHaveLength(1);
    expect(screen.getByText("GrandmasterKay")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Say something about the game…"), {
      target: { value: "wild tactic" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(chessApi.postMatchChatMessage).toHaveBeenCalledWith(
        "m1",
        "spectator",
        "wild tactic",
        null
      )
    );
  });
});

describe("live games modal", () => {
  it("shows your own live game in the modal as a resumable board", async () => {
    chessApi.fetchLiveMatches.mockResolvedValue([activeMatch()]);
    render(<LobbySection />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Open live games" }));
    expect(await screen.findByText("0xabc vs GrandmasterKay")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/casino/chess/play?match=m1"));
  });

  it("opens from the lobby rail", async () => {
    chessApi.fetchLiveMatches.mockResolvedValue([
      activeMatch({
        id: "live-1",
        white: { id: "0x111", username: "TableOne", rating: 1650, walletAddress: "0x111" },
        black: { id: "0x222", username: "TableTwo", rating: 1710, walletAddress: "0x222" },
      }),
    ]);
    render(<LobbySection />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Open live games" }));
    expect(await screen.findByText("TableOne vs TableTwo")).toBeInTheDocument();
  });

  it("shows a clean empty state when no live games are running", async () => {
    chessApi.fetchLiveMatches.mockResolvedValue([]);
    render(<LobbySection />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Open live games" }));
    expect(await screen.findByText("No live chess games right now.")).toBeInTheDocument();
  });
});
