"use client";

import { useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { ShareToSquare, type ShareDraft } from "@/components/share/share-to-square";
import { AssetIcon } from "@/components/ui/asset-icon";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ModalShell } from "@/components/ui/modal-shell";
import { MODAL_PANEL_CLASS, useModalDismiss } from "@/components/ui/modal-trigger";
import { StatusChip } from "@/components/ui/status-chip";
import { explorerTxHref, type ActivityFeedItem, type ActivityLabel } from "@/lib/activity/feed";
import { fullTimestamp } from "@/lib/activity/time";
import { track } from "@/lib/analytics/mixpanel";
import type { MarketSquareDeepLink } from "@/lib/api/market-square";
import { encodeGameRef } from "@/lib/broadcast/deep-link";
import { truncateAddress } from "@/lib/format";
import { signOf } from "@/lib/meme/decimal";
import { tokenBg } from "@/lib/trade/assets";
import { networkLabel } from "@/lib/trade/networks";
import { cn } from "@/lib/utils";

import { amountText, amountTint, STATUS_KEY } from "./activity-feed-row";

/**
 * The detail behind an All Activity row (ADR-2026-09-23).
 *
 * What the maintainer asked for, and all of it: the content of the event, then
 * exactly two actions — share it to Market Square, and open the transaction on
 * the chain that carries it. The cash-out and In Progress surfaces are out of
 * scope per the ADR, so there is no third button and no tab strip here.
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

/**
 * What the square links back to, or null when this event is not linkable.
 *
 * A row carries at most one of `onChain` and `game`. A played Arkade match
 * settles in the cashier ledger and has no transaction, so it shares through a
 * game deep link and the square routes the reader to the match; a transfer
 * shares through its chain and hash. An event with neither — a daily check-in,
 * a service-settled prediction — has nothing to point at, so it gets no share
 * control rather than one that posts a card leading nowhere.
 */
function deepLinkFor(item: ActivityFeedItem): MarketSquareDeepLink | null {
  if (item.game) {
    // encodeGameRef refuses a blank id rather than minting "chess:", so an
    // incomplete reference drops the control instead of throwing mid-render.
    if (item.game.matchId.trim() === "") return null;
    return { kind: "game", ref: encodeGameRef(item.game.game, item.game.matchId) };
  }
  if (item.onChain && item.onChain.hash !== "") {
    return { kind: "trade", ref: `${item.onChain.network}:${item.onChain.hash}` };
  }
  return null;
}

/**
 * The share draft for an event.
 *
 * The money goes on `amount` and nowhere else. ShareDraft keeps the figure off
 * the card until the user ticks it in, and putting it in the subtitle as well
 * would publish a position size that the opt-in exists to protect. The subtitle
 * carries the context instead: who it was against, or what it was.
 *
 * The figure is `amountText`, the row's own formatter, rather than `useMoney`:
 * `format` takes a USD number, and both halves of that are wrong here. The
 * value is a plain decimal string that must never be `Number()`-ed (Checklist
 * 4), and the ticker is often not dollars at all — converting 23,500,000 PEPE
 * through an FX rate would print a figure that is simply false.
 */
function shareDraftFor(
  item: ActivityFeedItem,
  deepLink: MarketSquareDeepLink,
  title: string,
  subtitle: string | undefined
): ShareDraft {
  return {
    title,
    ...(subtitle ? { subtitle } : {}),
    deepLink,
    suggestedText: "",
    amount: amountText(item.amount),
  };
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

// The two actions. Both are full width on the phone and share a row from `sm`
// up, and neither carries a fixed width: "Partager sur Market Square" is half
// again as long as the English and has to fit.
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
  const [sharing, setSharing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Sharing belongs to the event being shared, and this sheet is reused for
  // every row rather than remounted per row. Without this reset, a composer left
  // open when the sheet closed would still be open the next time any row was
  // tapped, carrying the previous event's draft.
  //
  // Adjusted during render rather than in an effect: React re-runs this
  // component before committing, so the composer is never painted against the
  // wrong event, and an effect that sets state here would queue the cascading
  // second render the compiler warns about.
  const [shownItem, setShownItem] = useState(item);
  if (item !== shownItem) {
    setShownItem(item);
    setSharing(false);
  }

  // The share sheet opens on top of this one, so while it is up the keyboard
  // belongs to it: trapping Tab in the surface underneath would strand a reader
  // in a dialog they cannot see, and Escape would close the wrong thing.
  useModalDismiss(item !== null && !sharing, onClose, panelRef);

  const title = item ? resolveLabel(item.title, t) : "";
  const subtitle = item?.subtitle ? resolveLabel(item.subtitle, t) : undefined;
  const caption = item ? resolveLabel(item.caption.label, t) : "";
  const deepLink = item ? deepLinkFor(item) : null;
  const draft = item && deepLink ? shareDraftFor(item, deepLink, title, subtitle) : null;
  // Bound once so the narrowing survives into the link's handler: a `?? ""`
  // fallback inside the closure would be a value invented to satisfy the type
  // checker, which is exactly the shape of a masked defect.
  const chain = item?.onChain;
  // undefined for an off-chain event or a chain we have no explorer for. The
  // absence is a fact about the event, so the button is gone rather than dead.
  const explorer = explorerTxHref(chain);

  return (
    <>
      {/* `lg` (600px on desktop) rather than the default 440. This sheet holds
          a title, a status, a figure, a fact list and two actions, and at the
          narrower width the fact rows wrap their values under their labels and
          the two buttons crowd each other. The shell's own size prop, not a
          width of our own, so it stays in step with the other wide modals. */}
      <ModalShell
        open={item !== null}
        onClose={onClose}
        size="lg"
        panelClassName={MODAL_PANEL_CLASS}
      >
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

            {/* The two controls are SIBLINGS. The share control must never sit
                inside the explorer anchor: a button inside an anchor is invalid
                markup and swallows the tap on touch. */}
            {draft || explorer ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                {draft ? (
                  <button
                    type="button"
                    onClick={() => setSharing(true)}
                    className={cn(ACTION, "text-ink bg-white hover:opacity-90")}
                  >
                    {t("detail.share")}
                  </button>
                ) : null}
                {explorer && chain ? (
                  <a
                    data-sensitive="other"
                    href={explorer}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      track("arktivity_tx_opened", {
                        network: chain.network,
                        // The view model carries a signed amount rather than a
                        // direction, and the sign is exactly what the adapter
                        // derived from it, so the event keeps its old meaning.
                        direction: signOf(item.amount.value) === -1 ? "out" : "in",
                      })
                    }
                    className={cn(
                      ACTION,
                      "border-hairline bg-surface border text-white/80 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    {t("detail.explorer", { chain: networkLabel(chain.network) })}
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </ModalShell>

      {/* A sibling of the shell, not a child of it: the square's composer is a
          sheet in its own right and stacks above this one, the same way the old
          row put it beside the row rather than inside its anchor. */}
      {sharing && draft ? (
        <ShareToSquare draft={draft} open onClose={() => setSharing(false)} />
      ) : null}
    </>
  );
}
