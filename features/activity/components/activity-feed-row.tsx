"use client";

import { useTranslations } from "next-intl";

import { AssetIcon } from "@/components/ui/asset-icon";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { Responsive } from "@/components/ui/responsive";
import { StatusChip } from "@/components/ui/status-chip";
import type {
  ActivityAmount,
  ActivityFeedItem,
  ActivityIcon,
  ActivityLabel,
} from "@/lib/activity/feed";
import { clockTime, fullTimestamp } from "@/lib/activity/time";
import { formatQuantity, formatUsdString, signOf } from "@/lib/meme/decimal";
import { MISSING_FIGURE } from "@/lib/meme/format";
import { tokenBg } from "@/lib/trade/assets";
import { cn } from "@/lib/utils";

/**
 * One row of the All Activity feed, at both breakpoints.
 *
 * Desktop draws a filled card and stacks the chevron, the amount and the
 * caption in a right hand column. Phone drops the card for a divider row, puts
 * the chevron at the end of the title line, the amount beside the time, and the
 * caption beside the status. Same data, two grids, which is why this is one
 * component with two trees rather than one tree with breakpoint prefixes.
 *
 * The design pins the desktop left block to a fixed 72x191 box with the title
 * at `left 55` and the status at `left 57`. That clips the moment a title is
 * translated, so the block is built as flex here and grows with its content.
 */

type Translate = ReturnType<typeof useTranslations>;

// The status word, keyed into the flat `activity` namespace. The chip holds no
// copy of its own on purpose, so the words are looked up at the call site.
//
// Exported because the detail sheet shows the same chip for the same item, and
// a second copy of this table is how a row and its detail come to disagree
// about what an event's status is called.
export const STATUS_KEY: Record<ActivityFeedItem["status"], string> = {
  won: "statusWon",
  lost: "statusLost",
  live: "statusLive",
  processing: "statusProcessing",
  completed: "statusCompleted",
  earned: "statusEarned",
  failed: "statusFailed",
  awaitingResults: "statusAwaitingResults",
};

// The "· Predictions" segment. Product is an id in the model, not a word, so a
// German reader gets "Einzahlung" rather than the English the endpoint sent.
const PRODUCT_KEY: Record<ActivityFeedItem["product"], string> = {
  predictions: "products.predictions",
  memecoins: "products.memecoins",
  trade: "products.trade",
  perps: "products.perps",
  arkade: "products.arkade",
  deposit: "products.deposit",
  withdrawal: "products.withdrawal",
  transfer: "products.transfer",
  rewards: "products.rewards",
};

// Quantities abbreviate from a million up, the same threshold the memecoin
// columns use for a count. Below it a quantity prints in full, because
// "999,999" is no wider than the "1M" that would replace it.
const COMPACT_TIERS = [
  { digits: 13, shift: 12, suffix: "T" },
  { digits: 10, shift: 9, suffix: "B" },
  { digits: 7, shift: 6, suffix: "M" },
] as const;

const DECIMAL = /^([+-])?(\d+)(?:\.(\d+))?$/u;

/** Copy from the catalogue, or a name the upstream owns, as one string. */
function resolveLabel(label: ActivityLabel, t: Translate): string {
  return label.type === "message" ? t(label.key, label.values) : label.text;
}

/**
 * A large token quantity as "23.5M", or null when the figure is small enough to
 * print in full or is not a plain decimal.
 *
 * The shift runs on the digits of the string, so no amount is ever converted to
 * a float. Digits past the second are dropped rather than rounded: an
 * abbreviation must never read higher than the amount it stands for, and the
 * exact figure stays on the element's title attribute.
 */
function compactQuantity(value: string): string | null {
  const match = DECIMAL.exec(value.trim());
  if (!match) return null;
  const [, sign, whole = "", fraction = ""] = match;
  const digits = whole.replace(/^0+(?=\d)/u, "");
  const tier = COMPACT_TIERS.find((candidate) => digits.length >= candidate.digits);
  if (!tier) return null;
  const head = digits.slice(0, digits.length - tier.shift);
  let tail = `${digits.slice(digits.length - tier.shift)}${fraction}`.slice(0, 2);
  while (tail.endsWith("0")) tail = tail.slice(0, -1);
  return `${sign === "-" ? "-" : ""}${head}${tail ? `.${tail}` : ""}${tier.suffix}`;
}

/**
 * The amount as the row prints it.
 *
 * A minus always shows, because a figure that left the account reads wrong
 * without one. A plus shows only when the item asks for it, which is what
 * separates a gain ("+500 USDC") from a plain quantity ("150 USDC") in the
 * design. Dollars go through the USD formatter and carry no ticker; every other
 * symbol prints after its quantity.
 */
export function amountText(amount: ActivityAmount): string {
  if (amount.symbol === "USD") {
    return formatUsdString(amount.value, { signed: amount.signed }) ?? MISSING_FIGURE;
  }
  const sign = signOf(amount.value);
  const figure = compactQuantity(amount.value) ?? formatQuantity(amount.value);
  // An unreadable figure shows as missing, never as a zero: a row that claims a
  // zero is worse than one that admits it cannot say.
  if (sign === null || figure === null) return MISSING_FIGURE;
  return `${sign > 0 && amount.signed ? "+" : ""}${figure} ${amount.symbol}`;
}

/**
 * Green for a gain, red for anything negative, plain white otherwise.
 *
 * An unsigned positive is a quantity, not a profit, so it stays white: that is
 * how the design draws a committed stake beside a won payout. `text-up` and
 * `text-down` are the pair the portfolio and memecoin rows already use, so an
 * amount reads the same colour wherever it appears.
 */
export function amountTint(amount: ActivityAmount): string {
  const sign = signOf(amount.value);
  if (sign === -1) return "text-down";
  if (sign === 1 && amount.signed) return "text-up";
  return "text-white";
}

function RowIcon({ icon, size }: { icon: ActivityIcon; size: number }) {
  // The Figma repeats one ETH glyph on all eighteen rows, PEPE and KASH+
  // included, so it is a placeholder. AssetIcon resolves the real mark, then
  // the logo the feed carries, then a gradient coin.
  //
  // The icon is its own field on the item and not `amount.symbol`, because a
  // KASH+ buy moves USDC and shows the KASH+ coin.
  return (
    <span className="shrink-0">
      <AssetIcon
        sym={icon.symbol}
        bg={tokenBg(icon.symbol)}
        size={size}
        logo={icon.logo}
        fallback="gradient"
      />
    </span>
  );
}

// A 3px dot between two words, the separator the design uses on the time line
// and inside a two-part caption.
function Dot({ size }: { size: number }) {
  return (
    <span
      aria-hidden
      className="shrink-0 rounded-full bg-current"
      style={{ width: size, height: size }}
    />
  );
}

// The time and the product that produced the row. It wraps rather than
// truncates: every locale this app ships spells these products longer than
// English does.
function MetaLine({
  time,
  product,
  className,
}: {
  time: string;
  product: string;
  className: string;
}) {
  return (
    <span className={cn("text-grey-400 flex min-w-0 flex-wrap items-center gap-2", className)}>
      <span className="tnum">{time}</span>
      <Dot size={3} />
      <span>{product}</span>
    </span>
  );
}

// "Net Profit · USD". The detail is a currency code or a ticker, so it is never
// translated and never wraps away from the words it qualifies.
function Caption({
  text,
  detail,
  className,
}: {
  text: string;
  detail?: string;
  className: string;
}) {
  return (
    <span
      className={cn(
        "text-grey-400 flex min-w-0 flex-wrap items-center justify-end gap-[7.6px] text-right",
        className
      )}
    >
      <span>{text}</span>
      {detail ? (
        <>
          <Dot size={2.85} />
          <span className="tnum">{detail}</span>
        </>
      ) : null}
    </span>
  );
}

// Points into the item's detail. ChevronLeftIcon turned around is the glyph the
// Activity pager already rotates, so the tree gains no second chevron.
function RowChevron() {
  return (
    <span aria-hidden className="text-grey-400 grid size-7 shrink-0 place-items-center">
      <ChevronLeftIcon size={19} className="rotate-180" />
    </span>
  );
}

interface RowTreeProps {
  item: ActivityFeedItem;
  title: string;
  subtitle?: string;
  product: string;
  status: string;
  caption: string;
}

function DesktopRow({ item, title, subtitle, product, status, caption }: RowTreeProps) {
  return (
    <div className="bg-surface border-hairline rounded-card flex w-full items-start justify-between gap-4 border px-5 py-[15px] transition-colors group-hover:bg-white/8">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <RowIcon icon={item.icon} size={45} />
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <p className="ws-display text-[14px] leading-[1.15] break-words text-white">{title}</p>
          {subtitle ? (
            <p className="text-grey-400 text-[12px]/[16.5px] break-words">{subtitle}</p>
          ) : null}
          <MetaLine
            time={clockTime(item.occurredAt)}
            product={product}
            className="text-[12px]/[16.5px]"
          />
          <StatusChip tone={item.tone} label={status} />
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <RowChevron />
        <p
          title={`${item.amount.value} ${item.amount.symbol}`}
          className={cn("tnum text-right text-[14px]/[16.5px] font-bold", amountTint(item.amount))}
        >
          {amountText(item.amount)}
        </p>
        {caption ? (
          <Caption text={caption} detail={item.caption.detail} className="text-[12px]/[15.675px]" />
        ) : null}
      </div>
    </div>
  );
}

function PhoneRow({ item, title, subtitle, product, status, caption }: RowTreeProps) {
  return (
    <div className="border-hairline flex w-full items-start gap-2 border-b py-4 transition-colors group-hover:bg-white/4">
      <RowIcon icon={item.icon} size={40} />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            <p className="ws-display min-w-0 text-[13px] leading-[1.15] break-words text-white">
              {title}
            </p>
            <RowChevron />
          </div>
          {subtitle ? (
            <p className="text-grey-400 text-[11px]/[16.5px] break-words">{subtitle}</p>
          ) : null}
          <div className="flex items-start justify-between gap-2">
            <MetaLine
              time={clockTime(item.occurredAt)}
              product={product}
              className="text-[11px]/[16.5px]"
            />
            <p
              title={`${item.amount.value} ${item.amount.symbol}`}
              className={cn(
                "tnum shrink-0 text-right text-[13px]/[16.5px] font-bold",
                amountTint(item.amount)
              )}
            >
              {amountText(item.amount)}
            </p>
          </div>
        </div>
        <div className="flex items-start justify-between gap-2">
          <StatusChip tone={item.tone} label={status} />
          {caption ? (
            <Caption
              text={caption}
              detail={item.caption.detail}
              className="shrink-0 text-[10px]/[15.675px]"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export interface ActivityFeedRowProps {
  item: ActivityFeedItem;
  /**
   * Open this item's detail, where the share and explorer actions live. The row
   * does not know whether that detail is a route or a sheet and builds no URL:
   * the caller owns the destination.
   */
  onOpen: (item: ActivityFeedItem) => void;
}

export function ActivityFeedRow({ item, onOpen }: ActivityFeedRowProps) {
  const t = useTranslations("activity");
  const tree: RowTreeProps = {
    item,
    title: resolveLabel(item.title, t),
    ...(item.subtitle ? { subtitle: resolveLabel(item.subtitle, t) } : {}),
    product: t(PRODUCT_KEY[item.product]),
    status: t(STATUS_KEY[item.status]),
    caption: resolveLabel(item.caption.label, t),
  };

  return (
    // One control for the whole row, so the chevron stays decoration and there
    // is nothing nested to swallow a tap on touch.
    //
    // data-no-ripple: every button in this app lifts and ripples on hover, and
    // a full width list row rising off the page on every pass of the pointer is
    // noise. The row says it is interactive with a background change and a
    // focus ring instead.
    <button
      type="button"
      data-no-ripple
      onClick={() => onOpen(item)}
      title={fullTimestamp(item.occurredAt)}
      className="rounded-card group block w-full cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
    >
      <Responsive mobile={<PhoneRow {...tree} />} desktop={<DesktopRow {...tree} />} />
    </button>
  );
}
