"use client";

import { useId, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";

import { AssetIcon } from "@/components/ui/asset-icon";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ModalShell } from "@/components/ui/modal-shell";
import { MODAL_PANEL_CLASS, useModalDismiss } from "@/components/ui/modal-trigger";
import { StatusChip } from "@/components/ui/status-chip";
import { explorerTxHref, type ActivityFeedItem, type ActivityLabel } from "@/lib/activity/feed";
import { fullTimestamp } from "@/lib/activity/time";
import { truncateAddress } from "@/lib/format";
import { tokenBg } from "@/lib/trade/assets";
import { networkLabel } from "@/lib/trade/networks";
import { cn } from "@/lib/utils";

import { amountText, amountTint, STATUS_KEY } from "./activity-feed-row";

/**
 * The detail behind an All Activity row (ADR-2026-09-23).
 *
 * The content of the event, then one action: open the transaction on the chain
 * that carries it. The cash-out and In Progress surfaces are out of scope per
 * the ADR, so there is no tab strip here.
 *
 * `item` is nullable rather than there being a separate `open` flag: the shell
 * animates its panel out through AnimatePresence, which needs the subtree it is
 * removing, so this component never returns early. It always renders the shell
 * and lets `item` decide whether that shell is open.
 */

type Translate = ReturnType<typeof useTranslations>;

/** Copy from the catalogue, or a name the upstream owns, as one string. */
function resolveLabel(label: ActivityLabel, t: Translate): string {
  return label.type === "message" ? t(label.key, label.values) : label.text;
}

/** One "label — value" line in the detail's fact list. */
function Fact({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="border-hairline flex items-start justify-between gap-6 border-b pb-3.5 last:border-b-0 last:pb-0">
      <dt className="text-grey-400 shrink-0 text-[13px]">{label}</dt>
      <dd className="tnum min-w-0 text-right text-[13px] break-words text-white/85" title={title}>
        {value}
      </dd>
    </div>
  );
}

// Full width on the phone, and no fixed width so a long translation fits.
const ACTION =
  "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full px-4 py-3 text-center font-sans text-[14px] font-semibold transition-colors";

export interface ActivityDetailSheetProps {
  /** The event to show. `null` means the sheet is closed. */
  item: ActivityFeedItem | null;
  onClose: () => void;
}

export function ActivityDetailSheet({ item, onClose }: ActivityDetailSheetProps) {
  const t = useTranslations("activity");
  // The stamp interpolates a month name; without the reader's locale it comes
  // back in the runtime's.
  const locale = useLocale();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useModalDismiss(item !== null, onClose, panelRef);

  const title = item ? resolveLabel(item.title, t) : "";
  const subtitle = item?.subtitle ? resolveLabel(item.subtitle, t) : undefined;
  const caption = item ? resolveLabel(item.caption.label, t) : "";
  // Bound once so the narrowing survives into the link's handler: a `?? ""`
  // fallback inside the closure would be a value invented to satisfy the type
  // checker, which is exactly the shape of a masked defect.
  const chain = item?.onChain;
  // undefined for an off-chain event or a chain we have no explorer for. The
  // absence is a fact about the event, so the button is gone rather than dead.
  const explorer = explorerTxHref(chain);

  // `lg` (600px on desktop) rather than the default 440: at the narrower width
  // the fact rows wrap their values under their labels. The shell's own size
  // prop, so it stays in step with the other wide modals.
  return (
    <ModalShell open={item !== null} onClose={onClose} size="lg" panelClassName={MODAL_PANEL_CLASS}>
      {item ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="flex flex-col gap-5 outline-none"
        >
          {/* Named, because the sheet has no header of its own and the event
                title alone does not say what surface a reader has landed on.
                Padded past the shell's close button. */}
          <div id={titleId} className="pr-10">
            <Eyebrow>{t("detail.eyebrow")}</Eyebrow>
          </div>

          <div className="flex items-start gap-4">
            <AssetIcon
              sym={item.icon.symbol}
              bg={tokenBg(item.icon.symbol)}
              size={52}
              logo={item.icon.logo}
              fallback="gradient"
            />
            <div className="flex min-w-0 flex-col items-start gap-2">
              <h2 className="ws-display text-[21px] leading-[1.2] break-words text-white">
                {title}
              </h2>
              {subtitle ? (
                <p className="text-grey-400 text-[12.5px]/[17px] break-words">{subtitle}</p>
              ) : null}
              <StatusChip tone={item.tone} label={t(STATUS_KEY[item.status])} />
            </div>
          </div>

          <div className="bg-surface border-hairline rounded-card border px-5 py-4.5">
            <p
              title={`${item.amount.value} ${item.amount.symbol}`}
              className={cn("tnum text-[26px] leading-[1.25] font-bold", amountTint(item.amount))}
            >
              {amountText(item.amount)}
            </p>
            {caption ? (
              <p className="text-grey-400 mt-1.5 text-[13px] break-words">
                {caption}
                {item.caption.detail ? (
                  <>
                    {" · "}
                    <span className="tnum">{item.caption.detail}</span>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>

          <dl className="flex flex-col gap-3.5">
            <Fact label={t("detail.when")} value={fullTimestamp(item.occurredAt, locale)} />
            <Fact label={t("detail.product")} value={t(`products.${item.product}`)} />
            {item.onChain ? (
              <Fact
                label={t("detail.transaction")}
                value={truncateAddress(item.onChain.hash)}
                title={item.onChain.hash}
              />
            ) : null}
          </dl>

          {explorer && chain ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                data-sensitive="other"
                href={explorer}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  ACTION,
                  "border-hairline bg-surface border text-white/80 hover:bg-white/10 hover:text-white"
                )}
              >
                {t("detail.explorer", { chain: networkLabel(chain.network) })}
              </a>
            </div>
          ) : null}
        </div>
      ) : null}
    </ModalShell>
  );
}
