"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuthSession } from "@/hooks/use-auth-session";
import {
  getBookCapabilities,
  getBookBets,
  getBookNavigation,
  listBookBoard,
  placeBookBet,
  quoteBookBet,
  type BookBoardEvent,
  type BookBoardMarket,
  type BookOutcome,
} from "@/features/prediction/book/api";
import { BOOK_FUNDING_KEYS, useBookFunding } from "@/features/prediction/book/use-book-funding";
import {
  formatDecimalOddsE6,
  formatUsdcE6,
  stakeToE6,
  usdcInputFromE6,
} from "@/features/prediction/book/format";
import {
  PredictionBetEmpty,
  PredictionBetPanel,
  PredictionBetSidebarFrame,
} from "@/features/prediction/components/prediction-bet-sidebar";
import { SportIcon } from "@/features/prediction/sportsbook/components/sport-icon";

export interface BookPick {
  event: BookBoardEvent;
  market: BookBoardMarket;
  outcome: BookOutcome;
}

type BetPhase = "idle" | "funding" | "quoting" | "placing";

function eventTime(startsAt: number): { day: string; time: string } {
  const date = new Date(startsAt);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const day =
    date.toDateString() === today.toDateString()
      ? "Today"
      : date.toDateString() === tomorrow.toDateString()
        ? "Tomorrow"
        : new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short" }).format(date);
  return {
    day,
    time: new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date),
  };
}

function OutcomeButton({
  event,
  market,
  outcome,
  tone,
  selected,
  onPick,
}: {
  event: BookBoardEvent;
  market: BookBoardMarket;
  outcome: BookOutcome;
  tone: "green" | "red";
  selected: boolean;
  onPick: (pick: BookPick) => void;
}) {
  const toneClass =
    tone === "green"
      ? selected
        ? "border-[#14be47] bg-[#123b20] text-[#65e58b] shadow-[inset_0_0_0_1px_rgba(20,190,71,.25)]"
        : "border-[#17652f] bg-[#0c2514] text-[#47d674] hover:border-[#14be47] hover:bg-[#123b20]"
      : selected
        ? "border-[#ef4055] bg-[#42151b] text-[#ff8291] shadow-[inset_0_0_0_1px_rgba(239,64,85,.25)]"
        : "border-[#7a2933] bg-[#2a1014] text-[#ff687a] hover:border-[#ef4055] hover:bg-[#42151b]";

  // The label sits inside the button, above the odds, and wraps: it is what
  // tells a person which side of the market they are taking, so it is never
  // cut. It used to sit above the button on one truncated line.
  return (
    <button
      type="button"
      disabled={outcome.state !== "active" || market.state !== "active"}
      aria-pressed={selected}
      aria-label={`${market.title}: ${outcome.title} at ${outcome.odds}`}
      onClick={() => onPick({ event, market, outcome })}
      className={`flex min-h-14 w-full min-w-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border px-2.5 py-2 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${toneClass}`}
    >
      <span className="text-[12px] leading-[15px] font-semibold break-words text-white/75">
        {outcome.title}
      </span>
      <span className="text-base leading-5 font-bold tabular-nums">{outcome.odds}</span>
    </button>
  );
}

function ParticipantPortrait({
  name,
  imageUrl,
  size = "md",
}: {
  name: string;
  imageUrl: string | null;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "size-8 border-2 border-black" : "size-10 border border-white/10";
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-[#242424] ${box}`}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="size-full object-cover" />
      ) : (
        <span className="text-xs font-semibold text-[#999]">{name.slice(0, 1).toUpperCase()}</span>
      )}
    </span>
  );
}

function MarketArtwork({
  title,
  imageUrl,
  fallbackUrl,
  className,
}: {
  title: string;
  imageUrl: string | null;
  fallbackUrl: string | null;
  className: string;
}) {
  const source = imageUrl ?? fallbackUrl;
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-md border border-white/10 bg-[#242424] ${className}`}
    >
      {source ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={source} alt="" className="size-full object-cover" />
      ) : (
        <span className="text-[10px] font-bold text-[#999]">{title.slice(0, 1).toUpperCase()}</span>
      )}
    </span>
  );
}

export function EventRow({
  event,
  market,
  pick,
  onPick,
}: {
  event: BookBoardEvent;
  market: BookBoardMarket;
  pick: BookPick | null;
  onPick: (pick: BookPick) => void;
}) {
  const time = eventTime(event.startsAt);
  const outcomes = market.outcomes.filter((outcome) => !outcome.hidden).slice(0, 4);
  const columns = outcomes.length === 3 ? "grid-cols-3" : "grid-cols-2";
  const [first, second] = event.participants;

  // On a phone the row stacks: when and what sport, the market's question as
  // the row's heading, the fight with both faces, then the outcomes across
  // the full width. From 1280px it is the desk's two columns again. Nothing
  // here truncates: these words are what tell a person which bet this is.
  return (
    <article className="border-b border-white/[0.06] bg-black px-3 py-3.5 transition-colors hover:bg-white/[0.025] min-[1280px]:px-5 min-[1280px]:py-3">
      <div className="grid min-w-0 grid-cols-1 gap-3 min-[1280px]:grid-cols-[minmax(0,1fr)_28rem] min-[1280px]:items-center min-[1280px]:gap-0">
        <div className="min-w-0 min-[1280px]:pr-3">
          <div className="mb-2 flex min-w-0 items-center gap-1.5 text-[12px] text-[#999]">
            <span className="font-semibold text-[#adadad]">{time.time}</span>
            <span>{time.day}</span>
            <SportIcon sport={event.sport.slug} name={event.sport.name} className="size-4" />
            <span className="break-words text-[#777]">{event.sport.name}</span>
          </div>

          <h3 className="mb-2.5 text-[15px] leading-5 font-semibold break-words text-white min-[1280px]:mb-2 min-[1280px]:text-[13px] min-[1280px]:leading-[18px] min-[1280px]:text-[#d7d9de]">
            {market.title}
          </h3>

          {/* Phone: the fight on one line, both faces overlapped before it. */}
          <div className="flex min-w-0 items-center gap-2.5 min-[1280px]:hidden">
            <span className="flex shrink-0 -space-x-2">
              {[first, second].filter(Boolean).map((participant, index) => (
                <ParticipantPortrait
                  key={`${participant.name}:${index}`}
                  name={participant.name}
                  imageUrl={participant.imageUrl}
                  size="sm"
                />
              ))}
            </span>
            <span className="min-w-0 text-[13px] leading-[18px] font-semibold break-words text-[#d7d9de]">
              {event.title}
            </span>
          </div>

          {/* Desk: the fight's artwork and title, then a fighter per line. */}
          <div className="hidden min-[1280px]:block">
            <div className="mb-2 flex min-w-0 items-center gap-2">
              <MarketArtwork
                title={event.title}
                imageUrl={market.imageUrl}
                fallbackUrl={event.imageUrl}
                className="size-6"
              />
              <span className="min-w-0 text-[11px] font-bold tracking-[0.01em] break-words text-[#d7d9de]">
                {event.title}
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              {event.participants.slice(0, 2).map((participant, index) => (
                <p key={`${participant.name}:${index}`} className="flex min-w-0 items-center">
                  <ParticipantPortrait name={participant.name} imageUrl={participant.imageUrl} />
                  <span className="ml-2 min-w-0 text-[16px] font-semibold break-words text-white">
                    {participant.name}
                  </span>
                </p>
              ))}
            </div>
          </div>
        </div>

        <div className={`grid min-w-0 items-stretch gap-2 ${columns}`}>
          {outcomes.map((outcome, index) => (
            <OutcomeButton
              key={outcome.id}
              event={event}
              market={market}
              outcome={outcome}
              tone={index === 0 ? "green" : "red"}
              selected={pick?.outcome.id === outcome.id}
              onPick={onPick}
            />
          ))}
        </div>
      </div>
    </article>
  );
}

function BetSlip({
  pick,
  onClear,
  onAccepted,
  onBusyChange,
}: {
  pick: BookPick;
  onClear: () => void;
  onAccepted: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { ready, authenticated } = useAuthSession();
  const funding = useBookFunding();
  const [stake, setStake] = useState("10");
  const [phase, setPhase] = useState<BetPhase>("idle");
  const deferredStake = useDeferredValue(stake);
  const stakeE6 = stakeToE6(deferredStake);
  const meetsMinimum = Boolean(stakeE6 && BigInt(stakeE6) >= BigInt(pick.market.minStakeE6));
  const quote = useQuery({
    queryKey: ["prediction", "book", "quote", pick.outcome.id, stakeE6],
    queryFn: () => quoteBookBet(pick.market.id, pick.outcome.id, stakeE6!),
    enabled: Boolean(stakeE6 && meetsMinimum),
    retry: false,
    staleTime: 0,
  });
  const bet = useMutation({
    mutationFn: async () => {
      if (!stakeE6) throw new Error("Enter a valid stake.");
      if (!quote.data) throw new Error("Wait for the current quote.");
      if (!funding.balance) throw new Error("Your prediction balance could not be checked.");

      const stakeAtomic = BigInt(stakeE6);
      const availableAtomic = BigInt(funding.balance.availableE6);
      if (availableAtomic < stakeAtomic) {
        setPhase("funding");
        await funding.deposit(usdcInputFromE6(stakeAtomic - availableAtomic));
      }

      setPhase("quoting");
      const refreshed = await quote.refetch();
      if (!refreshed.data) {
        throw refreshed.error ?? new Error("The current odds could not be refreshed.");
      }

      setPhase("placing");
      return placeBookBet(refreshed.data, crypto.randomUUID());
    },
    onSuccess: (nextReceipt) => {
      void queryClient.invalidateQueries({ queryKey: ["prediction", "book", "board"] });
      void queryClient.invalidateQueries({ queryKey: BOOK_FUNDING_KEYS.balance });
      void queryClient.invalidateQueries({ queryKey: ["prediction", "book", "bets"] });
      toast.success(`Ticket ${nextReceipt.bookingCode} accepted`);
      onClear();
      onAccepted();
    },
    onSettled: () => setPhase("idle"),
  });

  const minimum = formatUsdcE6(pick.market.minStakeE6);
  const quotedOdds = quote.data ? formatDecimalOddsE6(quote.data.decimalOddsE6) : pick.outcome.odds;
  const potentialReturn = quote.data ? formatUsdcE6(quote.data.potentialPayoutE6) : "0.00";
  const busy = bet.isPending || phase !== "idle";
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);

  const balanceUnavailable = authenticated && !funding.balanceLoading && !funding.balance;
  const actionLabel = !authenticated
    ? "Sign in to bet"
    : phase === "funding"
      ? "Adding funds from Base..."
      : phase === "quoting"
        ? "Refreshing odds..."
        : phase === "placing"
          ? "Placing bet..."
          : "Place bet";

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      data-sensitive="other"
      data-broadcast-suspend
    >
      <div className="flex items-center justify-between px-4 pt-3 text-[10px] text-[#999]">
        <span className="rounded-md bg-[#3b3b3b] px-2 py-1">Single</span>
        <button
          type="button"
          disabled={busy}
          onClick={onClear}
          className="cursor-pointer hover:text-white disabled:opacity-40"
        >
          Clear
        </button>
      </div>
      <div className="p-3">
        <article className="rounded-lg border border-[#303030] bg-[#191919] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 gap-2.5">
              <MarketArtwork
                title={pick.market.title}
                imageUrl={pick.market.imageUrl}
                fallbackUrl={pick.event.imageUrl}
                className="size-10"
              />
              <div className="min-w-0">
                <p className="text-[9px] font-semibold text-[#777]">
                  {pick.event.league.name} · {pick.market.title}
                </p>
                <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[#ddd]">
                  {pick.event.title}
                </p>
                <p className="mt-1 text-[10px] font-semibold text-white">
                  {pick.outcome.title} <span className="text-[#80dbae]">{quotedOdds}</span>
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={onClear}
              aria-label={`Remove ${pick.outcome.title}`}
              className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full bg-[#292929] text-[#888] hover:text-white disabled:opacity-40"
            >
              x
            </button>
          </div>
        </article>
      </div>
      <div className="mt-auto border-t border-[#2b2b2b] p-4">
        <label className="block text-[10px] font-semibold text-[#999]">
          Stake (Base USDC)
          <div className="mt-2 flex h-11 items-center rounded-lg border border-[#383838] bg-[#191919] px-3">
            <span className="text-sm text-[#777]">$</span>
            <input
              value={stake}
              disabled={busy}
              onChange={(event) => setStake(event.target.value)}
              inputMode="decimal"
              aria-label="Stake in USDC"
              className="min-w-0 flex-1 bg-transparent px-2 text-sm font-semibold text-white outline-none"
            />
            <span className="text-[10px] text-[#888]">USDC</span>
          </div>
        </label>
        <div className="mt-3 space-y-1.5 text-[10px]">
          <div className="flex justify-between text-[#888]">
            <span>Projected odds</span>
            <span className="font-semibold text-white">
              {quote.isFetching ? "..." : quotedOdds}
            </span>
          </div>
          <div className="flex justify-between text-[#888]">
            <span>Projected return</span>
            <span className="font-semibold text-white">{potentialReturn} USDC</span>
          </div>
        </div>
        {quote.data && !quote.data.poolFormed ? (
          <p className="mt-3 text-[10px] leading-4 text-[#8ebed3]">
            Pool forming. Your stake is refunded if no opposing stake arrives before close.
          </p>
        ) : null}
        {!meetsMinimum ? (
          <p className="mt-3 text-[10px] text-[#ef9ca5]">
            Enter a stake of at least {minimum} USDC.
          </p>
        ) : quote.error ? (
          <p className="mt-3 text-[10px] text-[#ef9ca5]">{quote.error.message}</p>
        ) : balanceUnavailable ? (
          <p className="mt-3 text-[10px] text-[#ef9ca5]">
            Your prediction balance is unavailable. Try again in a moment.
          </p>
        ) : bet.error ? (
          <p className="mt-3 text-[10px] text-[#ef9ca5]">{bet.error.message}</p>
        ) : null}
        <button
          type="button"
          disabled={
            !ready ||
            !meetsMinimum ||
            quote.isFetching ||
            !quote.data ||
            busy ||
            (authenticated && (funding.balanceLoading || balanceUnavailable))
          }
          onClick={() => {
            if (!authenticated) {
              router.push("/auth?returnTo=%2Fprediction%2Flocal");
              return;
            }
            bet.mutate();
          }}
          className="mt-4 h-11 w-full cursor-pointer rounded-lg bg-[#b9fcff] text-xs font-bold text-[#171717] hover:bg-[#a8f5f8] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {actionLabel}
        </button>
        <p className="mt-2 text-center text-[9px] leading-4 text-[#666]">
          Only the missing amount is added from Base. Returns follow the final pool.
        </p>
      </div>
    </div>
  );
}

function MyBookBets({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const { authenticated } = useAuthSession();
  const query = useQuery({
    queryKey: ["prediction", "book", "bets"],
    queryFn: getBookBets,
    enabled: enabled && authenticated,
    staleTime: 10_000,
    refetchInterval: enabled ? 30_000 : false,
    retry: false,
  });

  if (!authenticated) {
    return (
      <div className="px-5 py-14 text-center">
        <p className="text-xs text-[#999]">Sign in to view your prediction tickets.</p>
        <button
          type="button"
          onClick={() => router.push("/auth?returnTo=%2Fprediction%2Flocal")}
          className="mt-4 cursor-pointer rounded-lg bg-[#b9fcff] px-5 py-2 text-xs font-semibold text-[#171717]"
        >
          Sign in
        </button>
      </div>
    );
  }
  if (query.isPending) {
    return <p className="px-5 py-12 text-center text-xs text-[#888]">Loading your tickets...</p>;
  }
  if (query.isError) {
    return (
      <div className="px-5 py-12 text-center">
        <p className="text-xs text-[#ef9ca5]">Your tickets could not be loaded.</p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="mt-3 cursor-pointer text-xs font-semibold text-[#b9fcff]"
        >
          Try again
        </button>
      </div>
    );
  }
  if (!query.data.bets.length) {
    return <p className="px-5 py-12 text-center text-xs text-[#888]">No tickets yet.</p>;
  }

  return (
    <div className="divide-y divide-[#2b2b2b] border-y border-[#2b2b2b]">
      {query.data.bets.map((ticket) => {
        const won = ticket.status === "won";
        const lost = ticket.status === "lost";
        const voided = ticket.status === "void";
        const tone = won
          ? "border-[#3d7b5f] bg-[#24503c] text-[#80dbae]"
          : lost
            ? "border-[#8d3e48] bg-[#51262c] text-[#ff9da8]"
            : voided
              ? "border-[#5b5b5b] bg-[#333] text-[#bbb]"
              : "border-[#47758f] bg-[#23465a] text-[#9ddfff]";
        return (
          <article key={ticket.id} className="flex min-h-[96px] items-center gap-3 px-4 py-3.5">
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-full border text-xs font-bold ${tone}`}
            >
              {won ? "✓" : lost ? "x" : voided ? "-" : "•"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-bold text-white">
                {ticket.selectionLabel}
              </span>
              <span className="mt-0.5 block truncate text-[9px] font-bold tracking-[0.08em] text-[#777] uppercase">
                {ticket.bookingCode} · {ticket.status}
              </span>
              <span className="mt-2 line-clamp-2 block text-[10px] leading-4 text-[#8ebed3]">
                {ticket.marketTitle}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-[14px] font-bold text-white tabular-nums">
                {formatUsdcE6(ticket.stakeE6)}
              </span>
              <span className="mt-0.5 block text-[9px] font-semibold text-[#777]">USDC</span>
            </span>
          </article>
        );
      })}
    </div>
  );
}

export function BookBetPanel({
  pick,
  onClear,
  onClose,
}: {
  pick: BookPick | null;
  onClear: () => void;
  onClose?: () => void;
}) {
  const [tab, setTab] = useState<"slip" | "bets">("slip");
  const [busy, setBusy] = useState(false);
  return (
    <PredictionBetPanel
      count={pick ? 1 : 0}
      tab={tab}
      busy={busy}
      onTabChange={setTab}
      onClose={onClose}
      slip={
        pick ? (
          <BetSlip
            key={pick.outcome.id}
            pick={pick}
            onClear={onClear}
            onAccepted={() => setTab("bets")}
            onBusyChange={setBusy}
          />
        ) : (
          <PredictionBetEmpty
            title="Ticket is empty"
            body="Select any odds on the board to place a single bet."
          />
        )
      }
      bets={
        <div className="min-h-0 flex-1 overflow-y-auto">
          <MyBookBets enabled={tab === "bets"} />
        </div>
      }
    />
  );
}

export function BookSportsbookView() {
  const [sport, setSport] = useState("");
  const [country, setCountry] = useState("");
  const [league, setLeague] = useState("");
  const [offset, setOffset] = useState(0);
  const [pick, setPick] = useState<BookPick | null>(null);
  const [desktopSlipOpen, setDesktopSlipOpen] = useState(false);
  const [mobileSlipOpen, setMobileSlipOpen] = useState(false);
  const capabilities = useQuery({
    queryKey: ["prediction", "book", "capabilities"],
    queryFn: getBookCapabilities,
    staleTime: 5 * 60_000,
  });
  const navigation = useQuery({
    queryKey: ["prediction", "book", "navigation"],
    queryFn: getBookNavigation,
    staleTime: 30_000,
  });
  const sports = navigation.data?.sports ?? [];
  const activeSport = sports.find(({ sport: item }) => item.slug === sport) ?? sports[0];
  const activeSportSlug = activeSport?.sport.slug ?? "";
  const leagues =
    activeSport?.countries.flatMap((item) =>
      item.leagues.map((entry) => ({ ...entry, country: item.country }))
    ) ?? [];
  const board = useQuery({
    queryKey: ["prediction", "book", "board", activeSportSlug, country, league, offset],
    queryFn: () => listBookBoard({ sport: activeSportSlug, country, league, offset }),
    enabled: Boolean(activeSportSlug),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
  const markets = (board.data?.events ?? []).flatMap((event) =>
    event.markets
      .filter((market) => !market.hidden && market.state === "active")
      .map((market) => ({ event, market }))
  );

  function selectSport(nextSport: string) {
    setSport(nextSport);
    setCountry("");
    setLeague("");
    setOffset(0);
  }

  function selectLeague(nextCountry: string, nextLeague: string) {
    setCountry(nextCountry);
    setLeague(nextLeague);
    setOffset(0);
  }

  function selectPick(nextPick: BookPick) {
    setPick(nextPick);
    if (window.matchMedia("(min-width: 1280px)").matches) setDesktopSlipOpen(true);
    else setMobileSlipOpen(true);
  }

  const renderBetPanel = (close?: () => void) => (
    <BookBetPanel pick={pick} onClear={() => setPick(null)} onClose={close} />
  );

  return (
    <main
      className={`relative min-h-screen bg-black text-white transition-[padding] duration-300 ease-in-out ${desktopSlipOpen ? "xl:pr-[326px]" : ""}`}
    >
      <section
        aria-label="Ark Matchday"
        className="mx-auto w-full max-w-[1440px] border-x border-b border-white/[0.07] bg-[#080808] p-3 sm:p-4 lg:px-6"
      >
        <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black shadow-[0_18px_50px_rgba(0,0,0,.35)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/images/matchday.png"
            alt="Ark Matchday: Carter Efe versus Speed Darlington and Phyna versus Nkechi Blessing"
            fetchPriority="high"
            className="block h-auto w-full object-contain"
          />
          <div className="pointer-events-none absolute inset-0 ring-1 ring-white/[0.06] ring-inset" />
        </div>
      </section>
      <nav
        aria-label="Local sports"
        className="flex h-12 [scrollbar-width:none] items-center gap-1 overflow-x-auto border-y border-white/[0.07] px-4 lg:px-6 [&::-webkit-scrollbar]:hidden"
      >
        {sports.map((entry) => {
          const selected = entry.sport.slug === activeSportSlug;
          return (
            <button
              key={entry.sport.id}
              type="button"
              onClick={() => selectSport(entry.sport.slug)}
              className={`inline-flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md px-3 text-[13px] font-semibold ${
                selected
                  ? "bg-[#172235] text-[#5ba8ff]"
                  : "text-[#858b96] hover:bg-white/[0.05] hover:text-white"
              }`}
            >
              <SportIcon sport={entry.sport.slug} name={entry.sport.name} className="size-4" />
              <span>{entry.sport.name}</span>
              <span className={selected ? "text-[#8dc3ff]" : "text-[#5f6570]"}>
                {entry.prematchGames}
              </span>
            </button>
          );
        })}
      </nav>

      <nav
        aria-label="Local leagues"
        className="flex h-12 [scrollbar-width:none] items-center gap-1 overflow-x-auto border-b border-white/[0.07] px-4 lg:px-6 [&::-webkit-scrollbar]:hidden"
      >
        <button
          type="button"
          onClick={() => selectLeague("", "")}
          className={`h-8 shrink-0 cursor-pointer rounded-md px-3 text-[13px] font-semibold ${
            !league ? "bg-[#172235] text-[#5ba8ff]" : "text-[#858b96] hover:text-white"
          }`}
        >
          All
        </button>
        {leagues.map((entry) => {
          const selected = league === entry.league.slug && country === entry.country.slug;
          return (
            <button
              key={`${entry.country.slug}:${entry.league.slug}`}
              type="button"
              onClick={() => selectLeague(entry.country.slug, entry.league.slug)}
              className={`h-8 shrink-0 cursor-pointer rounded-md px-3 text-[13px] font-semibold ${
                selected
                  ? "bg-[#172235] text-[#5ba8ff]"
                  : "text-[#858b96] hover:bg-white/[0.05] hover:text-white"
              }`}
            >
              {entry.league.name}
            </button>
          );
        })}
      </nav>

      <div className="mx-auto w-full max-w-[1440px] pb-24 xl:pb-10">
        <section aria-label="Open local markets" className="min-w-0 border-x border-white/[0.06]">
          <div className="flex h-12 items-center justify-between border-b border-white/[0.06] px-3">
            <button
              type="button"
              disabled
              className="flex h-8 items-center gap-2 rounded-md border border-white/10 bg-black px-2 text-sm text-[#d7d9de] disabled:opacity-60"
            >
              <span className="text-[#999]">◉</span>
              Live
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="h-8 rounded-md border border-white/10 bg-black px-3 text-sm text-[#d7d9de]"
              >
                All
              </button>
              <span className="rounded-md border border-[#2d3948] bg-[#172235] px-2 py-1 text-[9px] font-semibold text-[#8dc3ff]">
                {capabilities.data?.token.symbol ?? "USDC"} singles
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-3 min-[1280px]:px-5">
            <span className="text-[11px] font-semibold tracking-wide text-[#646a75] uppercase">
              Open markets
            </span>
            <span className="text-[11px] font-semibold text-[#858b96] tabular-nums">
              {markets.length} {markets.length === 1 ? "market" : "markets"}
            </span>
          </div>

          {navigation.isLoading || board.isLoading ? (
            <div className="divide-y divide-white/[0.06]">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="h-36 animate-pulse bg-white/[0.025]" />
              ))}
            </div>
          ) : navigation.error || board.error ? (
            <div className="px-5 py-20 text-center">
              <p className="text-sm font-medium text-[#999]">Markets could not load.</p>
              <button
                type="button"
                onClick={() => void Promise.all([navigation.refetch(), board.refetch()])}
                className="mt-4 cursor-pointer rounded-lg bg-[#5ba8ff] px-5 py-2 text-xs font-semibold text-black"
              >
                Try again
              </button>
            </div>
          ) : markets.length ? (
            markets.map(({ event, market }) => (
              <EventRow
                key={`${event.id}:${market.id}`}
                event={event}
                market={market}
                pick={pick}
                onPick={selectPick}
              />
            ))
          ) : (
            <div className="px-5 py-20 text-center text-sm text-[#858b96]">
              No matching events are open right now.
            </div>
          )}

          {markets.length ? (
            <footer className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3">
              <span className="text-[10px] text-[#7e7e7e]">
                {markets.length} open {markets.length === 1 ? "market" : "markets"}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - 24))}
                  className="cursor-pointer rounded-lg border border-[#333] px-3 py-2 text-[10px] text-[#999] disabled:opacity-25"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={board.data?.nextOffset == null}
                  onClick={() => setOffset(board.data?.nextOffset ?? offset)}
                  className="cursor-pointer rounded-lg border border-[#333] px-3 py-2 text-[10px] text-[#999] disabled:opacity-25"
                >
                  Next
                </button>
              </div>
            </footer>
          ) : null}
        </section>
      </div>
      <PredictionBetSidebarFrame
        count={pick ? 1 : 0}
        desktopOpen={desktopSlipOpen}
        mobileOpen={mobileSlipOpen}
        onDesktopOpenChange={setDesktopSlipOpen}
        onMobileOpenChange={setMobileSlipOpen}
        renderPanel={renderBetPanel}
      />
    </main>
  );
}
