// The event catalog as data, so it can be checked at runtime.
//
// ./events is the catalog as types. TypeScript enforces it at every call site,
// which is most of the job, but it stops at the boundary where a value's type
// is asserted rather than known: a figure parsed out of an API response, a
// number that arrived as a decimal string, anything cast on the way in. Those
// reach Mixpanel looking exactly like a violation of the spec, and nothing
// fails until someone tries to sum a column of quoted numbers weeks later.
//
// So the shapes are restated here as data and checked against what actually
// goes on the wire. Two things keep this from drifting away from ./events:
//
//   - EVENT_SCHEMA is typed Record<AnalyticsEventName, ...>, so an event added
//     to the catalog without a shape here does not compile.
//   - The suite validates the catalog and rejects a deliberately malformed
//     event, so CI fails rather than the data quietly rotting.
//
// This is what makes the spec enforceable instead of merely written down.

import type { AnalyticsEventName } from "@/lib/analytics/events";

export type PropType = "number" | "string" | "boolean";

export interface Shape {
  props: Record<string, PropType>;
  required: readonly string[];
}

// One shape, or one per variant for an event whose properties depend on a
// discriminant (the funding rail, the trading vertical). A payload is valid if
// it matches any of them, which is `oneOf` in JSON Schema terms.
export type EventSchema = readonly Shape[];

export interface Violation {
  property?: string;
  message: string;
}

/**
 * Declares a shape. A key ending in `?` is optional; every other key is
 * required. Written this way because a shape reads as one line per event
 * rather than as two parallel lists that can disagree with each other.
 */
function shape(spec: Record<string, PropType>): Shape {
  const props: Record<string, PropType> = {};
  const required: string[] = [];
  for (const [key, type] of Object.entries(spec)) {
    const optional = key.endsWith("?");
    const name = optional ? key.slice(0, -1) : key;
    props[name] = type;
    if (!optional) required.push(name);
  }
  return { props, required };
}

// An event that carries nothing. Anything sent with it is a violation.
const NOTHING: EventSchema = [shape({})];

export const EVENT_SCHEMA: Record<AnalyticsEventName, EventSchema> = {
  // Auth and onboarding
  auth_started: NOTHING,
  signup_completed: [shape({ method: "string" })],
  login_completed: [shape({ method: "string" })],
  passkey_added: NOTHING,
  passkey_skipped: NOTHING,

  // KYC
  kyc_started: [shape({ kyc_type: "string" })],
  kyc_completed: NOTHING,
  kyc_failed: [shape({ reason: "string" })],

  // Funding
  add_funds_opened: NOTHING,
  fund_method_selected: [shape({ method: "string" })],
  deposit_network_selected: [shape({ network: "string" })],
  // Two rails, two shapes. The bank leg's Naira properties are required, and
  // `provider` is the rail rather than the user's own bank; see DepositCompleted.
  deposit_completed: [
    shape({ method: "string", amount_usd: "number", source_network: "string" }),
    shape({
      method: "string",
      amount_usd: "number",
      amount_ngn: "number",
      fx_rate: "number",
      provider: "string",
      "fee_ngn?": "number",
    }),
  ],
  bank_account_requested: [shape({ amount_ngn: "number", fx_rate: "number", reused: "boolean" })],
  deposit_failed: [shape({ method: "string", reason: "string" })],

  // Trading
  market_viewed: [shape({ vertical: "string", asset: "string" })],
  trade_previewed: [
    shape({ vertical: "string", asset: "string", side: "string", amount_usd: "number" }),
  ],
  trade_completed: [
    shape({
      vertical: "string",
      asset: "string",
      side: "string",
      amount_usd: "number",
      "fee_usd?": "number",
      "network?": "string",
      "mode?": "string",
    }),
    shape({
      vertical: "string",
      token: "string",
      side: "string",
      amount_usd: "number",
      network: "string",
      "slippage_pct?": "number",
      "price_impact_pct?": "number",
      "risk_label?": "string",
    }),
    shape({
      vertical: "string",
      asset: "string",
      side: "string",
      amount_usd: "number",
      "apy?": "number",
      "category?": "string",
      "issuer?": "string",
    }),
  ],
  trade_failed: [shape({ vertical: "string", asset: "string", reason: "string" })],

  // Perpetuals
  perp_market_viewed: [shape({ market: "string", "market_type?": "string" })],
  perp_trade_opened: [
    shape({
      market: "string",
      "market_type?": "string",
      side: "string",
      leverage: "number",
      collateral_usd: "number",
      position_size_usd: "number",
      order_type: "string",
      "entry_price?": "number",
      "limit_price?": "number",
      has_take_profit: "boolean",
      "take_profit_price?": "number",
      has_stop_loss: "boolean",
      "stop_loss_price?": "number",
      "opening_fee_usd?": "number",
      "execution_fee_eth?": "number",
    }),
  ],
  perp_trade_closed: [
    shape({
      market: "string",
      close_type: "string",
      close_reason: "string",
      pnl_usd: "number",
      amount_usd: "number",
      notional_usd: "number",
    }),
  ],
  perp_tpsl_set: [shape({ market: "string", has_tp: "boolean", has_sl: "boolean" })],
  perp_margin_adjusted: [shape({ market: "string", action: "string", amount_usd: "number" })],

  // Prediction
  prediction_market_viewed: [
    shape({ market_id: "string", "category?": "string", scope: "string" }),
  ],
  prediction_bet_placed: [
    shape({
      market_id: "string",
      "category?": "string",
      scope: "string",
      side: "string",
      amount_usd: "number",
      price_cents: "number",
      "outcome_label?": "string",
    }),
  ],
  prediction_market_created: [
    shape({
      market_type: "string",
      "category?": "string",
      seed_usd: "number",
      "closes_in?": "string",
      num_outcomes: "number",
    }),
  ],
  prediction_liquidity_provided: [shape({ market_id: "string", amount_usd: "number" })],
  prediction_market_resolved: [
    shape({ market_id: "string", outcome: "string", num_outcomes: "number" }),
  ],
  prediction_payout_claimed: [
    shape({ "market_id?": "string", scope: "string", "amount_usd?": "number" }),
  ],

  // Kash
  kash_bought: [shape({ amount_usd: "number", kash_amount: "number" })],
  kash_sold: [shape({ kash_amount: "number", amount_usd: "number" })],
  kash_earned: [shape({ "source?": "string", kash_amount: "number" })],

  // Earn marketplace
  earn_listing_viewed: [shape({ listing_id: "string", "type?": "string" })],
  earn_application_started: [shape({ listing_id: "string", "type?": "string" })],
  earn_application_submitted: [shape({ listing_id: "string", "type?": "string" })],
  earn_company_created: NOTHING,
  earn_listing_published: [
    shape({
      type: "string",
      reward_amount: "number",
      token: "string",
      "region?": "string",
      "who_can_apply?": "string",
    }),
  ],

  // Arkade games
  game_opened: [shape({ game: "string" })],
  game_wallet_funded: [shape({ game: "string", amount_usd: "number" })],
  chess_game_created: [shape({ clock_min: "number", stake_usd: "number", mode: "string" })],
  chess_challenge_accepted: [shape({ stake_usd: "number", clock_min: "number" })],
  chess_challenge_declined: NOTHING,
  chess_game_started: [shape({ stake_usd: "number" })],
  game_result: [
    shape({
      game: "string",
      result: "string",
      reason: "string",
      stake_usd: "number",
      payout_usd: "number",
      fee_usd: "number",
    }),
  ],
  game_watched: [shape({ game: "string", match_id: "string" })],
  spectator_bet_placed: [
    shape({
      game: "string",
      match_id: "string",
      side: "string",
      amount_usd: "number",
      "odds?": "number",
    }),
  ],
  game_staked: [shape({ game: "string", amount_usd: "number" })],
  last_man_played: [shape({ cost_usd: "number" })],
  last_man_won: [shape({ pot_usd: "number", winnings_usd: "number", started_it: "boolean" })],
  tournament_joined: [shape({ game: "string", entry_usd: "number" })],

  // Cross-border
  send_money_opened: NOTHING,
  send_destination_selected: [shape({ country: "string", currency: "string" })],
  send_completed: [
    shape({
      corridor: "string",
      amount_usd: "number",
      amount_local: "number",
      "fee_usd?": "number",
      "fee_local?": "number",
      "fee_currency?": "string",
    }),
  ],

  // Withdraw
  withdraw_opened: NOTHING,
  withdraw_completed: [
    shape({
      method: "string",
      asset: "string",
      amount_usd: "number",
      "network?": "string",
      "recipient_address?": "string",
    }),
    shape({
      method: "string",
      asset: "string",
      amount_usd: "number",
      amount_ngn: "number",
      fx_rate: "number",
      bank: "string",
      "fee_ngn?": "number",
    }),
  ],

  // Engagement
  page_view: [shape({ page: "string" })],
  currency_switched: [shape({ currency: "string" })],
  referral_completed: NOTHING,
  arktivity_tx_opened: [shape({ chain: "string", direction: "string" })],
};

function typeOf(value: unknown): PropType | "other" {
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  if (typeof value === "boolean") return "boolean";
  return "other";
}

function checkShape(shp: Shape, props: Record<string, unknown>): Violation[] {
  const found: Violation[] = [];

  for (const key of shp.required) {
    if (!(key in props)) {
      found.push({ property: key, message: `missing required property "${key}"` });
    }
  }

  for (const [key, value] of Object.entries(props)) {
    const expected = shp.props[key];
    if (!expected) {
      // The catalog is the taxonomy. A property nobody declared is either a
      // typo or a shape that was never agreed, and both are how a catalog
      // stops describing what is actually being sent.
      found.push({ property: key, message: `unknown property "${key}"` });
      continue;
    }
    const actual = typeOf(value);
    if (actual === expected) continue;
    if (expected === "number" && actual === "string") {
      // Called out separately because it is the failure that survives review:
      // Mixpanel coerces on read, so a quoted number looks correct in the UI
      // and only breaks sums and numeric filters later.
      found.push({
        property: key,
        message: `"${key}" must be an unquoted number, got the string ${JSON.stringify(value)}`,
      });
      continue;
    }
    found.push({
      property: key,
      message: `"${key}" must be a ${expected}, got ${actual === "other" ? JSON.stringify(value) : actual}`,
    });
  }

  return found;
}

/**
 * What is wrong with `props` as a payload for `name`, or an empty list if
 * nothing is.
 *
 * An event with several shapes is valid if it matches any one of them. When it
 * matches none, the complaints reported are those of the closest shape, so the
 * message names the properties the developer actually got wrong rather than
 * every difference from every variant.
 */
export function validateEvent(
  name: AnalyticsEventName,
  props: Record<string, unknown>
): Violation[] {
  const shapes = EVENT_SCHEMA[name];
  if (!shapes) return [{ message: `"${name}" is not in the event catalog` }];

  let closest: Violation[] | null = null;
  for (const shp of shapes) {
    const found = checkShape(shp, props);
    if (found.length === 0) return [];
    if (closest === null || found.length < closest.length) closest = found;
  }
  return closest ?? [];
}
