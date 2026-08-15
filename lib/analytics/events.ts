// The product analytics catalog. Every event the app sends is named here, with
// the properties it carries, so a screen cannot invent a name, misspell one, or
// drift from the agreed shape without failing the build.
//
// Conventions, enforced by the types below and by `track`:
//   - event names are snake_case and past tense: `trade_completed`
//   - property names are snake_case
//   - numbers go unquoted; a property with no value is omitted, never sent as
//     null, "" or "N/A" (see `track` in ./mixpanel)
//   - one action is one event; variants are a property (`vertical`, `scope`),
//     not a second event name
//
// Never add a property here that could carry a NIN, BVN, bank account or
// virtual account number, transfer reference, OTP, passkey or key material.
// Those are identity-theft and account-drainage grade, and NIN/BVN are NDPR
// crown jewels. Contact details (email, name) are governed profile fields set
// once on identify, never event properties.

export type Vertical = "spot" | "memecoin" | "real_asset";
export type SignupMethod = "google" | "x" | "email" | "passkey" | "kingschat";
export type Side = "buy" | "sell";
export type Game = "chess" | "last_man" | "checkers";
export type KycStatus = "none" | "pending" | "verified";
export type UserTier = "new" | "activated" | "power";

// The nav sections `page_view` reports. Kept as a union so a new route has to
// be mapped deliberately rather than leaking a raw pathname into the data.
export type PageName =
  | "portfolio"
  | "spot"
  | "perpetuals"
  | "memecoins"
  | "real_assets"
  | "prediction"
  | "earn"
  | "arkade"
  | "arktivity";

/**
 * Event name -> its properties. `void` means the event takes none.
 *
 * Two names here predate this catalog and are already live on the site,
 * `login_completed` and `page_view`. They keep their exact spelling rather
 * than being renamed to match the `_completed` pattern, so existing reports
 * do not break.
 */
export interface AnalyticsEvents {
  // Auth and onboarding
  auth_started: void;
  signup_completed: { method: SignupMethod };
  login_completed: { method: string };
  passkey_added: void;
  passkey_skipped: void;

  // KYC. The identity check itself is the only thing recorded: which document
  // type was used, and whether it passed. Never the number behind it.
  kyc_started: { kyc_type: "nin" | "bvn" };
  kyc_completed: void;
  kyc_failed: { reason: string };

  // Funding
  add_funds_opened: void;
  fund_method_selected: { method: "crypto" | "bank" };
  deposit_network_selected: { network: string };
  deposit_completed: { method: "crypto"; source_network: string; amount_usd: number };
  // The amounts and the rate, never the account number the user was given.
  bank_account_requested: { amount_ngn: number; amount_usd: number; fx_rate: number };
  bank_transfer_completed: { amount_ngn: number; amount_usd: number; bank: string };
  deposit_failed: { method: "crypto" | "bank"; reason: string };

  // Trading. One event across the verticals, told apart by `vertical`.
  market_viewed: { vertical: Vertical; asset: string };
  trade_previewed: { vertical: Vertical; asset: string; side: Side; amount_usd: number };
  trade_completed: TradeCompleted;
  trade_failed: { vertical: Vertical; asset: string; reason: string };

  // Perpetuals
  perp_market_viewed: { market: string; market_type?: MarketType };
  perp_trade_opened: PerpTradeOpened;
  perp_trade_closed: {
    market: string;
    close_type: "full" | "partial";
    /**
     * What ended the position. Only a close the user asked for reaches this
     * app: a stop, a take profit and a liquidation are all executed on chain by
     * the keeper, with nothing to report from the browser. Those three are in
     * the union so the field does not have to change shape when the backend can
     * report them, but today every event carries "manual".
     */
    close_reason: "manual" | "stop_loss" | "take_profit" | "liquidation";
    pnl_usd: number;
    amount_usd: number;
    notional_usd: number;
  };
  perp_tpsl_set: { market: string; has_tp: boolean; has_sl: boolean };
  perp_margin_adjusted: { market: string; action: "add" | "remove"; amount_usd: number };

  // Prediction
  prediction_market_viewed: { market_id: string; category?: string; scope: PredictionScope };
  prediction_bet_placed: {
    market_id: string;
    category?: string;
    scope: PredictionScope;
    side: "yes" | "no";
    amount_usd: number;
    price_cents: number;
    outcome_label?: string;
  };
  prediction_market_created: {
    market_type: "single" | "multi";
    category?: string;
    seed_usd: number;
    closes_in?: string;
    num_outcomes: number;
  };
  prediction_liquidity_provided: { market_id: string; amount_usd: number };
  prediction_market_resolved: { market_id: string; outcome: "yes" | "no"; num_outcomes: number };
  // The contract pays every settled position in one call, so a claim cannot
  // always name a single market or amount. Both are omitted rather than
  // reported as an empty string and a zero, which would read as a real $0 claim.
  prediction_payout_claimed: { market_id?: string; scope: PredictionScope; amount_usd?: number };

  // Kash
  kash_bought: { amount_usd: number; kash_amount: number };
  kash_sold: { kash_amount: number; amount_usd: number };
  // `source` is omitted when points are settled in bulk: a weekly claim mixes
  // trading, games and referral activity, and the engine does not break the
  // total down, so naming one would be a guess.
  kash_earned: { source?: "trading" | "games" | "referral"; kash_amount: number };

  // Earn marketplace. `earn_company_created` deliberately carries nothing: the
  // form it fires from collects a legal entity name, which must not be sent.
  earn_listing_viewed: { listing_id: string; type?: EarnListingType };
  earn_application_started: { listing_id: string; type?: EarnListingType };
  earn_application_submitted: { listing_id: string; type?: EarnListingType };
  earn_company_created: void;
  earn_listing_published: {
    type: EarnListingType;
    reward_amount: number;
    token: string;
    region?: string;
    who_can_apply?: string;
  };

  // Arkade games
  game_opened: { game: Game };
  game_wallet_funded: { game: Game; amount_usd: number };
  chess_game_created: {
    clock_min: number;
    stake_usd: number;
    mode: "invite" | "quick" | "tournament";
  };
  chess_challenge_accepted: { stake_usd: number; clock_min: number };
  chess_challenge_declined: void;
  chess_game_started: { stake_usd: number };
  // `fee_usd` is the platform's 5% cut of the winnings.
  game_result: {
    game: Game;
    result: "win" | "loss" | "draw";
    // "no_moves" covers a draughts side that is blocked or wiped out, which is
    // the game's equivalent of checkmate and has no chess name.
    reason: "checkmate" | "no_moves" | "resign" | "timeout" | "abandoned" | "draw";
    stake_usd: number;
    payout_usd: number;
    fee_usd: number;
  };
  game_watched: { game: Game; match_id: string };
  spectator_bet_placed: {
    game: Game;
    match_id: string;
    side: "white" | "draw" | "black";
    amount_usd: number;
    odds?: number;
  };
  game_staked: { game: Game; amount_usd: number };
  last_man_played: { cost_usd: number };
  last_man_won: { pot_usd: number };
  tournament_joined: { game: Game; entry_usd: number };

  // Cross-border
  send_money_opened: void;
  send_destination_selected: { country: string; currency: string };
  send_completed: {
    corridor: string;
    amount_usd: number;
    amount_local: number;
    /**
     * The rail quotes its fee in the currency being received, not in dollars,
     * and only quotes one at all some of the time. `fee_local` carries that
     * figure with `fee_currency` to say what it is denominated in; `fee_usd`
     * stays for a rail that does quote in dollars. All three are omitted when
     * no fee was quoted, rather than reported as a zero the user did not pay.
     */
    fee_usd?: number;
    fee_local?: number;
    fee_currency?: string;
  };

  // Withdraw
  withdraw_opened: void;
  withdraw_completed: {
    method: "wallet" | "bank";
    asset: string;
    amount_usd: number;
    network?: string;
    /**
     * Where a crypto withdrawal was sent. An on-chain address is public by
     * construction, the same class of value as the wallet address we already
     * use as the distinct_id, and it is what makes a withdrawal traceable to
     * the chain.
     *
     * Only ever set for `method: "wallet"`. A bank withdrawal's recipient is an
     * account number, which is on the never-send list, so that rail sends no
     * recipient at all.
     */
    recipient_address?: string;
  };

  // Engagement
  page_view: { page: PageName };
  currency_switched: { currency: string };
  referral_completed: void;
  arktivity_tx_opened: { chain: string; direction: "in" | "out" };
}

export type MarketType = "crypto" | "forex" | "commodity" | "equity";
export type PredictionScope = "global" | "local";
export type EarnListingType = "bounty" | "project" | "grant";

// Trading carries the fields its vertical actually has: a spot fill knows its
// network and whether it came from the simple or pro screen, a memecoin fill
// knows slippage and the risk label, a real-world asset knows its issuer.
export type TradeCompleted =
  | {
      vertical: "spot";
      asset: string;
      side: Side;
      amount_usd: number;
      fee_usd?: number;
      network?: string;
      mode?: "simple" | "pro";
    }
  | {
      vertical: "memecoin";
      token: string;
      side: Side;
      amount_usd: number;
      slippage_pct?: number;
      price_impact_pct?: number;
      risk_label?: "low" | "medium" | "critical";
      network: "base";
    }
  | {
      vertical: "real_asset";
      asset: string;
      side: Side;
      amount_usd: number;
      apy?: number;
      category?: "credit" | "carbon" | "real_estate";
      issuer?: string;
    };

export interface PerpTradeOpened {
  market: string;
  market_type?: MarketType;
  side: "long" | "short";
  leverage: number;
  collateral_usd: number;
  position_size_usd: number;
  order_type: "market" | "limit" | "stop";
  /**
   * The price the position actually opened at. A limit or stop order has none
   * yet: it is resting until the keeper triggers it, and `limit_price` carries
   * the level it is waiting for instead.
   */
  entry_price?: number;
  /** The trigger level, set only when `order_type` is not "market". */
  limit_price?: number;
  // Whether the position was opened with an exit already attached, and at what
  // level. The flags are always sent so "no take profit" is a fact in the data
  // rather than a missing property; the prices are sent only when they exist.
  has_take_profit: boolean;
  take_profit_price?: number;
  has_stop_loss: boolean;
  stop_loss_price?: number;
  opening_fee_usd?: number;
  execution_fee_eth?: number;
}

export type AnalyticsEventName = keyof AnalyticsEvents;

// Profile fields Mixpanel keeps a running total of. The client sends the
// delta and the server holds the sum, so two devices cannot race each other
// into a wrong figure.
export type ProfileCounter =
  | "total_deposit_usd"
  | "total_volume_usd"
  | "trade_count"
  | "lifetime_kash_earned"
  | "referral_count";

// Attached to every event, so any of them can be sliced by who sent it without
// each call site having to pass these through.
export interface SuperProperties {
  kyc_status: KycStatus;
  country?: string;
  has_deposited: boolean;
  user_tier: UserTier;
  platform: "web";
  app_version?: string;
}

// Set once on identify. The EVM address is already the distinct_id, so it is
// not repeated here. `$email` and `$name` are Mixpanel's reserved contact
// fields: governed, set only here, and never copied onto an event.
export interface UserProfile {
  $email?: string;
  $name?: string;
  sol_address?: string;
  signup_method?: string;
  signup_date?: string;
  country?: string;
  kyc_status?: KycStatus;
  has_deposited?: boolean;
  first_deposit_method?: string;
  first_deposit_date?: string;
  total_deposit_usd?: number;
  total_volume_usd?: number;
  trade_count?: number;
  verticals_used?: string[];
  kash_balance?: number;
  kash_active?: boolean;
  lifetime_kash_earned?: number;
  referral_count?: number;
  portfolio_value_usd?: number;
}
