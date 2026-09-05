"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CopyButton } from "@/components/ui/copy-button";
import { ModalShell } from "@/components/ui/modal-shell";
import { useKashLedger } from "@/features/portfolio/hooks/use-kash";
import { formatKashAmount, type KashLedgerEntry } from "@/features/portfolio/lib/kash";
import { truncateAddress } from "@/lib/format";

interface KashHistoryModalProps {
  open: boolean;
  onClose: () => void;
}

type HistoryView = "activity" | "points";

// Real KSH movement vs. unsettled points accrual — two different things a
// wallet asks about ("did my buy go through?" vs "how many points do I
// have?") that don't belong mixed into one scrolling list.
const VIEW_KINDS: Record<HistoryView, ReadonlyArray<KashLedgerEntry["kind"]>> = {
  activity: ["purchase", "conversion", "settlement", "transfer-in", "transfer-out"],
  points: ["points", "locked-activity"],
};

const KIND_LABEL_KEY: Record<KashLedgerEntry["kind"], string> = {
  points: "historyPoints",
  settlement: "historySettlement",
  purchase: "historyPurchase",
  conversion: "historyConversion",
  "locked-activity": "historyLocked",
  "transfer-in": "historyTransferIn",
  "transfer-out": "historyTransferOut",
};

// A colour per kind, so the eye can scan the column without reading it. Send,
// receive and conversion each get their own hue — they used to double up
// (receive on settlement's green, send on purchase's white) which made the
// three hardest-to-tell-apart rows look identical at a glance.
const KIND_DOT: Record<KashLedgerEntry["kind"], string> = {
  points: "bg-amber-200/70",
  settlement: "bg-up",
  purchase: "bg-white/45",
  conversion: "bg-down",
  "locked-activity": "bg-white/15",
  "transfer-in": "bg-sky-300/70",
  "transfer-out": "bg-violet-300/70",
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

// A purchase or a claim is a MINT — its tx is the sale/redeem contract
// calling our own minter, and pointing a curious wallet straight at it is an
// invitation to go poke at the contract. A conversion (burn), send and
// receive are plain ERC-20 transfers with nothing to hide, so only those get
// the on-chain affidavit.
const TX_VISIBLE_KINDS: ReadonlySet<KashLedgerEntry["kind"]> = new Set([
  "conversion",
  "transfer-in",
  "transfer-out",
]);

/** `ref` carries a tx hash on chain-backed rows and a domain id elsewhere. */
function txHashFor(entry: KashLedgerEntry): string | null {
  if (!TX_VISIBLE_KINDS.has(entry.kind)) return null;
  const hash = entry.txHash ?? entry.ref;
  return hash && TX_HASH.test(hash) ? hash : null;
}

const VIEWS: HistoryView[] = ["activity", "points"];
const VIEW_LABEL_KEY: Record<HistoryView, string> = {
  activity: "historyTabActivity",
  points: "historyTabPoints",
};
const VIEW_SUBTITLE_KEY: Record<HistoryView, string> = {
  activity: "historySubtitle",
  points: "historySubtitlePoints",
};
const VIEW_EMPTY_KEY: Record<HistoryView, { title: string; hint: string }> = {
  activity: { title: "historyEmpty", hint: "historyEmptyHint" },
  points: { title: "historyEmptyPoints", hint: "historyEmptyPointsHint" },
};

export function KashHistoryModal({ open, onClose }: KashHistoryModalProps) {
  const t = useTranslations("kash");
  const ledger = useKashLedger(open);
  const [view, setView] = useState<HistoryView>("activity");

  const entries = useMemo(() => {
    const kinds = VIEW_KINDS[view];
    return ledger.data?.filter((entry) => (kinds as readonly string[]).includes(entry.kind));
  }, [ledger.data, view]);

  const onTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const index = VIEWS.indexOf(view);
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % VIEWS.length;
      else if (event.key === "ArrowLeft") next = (index - 1 + VIEWS.length) % VIEWS.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = VIEWS.length - 1;
      else return;
      event.preventDefault();
      const target = VIEWS[next];
      if (target) setView(target);
    },
    [view]
  );

  return (
    <ModalShell open={open} onClose={onClose} size="lg">
      <div className="p-5 sm:p-6" data-sensitive="other">
        <div className="ws-display text-[22px]">{t("historyTitle")}</div>
        <p className="mt-1 text-[13px] leading-[1.5] font-normal text-white/55">
          {t(VIEW_SUBTITLE_KEY[view])}
        </p>

        <div role="tablist" aria-label={t("historyTitle")} className="mt-4 flex gap-1">
          {VIEWS.map((v) => {
            const selected = v === view;
            return (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setView(v)}
                onKeyDown={onTabKeyDown}
                className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                  selected ? "bg-white/12 text-white/90" : "text-white/45 hover:text-white/70"
                }`}
              >
                {t(VIEW_LABEL_KEY[v])}
              </button>
            );
          })}
        </div>

        {ledger.isPending ? (
          <p className="mt-5 text-[13px] font-normal text-white/50">{t("historyLoading")}</p>
        ) : ledger.isError ? (
          <p className="mt-5 text-[13px] font-normal text-white/50">{t("historyFailed")}</p>
        ) : entries && entries.length > 0 ? (
          <div className="ws-no-scrollbar mt-4 flex max-h-[55vh] flex-col divide-y divide-white/6 overflow-y-auto">
            {entries.map((entry) => {
              const txHash = txHashFor(entry);
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
                      <span className="text-[13.5px] font-medium text-white/90">
                        {t(KIND_LABEL_KEY[entry.kind])}
                      </span>
                      {detail && (
                        <div className="tnum mt-0.5 truncate text-[12px] font-normal text-white/45">
                          {detail}
                        </div>
                      )}
                      {txHash && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="tnum truncate font-mono text-[11px] text-white/35">
                            {truncateAddress(txHash)}
                          </span>
                          <CopyButton value={txHash} size="sm" />
                          <a
                            href={`https://basescan.org/tx/${txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-md border border-white/12 px-1.5 py-0.5 text-[10px] font-medium text-white/45 hover:border-white/25 hover:text-white/70"
                          >
                            {t("historyOnChain")}
                          </a>
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
            <p className="text-[13px] font-normal text-white/55">{t(VIEW_EMPTY_KEY[view].title)}</p>
            <p className="mt-1 text-[12px] font-normal text-white/35">
              {t(VIEW_EMPTY_KEY[view].hint)}
            </p>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
