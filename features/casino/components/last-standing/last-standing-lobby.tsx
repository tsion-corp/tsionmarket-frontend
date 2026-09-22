"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { usePrivy } from "@privy-io/react-auth";
import { deriveProfile, getWalletAddress } from "@/lib/user";
import { Tabs, type Tab } from "@/components/ui/tabs";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ModalShell } from "@/components/ui/modal-shell";
import { useCurrency } from "@/components/ui/currency-select";
import { useFx } from "@/hooks/use-fx";
import { formatMoney } from "@/lib/currencies";
import { useVaultLobby } from "@/features/casino/hooks/use-vault-lobby";
import { GameCard } from "@/features/casino/components/last-standing/game-card";
import { StartGameSheet } from "@/features/casino/components/last-standing/start-game-sheet";
import { LAST_MAN_START_LIVE } from "@/features/casino/lib/last-standing/start-gate";
import {
  canStartPublic,
  lobbyGames,
  privateGameIds,
} from "@/features/casino/lib/last-standing/visibility";
import { usePayoutRefresh } from "@/features/casino/hooks/use-payout-refresh";
import { LeaderboardBoard } from "@/features/casino/components/last-standing/leaderboard-board";
import { HowItWorks } from "@/features/casino/components/last-standing/how-it-works";
import { useVaultLeaderboard } from "@/features/casino/hooks/use-vault-leaderboard";
import { useDefaultEntry } from "@/features/casino/hooks/use-default-entry";

type LobbyTab = "game" | "leaderboard" | "how";

// The lobby: every game currently taking joins, and the way to open one.
//
// The vault runs many games at once, so this is the screen the nav lands on; a game
// itself lives at /casino/last-standing/[gameId], which is also the link a
// player shares.
export function LastStandingLobby() {
  const t = useTranslations("casino.lastStanding");
  const { user } = usePrivy();
  const address = getWalletAddress(user, "ethereum");
  const profile = deriveProfile(user);
  const [tab, setTab] = useState<LobbyTab>("game");
  const {
    games: allGames,
    gamesLoading,
    gamesError,
    gamesStale,
    refetchGames,
    resync,
  } = useVaultLobby();

  // Keyed on the games list rather than read every render: the lobby
  // re-renders on every socket tick, and this reads localStorage and parses
  // JSON. The store only changes when this browser starts a private game,
  // which refreshes the list too, so the list is a sound trigger.
  const { games, lobbySlotFree } = useMemo(() => {
    const hidden = privateGameIds();
    return {
      // The lobby holds one slot. Everything else running is link-only.
      games: lobbyGames(allGames, hidden),
      lobbySlotFree: canStartPublic(allGames, hidden),
    };
  }, [allGames]);

  const [startOpen, setStartOpen] = useState(false);
  // Every settled game, for the history. The same feed the game pages scope
  // down to one game.

  // No balance card here any more: the game is played in USDC, which is the
  // spendable balance the shell already shows, so a second figure for the same
  // money was only ever a thing to keep in sync. A round this wallet wins while
  // it watches from here still pays out on the socket's settle frame, and this
  // confirms it with one read.
  usePayoutRefresh(address);

  // One formatter for the whole list, so switching currency re-renders the
  // rows once rather than each row holding its own subscription.
  const { currency } = useCurrency();
  const { rate } = useFx();
  const formatUsd = useCallback(
    (usd: number) => formatMoney(usd, currency, rate(currency.code) ?? 1),
    [currency, rate]
  );

  // What a game opens at today: the contract floor priced live, or our
  // preferred entry if that is higher. Until it is known the button says
  // "Start a game" with no number rather than a number that might be wrong.
  // Only fetched once the board is actually opened.
  const leaderboard = useVaultLeaderboard(tab === "leaderboard");

  const tabs: Tab[] = [
    { id: "game", label: t("tabLastMan") },
    { id: "leaderboard", label: t("tabLeaderboard") },
    { id: "how", label: t("tabHowItWorks") },
  ];

  const { usd: defaultEntryUsd } = useDefaultEntry();
  const defaultEntry = useMemo(
    () => (defaultEntryUsd === null ? null : formatUsd(defaultEntryUsd)),
    [defaultEntryUsd, formatUsd]
  );

  return (
    // The same page frame the rest of the casino and the dashboard use, so the
    // lobby sits off the sidebar and its right-hand status pill is not clipped.
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      {/* The strip sits directly under the back link, so the three faces of
          this game are the first thing a new player sees. */}
      <div className="border-b border-white/[0.07]">
        <Tabs
          tabs={tabs}
          active={tab}
          onSelect={(id) => setTab(id as LobbyTab)}
          label={t("tabsLabel")}
        />
      </div>

      {tab === "game" ? (
        <>
          {/* The hero. The Arkade banner's warm gold over a deep ground, so the
          game reads as part of that shelf rather than a plain page header. */}
          <div className="relative mt-4 overflow-hidden rounded-[22px] border border-white/10">
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(120% 140% at 8% 0%, #2a1c07 0%, #140f08 42%, #08070a 100%)",
              }}
            />
            {/* Two lamps, warm at the top-left and cool at the far right, so the
            card has a direction of light instead of a flat wash. */}
            <div
              aria-hidden
              className="pointer-events-none absolute -top-28 -left-16 h-72 w-72 rounded-full blur-[90px]"
              style={{ background: "rgba(255,225,120,0.28)" }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -right-20 -bottom-28 h-72 w-72 rounded-full blur-[100px]"
              style={{ background: "rgba(120,170,255,0.16)" }}
            />
            {/* A fine rule grid, barely there, for texture under the type. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(255,255,255,0.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.10) 1px, transparent 1px)",
                backgroundSize: "54px 54px",
                maskImage: "radial-gradient(90% 80% at 30% 0%, #000 0%, transparent 75%)",
              }}
            />

            <div className="relative flex flex-col gap-4 px-5 py-5 sm:px-7 sm:py-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
              <div className="min-w-0">
                <span className="text-[10.5px] font-semibold tracking-[0.16em] text-[#ffe178]/80 uppercase">
                  {t("eyebrow")}
                </span>
                <h1 className="mt-1.5 font-serif text-[30px] leading-[1.02] font-semibold tracking-[-0.01em] text-[#ffe178] sm:text-[36px]">
                  {t("title")}
                </h1>
                {/* Wide enough to stay on two lines. At 48ch it ran to three
                    and the card grew a whole row taller for no extra meaning. */}
                <p className="mt-2 max-w-[72ch] text-[13px] leading-[1.5] font-normal text-white/60">
                  {t("howIntro")}
                </p>
              </div>

              {/* The numbers and the status share the right-hand side, which is
                  what keeps the card to one band of height on a wide screen. */}
              <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                {[
                  { v: "60s", k: t("howFactTimer") },
                  { v: defaultEntry ?? "—", k: t("howFactStake") },
                  { v: "50%", k: t("splitWinner") },
                ].map((chip) => (
                  <span
                    key={chip.k}
                    className="flex items-baseline gap-1.5 rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-1 backdrop-blur-sm"
                  >
                    <span className="tnum text-[12.5px] font-semibold text-white">{chip.v}</span>
                    <span className="text-[10.5px] font-normal text-white/50">{chip.k}</span>
                  </span>
                ))}
                <span className="flex items-center gap-2 rounded-full border border-white/12 bg-black/40 px-3 py-1 text-[11.5px] font-medium text-white/75 backdrop-blur-sm">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${games.length > 0 ? "bg-up animate-pulse" : "bg-white/25"}`}
                  />
                  {games.length > 0
                    ? t("gamesCount", { count: games.length })
                    : t("lobbyEmptyTitle")}
                </span>
              </div>
            </div>
          </div>

          {/* Starting is always on offer now: only a PUBLIC game competes for
              the lobby's single slot, so a taken slot changes what the button
              opens rather than whether it exists. The list must have loaded
              first, or a stale empty frame would promise a public game that
              the slot forbids. */}
          {LAST_MAN_START_LIVE && !gamesLoading && !gamesError ? (
            <div className="ws-inset mt-5 px-4 py-4">
              <div className="ws-display text-[17px] tracking-[-0.01em]">
                {lobbySlotFree ? t("starterPitchTitle") : t("starterPitchTitlePrivate")}
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed font-normal text-white/60">
                {lobbySlotFree ? t("starterPitchBody") : t("starterPitchBodyPrivate")}
              </p>
              <button
                type="button"
                onClick={() => setStartOpen(true)}
                className="bg-accent mt-3.5 cursor-pointer rounded-[12px] px-5 py-2.5 text-[13.5px] font-semibold text-black"
              >
                {defaultEntry === null
                  ? t("startTitle")
                  : t("startCtaShort", { amount: defaultEntry })}
              </button>
            </div>
          ) : null}

          <div className="mt-7 flex items-center justify-between">
            <Eyebrow>{t("liveGames")}</Eyebrow>
            {games.length > 0 ? (
              <span className="tnum text-[12px] font-normal text-white/40">
                {t("gamesCount", { count: games.length })}
              </span>
            ) : null}
          </div>

          {gamesStale ? (
            <p role="status" className="mt-3 text-[12.5px] leading-[1.5] font-normal text-white/50">
              {t("lobbyStale")}
            </p>
          ) : null}

          <div className="mt-3 flex flex-col gap-2">
            {gamesLoading ? (
              // Fixed-height skeletons so the list does not jump when they resolve.
              Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="ws-inset h-[86px] animate-pulse bg-white/[0.03]" />
              ))
            ) : gamesError ? (
              <div className="ws-inset px-4 py-6 text-center">
                <p className="text-[13.5px] font-normal text-white/60">{t("lobbyError")}</p>
                <button
                  type="button"
                  onClick={() => void refetchGames()}
                  className="text-accent mt-2 cursor-pointer text-[13px] font-semibold hover:underline"
                >
                  {t("retry")}
                </button>
              </div>
            ) : games.length === 0 ? (
              <div className="ws-inset px-4 py-8 text-center">
                <p className="text-[14px] font-medium text-white">{t("lobbyEmptyTitle")}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed font-normal text-white/55">
                  {t("lobbyEmptyBody")}
                </p>
              </div>
            ) : (
              games.map((game) => (
                <GameCard key={game.gameId} game={game} address={address} formatUsd={formatUsd} />
              ))
            )}
          </div>
        </>
      ) : tab === "leaderboard" ? (
        <section className="mt-5">
          <h2 className="ws-display text-[22px] tracking-[-0.01em]">{t("leaderboardTitle")}</h2>
          <p className="mt-1 text-[13px] leading-[1.55] font-normal text-white/55">
            {t("leaderboardSubtitle")}
          </p>
          <LeaderboardBoard
            rows={leaderboard.rows}
            loading={leaderboard.loading}
            error={leaderboard.error}
            onRetry={leaderboard.refetch}
            address={address}
            selfName={profile.name}
          />
        </section>
      ) : (
        <HowItWorks
          onStart={LAST_MAN_START_LIVE ? () => setStartOpen(true) : undefined}
          startLabel={
            defaultEntry === null ? t("startTitle") : t("startCtaShort", { amount: defaultEntry })
          }
        />
      )}

      <ModalShell open={startOpen} onClose={() => setStartOpen(false)}>
        <StartGameSheet
          canStartPublic={lobbySlotFree}
          ensureCanStart={async () => {
            const fresh = await refetchGames();
            return canStartPublic(fresh.data ?? [], privateGameIds());
          }}
          onClose={() => setStartOpen(false)}
          onStarted={resync}
          formatUsd={formatUsd}
          // Nothing to hand over to when the balance is short: the stake comes
          // off the USDC balance, so the sheet says the amount is more than
          // they hold rather than offering a conversion that no longer exists.
        />
      </ModalShell>

      {/* No "add money" and no "withdraw". Both existed to convert the
          player's USDC into the ETH a v4 game needed and back again; a v5 game
          is played in USDC, which IS the spendable balance. See
          ADR-2026-09-15-last-man-v5-usdc, decision 5. */}
    </div>
  );
}
