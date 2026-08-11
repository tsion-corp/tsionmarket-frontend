"use client";

import { useTranslations } from "next-intl";
import { SheetNav } from "@/components/ui/sheet-nav";
import { useRampOrder } from "@/features/remit/hooks/use-offramp";
import { clearPendingRemit } from "@/features/remit/lib/pending";
import { isTerminalRampStatus, type RampPublicStatus } from "@/features/remit/lib/offramp";

function StatusCard({ status }: { status: RampPublicStatus }) {
  const t = useTranslations("remit");
  const tone =
    status === "completed"
      ? "border-up/30 bg-up/10"
      : status === "needs_attention"
        ? "border-down/30 bg-down/10"
        : "border-white/12 bg-white/5";
  return (
    <div
      className={`mt-4 rounded-[14px] border p-4 text-[13.5px] leading-[1.55] font-medium text-white/85 ${tone}`}
    >
      {t(`status_${status}`)}
    </div>
  );
}

// Shown when the flow reopens onto an order that is still in flight — the
// pending record survived a closed sheet or a reload, so the user lands back
// on their money instead of a blank wizard. Polling resumes immediately; Done
// releases the record once the payout has actually finished.
export function StatusStep({ orderId, onExit }: { orderId: string; onExit: () => void }) {
  const t = useTranslations("remit");
  const order = useRampOrder(orderId);
  const status = order.data?.publicStatus ?? null;
  const receive = order.data?.fiatQuote?.receive ?? null;
  const terminal = status !== null && isTerminalRampStatus(status);

  const onDone = () => {
    // A finished payout has nothing left to resume; an attention case keeps
    // its record so the flow keeps resurfacing it until support resolves it.
    if (status === "completed") clearPendingRemit();
    onExit();
  };

  return (
    <div>
      <SheetNav title={t("statusTitle")} subtitle={t("statusSubtitle")} onBack={onDone} />

      {receive ? (
        <div className="ws-inset flex items-start justify-between gap-4 px-[15px] py-3">
          <span className="shrink-0 text-[13px] font-normal text-white/50">{t("theyReceive")}</span>
          <span className="text-accent text-right font-sans text-[13.5px] font-medium">
            {receive.amount} {receive.currency}
          </span>
        </div>
      ) : null}

      <StatusCard status={status ?? "processing"} />

      <button
        onClick={onDone}
        disabled={!terminal && order.isLoading}
        className="text-ink mt-4 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {terminal ? t("done") : t("trackLater")}
      </button>
    </div>
  );
}
