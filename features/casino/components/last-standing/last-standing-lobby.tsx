"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuthSession } from "@/hooks/use-auth-session";
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
import { privateGameIds } from "@/features/casino/lib/last-standing/visibility";
import { publicGames } from "@/features/casino/lib/vault-game";
import type { VaultGame } from "@/features/casino/lib/vault-api";
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
// The gold-to-bark fill the Last Man wordmark is lettered in, the same pair the
// Marathon poster on the dashboard uses, so the lobby and the card people
// arrive through read as one identity.
const LAST_MAN_INK = "bg-gradient-to-r from-[#ac6900] to-[#462b00] bg-clip-text text-transparent";

export function LastStandingLobby() {
  const t = useTranslations("casino.lastStanding");
  const { evmAddress: address, profile } = useAuthSession();
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
  const games = useMemo(() => publicGames(allGames, privateGameIds()), [allGames]);

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
          {/* The hero, in the Arkade's own Last Man world: the gold sky, the
              clouds and the hourglass the Marathon poster on the dashboard is
              drawn in (features/discovery/components/arkade-cards.tsx). The
              lobby used to wear a dark card with pale gold type, which read as
              a different product from the card people arrive through.

              The art is the poster's, the content is the lobby's: this one has
              to say whether anything is running and what it costs to join, so
              the live state and the facts sit on the gold rather than a second
              card underneath it. */}
          <div className="relative mt-4 overflow-hidden rounded-[22px] bg-[linear-gradient(126.36deg,#ffd52d_36.667%,#f5c500_87.735%)]">
            {/* The two cloud bands, in the order the poster paints them. Each
                export is the whole card rather than a strip. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[url('/market/lastman-clouds-back.png')] bg-[length:100%_100%] bg-no-repeat"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[url('/market/lastman-clouds-front.png')] bg-[length:100%_100%] bg-no-repeat"
            />
            {/* The hourglass, with a blurred copy screened over it for the glow
                the poster puts around the glass. Hidden below sm: at a phone's
                width it sits under the type instead of beside it. */}
            <div
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-[-2%] hidden h-[170px] w-[170px] -translate-y-1/2 rotate-[13.21deg] sm:block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/market/lastman-hourglass.png"
                alt=""
                width={500}
                height={500}
                className="h-full w-full object-contain"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/market/lastman-hourglass.png"
                alt=""
                width={500}
                height={500}
                className="absolute inset-0 h-full w-full object-contain mix-blend-screen blur-[5.71px]"
              />
            </div>

            <div className="relative z-[1] flex flex-col gap-3.5 px-5 py-5 sm:px-7 sm:py-6">
              <div className="max-w-[46ch] min-w-0">
                {/* The wordmark, lettered in the poster's gold-to-bark ink so
                    the two read as one identity. */}
                <h1
                  className={`ws-chewy text-[30px] leading-[1] tracking-[-0.53px] sm:text-[38px] ${LAST_MAN_INK}`}
                >
                  {t("heroName")}
                </h1>
                {/* The pitch that used to sit in a card of its own below. One
                    banner rather than two stacked, which is what kept the top
                    of the lobby to a screenful. Ink rather than white: the
                    ground is bright and white fails contrast at every size. */}
                <p className="mt-2 text-[14px] leading-[1.35] font-bold text-[#3a2400]">
                  {t("starterPitchTitle")}
                </p>
                <p className="mt-1 text-[12.5px] leading-[1.45] font-medium text-[#4a2f00]/80">
                  {t("starterPitchBody")}
                </p>
              </div>

              {/* The button on the gold: the card's own ink, so it reads as
                  the one thing to press rather than a third pale pill among
                  the facts. Hidden until the list has loaded, or a stale empty
                  frame would promise a public game the slot forbids. */}
              {LAST_MAN_START_LIVE && !gamesLoading && !gamesError ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setStartOpen(true)}
                    className="ws-pressable cursor-pointer rounded-full bg-[#2a1a00] px-5 py-2.5 text-[13.5px] font-semibold text-[#ffd52d] transition-colors hover:bg-[#3a2400]"
                  >
                    {defaultEntry === null
                      ? t("startTitle")
                      : t("startCtaShort", { amount: defaultEntry })}
                  </button>
                </div>
              ) : null}

              {/* The facts and the live state. On the gold they are dark glass
                  rather than the white-on-dark pills the old card used. */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-2 rounded-full bg-[#2a1a00]/85 px-3 py-1.5 text-[11.5px] font-semibold text-[#ffd52d]">
                  <span
                    className={`size-1.5 rounded-full ${games.length > 0 ? "animate-pulse bg-[#7ee2a8]" : "bg-white/30"}`}
                  />
                  {games.length > 0
                    ? t("gamesCount", { count: games.length })
                    : t("lobbyEmptyTitle")}
                </span>
                {[
                  { v: "60s", k: t("howFactTimer") },
                  { v: defaultEntry ?? "\u2014", k: t("howFactStake") },
                  { v: "50%", k: t("splitWinner") },
                ].map((chip) => (
                  <span
                    key={chip.k}
                    className="flex items-baseline gap-1.5 rounded-full border border-[#4a2f00]/20 bg-white/25 px-2.5 py-1.5 backdrop-blur-sm"
                  >
                    <span className="tnum text-[12.5px] font-bold text-[#3a2400]">{chip.v}</span>
                    <span className="text-[10.5px] font-medium text-[#4a2f00]/70">{chip.k}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

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
              games.map((game: VaultGame) => (
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
