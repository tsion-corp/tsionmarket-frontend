// The product analytics catalog. Every event the app sends is named here, with
// the properties it carries, so a screen cannot invent a name, misspell one, or
// drift from the agreed shape without failing the build.
//
// Sections 1 to 8 of management's catalog (landing, auth, add funds, withdraw,
// Kash, trading, prediction, perps) are implemented here. Sections 9 to 11
// (Arkade, Square, Arkivity) are a second pass: the Arkade events below are the
// ones already in the app, not yet the catalog's. See
// docs/adr/ADR-2026-09-22-mixpanel-management-catalog.md.
//
// Conventions, enforced by the types below and by `track`:
//   - event names are snake_case and past tense: `trade_completed`
//   - property names are snake_case
//   - money is always a number, never a string. `amount_usd` is dollars on
//     every event that has it; `amount_ngn` is naira
//   - a property with no value is omitted, never sent as null, "" or "N/A"
//     (see `track` in ./mixpanel)
//   - one action is one event; variants are a property (`vertical`, `method`),
//     not a second event name
//
// Never add a property here that could carry a NIN, BVN, bank account or
// virtual account number, transfer reference, OTP, passkey or key material.
// Those are identity-theft and account-drainage grade, and NIN/BVN are NDPR
// crown jewels. Contact details (email, name) are governed profile fields set
// once on identify, never event properties.

import type { AmountSource } from "@/lib/analytics/trade-amounts";
import type {
  AUTH_FAILURE,
  DEPOSIT_FAILURE,
  GAME_FAILURE,
  SQUARE_FAILURE,
  KASH_FAILURE,
  PERP_FAILURE,
  PREDICTION_FAILURE,
  TRADE_FAILURE,
  WITHDRAW_FAILURE,
  Vocabulary,
} from "@/lib/analytics/failure-reason";

/** The reason type a domain's vocabulary permits. */
type ReasonOf<V> = V extends Vocabulary<infer R> ? R : never;

export type AuthReason = ReasonOf<typeof AUTH_FAILURE>;
export type GameReason = ReasonOf<typeof GAME_FAILURE>;
export type SquareReason = ReasonOf<typeof SQUARE_FAILURE>;
export type DepositReason = ReasonOf<typeof DEPOSIT_FAILURE>;
export type WithdrawReason = ReasonOf<typeof WITHDRAW_FAILURE>;
export type KashReason = ReasonOf<typeof KASH_FAILURE>;
export type TradeReason = ReasonOf<typeof TRADE_FAILURE>;
export type PredictionReason = ReasonOf<typeof PREDICTION_FAILURE>;
export type PerpReason = ReasonOf<typeof PERP_FAILURE>;

/**
 * The trading verticals. `rwa` is the catalog's word for real-world assets; the
 * app's own slice is still called `rwa` too, so the two agree.
 */
export type Vertical = "spot" | "memecoin" | "rwa";
export type Side = "buy" | "sell";
export type Direction = "long" | "short";
export type MarginMode = "cross" | "isolated";
export type FundMethod = "crypto" | "bank";
export type WithdrawMethod = "bank" | "wallet";
/**
 * The Arkade games. `pilot_chicken` and the rest are the catalog's spellings.
 * `checkers` is draughts, which the catalog does not list but the app ships.
 */
export type Game = "chess" | "checkers" | "last_man" | "arkball" | "arkjet" | "pilot_chicken";

/** How a chess game was started. */
export type ChessMode =
  "play_online" | "challenge_friend" | "vs_computer" | "puzzles" | "learn" | "watch";

/** How a chess game finished. */
export type ChessEndReason =
  "checkmate" | "resign" | "timeout" | "stalemate" | "draw_agreed" | "abandoned";

export type ChickenDifficulty = "easy" | "medium" | "hard" | "hardcore";

export type SquareTab = "home" | "pals" | "chat";
export type SquareMediaType = "text" | "image" | "video";
export type KycStatus = "none" | "pending" | "verified";
export type UserTier = "new" | "activated" | "power";

/**
 * How someone signed in. The catalog lists email, google, x, apple and wallet;
 * `passkey` and `kingschat` are ours, because Privy offers both here and
 * reporting them as something else would be a lie about how people get in.
 */
export type AuthMethod = "email" | "google" | "x" | "apple" | "wallet" | "passkey" | "kingschat";

/**
 * The page a `page_view` is about, as a name rather than a URL.
 *
 * Closed on purpose: a report groups on this, and a raw pathname would split
 * one page into a row per id. The path rides alongside on every event, so a
 * route that has not been named here is still visible in the data, just not
 * grouped. Add the name when you add the route.
 */
export type PageName =
  | "landing"
  | "welcome"
  | "auth"
  | "interests"
  | "vault"
  | "privacy"
  | "terms"
  | "portfolio"
  | "spot"
  | "spot_asset"
  | "perpetuals"
  | "memecoins"
  | "real_assets"
  | "prediction"
  | "prediction_market"
  | "earn"
  | "earn_listing"
  | "arkade"
  | "arkade_chess"
  | "arkade_checkers"
  | "arkade_last_man"
  | "arkade_arkball"
  | "arkade_arkjet"
  | "arkade_chicken"
  | "arktivity"
  | "market_square";

/** The campaign tags a landing URL carries. Absent ones are omitted. */
export interface CampaignTags {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
}

/**
 * Event name -> its properties. `void` means the event takes none.
 *
 * Two names predate this catalog and are already live on the site,
 * `login_completed` and `page_view`. They keep their exact spelling, and the
 * catalog agrees with both.
 */
export interface AnalyticsEvents {
  // 1. Landing
  /**
   * Every page, on first load and on every client-side navigation. `page` names
   * it, `path` is the raw pathname, and the campaign tags are read off the URL
   * so a link landed on mid-session is attributed too.
   */
  page_view: CampaignTags & {
    page?: PageName;
    path: string;
    referrer?: string;
  };
  get_started_clicked: { placement: string };

  // 2. Auth
  /** `intent` is which door the visitor came through, not what they end up doing. */
  auth_started: { intent: "signup" | "login" };
  auth_method_selected: { method: AuthMethod };
  /**
   * Sent from the browser once the account is identified. The catalog asks for
   * this to come from the server when the account row is written; that belongs
   * to the outbox work in docs/mixpanel-server-events-integration.md.
   */
  signup_completed: { method: AuthMethod; referral_code?: string };
  signup_failed: { method: AuthMethod; reason: AuthReason; reason_detail?: string };
  login_completed: { method: AuthMethod };
  login_failed: { method: AuthMethod; reason: AuthReason; reason_detail?: string };

  // Migration of money out of the old Privy wallets. Never carries addresses.
  migration_started: { entry: "balance_card" | "account_modal" | "gate" };
  migration_linked: void;
  // Linking failed terminally (the old wallet is bound to another account), so
  // the gate offered a way out instead of another retry. `code` is the gateway
  // error code, never an address.
  migration_link_blocked: { code: string };
  // The sign-in lapsed under the upgrade (every call answered 401), so the
  // gate said so and sent the person back to sign in. A pause, not a failure.
  migration_session_expired: void;
  // The user put the gate away for a while: they cannot sign into the old
  // account, or the current step kept failing. A delay, never a completion.
  migration_gate_snoozed: {
    reason: "no_access" | "failing" | "browser" | "blocked";
    stage: string;
  };
  migration_reviewed: {
    holdings: number;
    opted_in: number;
    settle_later: number;
    value_usd: number;
  };
  migration_step_completed: { venue: string; kind: string };
  migration_step_failed: { venue: string; kind: string; retryable: boolean };
  migration_completed: { outcome: "complete" | "partial" | "blocked"; moved_usd: number };
  passkey_added: void;
  // `supported` is false where the device cannot make a passkey at all, and
  // the only way on was "Continue": not a choice to skip.
  passkey_skipped: { supported: boolean };

  // KYC. The identity check itself is the only thing recorded: which document
  // type was used, and whether it passed. Never the number behind it.
  kyc_started: { kyc_type?: "nin" | "bvn" };
  kyc_completed: void;
  kyc_failed: { reason: AuthReason; reason_detail?: string };

  // 3. Add funds
  add_funds_opened: void;
  fund_method_selected: { method: FundMethod };
  deposit_network_selected: { network: string };
  deposit_address_generated: { network: string; asset: string };
  deposit_address_failed: { network: string; reason: DepositReason; reason_detail?: string };
  /**
   * A virtual account was asked for. `provider` is the rail. The amounts and
   * the rate quoted at request time ride along where the screen knows them: the
   * gap between this rate and the one on `bank_transfer_completed` is the
   * spread the naira rail charges. Never the account number itself.
   */
  bank_account_requested: {
    provider: string;
    amount_ngn?: number;
    fx_rate?: number;
    reused?: boolean;
  };
  bank_account_generated: { provider: string; bank: string };
  bank_account_failed: { provider: string; reason: DepositReason; reason_detail?: string };
  /**
   * A crypto deposit credited to the balance. Reported from the arrival, never
   * on intent. Naira deposits are `bank_transfer_completed`, a separate event:
   * the two rails are disjoint, so nothing fires both and nothing is counted
   * twice.
   */
  deposit_completed: SettledRecord & {
    amount_usd: number;
    network: string;
    asset: string;
    token_address?: string;
    chain_id?: number;
    order_id?: string;
  };
  /** A naira deposit settled. `fx_rate` is what was actually applied at settlement. */
  bank_transfer_completed: SettledRecord & {
    amount_usd: number;
    amount_ngn: number;
    fx_rate: number;
    provider: string;
    order_id?: string;
    // Only when the provider actually charged one, rather than a zero nobody paid.
    fee_ngn?: number;
  };
  deposit_failed: {
    method: FundMethod;
    reason: DepositReason;
    reason_detail?: string;
    amount_usd?: number;
    network?: string;
    asset?: string;
  };

  // 4. Withdraw
  withdraw_opened: void;
  withdraw_method_selected: { method: WithdrawMethod };
  withdraw_completed: WithdrawCompleted;
  withdraw_failed: {
    method: WithdrawMethod;
    reason: WithdrawReason;
    reason_detail?: string;
    amount_usd?: number;
    order_id?: string;
  };

  // 5. Kash
  kash_bought: KashTrade;
  kash_sold: KashTrade;
  kash_failed: {
    side: Side;
    reason: KashReason;
    reason_detail?: string;
    amount_usd?: number;
    kash_amount?: number;
  };
  // `source` is omitted when points are settled in bulk: a weekly claim mixes
  // trading, games and referral activity, and the engine does not break the
  // total down, so naming one would be a guess.
  kash_earned: { source?: "trading" | "games" | "referral"; kash_amount: number };

  // 6. Trading: spot, memecoin, rwa. One set of events across the verticals.
  market_viewed: { vertical: Vertical; asset: string; token_address?: string; chain_id?: number };
  /**
   * `amount_usd` is the trade's value in dollars on both sides, never the token
   * count. A sell carries `token_quantity` as well, and the validator refuses
   * one without it. See ./trade-amounts.
   */
  trade_previewed: TradeIntent;
  /** The order was sent and the venue accepted it. `order_id` is required: it is
   * what joins this to its completion or its failure, so a retry reads as the
   * same order rather than a second trade. */
  trade_submitted: TradeIntent & { order_id: string };
  trade_completed: TradeCompleted;
  // `amount_usd` is optional here alone: a trade that failed before it was
  // sized has no dollar value, and a zero would read as a real trade of
  // nothing rather than as a figure we do not have.
  trade_failed: Omit<TradeIntent, "amount_usd"> & {
    amount_usd?: number;
    reason: TradeReason;
    reason_detail?: string;
    order_id?: string;
  };
  // The wallet's balance proved the trade, but the trade service recorded it
  // as something else. An ops signal, never shown to the user as a failure.
  trade_recording_mismatch: {
    vertical: Vertical;
    asset: string;
    swap_id: string;
    recorded: string;
    request_id?: string;
    tx_hash?: string;
  };

  // 7. Prediction. A slip is a set of legs; the house takes a minimum of three,
  // so `leg_count` rides on every slip event.
  prediction_market_viewed: {
    market_id: string;
    category?: string;
    odds?: number;
    scope?: PredictionScope;
  };
  prediction_selection_added: {
    market_id: string;
    outcome: string;
    odds?: number;
    slip_size: number;
  };
  prediction_selection_removed: { market_id: string; slip_size: number };
  // `market_ids` is the slip's markets joined by a comma. Mixpanel takes a
  // list property, but a list cannot be grouped or filtered the way a report
  // needs, and the leg detail is already on prediction_selection_added.
  prediction_slip_submitted: PredictionSlip & { market_ids: string };
  prediction_bet_placed: PredictionSlip;
  prediction_bet_failed: {
    slip_id?: string;
    leg_count: number;
    stake_usd: number;
    reason: PredictionReason;
    reason_detail?: string;
  };
  prediction_bet_settled: {
    slip_id?: string;
    outcome: "won" | "lost" | "void";
    stake_usd: number;
    payout_usd: number;
  };
  // Making a market and seeding it is a different act from betting on one, and
  // the catalog's slip events have nothing to say about it.
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
  prediction_payout_claimed: { market_id?: string; scope?: PredictionScope; amount_usd?: number };

  // 8. Perps
  perp_market_viewed: { pair: string; market_type?: MarketType; venue?: PerpVenue };
  perp_order_submitted: PerpOrder & { order_id?: string };
  perp_trade_opened: PerpOrder & {
    order_id?: string;
    position_id?: string;
    /** The price the position actually opened at. A resting order has none yet. */
    entry_price?: number;
    fee_usd?: number;
    execution_fee_eth?: number;
    amount_source?: AmountSource;
  };
  perp_trade_closed: {
    pair: string;
    direction: Direction;
    position_id?: string;
    close_type: "full" | "partial";
    /**
     * What ended the position. Only a close the user asked for reaches this
     * app: a stop, a take profit and a liquidation are all executed on chain by
     * the keeper, with nothing to report from the browser. Those three are in
     * the union so the field does not have to change shape when the backend can
     * report them, but today every event from here carries "manual".
     */
    close_reason: "manual" | "take_profit" | "stop_loss" | "liquidation";
    exit_price?: number;
    pnl_usd: number;
    notional_usd: number;
    fee_usd?: number;
    order_id?: string;
    venue?: PerpVenue;
    amount_source?: AmountSource;
  };
  // An order the desk could not place. The exchange's own rejection of a
  // TP/SL leg is not this: the entry stands, and perp_trade_opened says so.
  perp_trade_failed: {
    pair: string;
    direction: Direction;
    reason: PerpReason;
    reason_detail?: string;
    leverage?: number;
    margin_mode?: MarginMode;
    collateral_usd?: number;
    order_id?: string;
  };
  // No `perp_tpsl_set` or `perp_margin_adjusted`: exits and leverage are set
  // when the order is placed, which perp_trade_opened already carries, and the
  // desk has no way to change either on a position that is already open.

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

  // 9. Arkade
  //
  // The catalog names five games and gives four of them a section of their own.
  // Draughts is a sixth it does not cover, so draughts keeps the generic
  // `game_staked`, `game_result` and `tournament_joined` it already sends.
  // Chess has its own events now and no longer sends those, so nothing is
  // counted under two names.
  arkade_opened: void;
  game_opened: { game: Game };
  // The Arkade balance is a float of its own: money has to be moved into it
  // before a game can be staked, and that step is where funded players are
  // lost. `game_wallet_funded` was the old name and reported only chess.
  arkade_balance_funded: { amount_usd: number };
  arkade_balance_withdrawn: { amount_usd: number };

  // 9.2 Chess
  // Mode, puzzles and tournaments: the chess app has screens for all three,
  // but none of them is wired yet. They are defined because the surfaces exist
  // and the events are next; see the release note.
  chess_mode_selected: { mode: ChessMode };
  chess_game_created: {
    game_id: string;
    mode: ChessMode;
    /** Whether money is on it. A free game is still a game played. */
    staked: boolean;
    amount_usd: number;
    /** The clock as the lobby labels it: "5+0", "10+5". */
    time_control?: string;
  };
  // No `chess_challenge_declined`: the service has a decline for a rematch and
  // for a takeback, but not for a challenge, so there is nothing to report.
  chess_challenge_sent: { game_id: string; amount_usd: number };
  chess_challenge_accepted: { game_id: string; amount_usd: number; time_control?: string };
  // Sent by each player when their game starts, whichever seat they took.
  chess_game_started: {
    game_id: string;
    mode?: ChessMode;
    amount_usd: number;
    opponent_type: "human" | "bot";
    /** 1 to 8, and only against a bot. */
    bot_level?: number;
  };
  /**
   * A game that finished, from the seat of the player who watched it finish.
   *
   * `house_usd` is the platform's cut, reported beside the payout rather than
   * left to be derived. The fee rate has changed before, and a report that
   * divided one by the other would silently restate history when it changes
   * again.
   */
  chess_game_ended: {
    game_id: string;
    result: "win" | "loss" | "draw";
    end_reason: ChessEndReason;
    amount_usd: number;
    payout_usd: number;
    house_usd: number;
    moves?: number;
  };
  chess_puzzle_started: { puzzle_id: string };
  /**
   * A puzzle the player actually solved. Giving up finishes a puzzle too, and
   * counting that would make the solve rate meaningless.
   *
   * `attempts` is optional and is not sent today. The puzzle runner is Lichess's
   * own and reports a move at a time, correct ones included, so a count of
   * those is the length of the solution rather than the number of tries. It
   * returns when the runner tells us how many tries it took.
   */
  chess_puzzle_solved: { puzzle_id: string; attempts?: number };
  chess_tournament_joined: {
    tournament_id: string;
    tournament_type: "arena" | "swiss";
    entry_fee_usd: number;
  };
  // A game that could not be started or staked. Never a game that was lost.
  chess_game_failed: {
    game_id?: string;
    amount_usd?: number;
    reason: GameReason;
    reason_detail?: string;
  };

  // 9.3 Last Man
  //
  // The pot splits winner 50%, house 40%, creator 10%. All three are reported
  // as their own field rather than derived from the pot: the split is a product
  // decision that has to be able to change without restating every past round.
  last_man_created: { game_id: string; entry_fee_usd: number; creator_id?: string };
  /**
   * A player buying into the round. `player_count` is optional because the
   * contract does not expose one and the vault service does not count them:
   * a guessed figure on a pot game is worse than an absent one.
   *
   * There is no `last_man_started`. The round has no start the browser can
   * observe separately from players joining it, so an event for it could only
   * be a second report of the same fact.
   */
  last_man_joined: { game_id: string; entry_fee_usd: number; player_count?: number };
  /**
   * The round settled. Reported by the winner's device only: it is the reveal
   * that carries the settled figures, and nobody else's screen sees them.
   *
   * The three shares are read from the contract's live split rather than from
   * a rate written down here, because the owner can retune it.
   */
  last_man_ended: {
    game_id: string;
    player_count?: number;
    pot_usd: number;
    winner_payout_usd: number;
    house_usd: number;
    creator_usd: number;
    duration_seconds?: number;
  };
  last_man_failed: {
    game_id?: string;
    entry_fee_usd?: number;
    reason: GameReason;
    reason_detail?: string;
  };

  // 9.4 ArkBall
  arkball_opened: {
    draw_id: string;
    jackpot_usd: number;
    tickets_sold: number;
    player_count: number;
  };
  arkball_numbers_selected: { draw_id: string; quick_pick: boolean };
  arkball_ticket_purchased: {
    draw_id: string;
    ticket_id: string;
    ticket_price_usd: number;
    /** The five main numbers, comma separated. A list cannot be grouped on. */
    white_balls: string;
    arkball_number: number;
    quick_pick: boolean;
  };
  arkball_ticket_failed: {
    draw_id: string;
    ticket_price_usd?: number;
    reason: GameReason;
    reason_detail?: string;
  };
  arkball_draw_settled: {
    draw_id: string;
    jackpot_usd: number;
    tickets_sold: number;
    player_count: number;
    winner_count: number;
    payout_usd: number;
    rollover: boolean;
  };

  // 9.5 Arkjet
  //
  // Two tickets can ride the same round, so every event names its slot.
  arkjet_ticket_placed: {
    round_id: string;
    ticket_slot: number;
    amount_usd: number;
    mode: "manual" | "auto";
    /** The multiplier an auto ticket cashes out at. Absent on a manual one. */
    auto_cashout_x?: number;
  };
  arkjet_cashed_out: {
    round_id: string;
    ticket_slot: number;
    amount_usd: number;
    multiplier: number;
    payout_usd: number;
  };
  arkjet_round_lost: {
    round_id: string;
    ticket_slot: number;
    amount_usd: number;
    crash_multiplier?: number;
  };
  arkjet_ticket_failed: {
    round_id?: string;
    amount_usd?: number;
    reason: GameReason;
    reason_detail?: string;
  };

  // 9.6 Pilot Chicken
  chicken_round_started: {
    round_id: string;
    amount_usd: number;
    difficulty: ChickenDifficulty;
    ticket_type: "paid" | "free";
  };
  chicken_lane_advanced: { round_id: string; lane_index: number; multiplier: number };
  chicken_cashed_out: {
    round_id: string;
    lane_index: number;
    multiplier: number;
    amount_usd: number;
    payout_usd: number;
  };
  chicken_round_lost: {
    round_id: string;
    lane_index: number;
    multiplier: number;
    amount_usd: number;
  };
  chicken_round_failed: {
    amount_usd?: number;
    difficulty?: ChickenDifficulty;
    reason: GameReason;
    reason_detail?: string;
  };

  // Draughts, which the catalog does not cover, so it keeps the generic shapes.
  // `amount_usd` is the money the event is about and `game_id` joins a stake to
  // its result; the older names beside them (`stake_usd`, `entry_usd`,
  // `payout_usd`) are unchanged, so reports built on those keep working.
  game_staked: { game: Game; amount_usd: number; game_id?: string };
  game_result: {
    game: Game;
    result: "win" | "loss" | "draw";
    // "no_moves" covers a draughts side that is blocked or wiped out, which is
    // the game's equivalent of checkmate and has no chess name.
    reason: "checkmate" | "no_moves" | "resign" | "timeout" | "abandoned" | "draw";
    stake_usd: number;
    payout_usd: number;
    fee_usd: number;
    amount_usd?: number;
    game_id?: string;
  };
  tournament_joined: {
    game: Game;
    entry_usd: number;
    amount_usd?: number;
    tournament_id?: string;
  };
  spectator_bet_placed: {
    game: Game;
    match_id: string;
    side: "white" | "draw" | "black";
    amount_usd: number;
    odds?: number;
    game_id?: string;
  };

  // 10. Square
  //
  // Only what the Square service can actually record, and only where a user
  // can actually do it. The designs carry more (bookmarks, stories, winks,
  // gist rooms, direct messages, joining a house), and the catalog asks for a
  // few others the app has no surface for yet (opening a profile, joining a
  // hashtag, a viewer joining a stream). None of those has a write or a call
  // site behind it, so there is no event for them rather than an event that
  // can never fire.
  square_opened: { tab: SquareTab };
  square_feed_filtered: { filter: string };
  post_created: {
    post_id: string;
    media_type: SquareMediaType;
    has_media: boolean;
    house_id?: string;
  };
  post_failed: { media_type: SquareMediaType; reason: SquareReason; reason_detail?: string };
  post_viewed: { post_id: string; author_id?: string };
  post_liked: { post_id: string; author_id?: string };
  post_commented: { post_id: string; author_id?: string };
  post_reposted: { post_id: string; author_id?: string };
  // `source` is where the follow was pressed: the feed, a profile, the
  // suggestions rail. Which surface actually grows the graph is the question it
  // answers.
  user_followed: { target_user_id: string; source?: string };
  user_unfollowed: { target_user_id: string };
  creator_application_started: void;
  creator_application_submitted: void;
  stream_started: { stream_id: string };
  stream_ended: { stream_id: string; duration_seconds?: number; peak_viewers?: number };

  // Cross-border
  send_money_opened: void;
  send_destination_selected: { country: string; currency: string };
  send_completed: {
    corridor: string;
    amount_usd: number;
    amount_local: number;
    /**
     * The rail quotes its fee in the currency being received, not in dollars,
     * and only quotes one at all some of the time. All three are omitted when
     * no fee was quoted, rather than reported as a zero the user did not pay.
     */
    fee_usd?: number;
    fee_local?: number;
    fee_currency?: string;
  };

  // 11. Arkivity
  //
  // There is no `arkivity_filtered`: the timeline has paging, not filters, so
  // the event could never fire. It returns when the filters do.
  arkivity_opened: void;
  arktivity_tx_opened: {
    tx_type?: ArkivityTxType;
    asset?: string;
    network?: string;
    amount_usd?: number;
    tx_hash?: string;
    direction: "in" | "out";
  };
  arkivity_tx_shared: { tx_type?: ArkivityTxType; tx_hash?: string };

  // Engagement
  currency_switched: { currency: string };
  referral_completed: void;
}

/** What a trade event says about the order, whatever stage it is at. */
export interface TradeIntent {
  vertical: Vertical;
  asset: string;
  side: Side;
  amount_usd: number;
  token_quantity?: number;
  /**
   * What one token cost in dollars. Derived from the two amounts, so it agrees
   * with them by construction, and it follows `amount_source`: the filled price
   * on a completion, the quoted one on a preview.
   */
  fill_price_usd?: number;
  token_address?: string;
  /**
   * The EVM chain id. Omitted on Solana, which has no id our services agree on
   * (the swap engine says 101, the bridge 792703809); `network` names it.
   */
  chain_id?: number;
  network?: string;
}

/**
 * A filled trade. One flat shape across the verticals, with each vertical's own
 * extras optional, so a report does not have to know which desk a row came from
 * to read its money.
 */
export type TradeCompleted = TradeIntent & {
  order_id?: string;
  tx_hash?: string;
  fee_usd?: number;
  price_impact_pct?: number;
  /** Whether the dollar figure is what actually moved or what the quote expected. */
  amount_source: AmountSource;
  /**
   * What the trade service recorded for a swap-engine trade. `delivered` is a
   * swap the receipt proves paid out while the service recorded something
   * else: the money moved, so it is a trade.
   */
  recorded?: "confirmed" | "delivered";
  // Per-vertical extras.
  slippage_pct?: number;
  risk_label?: "low" | "medium" | "critical";
  mode?: "simple" | "pro";
  apy?: number;
  category?: "credit" | "carbon" | "real_estate";
  issuer?: string;
};

/** A Kash purchase or conversion the engine confirmed. */
export interface KashTrade {
  amount_usd: number;
  kash_amount: number;
  /** Kash per dollar, as applied. */
  rate?: number;
  order_id?: string;
  tx_hash?: string;
}

/** What every slip event reports. `leg_count` is on all of them by rule. */
export interface PredictionSlip {
  slip_id?: string;
  leg_count: number;
  stake_usd: number;
  combined_odds?: number;
  potential_payout_usd?: number;
}

/** What an order says about itself, at submission and once it has opened. */
export interface PerpOrder {
  pair: string;
  market_type?: MarketType;
  direction: Direction;
  leverage: number;
  margin_mode: MarginMode;
  collateral_usd: number;
  /** Collateral times leverage: the position's size in dollars. */
  notional_usd: number;
  order_type: "market" | "limit" | "stop";
  /** The trigger level, set only when `order_type` is not "market". */
  limit_price?: number;
  // The exit levels attached at open, in dollars. Omitted when there is none,
  // rather than sent as a zero that reads as an exit at no price.
  take_profit?: number;
  stop_loss?: number;
  venue?: PerpVenue;
}

/**
 * What an event about a settled record carries so it can be counted once.
 *
 * The browser notices a deposit on whichever device is open when it lands,
 * and may notice it again on another. `time` is when it happened, in seconds,
 * and `$insert_id` is derived from the record (see ./insert-id), so Mixpanel
 * treats the two reports as one event. Both are Mixpanel's own reserved names.
 */
export interface SettledRecord {
  tx_hash?: string;
  time?: number;
  $insert_id?: string;
}

/**
 * A withdrawal the rail has paid out.
 *
 * The bank leg carries what actually landed in the user's account and the rate
 * that produced it. Without both, the round-trip cost of the naira rail (in at
 * one rate, out at another) cannot be worked out from the data at all.
 */
export type WithdrawCompleted = SettledRecord & { amount_usd: number; order_id?: string } & (
    | {
        method: "wallet";
        asset: string;
        network?: string;
        /**
         * Where a crypto withdrawal was sent. An on-chain address is public by
         * construction, the same class of value as the wallet address we
         * already use as the distinct_id, and it is what makes a withdrawal
         * traceable to the chain.
         *
         * A bank withdrawal's recipient is an account number, which is on the
         * never-send list, so that rail has no equivalent and sends none.
         */
        recipient_address?: string;
      }
    | {
        method: "bank";
        asset: string;
        // The net naira the user received, and the rate applied at payout.
        amount_ngn: number;
        fx_rate: number;
        /**
         * The user's own bank, receiving the money. Always the customer's
         * institution; the rail is `provider`.
         *
         * Sent as the bank registry's own name rather than the short label the
         * picker shows, so the same bank cannot arrive as both "OPay" and
         * "Opay" and split a breakdown into two rows.
         */
        bank: string;
        /** The payout rail. */
        provider?: string;
        // The difference between gross and net, when the rail charges one.
        fee_ngn?: number;
      }
  );

export type MarketType = "crypto" | "forex" | "commodity" | "equity";
export type PredictionScope = "global" | "local";
export type EarnListingType = "bounty" | "project" | "grant";
export type ArkivityTxType =
  "deposit" | "withdraw" | "trade" | "send" | "receive" | "game" | "kash";

/** Which perps venue an event came from. Hyperliquid replaced the old desk. */
export type PerpVenue = "hyperliquid";

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
  /** production, preview or development. See ./environment. */
  environment: string;
  kyc_status: KycStatus;
  country?: string;
  has_deposited: boolean;
  user_tier: UserTier;
  platform: "web";
  app_version?: string;
  /**
   * The EVM address lowercased. Now the same string as the distinct_id, which
   * the catalog also specifies lowercase; kept because it is what existing
   * joins to on-chain data are written against.
   */
  wallet_evm?: string;
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
