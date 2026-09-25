import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArenaDetail } from "@/features/casino/lib/api/arena";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
const arenaState = vi.hoisted(() => ({
  detail: null as ArenaDetail | null,
  isOrganizer: false,
  isLoading: false,
  error: null as Error | null,
  refetch: vi.fn(),
  join: vi.fn(),
  joining: false,
  withdraw: vi.fn(),
  withdrawing: false,
  start: vi.fn(),
  starting: false,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("@/features/casino/hooks/use-casino-wallet", () => ({
  useCasinoWallet: () => ({ address: "0xabc", connected: true }),
}));

vi.mock("@/features/casino/hooks/use-casino-arena", () => ({
  useArenaTournament: () => arenaState,
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    loading: vi.fn(() => "toast"),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { ArenaDetailSection } from "@/features/casino/components/chess/arena/detail-section";

function detail(overrides: Partial<ArenaDetail> = {}): ArenaDetail {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Friday Arena",
    organizer: "Player-abcd",
    status: "created",
    participantCount: 1,
    ongoingCount: 0,
    maxPlayers: 10_000,
    timeControl: "3+2",
    initialSeconds: 180,
    incrementSeconds: 2,
    durationSeconds: 3_600,
    startsAt: new Date(Date.now() + 60_000).toISOString(),
    startedAt: null,
    finishesAt: null,
    finishedAt: null,
    winner: null,
    standings: [
      {
        rank: 1,
        name: "Player-abcd",
        countryCode: "NG",
        rating: 1_500,
        score: 0,
        games: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        active: true,
        playing: false,
        fire: false,
      },
    ],
    standingOffset: 0,
    standingLimit: 100,
    me: null,
    myPairing: null,
    featuredPairings: [],
    ...overrides,
  };
}

beforeEach(() => {
  arenaState.detail = detail();
  arenaState.isOrganizer = false;
  arenaState.isLoading = false;
  arenaState.error = null;
  arenaState.join.mockReset();
  arenaState.withdraw.mockReset();
  arenaState.start.mockReset();
  router.replace.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Arena lobby flow", () => {
  it("shows a free-entry upcoming Arena without any funds controls", () => {
    render(<ArenaDetailSection arenaId={detail().id} />);

    expect(screen.getByRole("heading", { name: "Friday Arena" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join Arena" })).toBeInTheDocument();
    expect(screen.getByLabelText("NG country")).toHaveTextContent("NG");
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.queryByText(/deposit/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/prize pool/i)).not.toBeInTheDocument();
  });

  it("shows the Lichess-style standby state while waiting for a pairing", () => {
    arenaState.detail = detail({
      status: "started",
      participantCount: 20,
      startedAt: new Date().toISOString(),
      finishesAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      me: {
        name: "Player-abcd",
        countryCode: "NG",
        active: true,
        playing: false,
        rank: 4,
        score: 8,
      },
    });

    render(<ArenaDetailSection arenaId={arenaState.detail.id} />);

    expect(screen.getByText(/Stand by Player-abcd/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause pairing" })).toBeInTheDocument();
  });

  it("offers the assigned game and automatically hands the player to the board", () => {
    vi.useFakeTimers();
    const matchId = "22222222-2222-4222-8222-222222222222";
    arenaState.detail = detail({
      status: "started",
      participantCount: 20,
      startedAt: new Date().toISOString(),
      finishesAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      me: {
        name: "Player-abcd",
        countryCode: "NG",
        active: true,
        playing: true,
        rank: 4,
        score: 8,
      },
      myPairing: {
        id: "33333333-3333-4333-8333-333333333333",
        white: "Player-abcd",
        black: "Opponent",
        matchId,
        status: "ongoing",
        whiteScore: 0,
        blackScore: 0,
        scored: false,
        startedAt: new Date().toISOString(),
        finishedAt: null,
      },
    });

    render(<ArenaDetailSection arenaId={arenaState.detail.id} />);

    expect(screen.getByRole("link", { name: "Join the game" })).toHaveAttribute(
      "href",
      `/casino/chess/play?match=${matchId}&player=Player-abcd`
    );
    act(() => vi.advanceTimersByTime(700));
    expect(router.replace).toHaveBeenCalledWith(
      `/casino/chess/play?match=${matchId}&player=Player-abcd`
    );
  });

  it("locks joining after completion and shows the winner", () => {
    arenaState.detail = detail({
      status: "finished",
      participantCount: 20,
      startedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
      finishesAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      winner: "Champion",
    });

    render(<ArenaDetailSection arenaId={arenaState.detail.id} />);

    expect(screen.getByText("Champion wins")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /join arena/i })).not.toBeInTheDocument();
  });
});
