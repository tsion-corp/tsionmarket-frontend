"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DiceIcon } from "@/components/ui/icons";
import { LotteryBall } from "@/features/casino/components/arkball/lottery-ball";
import type {
  LotteryEligibility,
  LotterySelection,
  LotteryTicket,
} from "@/features/casino/lib/api/lottery";
import {
  completeLotterySelection,
  formatLotteryUsdc,
  lotterySalesOpen,
  lotterySelectionKey,
  POWER_BALL_MAX,
  toggleWhiteBall,
  WHITE_BALL_COUNT,
  WHITE_BALL_MAX,
} from "@/features/casino/lib/lottery";
import { toBaseUnits } from "@/lib/trade/math";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

type PickerStep = "white" | "arkball";

interface TicketBuilderProps {
  drawId: string;
  drawStatus: string;
  salesCloseAt: string;
  priceUsdc: string;
  availableUsdc: string;
  eligibility: LotteryEligibility | null;
  ownedTickets: LotteryTicket[];
  quickPick: () => Promise<LotterySelection>;
  purchase: (request: {
    selection: LotterySelection;
    idempotencyKey: string;
  }) => Promise<LotteryTicket>;
  quickPicking: boolean;
  purchasing: boolean;
}

export function TicketBuilder({
  drawId,
  drawStatus,
  salesCloseAt,
  priceUsdc,
  availableUsdc,
  eligibility,
  ownedTickets,
  quickPick,
  purchase,
  quickPicking,
  purchasing,
}: TicketBuilderProps) {
  const t = useTranslations("casino.arkball");
  const [step, setStep] = useState<PickerStep>("white");
  const [whiteNumbers, setWhiteNumbers] = useState<number[]>([]);
  const [powerNumber, setPowerNumber] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const initial = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  const selection = completeLotterySelection(whiteNumbers, powerNumber);
  const ownedKeys = new Set(
    ownedTickets
      .filter((ticket) => ticket.drawId === drawId)
      .map((ticket) =>
        lotterySelectionKey({
          whiteNumbers: ticket.whiteNumbers,
          powerNumber: ticket.powerNumber,
        })
      )
  );
  const duplicate = selection ? ownedKeys.has(lotterySelectionKey(selection)) : false;
  const salesOpen = now !== null && lotterySalesOpen(drawStatus, salesCloseAt, now);
  const sufficientBalance = toBaseUnits(availableUsdc, 6) >= toBaseUnits(priceUsdc, 6);
  const eligible = eligibility?.eligible ?? true;
  const ready =
    selection !== null && salesOpen && sufficientBalance && eligible && !duplicate && !purchasing;

  const clear = () => {
    setWhiteNumbers([]);
    setPowerNumber(null);
    setStep("white");
    pending.current = null;
  };

  const chooseWhite = (number: number) => {
    const next = toggleWhiteBall(whiteNumbers, number);
    setWhiteNumbers(next);
    if (next.length === WHITE_BALL_COUNT) setStep("arkball");
    pending.current = null;
  };

  const chooseArkBall = (number: number) => {
    setPowerNumber(number);
    pending.current = null;
  };

  const onQuickPick = async () => {
    try {
      const picked = await quickPick();
      setWhiteNumbers([...picked.whiteNumbers].sort((a, b) => a - b));
      setPowerNumber(picked.powerNumber);
      setStep("arkball");
      pending.current = null;
    } catch (error) {
      toast.error(friendlyError(error, t("quickPickFailed")));
    }
  };

  const onPurchase = async () => {
    if (!selection || !ready) return;
    const fingerprint = lotterySelectionKey(selection);
    const idempotencyKey =
      pending.current?.fingerprint === fingerprint
        ? pending.current.key
        : window.crypto.randomUUID();
    pending.current = { fingerprint, key: idempotencyKey };
    const toastId = toast.loading(t("buyingTicket"));
    try {
      await purchase({ selection, idempotencyKey });
      toast.success(t("ticketPurchased"), { id: toastId });
      clear();
    } catch (error) {
      toast.error(friendlyError(error, t("ticketPurchaseFailed")), { id: toastId });
    }
  };

  const buttonReason = !salesOpen
    ? t("salesClosed")
    : !eligible
      ? eligibility?.reason || t("notEligible")
      : !sufficientBalance
        ? t("notEnoughUsdc")
        : duplicate
          ? t("combinationOwned")
          : selection === null
            ? whiteNumbers.length < WHITE_BALL_COUNT
              ? t("chooseWhiteRemaining", { count: WHITE_BALL_COUNT - whiteNumbers.length })
              : t("chooseArkBall")
            : null;

  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
      <div className="overflow-hidden rounded-[24px] border border-white/8 bg-[#111214] shadow-[0_28px_80px_rgba(0,0,0,0.28)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/7 px-5 py-4 sm:px-6">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.12em] text-red-300 uppercase">
              {t("buildTicket")}
            </div>
            <div className="mt-1 text-[13px] text-white/50">{t("oneCombinationOneTicket")}</div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onQuickPick}
              disabled={!salesOpen || quickPicking}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3.5 py-2 text-[12px] font-semibold text-white/72 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <DiceIcon size={15} />
              {quickPicking ? t("picking") : t("quickPick")}
            </button>
            <button
              type="button"
              onClick={clear}
              className="cursor-pointer rounded-full border border-white/10 px-3.5 py-2 text-[12px] font-semibold text-white/45 transition hover:text-white"
            >
              {t("clear")}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 border-b border-white/7">
          <button
            type="button"
            onClick={() => setStep("white")}
            className={`cursor-pointer px-4 py-3.5 text-[12px] font-bold tracking-[0.04em] transition ${
              step === "white"
                ? "bg-white text-[#111214]"
                : "bg-white/[0.025] text-white/45 hover:text-white"
            }`}
          >
            {t("whiteBallsStep", { selected: whiteNumbers.length })}
          </button>
          <button
            type="button"
            onClick={() => setStep("arkball")}
            className={`cursor-pointer px-4 py-3.5 text-[12px] font-bold tracking-[0.04em] transition ${
              step === "arkball"
                ? "bg-[#d91532] text-white"
                : "bg-red-500/[0.04] text-white/45 hover:text-white"
            }`}
          >
            {t("arkballStep", { selected: powerNumber === null ? 0 : 1 })}
          </button>
        </div>

        <div className="p-4 sm:p-6">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <h2 className="ws-display text-[23px] tracking-[-0.02em] text-white">
                {step === "white" ? t("pickFiveWhite") : t("pickOneArkBall")}
              </h2>
              <p className="mt-1 text-[12px] text-white/42">
                {step === "white" ? t("whiteRange") : t("arkballRange")}
              </p>
            </div>
            <div className="tnum text-[12px] font-semibold text-white/45">
              {step === "white"
                ? `${whiteNumbers.length}/${WHITE_BALL_COUNT}`
                : `${powerNumber === null ? 0 : 1}/1`}
            </div>
          </div>

          <div className="grid grid-cols-7 justify-items-center gap-x-1 gap-y-3 sm:grid-cols-10 lg:grid-cols-12">
            {Array.from(
              { length: step === "white" ? WHITE_BALL_MAX : POWER_BALL_MAX },
              (_, index) => index + 1
            ).map((number) => {
              const selected =
                step === "white" ? whiteNumbers.includes(number) : powerNumber === number;
              const disabled =
                !salesOpen ||
                (step === "white" && whiteNumbers.length >= WHITE_BALL_COUNT && !selected);
              return (
                <LotteryBall
                  key={number}
                  number={number}
                  arkball={step === "arkball"}
                  selected={selected}
                  disabled={disabled}
                  onClick={() => (step === "white" ? chooseWhite(number) : chooseArkBall(number))}
                  size="fluid"
                />
              );
            })}
          </div>
        </div>
      </div>

      <aside className="h-fit rounded-[24px] border border-red-400/16 bg-[linear-gradient(180deg,rgba(222,24,51,0.13),rgba(255,255,255,0.035))] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.28)] xl:sticky xl:top-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.13em] text-red-300 uppercase">
              {t("yourTicket")}
            </div>
            <div className="mt-1 text-[12px] text-white/42">
              {t("drawNumber", { id: drawId.slice(0, 8) })}
            </div>
          </div>
          <div className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-bold text-white/62">
            ${formatLotteryUsdc(priceUsdc)}
          </div>
        </div>

        <div className="mt-6 min-h-12">
          {whiteNumbers.length === 0 ? (
            <div className="text-[13px] text-white/34">{t("ticketEmpty")}</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {whiteNumbers.map((number) => (
                <LotteryBall key={number} number={number} size="sm" />
              ))}
              {powerNumber !== null ? <LotteryBall number={powerNumber} arkball size="sm" /> : null}
            </div>
          )}
        </div>

        <div className="mt-6 space-y-2 border-t border-white/8 pt-4 text-[12px]">
          <div className="flex justify-between gap-4 text-white/45">
            <span>{t("availableBalance")}</span>
            <span className="tnum font-semibold text-white/75">
              {formatLotteryUsdc(availableUsdc, 6)} USDC
            </span>
          </div>
          <div className="flex justify-between gap-4 text-white/45">
            <span>{t("ticketPrice")}</span>
            <span className="tnum font-semibold text-white/75">
              {formatLotteryUsdc(priceUsdc)} USD
            </span>
          </div>
        </div>

        {buttonReason ? (
          <div className="mt-4 rounded-xl border border-white/7 bg-black/20 px-3 py-2.5 text-[11px] leading-4 text-white/48">
            {buttonReason}
          </div>
        ) : null}

        <button
          type="button"
          disabled={!ready}
          onClick={onPurchase}
          className="mt-4 w-full cursor-pointer rounded-xl bg-[#dc1935] px-4 py-3.5 text-[13px] font-extrabold text-white shadow-[0_12px_30px_rgba(220,25,53,0.25)] transition hover:bg-[#ee2340] disabled:cursor-not-allowed disabled:bg-white/8 disabled:text-white/28 disabled:shadow-none"
        >
          {purchasing ? t("buyingTicket") : t("buyTicket", { price: formatLotteryUsdc(priceUsdc) })}
        </button>
        <p className="mt-3 text-center text-[10px] leading-4 text-white/32">
          {t("purchaseDisclosure")}
        </p>
      </aside>
    </section>
  );
}
