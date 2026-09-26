import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "@/messages/en.json";
import type { VaultActivity, VaultGame, VaultWinner } from "@/features/casino/lib/vault-api";

// The section is the one piece of the arcade that owns decisions rather than
// looks: which stage phase to draw, which rail cards can actually be pressed,
// and which strings each state gets. Every hook under it talks to a socket, a
// contract or a price feed, so they are all replaced here and the file asserts
// on the wiring alone.

const ls = enMessages.casino.lastStanding;
const ZERO = "0x0000000000000000000000000000000000000000";
const ME = "0x1111111111111111111111111111111111111111";
const THEM = "0x2222222222222222222222222222222222222222";
const STARTER = "0x3333333333333333333333333333333333333333";

// One row of this game's feed. A game's rounds are counted off these, so a
// test that cares about the round number builds the run it wants: a "started"
// row opens it and each "joined" adds a round.
function play(
  action: VaultActivity["action"],
  address: string,
  createdAt: string,
  amountWei = "380000"
): VaultActivity {
  return {
    id: `${action}-${createdAt}`,
    gameId: 59,
    action,
    address,
    amountWei,
    transactionHash: `0x${action}`,
    createdAt,
  };
}

// Mutable fixtures, reset per test. The mock factories below read through
// these, so a test sets the world and then renders.
let world: {
  address: string | null;
  game: VaultGame | null;
  loading: boolean;
  error: boolean;
  notFound: boolean;
  degraded: boolean;
  activities: VaultActivity[];
  winners: VaultWinner[];
  balanceUsd: number;
  pending: { token: string; raw: bigint; amount: { decimals: number } }[];
  broadcastPhase: string;
  squareAvatar: string | null;
};

const settle = vi.fn(async () => {});
const wager = vi.fn(async () => {});
const claim = vi.fn(async () => {});
const resyncGame = vi.fn();
const onAddFunds = vi.fn();

function usdc(amount: string, usd: number) {
  return {
    amount,
    raw: String(Math.round(Number(amount) * 1e6)),
    token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    tokenSymbol: "USDC",
    decimals: 6,
    usdValue: usd,
    formattedUsd: `$${usd.toFixed(2)}`,
  };
}

function makeGame(over: Partial<VaultGame> = {}): VaultGame {
  return {
    gameId: 59,
    starter: STARTER,
    king: THEM,
    pot: usdc("1.16", 1.16),
    minWager: usdc("0.38", 0.38),
    // Far enough out that the local clock never reaches zero mid-test and
    // starts the round-end sequence on its own.
    endTime: Math.floor(Date.now() / 1000) + 600,
    timeRemaining: 600,
    settled: false,
    active: true,
    // Public by default. `isPrivate` arrived on the merge from main (#573,
    // real private games) and is required, so the fixture has to state it;
    // nothing in this file turns on it.
    isPrivate: false,
    ...over,
  };
}

vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({ evmAddress: world.address }),
}));

// The reader's Market Square picture. The real hook reads the square through
// react-query; what this file cares about is only which faces it reaches.
vi.mock("@/hooks/use-square-avatar", () => ({
  useSquareAvatar: () => world.squareAvatar,
}));

vi.mock("@/features/casino/hooks/use-vault-game", () => ({
  useVaultGame: () => ({
    game: world.game,
    loading: world.loading,
    error: world.error,
    notFound: world.notFound,
    connected: true,
    degraded: world.degraded,
    resync: resyncGame,
  }),
}));

vi.mock("@/features/casino/hooks/use-vault-feeds", () => ({
  useVaultFeeds: () => ({
    activities: world.activities,
    winners: world.winners,
    winnersLoading: false,
    activitiesLoading: false,
  }),
}));

vi.mock("@/features/casino/hooks/use-vault-actions", () => ({
  useVaultActions: () => ({
    wager,
    wagering: false,
    claim,
    claiming: false,
    settle,
    settling: false,
  }),
}));

vi.mock("@/features/casino/hooks/use-vault-winnings", () => ({
  useVaultPendingWinnings: () => ({
    pending: world.pending,
    hasPending: world.pending.length > 0,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/features/casino/hooks/use-game-balance", () => ({
  useGameBalance: () => ({
    balanceUsd: world.balanceUsd,
    balanceUnits: BigInt(Math.round(world.balanceUsd * 1e6)),
    settle: vi.fn(),
  }),
}));

vi.mock("@/features/casino/hooks/use-payout-refresh", () => ({ usePayoutRefresh: () => {} }));
vi.mock("@/features/casino/hooks/use-arcade-shine", () => ({ useVaultShine: () => {} }));
vi.mock("@/features/casino/hooks/use-vault-params", () => ({
  useVaultParams: () => ({ split: { winner: 5000, starter: 1000 } }),
}));
vi.mock("@/features/casino/hooks/use-leave-prompt", () => ({
  useLeavePrompt: () => ({ pending: null, leave: vi.fn(), stay: vi.fn() }),
}));
vi.mock("@/hooks/use-prices", () => ({ usePrices: () => ({ ETH: 3000 }) }));

vi.mock("@/components/ui/currency-select", () => ({
  useMoney: () => ({
    currency: { code: "USD" },
    ready: true,
    format: (n: number) => `$${n.toFixed(2)}`,
    formatExact: (n: number) => `$${n.toFixed(2)}`,
    toInput: (n: number) => n.toFixed(2),
    fromInput: (text: string) => {
      const value = Number(text.replace("$", "").trim());
      return Number.isFinite(value) && value > 0 ? value : null;
    },
  }),
}));

// Web Audio, confetti and the analytics transport have no place in jsdom, and
// none of them is what this file is about.
vi.mock("@/features/casino/lib/last-standing/music", () => ({
  isMusicPlaying: () => false,
  setUrgentMode: () => {},
  armMusicOnGesture: () => () => {},
  disarmMusic: () => {},
  startMusic: () => {},
  stopMusic: () => {},
  subscribeMusic: () => () => {},
}));
vi.mock("@/features/casino/lib/last-standing/sound", () => ({
  playClaimSound: () => {},
  playDethronedSound: () => {},
  playRevealSound: () => {},
  playRoundEndSound: () => {},
  playWagerSound: () => {},
  setSoundEnabled: () => {},
}));
vi.mock("canvas-confetti", () => ({ default: () => {} }));
vi.mock("@/lib/analytics/mixpanel", () => ({ track: () => {} }));
vi.mock("@/lib/toast", () => ({
  toast: {
    loading: () => "toast",
    success: () => {},
    error: () => {},
    info: () => {},
    dismiss: () => {},
  },
}));

// The broadcast carries its own session, queries and socket. This file only
// cares which phase it reports, which decides whether the rail offers it, and
// where the panel lands.
vi.mock("@/features/casino/hooks/use-game-broadcast", () => ({
  useGameBroadcast: () => ({ phase: world.broadcastPhase }),
}));
vi.mock("@/features/casino/components/broadcast", () => ({
  GameBroadcastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  GoLivePanel: ({ variant, header }: { variant?: string; header?: React.ReactNode }) => (
    <div data-testid="go-live" data-variant={variant}>
      {header}
    </div>
  ),
  isBroadcastOngoing: (phase: string) =>
    ["starting", "live", "share-stopped", "joining", "ending", "end-failed"].includes(phase),
}));

// The pop-out's store and launcher, faked. Picture-in-picture has no
// implementation in jsdom and the real launcher reaches Web Audio on the way
// out, so what is under test here is the SECTION'S WIRING: that the switch
// asks for a window, points it at this game first, closes the one that is up,
// and reads its label from the store. `formatCountdown` and the host stay
// real — this file's clock assertions run through the former.
const mini = {
  open: false,
  listeners: new Set<() => void>(),
  snapshot: { overlayActive: false },
  set(open: boolean) {
    this.open = open;
    // A fresh object per change: `useSyncExternalStore` compares identity, and
    // a mutated one would not re-render. The real store does the same.
    this.snapshot = { overlayActive: open };
    for (const l of this.listeners) l();
  },
};
const openMiniWindow = vi.fn(() => mini.set(true));
const closeMiniWindow = vi.fn(() => mini.set(false));
const followGame = vi.fn();
vi.mock("@/features/casino/components/last-standing/mini-timer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./mini-timer")>()),
  detectTier: () => "document",
  openMiniWindow: (...args: unknown[]) => openMiniWindow(...(args as [])),
  closeMiniWindow: () => closeMiniWindow(),
  subscribeMiniWindow: (cb: () => void) => {
    mini.listeners.add(cb);
    return () => mini.listeners.delete(cb);
  },
  miniWindowSnapshot: () => mini.snapshot,
  isMiniWindowOpen: (s: { overlayActive: boolean }) => s.overlayActive,
}));
vi.mock("@/features/casino/lib/last-standing/followed-game", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/last-standing/followed-game")>()),
  followGame: (id: number) => followGame(id),
}));

const { LastStandingSection, shortTimeAgo } =
  await import("@/features/casino/components/last-standing/last-standing-section");

// The catalogue's short-time strings, filled the way next-intl fills them.
const tAgo = (
  key: "timeJustNow" | "timeMinutesAgo" | "timeHoursAgo" | "timeDaysAgo",
  values?: { count: number }
) => ls[key].replace("{count}", String(values?.count ?? ""));

function renderSection() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <LastStandingSection gameId={59} onAddFunds={onAddFunds} />
    </NextIntlClientProvider>
  );
}

type RailKind = "action" | "invite" | "claim" | "broadcast";

function railCard(kind: RailKind): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-rail-card="${kind}"]`);
}

/** Pages the rail until the named card is on screen, or gives up. */
function openRailCard(kind: RailKind): HTMLElement {
  const dots = screen.queryAllByRole("button", { name: /Go to card/u });
  for (let i = 0; i < Math.max(1, dots.length); i += 1) {
    const found = railCard(kind);
    if (found) return found;
    const next = screen.queryAllByRole("button", { name: /Go to card/u })[i];
    if (next) fireEvent.click(next);
  }
  const found = railCard(kind);
  if (!found) throw new Error(`the rail never reached the ${kind} card`);
  return found;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Drop last test's subscribers before resetting, or the reset notifies
  // components that are already unmounted.
  mini.listeners.clear();
  mini.set(false);
  world = {
    address: ME,
    game: makeGame(),
    loading: false,
    error: false,
    notFound: false,
    degraded: false,
    activities: [],
    winners: [],
    balanceUsd: 25,
    pending: [],
    broadcastPhase: "idle",
    squareAvatar: null,
  };
  // jsdom under this Node ships no matchMedia, and both the stage card and
  // motion's reduced-motion hook read it on mount.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

describe("LastStandingSection page frame", () => {
  it("names the round in the breadcrumb and marks it live", () => {
    renderSection();

    const crumb = screen.getByTestId("lms-crumb-current");
    expect(crumb).toHaveTextContent(ls.title);
    expect(crumb).toHaveAttribute("data-live", "true");
    expect(crumb.className).toContain("text-[#ffe178]");
    expect(screen.getByTestId("lms-pill")).toHaveTextContent(ls.pillLive);
    // A static dot (844:79668), not a pulsing one.
    const dot = screen.getByTestId("lms-pill-dot");
    expect(dot.className).toContain("bg-[#FBE35C]");
    expect(dot.className).not.toContain("animate-pulse");
    expect(screen.getByText(ls.tagline)).toBeInTheDocument();
  });

  it("drops the live marker and says so once the round is over", () => {
    world.game = makeGame({ active: false });
    renderSection();

    const crumb = screen.getByTestId("lms-crumb-current");
    expect(crumb).toHaveAttribute("data-live", "false");
    // The current page stays amber whatever the state (844:79664).
    expect(crumb.className).toContain("text-[#ffe178]");
    expect(screen.getByTestId("lms-pill")).toHaveTextContent(ls.pillEnded);
    // The ended pill (844:78319) is drawn without a dot.
    expect(screen.queryByTestId("lms-pill-dot")).toBeNull();
  });

  it("offers a retry and the lobby when the game cannot be loaded at all", () => {
    world.game = null;
    world.error = true;
    renderSection();

    expect(screen.getByRole("alert")).toHaveTextContent(ls.gameLoadFailedTitle);
    fireEvent.click(screen.getByRole("button", { name: ls.retry }));
    expect(resyncGame).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: ls.backToLobby })).toBeInTheDocument();
  });

  // The rail's invite card carries the invite, so a second Share beside the
  // title was the same thing twice; and the sound switch has moved into the
  // stage card's empty top-right corner, opposite the round label. Nothing is
  // left beside the title.
  it("leaves nothing beside the title, and puts the sound switch in the stage card", () => {
    renderSection();

    const header = within(screen.getByRole("banner"));
    expect(header.queryByRole("button", { name: ls.shareCta })).toBeNull();
    expect(header.queryByRole("button", { name: ls.soundPlay })).toBeNull();

    const sound = screen.getByRole("button", { name: ls.soundPlay });
    expect(screen.getByTestId("stage-card")).toContainElement(sound);
  });

  // The heading says WHICH game you are looking at. A named game puts the
  // starter's own name and words there; an unnamed one falls back to the
  // product's, which is what every game showed before naming existed.
  describe("the heading", () => {
    it("is the starter's name for the game, with their description under it", () => {
      world.game = makeGame({ title: "Friday night pot", description: "Winner takes the lot" });
      renderSection();

      expect(screen.getByTestId("lms-heading")).toHaveTextContent("Friday night pot");
      expect(screen.getByTestId("lms-subheading")).toHaveTextContent("Winner takes the lot");
      expect(screen.getByTestId("lms-crumb-current")).toHaveTextContent(ls.title);
    });

    it("keeps the tagline under a named game that carries no description", () => {
      world.game = makeGame({ title: "Friday night pot" });
      renderSection();

      expect(screen.getByTestId("lms-heading")).toHaveTextContent("Friday night pot");
      expect(screen.getByTestId("lms-subheading")).toHaveTextContent(ls.tagline);
    });

    it("falls back to the product's own name and tagline for an unnamed game", () => {
      renderSection();

      expect(screen.getByTestId("lms-heading")).toHaveTextContent(ls.title);
      expect(screen.getByTestId("lms-subheading")).toHaveTextContent(ls.tagline);
    });

    // It used to be drawn twice: once here and once again above the stage.
    it("names the game once", () => {
      world.game = makeGame({ title: "Friday night pot" });
      renderSection();

      expect(screen.getAllByText("Friday night pot")).toHaveLength(1);
    });
  });

  // The stage's corner carries the sound switch and nothing else. A pop-out
  // pill here was the same offer twice: the dialog that catches a click
  // leaving the arena still raises the floating clock, which is where a
  // reader actually wants it.
  it("offers no pop-out switch beside the clock", () => {
    renderSection();

    expect(screen.queryByRole("button", { name: ls.miniOpen })).toBeNull();
    expect(screen.queryByRole("button", { name: ls.miniClose })).toBeNull();
    expect(screen.getByRole("button", { name: ls.soundPlay })).toBeInTheDocument();
  });

  it("shows a loading stage rather than an empty clock before the game arrives", () => {
    world.game = null;
    world.loading = true;
    renderSection();

    expect(screen.getByTestId("stage-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("stage-card")).toBeNull();
  });
});

describe("LastStandingSection stage phases", () => {
  it("draws the not-started stage while the round has no leader", () => {
    world.game = makeGame({ king: ZERO });
    renderSection();

    expect(screen.getByTestId("stage-card")).toHaveAttribute("data-phase", "notStarted");
    expect(screen.getByTestId("stage-caption")).toHaveTextContent(ls.stageCaptionStart);
    expect(screen.getByText(ls.stageNoLeader)).toBeInTheDocument();
  });

  // The round counts this game's stakes: opening it is round 1 and each
  // player who puts money in adds one. It is NOT the game's id, which is what
  // this used to print — game 59 announced "Rounds #59" on its first round.
  it("draws the live stage, the round number and the other player's lead", () => {
    world.activities = [
      play("started", THEM, "2026-09-25T18:57:00.000Z"),
      play("joined", ME, "2026-09-25T18:58:00.000Z"),
    ];
    renderSection();

    expect(screen.getByTestId("stage-card")).toHaveAttribute("data-phase", "live");
    expect(screen.getByText("Rounds #2")).toBeInTheDocument();
    expect(screen.getByTestId("stage-caption")).toHaveTextContent(ls.stageCaptionLive);
    expect(screen.getByTestId("stage-leader")).toHaveAttribute("data-you", "false");
    expect(screen.getByText(ls.stageLeadingOther)).toBeInTheDocument();
    expect(screen.getByTestId("stage-chip")).toHaveTextContent(ls.chipLeading);
  });

  it("counts a further stake as a further round", () => {
    world.activities = [
      play("started", THEM, "2026-09-25T18:57:00.000Z"),
      play("joined", ME, "2026-09-25T18:58:00.000Z"),
      play("joined", THEM, "2026-09-25T18:59:00.000Z"),
    ];
    renderSection();

    expect(screen.getByText("Rounds #3")).toBeInTheDocument();
  });

  // The vault reuses a game id when the contract is redeployed, so one id's
  // feed can carry a finished game as well as this one. Counting all of it
  // would announce a round this game has not reached.
  it("counts only the run being played, not an earlier game that reused the id", () => {
    world.activities = [
      play("started", THEM, "2026-08-30T02:20:00.000Z"),
      play("joined", ME, "2026-08-30T02:21:00.000Z"),
      play("won", ME, "2026-08-30T02:23:00.000Z"),
      play("started", THEM, "2026-09-25T18:57:00.000Z"),
    ];
    renderSection();

    expect(screen.getByText("Rounds #1")).toBeInTheDocument();
  });

  // A number here is read as fact. Nothing is better than a wrong one.
  it("shows no round number while the feed that counts them is still out", () => {
    world.activities = [];
    renderSection();

    expect(screen.queryByText(/Rounds #/)).not.toBeInTheDocument();
  });

  it("marks the leader strip as yours when this wallet is in front", () => {
    world.game = makeGame({ king: ME });
    renderSection();

    expect(screen.getByTestId("stage-leader")).toHaveAttribute("data-you", "true");
    expect(screen.getByText(ls.stageLeadingYou)).toBeInTheDocument();
    expect(screen.getByTestId("stage-chip")).toHaveTextContent(ls.chipYou);
  });

  it("draws the ended stage and names the last player", () => {
    world.game = makeGame({ active: false });
    renderSection();

    expect(screen.getByTestId("stage-card")).toHaveAttribute("data-phase", "ended");
    expect(screen.getByText(ls.stageEndedTitle)).toBeInTheDocument();
    expect(screen.getByTestId("stage-chip")).toHaveTextContent(ls.chipWinner);
  });

  it("draws the won stage when this wallet was the last one standing", () => {
    world.game = makeGame({ active: false, king: ME });
    renderSection();

    expect(screen.getByTestId("stage-card")).toHaveAttribute("data-phase", "won");
    expect(screen.getByText(ls.stageWonTitle)).toBeInTheDocument();
  });

  it("shows the pot and the winner's share as formatted money", () => {
    renderSection();

    expect(within(screen.getByTestId("stage-pot")).getByText("$1.16")).toBeInTheDocument();
    // Half the pot: the leader did not open this game, so no starter's share.
    expect(within(screen.getByTestId("stage-winner-share")).getByText("$0.58")).toBeInTheDocument();
  });

  it("freezes and dims the clock while the connection is degraded", () => {
    world.degraded = true;
    renderSection();

    expect(screen.getByTestId("stage-clock")).toHaveAttribute("data-frozen", "true");
    expect(screen.getByTestId("lms-degraded")).toHaveTextContent(ls.connectionLostTitle);
  });
});

describe("LastStandingSection rail", () => {
  it("offers the play card and the invite, and nothing to claim, while a round runs", () => {
    renderSection();

    expect(railCard("action")).not.toBeNull();
    expect(railCard("claim")).toBeNull();
    expect(screen.getByText(ls.railAddHeading)).toBeInTheDocument();
    expect(screen.getByTestId("rail-badge")).toHaveAttribute("data-tone", "behind");
  });

  it("takes the start shape before anyone has played", () => {
    world.game = makeGame({ king: ZERO });
    renderSection();

    expect(screen.getByText(ls.railStartHeading)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: ls.railStartCta })).toBeInTheDocument();
  });

  it("badges the play card as the lead when this wallet is in front", () => {
    world.game = makeGame({ king: ME });
    renderSection();

    expect(screen.getByTestId("rail-badge")).toHaveAttribute("data-tone", "lead");
    expect(screen.getByText(ls.railBadgeLead)).toBeInTheDocument();
  });

  it("wagers the stepper's amount, and steps it by the game's minimum", () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: ls.stepperIncrease }));
    expect(screen.getByRole("textbox", { name: ls.stepperEdit })).toHaveValue("$0.76");

    fireEvent.click(screen.getByRole("button", { name: ls.railAddCta }));
    expect(wager).toHaveBeenCalledWith(59, 760000n);
  });

  // Stepping is in units of the game's entry, so a ten-times stake is nine
  // presses. The figure is a field for that reason.
  describe("typing the stake", () => {
    const field = () => screen.getByRole("textbox", { name: ls.stepperEdit });

    it("wagers what was typed into it", () => {
      renderSection();

      fireEvent.focus(field());
      fireEvent.change(field(), { target: { value: "2.50" } });
      fireEvent.blur(field());

      expect(field()).toHaveValue("$2.50");
      fireEvent.click(screen.getByRole("button", { name: ls.railAddCta }));
      expect(wager).toHaveBeenCalledWith(59, 2_500_000n);
    });

    // Both ends are clamped rather than refused: under the game's minimum is
    // what the contract reverts, and over the balance is what cannot be paid.
    it("pulls a figure under the game's minimum up to it", () => {
      renderSection();

      fireEvent.focus(field());
      fireEvent.change(field(), { target: { value: "0.01" } });
      fireEvent.blur(field());

      expect(field()).toHaveValue("$0.38");
    });

    it("pulls a figure over the balance down to it", () => {
      world.balanceUsd = 5;
      renderSection();

      fireEvent.focus(field());
      fireEvent.change(field(), { target: { value: "999" } });
      fireEvent.blur(field());

      expect(field()).toHaveValue("$5.00");
    });

    it("leaves the stake alone when the field is cleared", () => {
      renderSection();

      fireEvent.focus(field());
      fireEvent.change(field(), { target: { value: "" } });
      fireEvent.blur(field());

      expect(field()).toHaveValue("$0.38");
    });

    it("drops what was typed on Escape", () => {
      renderSection();

      fireEvent.focus(field());
      fireEvent.change(field(), { target: { value: "9" } });
      fireEvent.keyDown(field(), { key: "Escape" });

      expect(field()).toHaveValue("$0.38");
    });
  });

  it("never steps the stake past the balance", () => {
    world.balanceUsd = 0.38;
    renderSection();

    expect(screen.getByRole("button", { name: ls.stepperIncrease })).toBeDisabled();
    expect(screen.getByRole("button", { name: ls.stepperDecrease })).toBeDisabled();
  });

  it("asks for money instead of a play when the balance is short", () => {
    world.balanceUsd = 0;
    renderSection();

    const cta = screen.getByRole("button", { name: ls.ctaAddMoney });
    fireEvent.click(cta);
    expect(onAddFunds).toHaveBeenCalled();
    expect(wager).not.toHaveBeenCalled();
  });

  it("keeps settle reachable when the round ended unsettled, and offers no play", () => {
    world.game = makeGame({ active: false, settled: false });
    renderSection();

    expect(railCard("action")).toBeNull();
    const claimCard = openRailCard("claim");
    expect(claimCard).toHaveTextContent(ls.claimStatusNotClaimed);

    fireEvent.click(within(claimCard).getByRole("button", { name: ls.ctaSettleRound }));
    expect(settle).toHaveBeenCalledWith(59);
  });

  it("offers the winner the settle-and-collect wording", () => {
    world.game = makeGame({ active: false, settled: false, king: ME });
    renderSection();

    expect(
      within(openRailCard("claim")).getByRole("button", { name: ls.ctaSettleCollect })
    ).toBeInTheDocument();
  });

  it("claims a payout the contract could not push", () => {
    world.game = makeGame({ active: false, settled: true });
    world.pending = [{ token: ZERO, raw: 580000n, amount: { decimals: 6 } }];
    renderSection();

    const claimCard = openRailCard("claim");
    expect(claimCard).toHaveTextContent(ls.railClaimReady);
    fireEvent.click(within(claimCard).getByRole("button", { name: /Claim \$0\.58/u }));
    expect(claim).toHaveBeenCalled();
  });

  it("shows no claim card on a settled round with nothing owed", () => {
    world.game = makeGame({ active: false, settled: true });
    renderSection();

    expect(railCard("claim")).toBeNull();
    expect(railCard("action")).toBeNull();
    expect(screen.getByRole("link", { name: ls.ctaStartAnother })).toBeInTheDocument();
  });

  it("pages from the play card to the invite, which is always offered", () => {
    renderSection();

    expect(railCard("invite")).toBeNull();
    const invite = openRailCard("invite");
    expect(within(invite).getByTestId("rail-qr")).toBeInTheDocument();
    expect(within(invite).getByText(ls.railInviteBadge)).toBeInTheDocument();
  });
});

/** The rail's cards in pager order, read by visiting each dot. */
function railOrder(): RailKind[] {
  const kinds: RailKind[] = ["action", "claim", "invite", "broadcast"];
  const current = () => kinds.find((kind) => railCard(kind) !== null);
  const dots = screen.queryAllByRole("button", { name: /Go to card/u });
  if (dots.length === 0) return [current()!];
  return dots.map((_dot, i) => {
    fireEvent.click(screen.getAllByRole("button", { name: /Go to card/u })[i]);
    return current()!;
  });
}

describe("LastStandingSection rail slides by state", () => {
  it("offers play, invite and broadcast while a round runs", () => {
    renderSection();
    expect(railOrder()).toEqual(["action", "invite", "broadcast"]);
  });

  it("offers a live round's slides even to a wallet owed a payout elsewhere", () => {
    world.pending = [{ token: ZERO, raw: 580000n, amount: { decimals: 6 } }];
    renderSection();
    expect(railOrder()).toEqual(["action", "invite", "broadcast"]);
  });

  it("opens an ended round on claim for the winner, then invite, and no broadcast", () => {
    world.game = makeGame({ active: false, settled: false, king: ME });
    renderSection();

    expect(railCard("claim")).not.toBeNull();
    expect(railOrder()).toEqual(["claim", "invite"]);
  });

  it("still offers settle to a wallet that did not win an unsettled round", () => {
    world.game = makeGame({ active: false, settled: false });
    renderSection();
    expect(railOrder()).toEqual(["claim", "invite"]);
  });

  it("leaves only the invite on a settled round with nothing owed", () => {
    world.game = makeGame({ active: false, settled: true });
    renderSection();

    expect(railOrder()).toEqual(["invite"]);
    // One card: nothing to page between, so no dots.
    expect(screen.queryAllByRole("button", { name: /Go to card/u })).toHaveLength(0);
  });

  it("keeps the broadcast after the round ends while this session is still streaming", () => {
    world.game = makeGame({ active: false, settled: true });
    world.broadcastPhase = "live";
    renderSection();

    expect(railOrder()).toEqual(["invite", "broadcast"]);
  });

  it("moves to claim when the round ends under a player who had paged away", () => {
    world.game = makeGame({ king: ME });
    const view = renderSection();
    openRailCard("invite");
    expect(railCard("invite")).not.toBeNull();

    world.game = makeGame({ active: false, settled: false, king: ME });
    view.rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <LastStandingSection gameId={59} onAddFunds={onAddFunds} />
      </NextIntlClientProvider>
    );
    expect(railCard("claim")).not.toBeNull();
  });

  it("draws the pager inside the card that is showing", () => {
    renderSection();

    const action = railCard("action")!;
    expect(within(action).getAllByRole("button", { name: /Go to card/u })).toHaveLength(3);

    const broadcast = openRailCard("broadcast");
    // The broadcast slide's marker sits inside the shared frame, so the dots
    // are its frame's, not the marker's.
    const frame = broadcast.closest("section") ?? broadcast.parentElement!;
    expect(within(frame).getAllByRole("button", { name: /Go to card/u })).toHaveLength(3);
  });

  it("renders the broadcast only as a rail slide, bare, never as a card under the rail", () => {
    renderSection();

    expect(screen.queryByTestId("go-live")).toBeNull();
    const slide = openRailCard("broadcast");
    const panel = within(slide).getByTestId("go-live");
    expect(panel).toHaveAttribute("data-variant", "bare");
    expect(within(panel).getByText(ls.railBroadcastHeading)).toBeInTheDocument();
    expect(screen.getAllByTestId("go-live")).toHaveLength(1);
  });
});

describe("LastStandingSection ended copy", () => {
  it("draws no caption under the ended stage, only the line naming the last player", () => {
    world.game = makeGame({ active: false, settled: true });
    renderSection();

    expect(screen.queryByTestId("stage-caption")).toBeNull();
    expect(
      screen.getByText(
        ls.stageEndedBody.replace("{player}", `${THEM.slice(0, 6)}…${THEM.slice(-4)}`)
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/Round settled/u)).toBeNull();
    expect("hintSettled" in ls).toBe(false);
  });

  it("draws the winning stage's confirmed line and no caption", () => {
    world.game = makeGame({ active: false, settled: false, king: ME });
    renderSection();

    expect(screen.queryByTestId("stage-caption")).toBeNull();
    expect(screen.getByText(ls.stageWonBody)).toBeInTheDocument();
  });
});

describe("LastStandingSection activity panel", () => {
  it("lists a play with its player, action, amount and time", () => {
    const now = new Date();
    const earlier = new Date(now.getTime() - 60_000).toISOString();
    world.activities = [
      play("started", ME, earlier, "380000"),
      play("won", THEM, now.toISOString(), "580000"),
    ];

    renderSection();

    expect(screen.getByText(ls.colPlayer)).toBeInTheDocument();
    expect(screen.getByText(ls.actionPlayed)).toBeInTheDocument();
    expect(screen.getByText(ls.actionWon)).toBeInTheDocument();
    expect(ls.actionWon).toBe("Won the round");
    expect(ls.actionPlayed).toBe("Played");
    // The design's short relative time, not Intl's "1 minute ago" / "now".
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Just now")).toBeInTheDocument();
    expect(table.getByText("1 min ago")).toBeInTheDocument();
    // Scoped to the table: the rail's stepper shows the same figure, because
    // the stake starts at the game's minimum.
    expect(within(screen.getByRole("table")).getByText("$0.38")).toBeInTheDocument();
  });

  // A reader watching a live round looks at the top of the table, so that is
  // where the play that just landed belongs.
  it("puts the newest play at the top", () => {
    const now = Date.now();
    const at = (msAgo: number) => new Date(now - msAgo).toISOString();
    world.activities = [
      play("started", ME, at(180_000), "380000"),
      play("joined", THEM, at(120_000), "380000"),
      play("won", THEM, at(60_000), "580000"),
    ];

    renderSection();

    const times = within(screen.getByRole("table"))
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.textContent);
    expect(times[0]).toContain("1 min ago");
    expect(times[times.length - 1]).toContain("3 min ago");
  });

  it("writes the time in the design's short form", () => {
    const now = new Date("2026-09-26T12:00:00.000Z");
    const ago = (ms: number) => shortTimeAgo(new Date(now.getTime() - ms), now, tAgo);
    expect(ago(0)).toBe("Just now");
    expect(ago(59_000)).toBe("Just now");
    // Clock skew: a row stamped slightly in the future is still "just now".
    expect(ago(-5_000)).toBe("Just now");
    expect(ago(60_000)).toBe("1 min ago");
    expect(ago(2 * 60_000 + 30_000)).toBe("2 min ago");
    expect(ago(59 * 60_000)).toBe("59 min ago");
    expect(ago(60 * 60_000)).toBe("1 h ago");
    expect(ago(23 * 3_600_000)).toBe("23 h ago");
    expect(ago(24 * 3_600_000)).toBe("1 d ago");
    expect(ago(3 * 86_400_000)).toBe("3 d ago");
  });

  it("says so plainly when nobody has played", () => {
    renderSection();
    expect(screen.getByText(ls.noPlays)).toBeInTheDocument();
  });

  // The table reads one game's own feed, and a reused id means that feed can
  // also hold a finished game. Those plays belong to a game that is over and
  // must not be listed next to this one's.
  it("leaves out the plays of an earlier game that reused this id", () => {
    world.activities = [
      play("started", THEM, "2026-08-30T02:20:00.000Z", "999000"),
      play("won", THEM, "2026-08-30T02:23:00.000Z", "999000"),
      play("started", ME, "2026-09-25T18:57:00.000Z", "380000"),
    ];
    renderSection();

    const table = within(screen.getByRole("table"));
    expect(table.getByText("$0.38")).toBeInTheDocument();
    expect(table.queryByText("$1.00")).not.toBeInTheDocument();
    expect(table.queryByText(ls.actionWon)).not.toBeInTheDocument();
  });

  it("reaches the game rules from the tabs", () => {
    renderSection();

    fireEvent.click(screen.getByRole("tab", { name: ls.tabRules }));
    expect(screen.getByText(ls.howTitle)).toBeInTheDocument();
  });

  // "Past rounds" was never past rounds. It drew the WINNERS feed, which is
  // global, capped at the 25 newest settlements across every game, and only
  // then filtered to this one — so a game whose settlement had aged out of
  // that window showed an empty tab whatever had happened in it. Two tabs that
  // both report, honestly, is better than three where one misleads.
  it("offers only the activity and the rules", () => {
    renderSection();

    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      ls.tabActivity,
      ls.tabRules,
    ]);
  });
});

// The reader's Market Square picture is theirs alone. Every other player is
// still the mark drawn from their address: the backend has no wallet-to-avatar
// mapping yet, and inventing one here would put a face on the wrong wallet.
describe("LastStandingSection player faces", () => {
  const MY_PICTURE = "https://square.example/me.png";

  /** The picture a face is showing, or null when it is the drawn fallback. */
  function pictureIn(scope: HTMLElement): string | null {
    return scope.querySelector("img")?.getAttribute("src") ?? null;
  }

  function tableRows(selector: string): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>(`tbody tr${selector}`));
  }

  it("puts the reader's own picture on the leader strip while they are king", () => {
    world.squareAvatar = MY_PICTURE;
    world.game = makeGame({ king: ME });
    renderSection();

    expect(pictureIn(screen.getByTestId("stage-avatar"))).toBe(MY_PICTURE);
  });

  it("leaves another player's lead to the face drawn from their address", () => {
    world.squareAvatar = MY_PICTURE;
    world.game = makeGame({ king: THEM });
    renderSection();

    expect(pictureIn(screen.getByTestId("stage-avatar"))).toBeNull();
  });

  // The strip that says nobody leads draws a plain disc from an empty seed.
  // There is no player, so there is no picture to be anyone's.
  it("puts no picture on the strip before anyone has played", () => {
    world.squareAvatar = MY_PICTURE;
    world.game = makeGame({ king: ZERO });
    renderSection();

    expect(pictureIn(screen.getByTestId("stage-avatar"))).toBeNull();
  });

  it("puts the reader's picture on their own activity rows and nobody else's", () => {
    world.squareAvatar = MY_PICTURE;
    world.activities = [
      play("started", THEM, "2026-09-25T18:57:00.000Z"),
      play("joined", ME, "2026-09-25T18:58:00.000Z"),
    ];
    renderSection();

    const mine = tableRows('[data-you="true"]');
    expect(mine).toHaveLength(1);
    expect(mine.map((row) => pictureIn(row))).toEqual([MY_PICTURE]);

    const theirs = tableRows(":not([data-you])");
    expect(theirs).toHaveLength(1);
    expect(theirs.map((row) => pictureIn(row))).toEqual([null]);
  });

  // Null is the ordinary answer from the square, not a failure: it means the
  // seeded face IS this person's face. Nothing should look broken.
  it("falls back to the drawn face when the square holds no picture", () => {
    world.squareAvatar = null;
    world.game = makeGame({ king: ME });
    renderSection();

    expect(pictureIn(screen.getByTestId("stage-avatar"))).toBeNull();
  });
});
