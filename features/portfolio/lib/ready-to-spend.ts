import { OFFRAMP_MIN_USDC } from "@/lib/ramping/orders";

// Spendable cash as the balance card has to treat it, which is not as a
// number.
//
// lib/balance/spendable.ts answers a decimal string, or null when it does not
// know — "UNKNOWN IS NOT ZERO, anywhere in this file", as its header puts it.
// The card has to carry that distinction the whole way to the screen, because
// the figure gates the withdraw button: an unknown balance flattened to 0
// satisfies `readyToSpend < OFFRAMP_MIN_USDC` and shuts the button on someone
// who has money, with no error anywhere to explain it. Everything below exists
// to stop a `?? 0` being written at any point between the hook and the render.
//
// Pure: no framework, no network, so the rule the button hangs on is unit
// tested on its own.

/**
 * What the card knows about spendable cash right now.
 *
 * Three states, and the third is the one that matters. "loading" and "unknown"
 * are kept apart rather than folded into one absent value because they are
 * different sentences to show a reader: a figure on its way is a skeleton, a
 * figure we could not get is "couldn't load". The card already draws exactly
 * that distinction for the headline total (see its `errored` comment) and this
 * follows it.
 */
export type ReadyToSpend =
  | { readonly state: "known"; readonly usd: number }
  | { readonly state: "loading" }
  | { readonly state: "unknown" };

const LOADING: ReadyToSpend = { state: "loading" };
const UNKNOWN: ReadyToSpend = { state: "unknown" };

/** A plain decimal, which is the only thing spendableCash() ever answers. */
const PLAIN_DECIMAL = /^-?\d+(?:\.\d+)?$/u;

/**
 * THE DISPLAY EDGE — the one place on this path where exact cash becomes a
 * float, and the only place Checklist 4 allows it.
 *
 * Everything upstream of here is exact: base-unit strings from the wire,
 * bigint arithmetic in lib/balance/amount.ts, a decimal string out of
 * spendableCash(). The card's formatter takes a `number` (money.format, which
 * also applies an FX rate that is itself a float), so the conversion has to
 * happen somewhere; it happens here, once, named, at the moment the figure
 * stops being money and becomes text. No caller may do it a second time, and
 * nothing downstream of this function does arithmetic on the result.
 *
 * The loss is bounded and harmless AT THIS EDGE: a double holds about 15
 * significant digits, the figure is rendered to two, and the withdraw
 * comparison it feeds is against a whole dollar (OFFRAMP_MIN_USDC). It would
 * NOT be harmless upstream, which is why spendableCash returns a string.
 */
function displayUsd(cash: string): number | null {
  // A figure we cannot read is not a figure we have. It takes the "unknown"
  // branch below rather than becoming NaN on screen or, worse, a Number("")
  // zero that would read as an empty wallet. Nothing is invented here: the
  // caller is told the figure is not known, which is what is true.
  if (!PLAIN_DECIMAL.test(cash.trim())) return null;
  const usd = Number(cash);
  return Number.isFinite(usd) ? usd : null;
}

/**
 * The card's view of spendable cash, from what the data layer knows.
 *
 * `cash` is spendableCash()'s answer: a decimal string, or null for "not
 * known". `pending` says a first read is still on its way — without it a
 * balance that has not landed yet would render as "couldn't load" on every
 * cold paint. `error` is the failed read, which is the one case that is
 * genuinely unknown rather than merely early.
 */
export function readyToSpendOf(source: {
  cash: string | null;
  pending: boolean;
  error: unknown;
}): ReadyToSpend {
  if (source.cash !== null) {
    const usd = displayUsd(source.cash);
    return usd === null ? UNKNOWN : { state: "known", usd };
  }
  if (source.error != null) return UNKNOWN;
  return source.pending ? LOADING : UNKNOWN;
}

/**
 * Whether a settling bank deposit holds the withdraw button shut.
 *
 * The hold exists so an unchanged balance next to a live button does not read
 * as "withdraw your new money now" and invite repeated attempts. It applies
 * only while there is nothing withdrawable: someone whose spendable cash
 * already clears the minimum can legitimately withdraw and keeps the button.
 *
 * AN UNKNOWN FIGURE NEVER HOLDS THE BUTTON. It is not evidence of an empty
 * wallet — it is the absence of evidence either way — and the two failures are
 * not symmetric. Holding wrongly locks a real balance behind a disabled
 * control that explains nothing; releasing wrongly shows a live button to
 * someone with nothing, who gets the withdrawal flow's own minimum-amount
 * refusal a step later. The flow can say no. A disabled button cannot say why.
 */
export function isWithdrawHeld(depositPending: boolean, ready: ReadyToSpend): boolean {
  if (!depositPending) return false;
  if (ready.state !== "known") return false;
  return ready.usd < OFFRAMP_MIN_USDC;
}
