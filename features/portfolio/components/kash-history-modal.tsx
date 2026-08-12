"use client";

import { useTranslations } from "next-intl";
import { ModalShell } from "@/components/ui/modal-shell";
import { useKashLedger } from "@/features/portfolio/hooks/use-kash";
import type { KashLedgerEntry } from "@/features/portfolio/lib/kash";

interface KashHistoryModalProps {
  open: boolean;
  onClose: () => void;
}

const KIND_LABEL_KEY: Record<KashLedgerEntry["kind"], string> = {
  points: "historyPoints",
  settlement: "historySettlement",
  purchase: "historyPurchase",
  conversion: "historyConversion",
  "locked-activity": "historyLocked",
};

// A points row carries deltaKash "0" (points are not tokens until settlement);
// a locked activity is zero because the wallet was below the holding gate.
// Both are worth showing: one is progress, the other what the gate cost.
function deltaClass(entry: KashLedgerEntry): string {
  const delta = Number(entry.deltaKash);
  if (delta > 0) return "text-up";
  if (delta < 0) return "text-white/70";
  return entry.kind === "points" ? "text-amber-200/80" : "text-white/40";
}

// Points rows show the points earned; everything else shows the KSH delta.
function amountLabel(entry: KashLedgerEntry): string {
  if (entry.kind === "points") return `+${entry.points ?? "0"} pts`;
  const sign = Number(entry.deltaKash) > 0 ? "+" : "";
  return `${sign}${entry.deltaKash} KASH`;
}

export function KashHistoryModal({ open, onClose }: KashHistoryModalProps) {
  const t = useTranslations("kash");
  const ledger = useKashLedger(open);

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="p-5 sm:p-6">
        <div className="ws-display text-[22px]">{t("historyTitle")}</div>

        {ledger.isPending ? (
          <p className="mt-4 text-[13px] font-normal text-white/50">{t("historyLoading")}</p>
        ) : ledger.isError ? (
          <p className="mt-4 text-[13px] font-normal text-white/50">{t("historyFailed")}</p>
        ) : ledger.data && ledger.data.length > 0 ? (
          <div className="mt-4 flex max-h-[50vh] flex-col gap-0.5 overflow-y-auto">
            {ledger.data.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-xl px-2 py-2.5 hover:bg-white/4"
              >
                <div>
                  <div className="text-[13px] font-medium text-white/85">
                    {t(KIND_LABEL_KEY[entry.kind])}
                  </div>
                  <div className="mt-0.5 text-[11.5px] font-normal text-white/40">
                    {new Date(entry.createdAt).toLocaleString()}
                  </div>
                </div>
                <span className={`tnum text-[13px] font-semibold ${deltaClass(entry)}`}>
                  {amountLabel(entry)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-[13px] font-normal text-white/50">{t("historyEmpty")}</p>
        )}
      </div>
    </ModalShell>
  );
}
