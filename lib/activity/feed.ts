// The shape the Activity screens render.
//
// An ActivityEntry is a transfer: an asset, an amount and a direction. The
// redesigned screens show a product event instead ("World Cup prediction, Live,
// Stake Committed"), which a transfer cannot describe. The endpoints for user
// balance and user activity land after this work, so the screens are built
// against this view model now and the endpoint fills it later: one more adapter,
// no component changes.
//
// ActivityEntry deliberately stays as it is. It is the output of a pure transfer
// reducer that also feeds lib/pnl.ts, PnlCards and the notification bell, and a
// status or a product means nothing to any of them.
//
// Pure: no framework, no network, no translator. Copy is carried as a message
// key plus its values (ActivityLabel) and resolved by the component.

import {
  gameForKind,
  isGameKind,
  isStable,
  type ActivityEntry,
  type ActivityKind,
} from "@/lib/activity/entries";
import type { BroadcastGameId } from "@/lib/broadcast/deep-link";
import { displaySymbol } from "@/lib/buy";
import { truncateAddress } from "@/lib/format";

/**
 * A string the screen shows. Either copy from the `activity` catalogue, keyed
 * relative to that namespace, or a name the upstream owns (a market question, a
 * ticker), which is never translated.
 */
export type ActivityLabel =
  | { readonly type: "message"; readonly key: string; readonly values?: ActivityLabelValues }
  | { readonly type: "text"; readonly text: string };

export type ActivityLabelValues = Readonly<Record<string, string | number>>;

export function messageLabel(key: string, values?: ActivityLabelValues): ActivityLabel {
  return values ? { type: "message", key, values } : { type: "message", key };
}

export function textLabel(text: string): ActivityLabel {
  return { type: "text", text };
}

/** The "· Predictions" segment on the time line. */
export type ActivityProduct =
  | "predictions"
  | "memecoins"
  | "trade"
  | "perps"
  | "arkade"
  | "deposit"
  | "withdrawal"
  | "transfer"
  | "rewards";

/** The coloured word beside the status dot. */
export type ActivityStatus =
  "won" | "lost" | "live" | "processing" | "completed" | "earned" | "failed" | "awaitingResults";

/**
 * The shared chip's vocabulary (components/ui/status-chip). Smaller than the
 * status set on purpose: the chip owns the colours, so six tones dress eight
 * statuses here and the chips the other features hand-rolled.
 */
export type ActivityTone = "win" | "loss" | "live" | "pending" | "done" | "neutral";

// The default tone for a status. It is a default and not a derivation because
// the design gives `Live` two colours: green in the All Activity list, amber on
// the In Progress cards. An adapter that knows which surface it is filling can
// override, which is why `tone` is a field rather than a lookup at render time.
const DEFAULT_TONE: Record<ActivityStatus, ActivityTone> = {
  won: "win",
  lost: "loss",
  live: "live",
  processing: "pending",
  awaitingResults: "pending",
  completed: "done",
  earned: "done",
  failed: "loss",
};

export function toneFor(status: ActivityStatus): ActivityTone {
  return DEFAULT_TONE[status];
}

export interface ActivityAmount {
  /**
   * A plain signed decimal string: "750", "-250", "0.0001". Not a number. The
   * activity endpoint sends decimal strings, and money is compared and rounded
   * as a scaled bigint (lib/meme/decimal.ts), so a float never enters the model.
   */
  readonly value: string;
  /** The ticker as it is shown: "USDC", "KASH+". */
  readonly symbol: string;
  /** Whether a positive amount renders an explicit "+". */
  readonly signed: boolean;
}

export interface ActivityCaption {
  readonly label: ActivityLabel;
  /**
   * The segment after the separator dot in "Net Profit · USD". A currency code
   * or a ticker, so it is not translated.
   */
  readonly detail?: string;
}

/**
 * The chain transaction behind an event. Optional, and the absence is a fact:
 * a daily check-in reward, an off-chain Arkade result and a prediction the
 * service settles never touch a chain, so their detail shows no explorer button
 * rather than a broken one.
 *
 * These are the facts a ShareDraft and an explorer link are assembled from, not
 * the draft itself: a draft carries formatted money and suggested text, which
 * needs `useMoney` and belongs to the component.
 */
export interface ActivityChainRef {
  /** The network id the feed uses, e.g. "base-mainnet". */
  readonly network: string;
  readonly hash: string;
}

/**
 * The off-chain match an Arkade game row resolves to. Chess, checkers and
 * ArkBall settle in the cashier ledger, so there is no transaction to link, but
 * a played game is the most shareable thing on the platform and its share link
 * points at the match. Carried separately from `onChain` because the two are
 * different references, and a row has at most one of them.
 */
export interface ActivityGameRef {
  readonly game: BroadcastGameId;
  readonly matchId: string;
}

/**
 * The coin the row draws, which is not always the ticker on the amount.
 *
 * Buying KASH+ is a USDC transfer to the treasury, so the figure is USDC and
 * calling it KASH+ would misstate it, but the row reads as the thing you got
 * and shows the KASH+ coin. They are two different facts, so they are two
 * different fields.
 *
 * `logo` is the art the feed itself carries. AssetIcon ships marks for the
 * majors and nothing for the long tail, which is most of a memecoin feed, so
 * dropping it would leave every unlisted token on a gradient placeholder.
 */
export interface ActivityIcon {
  readonly symbol: string;
  readonly logo?: string | null;
}

export interface ActivityFeedItem {
  readonly id: string;
  /** Epoch milliseconds, the same clock ActivityEntry.timestamp uses. */
  readonly occurredAt: number;
  readonly product: ActivityProduct;
  readonly title: ActivityLabel;
  readonly subtitle?: ActivityLabel;
  readonly status: ActivityStatus;
  readonly tone: ActivityTone;
  readonly icon: ActivityIcon;
  readonly amount: ActivityAmount;
  readonly caption: ActivityCaption;
  readonly onChain?: ActivityChainRef;
  readonly game?: ActivityGameRef;
  /**
   * The in-app detail the row's chevron opens. Left for the endpoint or the
   * route to fill: the explorer link is built from `onChain`, not from here.
   */
  readonly href?: string;
}

const PRODUCT_FOR_KIND: Record<ActivityKind, ActivityProduct> = {
  bought: "trade",
  sold: "trade",
  swapped: "trade",
  deposited: "deposit",
  withdrew: "withdrawal",
  moved: "transfer",
  received: "transfer",
  sent: "transfer",
  entered_game: "arkade",
  claimed_winnings: "arkade",
  prediction_buy: "predictions",
  prediction_payout: "predictions",
  perp_margin: "perps",
  perp_return: "perps",
  bought_kash: "rewards",
  arkade_deposit: "arkade",
  arkade_withdraw: "arkade",
  won_chess: "arkade",
  lost_chess: "arkade",
  drew_chess: "arkade",
  won_checkers: "arkade",
  lost_checkers: "arkade",
  drew_checkers: "arkade",
  arkball_ticket: "arkade",
  arkball_won: "arkade",
};

// A transfer that reached the feed is mined, so it is Completed. The only
// entries that carry a real outcome are the off-chain games, which are only
// built once the match has settled.
//
// `arkball_ticket` is deliberately Completed, not Awaiting Results: the entry is
// every non-refunded, non-winning ticket, so it covers losing tickets as well as
// pending ones and the entry does not say which (see
// features/casino/lib/game-activity.ts).
const STATUS_FOR_KIND: Partial<Record<ActivityKind, ActivityStatus>> = {
  won_chess: "won",
  won_checkers: "won",
  arkball_won: "won",
  lost_chess: "lost",
  lost_checkers: "lost",
};

// Captions that the transfer direction alone would get wrong. A forfeited stake
// is not an "Amount Sent", and KASH+ is the rewards balance, not a purchase.
// A draw reuses the existing `activity.refunded` copy rather than adding a key
// that would say the same thing.
// The KASH+ coin art, the same file the row this replaces pointed at.
const KASH_COIN = "/kash/kash-plus-coin.png";

const CAPTION_KEY_FOR_KIND: Partial<Record<ActivityKind, string>> = {
  entered_game: "captions.stakeCommitted",
  prediction_buy: "captions.stakeCommitted",
  perp_margin: "captions.stakeCommitted",
  arkball_ticket: "captions.stakeCommitted",
  lost_chess: "captions.stakeCommitted",
  lost_checkers: "captions.stakeCommitted",
  drew_chess: "refunded",
  drew_checkers: "refunded",
  bought_kash: "captions.rewardPoints",
};

// Explorer per chain, keyed by the network id the transfer feed uses. This is
// the map the old ActivityRow held privately; it belongs with the model, so the
// detail's "view on-chain" button and anything else reading `onChain` share one
// copy. Returns undefined for a chain we have no explorer for, so the button is
// absent rather than dead.
const EXPLORER_TX: Record<string, string> = {
  "base-mainnet": "https://basescan.org/tx/",
  "eth-mainnet": "https://etherscan.io/tx/",
  "arb-mainnet": "https://arbiscan.io/tx/",
  "opt-mainnet": "https://optimistic.etherscan.io/tx/",
  "polygon-mainnet": "https://polygonscan.com/tx/",
  "solana-mainnet": "https://solscan.io/tx/",
};

export function explorerTxHref(ref: ActivityChainRef | undefined): string | undefined {
  if (!ref) return undefined;
  const base = EXPLORER_TX[ref.network];
  return base && ref.hash ? `${base}${ref.hash}` : undefined;
}

const EXPONENTIAL = /^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/;

/**
 * A JavaScript number as a plain decimal string, never in exponent form.
 *
 * The transfer feed still carries `amount` as a number, so the adapter has to
 * hand one over. `String(1e-7)` is "1e-7", which is not a decimal string and
 * every parser here rejects it, so the exponent is expanded rather than the
 * value being rounded through `toFixed`. This is the only place a float crosses
 * into the model, and it disappears the day the activity endpoint sends strings.
 */
export function decimalFromNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const text = String(value);
  const match = EXPONENTIAL.exec(text);
  if (!match) return text;
  const sign = match[1];
  const whole = match[2];
  const fraction = match[3] ?? "";
  const exponent = Number(match[4]);
  const digits = whole + fraction;
  const pointAt = whole.length + exponent;
  if (pointAt <= 0) return `${sign}0.${"0".repeat(-pointAt)}${digits}`;
  if (pointAt >= digits.length) return `${sign}${digits}${"0".repeat(pointAt - digits.length)}`;
  return `${sign}${digits.slice(0, pointAt)}.${digits.slice(pointAt)}`;
}

function negated(decimal: string): string {
  if (decimal.startsWith("-")) return decimal.slice(1);
  return /^0(\.0+)?$/.test(decimal) ? decimal : `-${decimal}`;
}

// What the other leg of a trade was worth, as the caption shows it: "750 USDC".
function counterAmountText(entry: ActivityEntry): string | null {
  if (!entry.counterSymbol || entry.counterAmount == null) return null;
  return `${decimalFromNumber(entry.counterAmount)} ${displaySymbol(entry.counterSymbol)}`;
}

function captionFor(entry: ActivityEntry): ActivityCaption {
  const counter = counterAmountText(entry);
  // A trade's counter leg always moves against the subject, so an asset coming
  // in was paid for and an asset going out fetched something back.
  if (counter) {
    const key = entry.direction === "in" ? "captions.paid" : "captions.received";
    return { label: messageLabel(key, { amount: counter }) };
  }
  const override = CAPTION_KEY_FOR_KIND[entry.kind];
  if (override) return { label: messageLabel(override) };
  const key = entry.direction === "in" ? "captions.amountReceived" : "captions.amountSent";
  return { label: messageLabel(key) };
}

// The coin art for an entry. Everything reads as its own token and carries the
// logo the feed supplied; a KASH+ buy is the one entry whose coin is not the
// ticker that moved (see ActivityIcon).
function iconFor(entry: ActivityEntry, symbol: string): ActivityIcon {
  if (entry.kind === "bought_kash") return { symbol: "KASH+", logo: KASH_COIN };
  return { symbol, logo: entry.logo };
}

function subtitleFor(entry: ActivityEntry): ActivityLabel | undefined {
  if (!entry.counterparty) return undefined;
  const address = truncateAddress(entry.counterparty);
  // A game's counterparty is the opponent, not an address the user sent to.
  if (isGameKind(entry.kind)) return messageLabel("subtitles.versus", { opponent: address });
  const key = entry.direction === "in" ? "subtitles.from" : "subtitles.to";
  return messageLabel(key, { address });
}

/**
 * Today's on-chain feed as a feed item.
 *
 * The title keeps the existing behaviour exactly: the thirty-odd `ActivityKind`
 * strings are literally the keys under `activity` in messages/*.json, and
 * ActivityRow renders them as `t(kind, { symbol })`. The label carries the same
 * key and the same value, so the copy that ships today is the copy that renders.
 */
export function fromChainEntry(entry: ActivityEntry): ActivityFeedItem {
  // Stablecoins read as the product's cash rather than as a token, which is the
  // distinction "Deposited USD" against "Received GLDx" rests on.
  const cash = isStable(entry.symbol);
  const symbol = displaySymbol(entry.symbol);
  const status = STATUS_FOR_KIND[entry.kind] ?? "completed";
  const magnitude = decimalFromNumber(entry.amount);
  const subtitle = subtitleFor(entry);
  // A game entry's `hash` is a match id on a network with no explorer, so it is
  // a game reference and never a transaction. Everything else is a real
  // transfer the chain can show.
  const game = gameForKind(entry.kind);
  return {
    id: entry.id,
    occurredAt: entry.timestamp,
    product: PRODUCT_FOR_KIND[entry.kind],
    title: messageLabel(entry.kind, { symbol: cash ? "USD" : symbol }),
    ...(subtitle ? { subtitle } : {}),
    status,
    tone: toneFor(status),
    icon: iconFor(entry, symbol),
    amount: {
      value: entry.direction === "out" ? negated(magnitude) : magnitude,
      symbol,
      signed: true,
    },
    caption: captionFor(entry),
    ...(game
      ? { game: { game, matchId: entry.hash } }
      : { onChain: { network: entry.network, hash: entry.hash } }),
  };
}
