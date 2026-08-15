"use client";

import { useTranslations } from "next-intl";
import { ModalShell } from "@/components/ui/modal-shell";
import { useKashLedger } from "@/features/portfolio/hooks/use-kash";
import { formatKashAmount, type KashLedgerEntry } from "@/features/portfolio/lib/kash";
import { truncateAddress } from "@/lib/format";

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
  "transfer-in": "historyTransferIn",
  "transfer-out": "historyTransferOut",
};

// A colour per kind, so the eye can scan the column without reading it.
const KIND_DOT: Record<KashLedgerEntry["kind"], string> = {
  points: "bg-amber-200/70",
  settlement: "bg-up",
  purchase: "bg-white/45",
  conversion: "bg-white/30",
  "locked-activity": "bg-white/15",
  "transfer-in": "bg-up",
  "transfer-out": "bg-white/45",
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
  if (entry.kind === "points") return `+${formatKashAmount(entry.points ?? "0")} pts`;
  const sign = Number(entry.deltaKash) > 0 ? "+" : "";
  return `${sign}${formatKashAmount(entry.deltaKash)} KASH`;
}

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

/** `ref` carries a tx hash on chain-backed rows and a domain id elsewhere. */
function explorerHref(entry: KashLedgerEntry): string | null {
  const hash = entry.txHash ?? entry.ref;
  return hash && TX_HASH.test(hash) ? `https://basescan.org/tx/${hash}` : null;
}

export function KashHistoryModal({ open, onClose }: KashHistoryModalProps) {
  const t = useTranslations("kash");
  const ledger = useKashLedger(open);

  return (
    <ModalShell open={open} onClose={onClose} size="lg">
      <div className="p-5 sm:p-6">
        <div className="ws-display text-[22px]">{t("historyTitle")}</div>
        <p className="mt-1 text-[13px] leading-[1.5] font-normal text-white/55">
          {t("historySubtitle")}
        </p>

        {ledger.isPending ? (
          <p className="mt-5 text-[13px] font-normal text-white/50">{t("historyLoading")}</p>
        ) : ledger.isError ? (
          <p className="mt-5 text-[13px] font-normal text-white/50">{t("historyFailed")}</p>
        ) : ledger.data && ledger.data.length > 0 ? (
          <div className="mt-4 flex max-h-[55vh] flex-col divide-y divide-white/6 overflow-y-auto">
            {ledger.data.map((entry) => {
              const href = explorerHref(entry);
              // The trade behind a points row is the useful part — "+275 pts"
              // alone tells the user nothing about where it came from.
              const detail = entry.counterparty
                ? `${entry.kind === "transfer-in" ? t("historyFrom") : t("historyTo")} ${truncateAddress(entry.counterparty)}`
                : entry.notionalUsd && Number(entry.notionalUsd) > 0
                  ? t("historyOnVolume", {
                      volume: formatKashAmount(entry.notionalUsd),
                      type: entry.activityType ?? "",
                    })
                  : null;

              return (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-4 px-1 py-3 first:pt-1"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${KIND_DOT[entry.kind]}`}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13.5px] font-medium text-white/90">
                          {t(KIND_LABEL_KEY[entry.kind])}
                        </span>
                        {href && (
                          <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-md border border-white/12 px-1.5 py-0.5 text-[10px] font-medium text-white/45 hover:border-white/25 hover:text-white/70"
                          >
                            {t("historyOnChain")}
                          </a>
                        )}
                      </div>
                      {detail && (
                        <div className="tnum mt-0.5 truncate text-[12px] font-normal text-white/45">
                          {detail}
                        </div>
                      )}
                      <div className="mt-0.5 text-[11.5px] font-normal text-white/30">
                        {new Date(entry.createdAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className={`tnum text-[14px] font-semibold ${deltaClass(entry)}`}>
                      {amountLabel(entry)}
                    </div>
                    {entry.feeUsd && Number(entry.feeUsd) > 0 && (
                      <div className="tnum mt-0.5 text-[11px] font-normal text-white/30">
                        {t("historyFromFee", { fee: entry.feeUsd })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-[14px] border border-white/8 bg-white/3 px-4 py-6 text-center">
            <p className="text-[13px] font-normal text-white/55">{t("historyEmpty")}</p>
            <p className="mt-1 text-[12px] font-normal text-white/35">{t("historyEmptyHint")}</p>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
