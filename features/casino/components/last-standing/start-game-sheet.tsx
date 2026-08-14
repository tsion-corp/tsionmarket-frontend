"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { track } from "@/lib/analytics/mixpanel";
import { friendlyError } from "@/lib/errors";
import { SheetNav } from "@/components/ui/sheet-nav";
import { usePrices } from "@/hooks/use-prices";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useVaultActions, readMinStartStake } from "@/features/casino/hooks/use-vault-actions";
import { followGame } from "@/features/casino/lib/last-standing/followed-game";
import {
  DEFAULT_ENTRY_USD,
  formatEth,
  stakeToSend,
  usdToWei,
  weiToUsd,
} from "@/features/casino/lib/last-standing/stake";

interface StartGameSheetProps {
  onClose: () => void;
  onStarted: () => void;
  /** Formats a USD figure in the currency the user picked. */
  formatUsd: (usd: number) => string;
}

// The pot split, fixed by the contract. Shown before signing because opening a
// game is the only way to earn the starter's share, and nobody will do it who
// does not know it exists.
const SPLIT = [
  { key: "splitWinner", pct: 50 },
  { key: "splitPlatform", pct: 40 },
  { key: "splitStarter", pct: 10 },
] as const;

export function StartGameSheet({ onClose, onStarted, formatUsd }: StartGameSheetProps) {
  const t = useTranslations("casino.lastStanding");
  const router = useRouter();
  const { startGame, starting } = useVaultActions();
  const ethPrice = usePrices(["ETH"])["ETH"] ?? 0;

  // Null until they type: the field shows the cheapest stake the contract will
  // actually accept, which is not always our preferred figure.
  const [edited, setEdited] = useState<string | null>(null);

  // The contract's floor. Read rather than assumed, because a stake under it
  // reverts, and because our default is only honest if it clears it.
  //
  // "failed" is kept apart from "not loaded yet". Treating a failed read as a
  // zero floor is what let this sheet advertise a price the chain would not
  // take: the clamp had nothing to clamp against and the button quoted the
  // wrong number confidently.
  const [floorWei, setFloorWei] = useState<bigint | null>(null);
  const [floorFailed, setFloorFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readMinStartStake()
      .then((value) => {
        if (!cancelled) setFloorWei(value);
      })
      .catch(() => {
        if (!cancelled) setFloorFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // What the wallet needs to hold. The stake is native ETH on Base, so a user
  // whose balance is all USDC cannot start a game however much it is worth.
  const { tokens } = usePortfolio();
  const ethBalance =
    tokens.find((tk) => tk.network === "base-mainnet" && tk.symbol.toUpperCase() === "ETH")
      ?.balance ?? 0;

  // The default is the greater of our preferred entry and the contract's floor,
  // so the field, the ETH figure and the button always agree. Lower the floor
  // on-chain and this drops back to the preferred entry on its own.
  const floorUsd = floorWei === null ? 0 : weiToUsd(floorWei, ethPrice);
  const defaultUsd = Math.max(DEFAULT_ENTRY_USD, floorUsd);
  const usd = edited ?? (defaultUsd > 0 ? defaultUsd.toFixed(2) : "");

  const wanted = useMemo(() => usdToWei(Number(usd), ethPrice), [usd, ethPrice]);
  const send = useMemo(
    () => (floorWei === null ? 0n : stakeToSend(wanted, floorWei)),
    [wanted, floorWei]
  );
  // They typed something under the floor, so the sheet says the number moved
  // rather than quietly charging more than the button promised.
  const liftedToFloor = floorWei !== null && wanted > 0n && send > wanted;
  const sendUsd = weiToUsd(send, ethPrice);
  const sendEth = Number(formatEth(send, 18));
  const shortOnEth = send > 0n && ethBalance < sendEth;

  const ready = send > 0n && ethPrice > 0 && !starting && !floorFailed && !shortOnEth;

  const confirm = async () => {
    if (!ready) return;
    try {
      const { gameId } = await startGame(send);
      // The pop-out timer follows whatever you last put money into.
      if (gameId !== null) followGame(gameId);
      track("game_staked", { game: "last_man", amount_usd: sendUsd });
      toast.success(t("toastGameStarted"));
      onStarted();
      // Straight into the game they just opened, so they can share it.
      if (gameId !== null) router.push(`/casino/last-standing/${gameId}`);
      onClose();
    } catch (error) {
      toast.error(friendlyError(error, t("toastStartFailed")));
    }
  };

  return (
    <div>
      <SheetNav title={t("startTitle")} onBack={onClose} />

      <p className="text-[13.5px] leading-relaxed font-normal text-white/60">{t("startBody")}</p>

      <label className="mt-5 block">
        <span className="text-[11.5px] font-normal tracking-[0.04em] text-white/40 uppercase">
          {t("startStakeLabel")}
        </span>
        <span className="focus-within:border-accent/45 mt-2 flex items-center gap-2 rounded-[13px] border border-white/10 bg-black/35 px-3.5 transition-colors">
          <span className="text-[15px] font-medium text-white/45">$</span>
          <input
            inputMode="decimal"
            value={usd}
            onChange={(e) => {
              if (/^\d*\.?\d*$/.test(e.target.value)) setEdited(e.target.value);
            }}
            className="tnum w-full bg-transparent py-3 font-sans text-[15px] text-white outline-none placeholder:text-white/30"
          />
          <span className="tnum shrink-0 text-[12.5px] font-normal text-white/40">
            {send > 0n ? `${formatEth(send)} ETH` : "—"}
          </span>
        </span>
      </label>

      <p className="mt-2 text-[12px] leading-relaxed font-normal text-white/45">
        {t("startStakeNote")}
      </p>

      {liftedToFloor ? (
        <p className="mt-2 text-[12px] leading-relaxed font-normal text-white/70">
          {t("startFloorRaised", { amount: formatUsd(sendUsd) })}
        </p>
      ) : null}

      {floorFailed ? (
        <p className="mt-2 text-[12px] leading-relaxed font-normal text-[#e3a49a]">
          {t("startFloorUnavailable")}
        </p>
      ) : shortOnEth ? (
        <p className="mt-2 text-[12px] leading-relaxed font-normal text-[#e3a49a]">
          {t("startNeedsEth", { amount: formatUsd(sendUsd) })}
        </p>
      ) : null}

      <div className="ws-inset mt-5 divide-y divide-white/6">
        {SPLIT.map((row) => (
          <div key={row.key} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-[13px] font-normal text-white/60">{t(row.key)}</span>
            <span className="tnum text-[13.5px] font-semibold text-white">{row.pct}%</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void confirm()}
        disabled={!ready}
        className="bg-accent mt-5 w-full cursor-pointer rounded-[13px] py-3.5 text-[14.5px] font-semibold text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        {starting
          ? t("startPending")
          : floorFailed
            ? t("startUnavailable")
            : shortOnEth
              ? t("startNeedsEthCta")
              : send > 0n
                ? t("startCta", { amount: formatUsd(sendUsd) })
                : t("loading")}
      </button>
    </div>
  );
}
