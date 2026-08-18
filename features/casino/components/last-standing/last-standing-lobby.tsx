"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { usePrivy } from "@privy-io/react-auth";
import { getWalletAddress } from "@/lib/user";
import { usePortfolio } from "@/hooks/use-portfolio";
import type { SellPayload } from "@/lib/modal-types";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ModalShell } from "@/components/ui/modal-shell";
import { useCurrency } from "@/components/ui/currency-select";
import { useFx } from "@/hooks/use-fx";
import { formatMoney } from "@/lib/currencies";
import { useVaultLobby } from "@/features/casino/hooks/use-vault-lobby";
import { GameCard } from "@/features/casino/components/last-standing/game-card";
import { StartGameSheet } from "@/features/casino/components/last-standing/start-game-sheet";
import { LAST_MAN_START_LIVE } from "@/features/casino/lib/last-standing/start-gate";
import { FundSheet } from "@/features/casino/components/last-standing/fund-sheet";
import { GameBalanceCard } from "@/features/casino/components/last-standing/game-balance-card";
import { WinnersList } from "@/features/casino/components/last-standing/winners-list";
import { useVaultFeeds } from "@/features/casino/hooks/use-vault-feeds";
import { DEFAULT_ENTRY_USD } from "@/features/casino/lib/last-standing/stake";

// The lobby: every game currently taking joins, and the way to open one.
//
// v4 runs many games at once, so this is the screen the nav lands on; a game
// itself lives at /casino/last-standing/[gameId], which is also the link a
// player shares.
interface LastStandingLobbyProps {
  /** The portfolio's sell flow, for cashing the game balance back out. */
  renderWithdrawSheet: (payload: SellPayload, onClose: () => void) => ReactNode;
}

export function LastStandingLobby({ renderWithdrawSheet }: LastStandingLobbyProps) {
  const t = useTranslations("casino.lastStanding");
  const { user } = usePrivy();
  const address = getWalletAddress(user, "ethereum");
  const { games, gamesLoading, gamesError, refetchGames, connected, resync } = useVaultLobby();

  const [startOpen, setStartOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [fundOpen, setFundOpen] = useState(false);
  // Every settled game, for the history. The same feed the game pages scope
  // down to one game.
  const { winners, winnersLoading } = useVaultFeeds(connected);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  // The game runs on the wallet's ETH on Base. A player who holds only USDC
  // cannot open or join a game until some of it becomes ETH, and the lobby is
  // where they find that out, so the way to fund is here and not only on a
  // game page they cannot get into yet.
  const { tokens } = usePortfolio();
  const ethHolding = tokens.find(
    (tk) => tk.network === "base-mainnet" && tk.symbol.toUpperCase() === "ETH"
  );
  const balanceEth = ethHolding?.balance ?? 0;
  const balanceUsd = ethHolding?.valueUsd ?? 0;

  // One formatter for the whole list, so switching currency re-renders the
  // rows once rather than each row holding its own subscription.
  const { currency } = useCurrency();
  const { rate } = useFx();
  const formatUsd = useCallback(
    (usd: number) => formatMoney(usd, currency, rate(currency.code) ?? 1),
    [currency, rate]
  );

  const defaultEntry = useMemo(() => formatUsd(DEFAULT_ENTRY_USD), [formatUsd]);

  return (
    // The same page frame the rest of the casino and the dashboard use, so the
    // lobby sits off the sidebar and its right-hand status pill is not clipped.
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      {/* Stacked on a phone: the title block first, then the history button
          and the status pill on their own row. Side by side the eyebrow and
          the title were breaking into three lines each. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h1 className="ws-display mt-1.5 text-[26px] tracking-[-0.01em]">{t("title")}</h1>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="cursor-pointer rounded-full border border-white/12 bg-white/5 px-3.5 py-2 text-[12.5px] font-semibold text-white/85 transition-colors hover:bg-white/10"
          >
            🏆 {t("historyButton")}
          </button>
          {/* What is running, not whether the socket is up: the lobby polls the
              chain either way, and a reader takes this pill as the state of the
              games. */}
          <span className="flex items-center gap-1.5 text-[11.5px] font-normal text-white/45">
            <span
              className={`h-1.5 w-1.5 rounded-full ${games.length > 0 ? "bg-up animate-pulse" : "bg-white/25"}`}
            />
            {games.length > 0 ? t("gamesCount", { count: games.length }) : t("lobbyEmptyTitle")}
          </span>
        </div>
      </div>

      {/* Opening a game is the only way to earn the starter's 10%, so it is
          sold rather than tucked away as a secondary button — but only once
          the start gate is open, and only while NO game is live: the admin
          rule is one room at a time, so while one runs the pitch gives way to
          a note pointing at it. The list must have actually loaded before the
          pitch shows, or a stale empty frame would offer a start that the
          rule forbids. */}
      {LAST_MAN_START_LIVE &&
        (games.length > 0 ? (
          <div className="ws-inset mt-5 px-4 py-4">
            <div className="ws-display text-[17px] tracking-[-0.01em]">
              {t("startBlockedLiveTitle")}
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed font-normal text-white/60">
              {t("startBlockedLiveBody")}
            </p>
          </div>
        ) : gamesLoading || gamesError ? null : (
          <div className="ws-inset mt-5 px-4 py-4">
            <div className="ws-display text-[17px] tracking-[-0.01em]">
              {t("starterPitchTitle")}
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed font-normal text-white/60">
              {t("starterPitchBody")}
            </p>
            <button
              type="button"
              onClick={() => setStartOpen(true)}
              className="bg-accent mt-3.5 cursor-pointer rounded-[12px] px-5 py-2.5 text-[13.5px] font-semibold text-black"
            >
              {t("startCtaShort", { amount: defaultEntry })}
            </button>
          </div>
        ))}

      <div className="mt-3">
        <GameBalanceCard
          balanceUsd={balanceUsd}
          canWithdraw={balanceEth > 0}
          onWithdraw={() => setWithdrawOpen(true)}
          onAddMoney={() => setFundOpen(true)}
        />
      </div>

      <div className="mt-7 flex items-center justify-between">
        <Eyebrow>{t("liveGames")}</Eyebrow>
        {games.length > 0 ? (
          <span className="tnum text-[12px] font-normal text-white/40">
            {t("gamesCount", { count: games.length })}
          </span>
        ) : null}
      </div>

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

      <ModalShell open={startOpen} onClose={() => setStartOpen(false)}>
        <StartGameSheet
          ensureCanStart={async () => {
            const fresh = await refetchGames();
            return (fresh.data ?? []).length === 0;
          }}
          onClose={() => setStartOpen(false)}
          onStarted={resync}
          formatUsd={formatUsd}
          // Short on ETH at the stake sheet: hand over to funding rather than
          // leave a dead button. Back in the lobby with money, they start.
          onFund={() => {
            setStartOpen(false);
            setFundOpen(true);
          }}
        />
      </ModalShell>

      <ModalShell
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        contentKey="vault-history"
      >
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-[28px]">👑</span>
            <div>
              <div className="ws-display text-[20px] tracking-[-0.01em]">{t("historyTitle")}</div>
              <div className="text-[12px] font-normal text-white/50">{t("historySubtitle")}</div>
            </div>
          </div>
          <WinnersList winners={winners} loading={winnersLoading} emptyLabel={t("hallEmpty")} />
        </div>
      </ModalShell>

      <ModalShell open={fundOpen} onClose={() => setFundOpen(false)} contentKey="vault-fund">
        <FundSheet onClose={() => setFundOpen(false)} />
      </ModalShell>

      <ModalShell
        open={withdrawOpen && !!ethHolding}
        onClose={() => setWithdrawOpen(false)}
        contentKey="vault-withdraw"
      >
        {ethHolding
          ? renderWithdrawSheet(
              {
                symbol: ethHolding.symbol,
                name: ethHolding.name,
                network: ethHolding.network,
                address: ethHolding.address,
                decimals: ethHolding.decimals,
                balance: ethHolding.balance,
                rawBalance: ethHolding.rawBalance,
                priceUsd: ethHolding.priceUsd,
                logo: ethHolding.logo,
              },
              () => setWithdrawOpen(false)
            )
          : null}
      </ModalShell>
    </div>
  );
}
