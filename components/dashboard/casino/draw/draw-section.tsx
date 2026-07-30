"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useBuyDrawEntries, useDrawRound } from "@/hooks/use-casino-draw";
import { useCasinoWallet } from "@/hooks/use-casino-wallet";
import {
  CasinoEmpty,
  CasinoError,
  CasinoLoading,
} from "@/components/dashboard/casino/casino-state";
import { NumberChip } from "@/components/dashboard/casino/draw/number-chip";
import { amountUsd } from "@/lib/casino/money";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

// Ticks down to the round's close. Derived from the server's closesAt rather
// than a seconds value, so a reload or a slept tab shows the true time left.
function useCountdownTo(iso: string | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!iso) return 0;
  return Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000));
}

function formatCountdown(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export function DrawSection() {
  const t = useTranslations("casino.draw");
  const wallet = useCasinoWallet();
  const { round, pastResults, isLoading, error } = useDrawRound();
  const buy = useBuyDrawEntries();

  const [mainNumbers, setMainNumbers] = useState<number[]>([]);
  const [bonusNumber, setBonusNumber] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);

  const secondsLeft = useCountdownTo(round?.closesAt);

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[900px] px-4 pt-10 pb-20">
        <CasinoError error={error} subject={t("subject")} />
      </div>
    );
  }
  if (isLoading || !round) {
    return (
      <div className="mx-auto w-full max-w-[900px] px-4 pt-10 pb-20">
        <CasinoLoading label={t("loading")} rows={5} />
      </div>
    );
  }

  const toggleMain = (num: number) => {
    setMainNumbers((prev) => {
      if (prev.includes(num)) return prev.filter((n) => n !== num);
      if (prev.length >= round.mainPicks) return prev;
      return [...prev, num];
    });
  };

  const quickPick = () => {
    const picks = new Set<number>();
    while (picks.size < round.mainPicks) picks.add(1 + Math.floor(Math.random() * round.mainPool));
    setMainNumbers([...picks]);
    setBonusNumber(1 + Math.floor(Math.random() * round.bonusPool));
  };

  const entryCostUsd = amountUsd(round.entryCost, wallet.unitPriceUsd);
  const totalUsd = entryCostUsd * quantity;
  const totalWei = BigInt(round.entryCost.wei) * BigInt(quantity);
  const affordable = wallet.canAfford(totalWei);
  const complete = mainNumbers.length === round.mainPicks && bonusNumber !== null;
  const open = round.state === "open" && secondsLeft > 0;
  const canBuy = complete && affordable && open && !buy.isPending;

  const onBuy = async () => {
    if (!wallet.connected) {
      toast.error(t("toastConnect"));
      return;
    }
    if (!canBuy || bonusNumber === null) return;
    const id = toast.loading(t("toastBuying"));
    try {
      await buy.mutateAsync({
        roundId: round.id,
        mainNumbers: [...mainNumbers].sort((a, b) => a - b),
        bonusNumber,
        quantity,
      });
      toast.success(t("toastIn"), { id });
      setMainNumbers([]);
      setBonusNumber(null);
      setQuantity(1);
    } catch (e) {
      toast.error(friendlyError(e, t("toastBuyFailed")), { id });
    }
  };

  const numberButton = (num: number, selected: boolean, gold: boolean, onClick: () => void) => (
    <button
      key={num}
      onClick={onClick}
      disabled={!open}
      className={`tnum aspect-square cursor-pointer rounded-lg border text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        selected
          ? gold
            ? "border-grey-100 bg-grey-100 text-ink font-bold"
            : "border-accent bg-accent text-ink font-bold"
          : "border-white/10 bg-black/40 text-white hover:border-white/25"
      }`}
    >
      {num}
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 pt-8 pb-20 sm:px-6">
      <div className="ws-glass relative mb-6 overflow-hidden rounded-[20px] p-9 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-36 left-1/2 h-[280px] w-[480px] -translate-x-1/2 bg-[radial-gradient(ellipse,rgba(212,212,216,0.13),transparent_70%)]"
        />
        <div className="mb-2.5 text-[11px] font-normal tracking-[0.06em] text-white/50 uppercase">
          {t("jackpot")}
        </div>
        <div className="ws-display tnum text-grey-100 mb-2.5 text-[clamp(38px,7vw,56px)] leading-none">
          {wallet.format(amountUsd(round.jackpot, wallet.unitPriceUsd))}
        </div>
        <div className="tnum text-[15px]">
          {open ? (
            <>
              {t("nextDrawIn")} <span className="text-down">{formatCountdown(secondsLeft)}</span>
            </>
          ) : (
            <span className="text-white/55">
              {round.state === "drawing" ? t("drawingNow") : t("roundClosedNote")}
            </span>
          )}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-[1.2fr_1fr]">
        <div className="ws-glass rounded-2xl p-5.5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[13px] font-normal text-white/55">
              {t("pickNumbers", { count: round.mainPicks, max: round.mainPool })}
            </div>
            <button
              onClick={quickPick}
              disabled={!open}
              className="text-accent cursor-pointer rounded-full border border-white/15 px-3.5 py-1.5 font-sans text-[12px] disabled:opacity-50"
            >
              {t("quickPick")}
            </button>
          </div>
          <div className="mb-4 grid grid-cols-7 gap-1.5">
            {Array.from({ length: round.mainPool }, (_, i) => i + 1).map((num) =>
              numberButton(num, mainNumbers.includes(num), false, () => toggleMain(num))
            )}
          </div>
          <div className="mb-2 text-[13px] font-normal text-white/55">
            {t("bonusNumber", { max: round.bonusPool })}
          </div>
          <div className="grid grid-cols-10 gap-1.5">
            {Array.from({ length: round.bonusPool }, (_, i) => i + 1).map((num) =>
              numberButton(num, bonusNumber === num, true, () => setBonusNumber(num))
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="ws-glass rounded-2xl p-5">
            <div className="mb-2.5 flex items-center justify-between text-[13px] font-normal text-white/55">
              <span>{t("entries")}</span>
              <span className="tnum">
                {t("balance", { amount: wallet.format(wallet.balanceUsd) })}
              </span>
            </div>
            <div className="mb-3 flex items-center gap-3.5">
              <button
                onClick={() => setQuantity((n) => Math.max(1, n - 1))}
                className="h-8 w-8 cursor-pointer rounded-lg border border-white/15 text-[16px] text-white"
              >
                −
              </button>
              <div className="tnum text-[16px]">{t("entryCount", { count: quantity })}</div>
              <button
                onClick={() => setQuantity((n) => Math.min(20, n + 1))}
                className="h-8 w-8 cursor-pointer rounded-lg border border-white/15 text-[16px] text-white"
              >
                +
              </button>
            </div>
            <div className="ws-display tnum text-grey-100 mb-3.5 text-[22px]">
              {wallet.format(totalUsd)}
            </div>
            <button
              onClick={() => void onBuy()}
              disabled={!canBuy}
              className={`w-full rounded-full p-3 font-sans text-[13px] font-bold ${
                canBuy
                  ? "text-ink cursor-pointer bg-white"
                  : "cursor-not-allowed bg-white/10 text-white/40"
              }`}
            >
              {buy.isPending
                ? t("buying")
                : !open
                  ? t("roundClosed")
                  : mainNumbers.length < round.mainPicks
                    ? t("pickMore", { count: round.mainPicks - mainNumbers.length })
                    : bonusNumber === null
                      ? t("pickBonus")
                      : !affordable
                        ? t("notEnoughBalance")
                        : t("confirmEntry")}
            </button>
            <Link
              href="/casino/draw/entries"
              className="text-accent mt-2.5 block text-center text-[12px]"
            >
              {t("myEntries")}
            </Link>
          </div>

          <div className="ws-glass rounded-2xl p-5">
            <div className="mb-2.5 text-[13px] font-normal text-white/55">{t("prizeTiers")}</div>
            {round.prizeTiers.map((t) => (
              <div
                key={t.label}
                className="flex justify-between border-t border-white/6 py-1.5 text-[12.5px]"
              >
                <span className="font-normal text-white/50">{t.label}</span>
                <span className="tnum text-grey-100">
                  {wallet.format(amountUsd(t.prize, wallet.unitPriceUsd))}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-2.5 text-[13px] font-normal text-white/55">{t("pastDraws")}</div>
      {pastResults.length === 0 ? (
        <CasinoEmpty>{t("noDrawsSettled")}</CasinoEmpty>
      ) : (
        <div className="flex gap-3.5 overflow-x-auto pb-1">
          {pastResults.map((d) => (
            <div key={d.roundId} className="ws-inset flex-none rounded-xl px-3.5 py-2.5">
              <div className="mb-1.5 text-[10.5px] font-normal text-white/40">
                {new Date(d.drawnAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </div>
              <div className="flex gap-1.5">
                {d.mainNumbers.map((num) => (
                  <NumberChip key={num} num={num} size={22} />
                ))}
                <NumberChip num={d.bonusNumber} variant="bonus" size={22} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
