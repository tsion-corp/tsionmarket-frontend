// The bank deposits this device has started, kept until the money can be
// matched to the transfer that paid for it.
//
// Why this exists: user funds are held in Base USDC, so a Naira deposit lands
// as an inbound Base USDC transfer that is indistinguishable on chain from a
// real crypto deposit. Same network, same asset, same shape. Nothing about the
// arrival says which rail it came in on, which is why `deposit_completed` used
// to report every fiat credit as `method: "crypto"`.
//
// The transfer screen writes an entry here the moment it shows a payment
// account. The deposit watcher reads it when an arrival lands and claims the
// entry that explains it. That is the whole mechanism: one writer of intent,
// one reader that turns an anonymous arrival into a named rail.
//
// Two kinds of entry, because the rail gives us two levels of certainty:
//
//   - A freshly created order can be polled to completion, and the rail then
//     reports what it actually moved. That is exact: settled figures, settled
//     rate, no inference.
//   - A reused payment account cannot. The account is permanently payable, so a
//     repeat deposit is paid into an order that already completed once, and the
//     rail never moves that order again. There is nothing to poll. For those the
//     entry carries what the user said they would send and the rate they were
//     quoted, and an arrival close enough to that figure claims it.
//
// The second kind is inference and is deliberately bounded: same wallet, inside
// the watch window, and the arrival has to be within RATE_TOLERANCE of the
// dollars the quote implies. Getting it wrong labels one deposit with the wrong
// rail. Not doing it at all leaves every repeat bank deposit reported as crypto,
// which is the defect this is here to fix.

const KEY = "wsws.ramping.onramp-watch.v1";

// How long an unclaimed bank deposit stays open. A Naira transfer settles in
// seconds to a few minutes and the rail delivers straight after, so an hour
// covers a user who pays, closes the app, and comes back. Past it the entry is
// dropped and a later arrival reports as crypto: a wrong rail on an old deposit
// is better than a watch that never expires.
export const WATCH_TTL_MS = 60 * 60 * 1000;

// Dollars. The rail reports USDC at six decimals and the arrival is the same
// figure read back off chain, so anything above float noise is a real
// difference and not the same money.
const AMOUNT_TOLERANCE = 5e-6;

// How far an arrival may sit from the dollars the quote implies and still be
// taken as that deposit. The rail's rate moves by a few percent between the
// quote and the payment, not by tens, so a tenth is generous for a real
// deposit and still narrow enough that an unrelated crypto deposit landing on
// the same figure is not a case worth designing for.
const RATE_TOLERANCE = 0.1;

// More than a user can plausibly have in flight, and small enough that the
// stored value stays trivial.
const MAX_WATCHES = 5;

export interface OnrampWatch {
  // The EVM address the USDC will land on, lowercased. Entries are matched per
  // wallet: a device can hold more than one login, and claiming another
  // wallet's deposit would name the wrong rail on both.
  wallet: string;
  orderId: string;
  // A reused payment account, whose order is already terminal and cannot be
  // polled for this deposit's settlement.
  reused: boolean;
  // What the user said they would send, and the rate they were quoted for it.
  expectedNgn: number;
  quotedRate: number;
  bank: string;
  openedAt: number;
  // What the rail says it actually moved. Only a polled order ever has these.
  settledNgn?: number;
  settledUsd?: number;
}

// The Naira leg of a `deposit_completed`, worked out from the entry that
// claimed the arrival.
export interface BankDepositFigures {
  amount_ngn: number;
  fx_rate: number;
  bank: string;
}

function isWatch(value: unknown): value is OnrampWatch {
  if (!value || typeof value !== "object") return false;
  const w = value as Record<string, unknown>;
  return (
    typeof w.wallet === "string" &&
    w.wallet !== "" &&
    typeof w.orderId === "string" &&
    typeof w.reused === "boolean" &&
    typeof w.expectedNgn === "number" &&
    Number.isFinite(w.expectedNgn) &&
    typeof w.quotedRate === "number" &&
    Number.isFinite(w.quotedRate) &&
    typeof w.bank === "string" &&
    typeof w.openedAt === "number" &&
    Number.isFinite(w.openedAt)
  );
}

// --- pure matching, exported for the tests ----------------------------------

export function isWatchOpen(watch: OnrampWatch, now: number): boolean {
  return now - watch.openedAt < WATCH_TTL_MS;
}

/**
 * The open entry for `wallet` that explains an arrival of `amountUsd`, or null.
 *
 * Newest first: a user who starts two deposits means the later one, and the
 * older entry stays available for the arrival still to come.
 */
export function matchWatch(
  watches: readonly OnrampWatch[],
  wallet: string,
  amountUsd: number,
  now: number
): OnrampWatch | null {
  if (!wallet || !(amountUsd > 0)) return null;
  const mine = watches
    .filter((w) => w.wallet === wallet.toLowerCase() && isWatchOpen(w, now))
    .sort((a, b) => b.openedAt - a.openedAt);

  // An order the rail reported on wins: its figure is the money it moved, so
  // matching it is a fact rather than a judgement.
  const settled = mine.find(
    (w) => w.settledUsd != null && Math.abs(w.settledUsd - amountUsd) < AMOUNT_TOLERANCE
  );
  if (settled) return settled;

  return (
    mine.find((w) => {
      if (w.settledUsd != null) return false;
      if (!(w.expectedNgn > 0) || !(w.quotedRate > 0)) return false;
      const expectedUsd = w.expectedNgn / w.quotedRate;
      return Math.abs(expectedUsd - amountUsd) <= expectedUsd * RATE_TOLERANCE;
    }) ?? null
  );
}

/**
 * The Naira leg to report for an arrival of `amountUsd` claimed by `watch`.
 *
 * `fx_rate` is always the two legs divided, never the quoted rate: that is what
 * the rail actually applied, and it keeps `amount_ngn / fx_rate` equal to
 * `amount_usd`. An onramp whose rate lock lapsed converts at the live rate, so
 * the quoted figure is not always the one the money moved at.
 */
export function bankFigures(watch: OnrampWatch, amountUsd: number): BankDepositFigures | null {
  const ngn = watch.settledNgn ?? watch.expectedNgn;
  if (!(ngn > 0) || !(amountUsd > 0)) return null;
  // Two decimals, the precision the rail itself quotes rates at. Dividing the
  // legs raw gives a rate with a dozen digits of float noise behind it, which
  // reads as spurious precision in every report it lands in.
  return { amount_ngn: ngn, fx_rate: Math.round((ngn / amountUsd) * 100) / 100, bank: watch.bank };
}

export function pruneWatches(watches: readonly OnrampWatch[], now: number): OnrampWatch[] {
  return watches.filter((w) => isWatchOpen(w, now)).slice(-MAX_WATCHES);
}

// --- the store --------------------------------------------------------------

// Snapshots have to be referentially stable between notifications for
// useSyncExternalStore, so the parsed list is cached and only re-read after a
// write. `undefined` means "not read yet".
let cached: OnrampWatch[] | undefined;
const listeners = new Set<() => void>();
const EMPTY: OnrampWatch[] = [];

function read(): OnrampWatch[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    const kept = parsed.filter(isWatch);
    return kept.length > 0 ? kept : EMPTY;
  } catch {
    // A corrupt or unavailable store must not stop the app. The cost is that
    // this device attributes nothing to the bank rail until the next deposit.
    return EMPTY;
  }
}

function write(next: OnrampWatch[]): void {
  cached = next.length > 0 ? next : EMPTY;
  try {
    if (next.length > 0) window.localStorage.setItem(KEY, JSON.stringify(next));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Private mode or a full quota. The in-memory value still serves this page.
  }
  for (const cb of listeners) cb();
}

export function onrampWatches(): OnrampWatch[] {
  if (cached === undefined) cached = read();
  return cached;
}

// Empty on the server, so hydration starts with nothing in flight and only
// attributes once the client has actually read the store.
export function serverOnrampWatches(): OnrampWatch[] {
  return EMPTY;
}

export function subscribeOnrampWatches(cb: () => void): () => void {
  listeners.add(cb);
  // A deposit started in another tab is the same deposit here.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cached = undefined;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Records that this wallet has been shown a payment account and may be about to
 * pay into it. Called when the account is shown, not when the user says they
 * have paid: a user who pays and closes the app never presses that button, and
 * their deposit is exactly the one that used to go unreported.
 */
export function openOnrampWatch(
  watch: Omit<OnrampWatch, "wallet" | "openedAt"> & { wallet: string },
  now: number
): void {
  if (typeof window === "undefined" || !watch.wallet) return;
  const wallet = watch.wallet.toLowerCase();
  const existing = pruneWatches(onrampWatches(), now).filter(
    (w) => !(w.wallet === wallet && w.orderId === watch.orderId)
  );
  write([...existing, { ...watch, wallet, openedAt: now }].slice(-MAX_WATCHES));
}

// What the rail says the order actually moved, once it reports it. This is what
// turns an entry from an expectation into a fact.
export function settleOnrampWatch(
  orderId: string,
  figures: { amountNgn: number; amountUsd: number },
  now: number
): void {
  if (typeof window === "undefined" || !orderId) return;
  const current = pruneWatches(onrampWatches(), now);
  const next = current.map((w) =>
    w.orderId === orderId
      ? { ...w, settledNgn: figures.amountNgn, settledUsd: figures.amountUsd }
      : w
  );
  write(next);
}

export function closeOnrampWatch(orderId: string, now: number): void {
  if (typeof window === "undefined" || !orderId) return;
  write(pruneWatches(onrampWatches(), now).filter((w) => w.orderId !== orderId));
}

// Drops what has aged out. Called on a timer so an abandoned deposit stops
// holding arrivals back.
export function pruneOnrampWatches(now: number): void {
  if (typeof window === "undefined") return;
  const current = onrampWatches();
  const next = pruneWatches(current, now);
  if (next.length !== current.length) write(next);
}

/**
 * Claims the entry that explains an arrival, removing it so the same deposit
 * cannot be attributed twice, and returns its Naira leg. Null when no open
 * entry explains it, which means the arrival is a crypto deposit.
 */
export function claimOnrampWatch(
  wallet: string,
  amountUsd: number,
  now: number
): BankDepositFigures | null {
  if (typeof window === "undefined") return null;
  const current = pruneWatches(onrampWatches(), now);
  const match = matchWatch(current, wallet, amountUsd, now);
  if (!match) return null;
  const figures = bankFigures(match, amountUsd);
  if (!figures) return null;
  write(current.filter((w) => w !== match));
  return figures;
}

// Whether a bank deposit for this wallet is still unaccounted for. An arrival
// that lands while one is open might be it, and the rail may not have reported
// yet, so the deposit watcher holds such an arrival back rather than calling it
// crypto and being unable to take it back.
export function hasOpenOnrampWatch(wallet: string, now: number): boolean {
  if (!wallet) return false;
  const address = wallet.toLowerCase();
  return onrampWatches().some((w) => w.wallet === address && isWatchOpen(w, now));
}
