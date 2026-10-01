"use client";

import { apiFetch } from "@/lib/api";

export interface BookFeatures {
  navigation: boolean;
  search: boolean;
  prematch: boolean;
  live: boolean;
  realtime: boolean;
  calculations: boolean;
  orderPlacement: boolean;
  settlement: boolean;
  parlays: boolean;
}

export interface BookCapabilities {
  provider: "local";
  chainId: number;
  environment: string;
  pricingModel: "dynamic_parimutuel";
  ticketOddsMode: "dynamic";
  token: { symbol: string; decimals: number };
  features: BookFeatures;
}

export interface BookEntity {
  id: string | null;
  slug: string;
  name: string;
}

export interface BookSport {
  id: string;
  slug: string;
  name: string;
  hub: string;
}

export interface BookLeagueNavigation {
  league: BookEntity;
  eventKind: "sports" | "esports" | "virtual";
  activeGames: number;
  liveGames: number;
  prematchGames: number;
}

export interface BookCountryNavigation {
  country: BookEntity;
  activeGames: number;
  liveGames: number;
  prematchGames: number;
  leagues: BookLeagueNavigation[];
}

export interface BookSportNavigation {
  sport: BookSport;
  activeGames: number;
  liveGames: number;
  prematchGames: number;
  countries: BookCountryNavigation[];
}

export interface BookNavigation {
  provider: "local";
  environment: string;
  sports: BookSportNavigation[];
}

export interface BookOutcome {
  id: string;
  title: string;
  odds: string;
  point: string | null;
  state: "active" | "stopped" | "canceled" | "won" | "lost" | "unknown";
  hidden: boolean;
}

export interface BookBoardMarket {
  id: string;
  eventId: string | null;
  title: string;
  imageUrl: string | null;
  currency: string;
  minStakeE6: string;
  maxStakeE6: string;
  commissionBps: number;
  minOddsE6: string;
  oddsMode: "dynamic_parimutuel";
  state: string;
  category: string | null;
  expressForbidden: boolean;
  hidden: boolean;
  outcomes: BookOutcome[];
}

export interface BookBoardEvent {
  id: string;
  slug: string;
  title: string;
  startsAt: number;
  state: string;
  sport: BookSport;
  country: BookEntity;
  league: BookEntity;
  trendingRank: number | null;
  primaryMarketId: string | null;
  participants: Array<{ name: string; imageUrl: string | null }>;
  imageUrl: string | null;
  markets: BookBoardMarket[];
}

export interface BookBoardPage {
  provider: "local";
  environment: string;
  events: BookBoardEvent[];
  limit: number;
  offset: number;
  total: number;
  nextOffset: number | null;
}

export interface BookBetQuote {
  marketId: string;
  selectionId: string;
  marketVersion: number;
  stakeE6: string;
  potentialPayoutE6: string;
  decimalOddsE6: string;
  oddsMode: "dynamic_parimutuel";
  poolFormed: boolean;
  quotedAt: string;
}

export interface BookBet {
  id: string;
  bookingCode: string;
  marketId: string;
  marketTitle: string;
  selectionId: string;
  selectionLabel: string;
  marketVersion: number;
  stakeE6: string;
  potentialPayoutE6: string;
  decimalOddsE6: string;
  oddsMode: "dynamic_parimutuel";
  status: "pending" | "won" | "lost" | "void";
  payoutE6: string | null;
  createdAt: string;
  settledAt: string | null;
}

export interface BookBetsPage {
  bets: BookBet[];
}

export interface BookBalance {
  ownerWallet: string;
  currency: "USDC";
  availableE6: string;
  pendingE6: string;
  pendingWithdrawalE6: string;
  version: number;
}

export interface BookFundingConfig {
  chainId: number;
  tokenSymbol: "USDC";
  tokenAddress: string;
  tokenDecimals: number;
  custodyAddress: string | null;
  depositAddress: string | null;
  requiredConfirmations: number;
  depositsEnabled: boolean;
  withdrawalFeeBps: number;
  withdrawalsEnabled: boolean;
  simulatedWithdrawals: boolean;
}

export interface BookDeposit {
  depositId: string;
  txHash: string;
  amountE6: string;
  currency: "USDC";
  status: string;
  creditedAt: string;
}

export interface BookWithdrawal {
  withdrawalId: string;
  toAddress: string;
  amountE6: string;
  feeE6: string;
  netAmountE6: string;
  currency: "USDC";
  status: string;
  txHash: string | null;
  createdAt: string;
  sentAt: string | null;
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

async function request<T>(path: string, init?: RequestInit, authenticated = false): Promise<T> {
  const response = await apiFetch(`/api/prediction/book${path}`, init, {
    anonymous: !authenticated,
    requireAuth: authenticated,
  });
  const body = (await response.json().catch(() => null)) as Envelope<T> | null;
  if (!response.ok || !body?.success || body.data === undefined) {
    throw new Error(body?.error?.message ?? "Prediction markets are unavailable right now.");
  }
  return body.data;
}

export const getBookCapabilities = () => request<BookCapabilities>("/capabilities");
export const getBookNavigation = () => request<BookNavigation>("/navigation");
export const getBookBalance = () => request<BookBalance>("/me/balance", undefined, true);
export const getBookFundingConfig = () => request<BookFundingConfig>("/funding/config");
export const getBookBets = () => request<BookBetsPage>("/me/bets", undefined, true);

export function confirmBookDeposit(txHash: string): Promise<BookDeposit> {
  return request<BookDeposit>(
    "/funding/deposits/confirm",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ txHash }),
    },
    true
  );
}

export function createBookWithdrawal(
  amountE6: string,
  idempotencyKey: string
): Promise<BookWithdrawal> {
  return request<BookWithdrawal>(
    "/funding/withdrawals",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amountE6, idempotencyKey }),
    },
    true
  );
}

export function listBookBoard(params: {
  sport?: string;
  country?: string;
  league?: string;
  offset?: number;
}): Promise<BookBoardPage> {
  const query = new URLSearchParams({ state: "prematch", limit: "24" });
  if (params.sport) query.set("sport", params.sport);
  if (params.country) query.set("country", params.country);
  if (params.league) query.set("league", params.league);
  if (params.offset) query.set("offset", String(params.offset));
  return request<BookBoardPage>(`/board?${query}`);
}

export function quoteBookBet(
  marketId: string,
  selectionId: string,
  stakeE6: string
): Promise<BookBetQuote> {
  return request<BookBetQuote>("/bets/quote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ marketId, selectionId, stakeE6 }),
  });
}

export function placeBookBet(quote: BookBetQuote, idempotencyKey: string): Promise<BookBet> {
  return request<BookBet>(
    "/bets",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        marketId: quote.marketId,
        selectionId: quote.selectionId,
        stakeE6: quote.stakeE6,
        quotedOddsE6: quote.decimalOddsE6,
        marketVersion: quote.marketVersion,
        acceptOddsChanges: "higher_only",
        idempotencyKey,
      }),
    },
    true
  );
}
