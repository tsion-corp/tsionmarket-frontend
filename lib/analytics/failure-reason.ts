// Why something failed, in the data team's vocabulary.
//
// Failure events used to carry whatever the screen had to hand: "order_failed"
// for any memecoin error, "sell_failed", an internal stage name, a provider's
// raw code. The same failure arrived under several names and could not be
// grouped, and a user dismissing their wallet counted as a failed trade.
//
// The catalog gives each part of the product its own list of reasons rather
// than one shared set: a withdrawal can fail for `kyc_required`, a trade
// cannot, and a trade can fail for `no_route`, a withdrawal cannot. So there is
// one classifier here, and each domain declares the list it accepts. A reason
// the domain has no word for arrives as `unknown`, with the classifier's own
// verdict kept in `reason_detail` so it is still countable.
//
// Only codes are ever sent. A provider's message can quote back what the user
// typed, so it never leaves this module.

/**
 * Every reason any domain can report. A domain accepts a subset; see the
 * vocabularies below. `user_cancelled` is ours rather than the catalog's: a
 * dismissed wallet is not a failure of the product, and folding it into
 * `unknown` buries the commonest cause of an abandoned trade in the one bucket
 * nobody can act on.
 */
export const REASONS = [
  "user_cancelled",
  // Auth
  "email_taken",
  "invalid_credentials",
  "oauth_denied",
  "oauth_timeout",
  "email_unverified",
  "blocked_region",
  "rate_limited",
  // Money in and out
  "address_unavailable",
  "account_generation_failed",
  "wrong_network",
  "rail_rejected",
  "invalid_address",
  "invalid_account_number",
  "kyc_required",
  "insufficient_balance",
  "below_minimum",
  "above_limit",
  // Trading
  "no_route",
  "simulation_failed",
  "slippage_exceeded",
  "order_failed",
  "already_submitted",
  "market_closed",
  "insufficient_liquidity",
  "rate_expired",
  // Prediction
  "below_minimum_legs",
  "odds_changed",
  "market_suspended",
  "stake_below_minimum",
  "stake_above_limit",
  // Games
  "round_closed",
  "draw_closed",
  "incomplete_selection",
  "duplicate_ticket",
  "above_maximum",
  // Square
  "media_too_large",
  "unsupported_media",
  "not_permitted",
  "empty_post",
  // Perps
  "insufficient_margin",
  "leverage_too_high",
  "order_rejected",
  // Shared
  "provider_timeout",
  "unknown",
] as const;

export type Reason = (typeof REASONS)[number];

/**
 * A domain's accepted reasons, and how a reason it has no word for is folded
 * into one it does. An alias is only ever a narrowing of the same fact:
 * `insufficient_balance` on a perp desk is `insufficient_margin`, which is the
 * same money missing under the name that desk uses.
 */
export interface Vocabulary<R extends Reason = Reason> {
  readonly reasons: readonly R[];
  readonly aliases: Readonly<Partial<Record<Reason, R>>>;
}

function vocabulary<const R extends Reason>(
  reasons: readonly R[],
  aliases: Readonly<Partial<Record<Reason, R>>> = {}
): Vocabulary<R> {
  return { reasons, aliases };
}

export const AUTH_FAILURE = vocabulary([
  "email_taken",
  "invalid_credentials",
  "oauth_denied",
  "oauth_timeout",
  "email_unverified",
  "blocked_region",
  "rate_limited",
  "user_cancelled",
  "unknown",
]);

export const DEPOSIT_FAILURE = vocabulary([
  "address_unavailable",
  "provider_timeout",
  "rail_rejected",
  "wrong_network",
  "below_minimum",
  "account_generation_failed",
  "user_cancelled",
  "unknown",
]);

export const WITHDRAW_FAILURE = vocabulary([
  "insufficient_balance",
  "invalid_address",
  "invalid_account_number",
  "rail_rejected",
  "provider_timeout",
  "below_minimum",
  "above_limit",
  "kyc_required",
  "user_cancelled",
  "unknown",
]);

export const KASH_FAILURE = vocabulary(
  [
    "insufficient_balance",
    "insufficient_liquidity",
    "rate_expired",
    "below_minimum",
    "user_cancelled",
    "unknown",
  ],
  // A Kash conversion that cannot be routed is the pool being empty, which is
  // what this desk calls insufficient liquidity.
  { no_route: "insufficient_liquidity" }
);

export const TRADE_FAILURE = vocabulary(
  [
    "insufficient_balance",
    "no_route",
    "simulation_failed",
    "slippage_exceeded",
    "order_failed",
    "already_submitted",
    "provider_timeout",
    "market_closed",
    "user_cancelled",
    "unknown",
  ],
  { insufficient_liquidity: "no_route", rail_rejected: "order_failed" }
);

export const PREDICTION_FAILURE = vocabulary(
  [
    "insufficient_balance",
    "below_minimum_legs",
    "odds_changed",
    "market_closed",
    "market_suspended",
    "stake_below_minimum",
    "stake_above_limit",
    "user_cancelled",
    "unknown",
  ],
  { below_minimum: "stake_below_minimum", above_limit: "stake_above_limit" }
);

/**
 * The Arkade games. One list across the five of them: the catalog gives each
 * game its own, but they are near-identical, and a shared list means a report
 * can ask "how often does a game fail for want of balance" without unioning
 * five different spellings of the same word.
 */
export const GAME_FAILURE = vocabulary(
  [
    "insufficient_balance",
    "round_closed",
    "draw_closed",
    "incomplete_selection",
    "duplicate_ticket",
    "below_minimum",
    "above_maximum",
    "market_closed",
    "provider_timeout",
    "user_cancelled",
    "unknown",
  ],
  // A second ticket for the same draw is this desk's duplicate.
  { above_limit: "above_maximum", already_submitted: "duplicate_ticket" }
);

export const SQUARE_FAILURE = vocabulary(
  [
    "media_too_large",
    "unsupported_media",
    "not_permitted",
    "empty_post",
    "rate_limited",
    "provider_timeout",
    "user_cancelled",
    "unknown",
  ],
  { kyc_required: "not_permitted", blocked_region: "not_permitted" }
);

export const PERP_FAILURE = vocabulary(
  [
    "insufficient_margin",
    "leverage_too_high",
    "market_closed",
    "order_rejected",
    "slippage_exceeded",
    "provider_timeout",
    "user_cancelled",
    "unknown",
  ],
  {
    insufficient_balance: "insufficient_margin",
    order_failed: "order_rejected",
    rail_rejected: "order_rejected",
    simulation_failed: "order_rejected",
  }
);

/** What a failure event carries: the domain's reason, and the raw code if any. */
export interface Failure<R extends Reason = Reason> {
  reason: R;
  /** The service's own code, or the classifier's verdict when the domain has no word for it. */
  reason_detail?: string;
}

// The trade service's codes (see TRADE_ERROR_KEYS in lib/errors) and the
// providers' own, where they map onto a reason.
const BY_CODE: Record<string, Reason> = {
  INSUFFICIENT_BALANCE: "insufficient_balance",
  INSUFFICIENT_FUNDS: "insufficient_balance",
  INSUFFICIENT_MARGIN: "insufficient_margin",
  NO_SWAP_ROUTE: "no_route",
  NO_ROUTE: "no_route",
  SIMULATION_FAILED: "simulation_failed",
  HIGH_PRICE_IMPACT: "slippage_exceeded",
  INVALID_SLIPPAGE: "slippage_exceeded",
  SLIPPAGE_EXCEEDED: "slippage_exceeded",
  PROVIDER_ERROR: "provider_timeout",
  QUOTE_PROVIDER_ERROR: "provider_timeout",
  SERVICE_UNAVAILABLE: "provider_timeout",
  BAD_RESPONSE: "provider_timeout",
  RATE_LIMITED: "rate_limited",
  TOO_MANY_REQUESTS: "rate_limited",
  EMAIL_TAKEN: "email_taken",
  EMAIL_UNVERIFIED: "email_unverified",
  INVALID_CREDENTIALS: "invalid_credentials",
  BLOCKED_REGION: "blocked_region",
  KYC_REQUIRED: "kyc_required",
  INVALID_ADDRESS: "invalid_address",
  INVALID_ACCOUNT_NUMBER: "invalid_account_number",
  WRONG_NETWORK: "wrong_network",
  BELOW_MINIMUM: "below_minimum",
  ABOVE_LIMIT: "above_limit",
  MARKET_CLOSED: "market_closed",
  MARKET_SUSPENDED: "market_suspended",
  ODDS_CHANGED: "odds_changed",
  RATE_EXPIRED: "rate_expired",
  DUPLICATE_ORDER: "already_submitted",
  ORDER_REJECTED: "order_rejected",
  LEVERAGE_TOO_HIGH: "leverage_too_high",
};

// Checked in order when there is no code to go by. The first patterns are the
// ones lib/errors uses to choose what to tell the user.
const BY_MESSAGE: [RegExp, Reason][] = [
  [
    /(user rejected|user denied|denied the request|rejected the request|user declined|request rejected|cancell?ed|user closed)/,
    "user_cancelled",
  ],
  [/already (registered|in use|taken|exists)|email.*(taken|exists)/, "email_taken"],
  [/(invalid|incorrect|wrong).*(password|credential|code|otp)/, "invalid_credentials"],
  [/(verify|unverified).*email|email.*not verified/, "email_unverified"],
  [
    /(not available|restricted|blocked).*(region|country)|region.*(blocked|restricted)/,
    "blocked_region",
  ],
  [/rate limit|too many (requests|attempts)|slow down/, "rate_limited"],
  [/insufficient margin|not enough margin/, "insufficient_margin"],
  [
    /insufficient[- ]?balance|amount exceeds balance|exceeds allowance|insufficient funds/,
    "insufficient_balance",
  ],
  [/insufficient liquidity|no liquidity|pool.*empty/, "insufficient_liquidity"],
  [/no route/, "no_route"],
  [/leverage.*(too high|exceeds|not allowed)/, "leverage_too_high"],
  [/slippage|price impact|too little received/, "slippage_exceeded"],
  [/simulation failed/, "simulation_failed"],
  [/(quote|rate).*(expired|stale)|expired.*(quote|rate)/, "rate_expired"],
  [/odds.*(changed|moved)/, "odds_changed"],
  [/market.*(suspended|halted)/, "market_suspended"],
  [/market.*closed|closed.*market|outside trading hours/, "market_closed"],
  [/(invalid|malformed).*address|address.*invalid/, "invalid_address"],
  [/(invalid|unknown).*account number|account.*not found/, "invalid_account_number"],
  [/wrong network|unsupported (network|chain)|network mismatch/, "wrong_network"],
  [/kyc|verification required|identity.*required/, "kyc_required"],
  [/below.*(minimum|min)|(minimum|min).*(is|of)/, "below_minimum"],
  [/above.*(limit|maximum|max)|exceeds.*(limit|maximum)/, "above_limit"],
  [/round (closed|over|ended)|betting closed/, "round_closed"],
  [/draw (closed|over|ended)/, "draw_closed"],
  [/(incomplete|pick|select).*(number|selection)|not enough numbers/, "incomplete_selection"],
  [/(file|image|video|media).*(too (large|big))|exceeds.*size/, "media_too_large"],
  [/unsupported (file|image|video|media|format)|invalid file type/, "unsupported_media"],
  [/(not allowed|not permitted|forbidden|unauthorized)/, "not_permitted"],
  [/(empty|blank).*(post|message)|post.*(empty|blank)/, "empty_post"],
  [/already (submitted|placed|pending)|duplicate/, "already_submitted"],
  [/(rejected|declined) by/, "rail_rejected"],
  [
    /failed to fetch|fetch failed|network ?error|timed? ?out|timeout|econn|offline|load failed/,
    "provider_timeout",
  ],
];

// EIP-1193's "user rejected the request".
const USER_REJECTED = 4001;

function codeOf(error: unknown): string | number | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" || typeof code === "number" ? code : null;
}

/** What an error is, before any domain has narrowed it. */
function classify(error: unknown): { reason: Reason; detail?: string } {
  const code = codeOf(error);
  if (code === USER_REJECTED) return { reason: "user_cancelled" };

  // A code is only kept when it looks like one, so a provider that puts a
  // sentence in `code` does not smuggle it through.
  const detail = typeof code === "string" && /^[A-Z][A-Z0-9_]*$/.test(code) ? code : undefined;
  if (detail && BY_CODE[detail]) return { reason: BY_CODE[detail], detail };

  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  for (const [pattern, reason] of BY_MESSAGE) {
    if (pattern.test(message)) return { reason, detail };
  }
  return { reason: "unknown", detail };
}

/**
 * Narrows a reason to what a domain accepts. A reason the domain has no word
 * for becomes `unknown`, and the reason it would have been is kept as the
 * detail so the bucket can still be broken down.
 */
function narrow<R extends Reason>(
  vocab: Vocabulary<R>,
  reason: Reason,
  detail?: string
): Failure<R> {
  const aliased = vocab.aliases[reason] ?? reason;
  if ((vocab.reasons as readonly Reason[]).includes(aliased)) {
    const narrowed = aliased as R;
    return detail ? { reason: narrowed, reason_detail: detail } : { reason: narrowed };
  }
  // `unknown` is in every vocabulary by construction.
  return { reason: "unknown" as R, reason_detail: detail ?? reason };
}

/** The reason an error represents, in one domain's words. Never its message. */
export function reasonFor<R extends Reason>(vocab: Vocabulary<R>, error: unknown): Failure<R> {
  const { reason, detail } = classify(error);
  return narrow(vocab, reason, detail);
}

/**
 * A reason a domain names outright, rather than one read off an error. Use
 * where the screen knows why it stopped: a slip under three legs, a stake below
 * the minimum, a balance it checked itself.
 */
export function statedReason<R extends Reason>(vocab: Vocabulary<R>, reason: R): Failure<R> {
  return narrow(vocab, reason);
}

/**
 * The reason for an order a venue ended without filling, reported by its
 * settlement stage (Dextopus says `refunded` or `failed`) rather than by an
 * error. The venue does not say why, so the stage is kept as the detail.
 */
export function failureReasonForStage<R extends Reason>(
  vocab: Vocabulary<R>,
  stage: string
): Failure<R> {
  return narrow(vocab, "unknown", stage);
}
