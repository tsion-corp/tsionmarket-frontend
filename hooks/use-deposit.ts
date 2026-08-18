"use client";

import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { recordSelfInitiated } from "@/lib/analytics/self-initiated";
import { toast } from "@/lib/toast";
import {
  TERMINAL_STAGES,
  depositProgress,
  depositOriginAsset,
  eligibilityKey,
  eligibilityLookupAddress,
  findStaticAddress,
  quoteReadyDestinationAsset,
  type AddressKind,
  type DepositChain,
  type DepositStatusResult,
  type DepositToken,
  type QuoteRequest,
  type QuoteResult,
  type StaticAddress,
  type StaticAddressListResult,
  type StaticAddressRequest,
  type StaticAddressResult,
  type ValidateAddressResult,
  type WithdrawDestination,
} from "@/lib/deposit";
import { PERSISTED_GC_TIME } from "@/lib/query-persist";

const ONE_HOUR = 60 * 60 * 1000;
const POLL_MS = 4000;

// The chain and token catalogs are effectively static and are persisted to
// localStorage, so they rehydrate instantly on the next visit and we never
// refetch on focus/reconnect. refetchOnMount stays on (the default) but is
// gated by the long staleTime: fresh cached data is shown without a refetch,
// while data that is missing or failed to load (e.g. the initial fetch lost
// a race during the busy dashboard-load burst) refetches when the deposit
// screen mounts, instead of staying empty until a hard reload.
const CATALOG_OPTIONS = {
  staleTime: ONE_HOUR,
  gcTime: PERSISTED_GC_TIME,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;

// Pull a human error message out of a Dextopus proxy error body.
function errorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (typeof d.message === "string") return d.message;
    if (Array.isArray(d.details) && d.details[0] && typeof d.details[0] === "object") {
      const first = d.details[0] as Record<string, unknown>;
      if (typeof first.message === "string") return first.message;
    }
    if (typeof d.error === "string") return d.error;
  }
  return fallback;
}

// Carries the HTTP status so callers can tell a request-shaped rejection
// (4xx, retrying the same input will never succeed) from a transient
// server/network failure (worth a retry).
export class DextopusError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "DextopusError";
    this.status = status;
  }
}

export function isRetryableDextopusError(error: unknown): boolean {
  if (!(error instanceof DextopusError)) return true;
  return error.status >= 500;
}

// Deposits, withdrawals and trades are three Dextopus integrations with three
// API keys. The proxy signs a request with the key of its purpose, and the
// purpose rides on the path: `withdraw/` in front of a Dextopus path selects
// the withdrawal key, `trade/` the trade key (spot buys and sells, the buy
// catalog, gas top-ups, the casino fund sheet, prediction settlement), and a
// bare path is a deposit. A request created under one key is only readable
// under the same key, which is why status polling takes the purpose as well.
export type DextopusPurpose = "deposit" | "withdrawal" | "trade";

const PURPOSE_PREFIX: Record<DextopusPurpose, string> = {
  deposit: "",
  withdrawal: "withdraw/",
  trade: "trade/",
};

/** The proxied path for a Dextopus call, carrying its purpose. */
export function purposedPath(path: string, purpose: DextopusPurpose): string {
  return `${PURPOSE_PREFIX[purpose]}${path}`;
}

export async function dextopusGet<T>(
  path: string,
  fallback: string,
  purpose: DextopusPurpose = "deposit"
): Promise<T> {
  const res = await apiFetch(`/api/dextopus/${purposedPath(path, purpose)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new DextopusError(errorMessage(data, fallback), res.status);
  return data as T;
}

export function fetchDepositStatus(
  depositRequestId: string,
  purpose: DextopusPurpose = "deposit"
): Promise<DepositStatusResult> {
  return dextopusGet<DepositStatusResult>(
    `deposit/status?depositRequestId=${depositRequestId}`,
    "Couldn't check deposit status",
    purpose
  );
}

async function dextopusPost<T>(
  path: string,
  body: unknown,
  fallback: string,
  purpose: DextopusPurpose = "deposit"
): Promise<T> {
  const res = await apiFetch(`/api/dextopus/${purposedPath(path, purpose)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new DextopusError(errorMessage(data, fallback), res.status);
  return data as T;
}

interface RawChain {
  chainId: number;
  name: string;
  nativeCurrency?: { symbol?: string; decimals?: number };
  logoUrl?: string;
  blockExplorer?: string;
}

interface RawToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  logoUrl?: string;
  supportsStaticAddress?: boolean;
}

// Dextopus's per-chain `deposit/tokens?chainId=X` catalog carries a
// `supportsStaticAddress` flag that is unreliable: on Polygon it flags native
// POL and wrapped WPOL as eligible, and `deposit/static/generate` then rejects
// both with "only supported for major tokens." Their own unfiltered
// `deposit/tokens` call (no chainId) returns the actual solver-curated token
// set the generate endpoint honors, so we cross-reference against that
// instead of trusting the per-chain flag.
interface RawMasterToken {
  address: string;
  chainId: number;
  supportsStaticAddress?: boolean;
}

interface MasterEligibility {
  // "{chainId}:{address}" keys, used to correct the per-chain endpoint's
  // unreliable supportsStaticAddress flag.
  keys: string[];
  // Chain ids that have at least one eligible origin token, so the network
  // picker never offers a chain that dead-ends into an empty token list.
  chainIds: number[];
}

export async function fetchMasterEligibility(): Promise<MasterEligibility> {
  const data = await dextopusGet<{ tokens?: RawMasterToken[] }>(
    "deposit/tokens",
    "Couldn't load token eligibility"
  );
  const keys: string[] = [];
  const chainIds = new Set<number>();
  for (const t of data.tokens ?? []) {
    if (!t.supportsStaticAddress) continue;
    keys.push(eligibilityKey(t.chainId, t.address));
    chainIds.add(t.chainId);
  }
  return { keys, chainIds: [...chainIds] };
}

export const MASTER_ELIGIBILITY_KEY = ["deposit-master-eligibility"] as const;

function useMasterEligibility() {
  return useQuery<MasterEligibility>({
    queryKey: MASTER_ELIGIBILITY_KEY,
    ...CATALOG_OPTIONS,
    queryFn: fetchMasterEligibility,
  });
}

// Chain ids with at least one static-address-eligible origin token, per
// Dextopus's solver-curated catalog (GET /deposit/tokens, no chainId). The
// "From network" picker filters to this set so every offered network
// actually has a sendable token once selected.
export function useEligibleOriginChainIds() {
  const master = useMasterEligibility();
  return {
    data: master.data ? new Set(master.data.chainIds) : undefined,
    isPending: master.isPending,
    isError: master.isError,
    refetch: master.refetch,
  };
}

// "{chainId}:{address}" keys of tokens Dextopus can accept as a deposit or
// withdrawal origin. The withdrawal screen filters a user's held tokens
// against this before offering them as a "withdraw from" source, so a token
// Dextopus can't route never even reaches the quote step.
export function useOriginEligibleKeys() {
  const master = useMasterEligibility();
  return {
    data: master.data ? new Set(master.data.keys) : undefined,
    isPending: master.isPending,
    isError: master.isError,
    refetch: master.refetch,
  };
}

interface RawDestination {
  destinationChainId: number;
  blockchain: string;
  currency: string;
  symbol: string;
  decimals: number;
  addressKind?: string;
  logoUrl?: string;
}

// Valid conversion targets for a given origin token, per Dextopus's solver
// (GET /deposit/destinations). This is the same forward path a deposit uses,
// just read for the reverse direction: our own held origin token routes out
// to whichever of these the user picks.
export async function fetchWithdrawDestinations(
  originChainId: number,
  originAddress: string
): Promise<WithdrawDestination[]> {
  const data = await dextopusGet<{ destinations?: RawDestination[] }>(
    `deposit/destinations?originChainId=${originChainId}&originAddress=${encodeURIComponent(originAddress)}`,
    "Couldn't load withdrawal destinations",
    "withdrawal"
  );
  return (data.destinations ?? []).map((d) => ({
    destinationChainId: d.destinationChainId,
    blockchain: d.blockchain,
    // Store the quote-ready asset id, not the raw catalog one: native SOL is
    // listed as the wrapped mint but only quotes under its native placeholder.
    currency: quoteReadyDestinationAsset(d.destinationChainId, d.currency),
    symbol: d.symbol,
    decimals: d.decimals,
    addressKind: (d.addressKind as AddressKind | undefined) ?? "evm",
    logoUrl: d.logoUrl ?? null,
  }));
}

export interface WithdrawOrigin {
  chainId: number;
  address: string;
}

export function useWithdrawDestinations(origin: WithdrawOrigin | null) {
  return useQuery<WithdrawDestination[]>({
    queryKey: ["withdraw-destinations", origin?.chainId ?? null, origin?.address ?? null],
    enabled: origin !== null,
    staleTime: ONE_HOUR,
    gcTime: PERSISTED_GC_TIME,
    refetchOnWindowFocus: false,
    queryFn: () =>
      fetchWithdrawDestinations(
        (origin as WithdrawOrigin).chainId,
        (origin as WithdrawOrigin).address
      ),
  });
}

export const DEPOSIT_CHAINS_KEY = ["deposit-chains"] as const;
export const depositTokensKey = (chainId: number) => ["deposit-tokens", chainId] as const;

export async function fetchDepositChains(): Promise<DepositChain[]> {
  const data = await dextopusGet<{ chains?: RawChain[] }>(
    "deposit/chains",
    "Couldn't load networks"
  );
  return (data.chains ?? [])
    .map((c) => ({
      chainId: c.chainId,
      name: c.name,
      nativeSymbol: c.nativeCurrency?.symbol ?? "",
      nativeDecimals: c.nativeCurrency?.decimals ?? 18,
      logoUrl: c.logoUrl ?? null,
      blockExplorer: c.blockExplorer ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchDepositTokens(
  chainId: number,
  eligible: Set<string>
): Promise<DepositToken[]> {
  const data = await dextopusGet<{ tokens?: RawToken[] }>(
    `deposit/tokens?chainId=${chainId}`,
    "Couldn't load tokens"
  );
  return (data.tokens ?? []).map((t) => {
    // Native SOL is listed here under the generic gas placeholder, but the
    // generate endpoint only accepts the system-program id — normalize so the
    // address we carry is the one that works.
    const address = depositOriginAsset(t.chainId, t.address);
    return {
      address,
      symbol: t.symbol,
      name: t.name,
      decimals: t.decimals,
      chainId: t.chainId,
      logoUrl: t.logoUrl ?? null,
      // Master eligibility keys SOL under the wrapped mint, so map the
      // normalized address back to that form for the lookup.
      supportsStaticAddress: eligible.has(
        eligibilityKey(t.chainId, eligibilityLookupAddress(t.chainId, address))
      ),
    };
  });
}

export function useDepositChains() {
  return useQuery<DepositChain[]>({
    queryKey: DEPOSIT_CHAINS_KEY,
    ...CATALOG_OPTIONS,
    queryFn: fetchDepositChains,
  });
}

export function useDepositTokens(chainId: number | null) {
  const master = useMasterEligibility();
  const eligibleSet = useMemo(() => new Set(master.data?.keys ?? []), [master.data]);

  return useQuery<DepositToken[]>({
    queryKey: depositTokensKey(chainId ?? 0),
    enabled: chainId !== null && master.data !== undefined,
    ...CATALOG_OPTIONS,
    queryFn: () => fetchDepositTokens(chainId as number, eligibleSet),
  });
}

export function useCreateQuote() {
  return useMutation<QuoteResult, Error, QuoteRequest>({
    mutationFn: (req) => dextopusPost<QuoteResult>("deposit/quote", req, "Couldn't create a quote"),
  });
}

export interface WithdrawQuoteInput {
  originChainId: number;
  originAsset: string;
  destinationChainId: number;
  destinationAsset: string;
  // Origin amount in base units (string), i.e. exactly what we will send.
  amount: string;
  // External wallet on the destination chain.
  recipient: string;
  // User's own wallet on the origin chain's family, for auto-refunds.
  refundTo: string;
}

// A single withdrawal quote. Always strict: because we control the exact
// amount we send, strict binds the deposit address to that amount and
// auto-refunds any mismatch back to refundTo on the origin chain — the
// "if the swap can't complete, funds return to the sender" guarantee. The
// returned depositAddress is where the origin token is sent to trigger the
// cross-chain settlement Dextopus performs under the hood.
export async function createWithdrawQuote(
  input: WithdrawQuoteInput,
  purpose: DextopusPurpose = "withdrawal"
): Promise<QuoteResult> {
  return dextopusPost<QuoteResult>(
    "deposit/quote",
    { ...input, strict: true },
    "Couldn't get a withdrawal quote",
    purpose
  );
}

// Reactive quote for the withdrawal screen: refetches whenever the inputs
// change so the UI can preview the exact amount the recipient will receive,
// and hands back the deposit address to send to. A fresh quote (new address)
// is minted per fetch, so we never refetch on focus/reconnect — only on input
// change or an explicit refetch at execution time. `retry: false` so an
// unroutable destination surfaces immediately instead of retrying.
// `purpose` defaults to the withdrawal key; the casino fund sheet reuses this
// quote shape to turn USDC into ETH, which is a trade, and says so.
export function useWithdrawQuote(
  input: WithdrawQuoteInput | null,
  purpose: DextopusPurpose = "withdrawal"
) {
  return useQuery<QuoteResult>({
    queryKey: ["withdraw-quote", purpose, input],
    enabled: input !== null,
    staleTime: 45_000,
    gcTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    queryFn: () => createWithdrawQuote(input as WithdrawQuoteInput, purpose),
  });
}

// Mints (or returns the cached) permanent deposit address for a given origin
// asset + settlement. Static addresses never change, so this is persisted and
// never restaled; re-opening the same selection is instant and offline-safe.
export function useStaticDepositAddress(req: StaticAddressRequest | null) {
  return useQuery<StaticAddress>({
    queryKey: [
      "deposit-static",
      req?.userId ?? null,
      req?.settlementChainId ?? null,
      req?.originChainId ?? null,
      req?.originAsset ?? null,
    ],
    enabled: req !== null,
    staleTime: PERSISTED_GC_TIME,
    gcTime: PERSISTED_GC_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    queryFn: async () => {
      if (!req) throw new Error("Missing deposit parameters");
      const data = await dextopusPost<StaticAddressResult>(
        "deposit/static/generate",
        req,
        "Couldn't create a deposit address"
      );
      return data.data;
    },
  });
}

// The permanent address for a request, reusing whatever was already minted for
// it. Unlike `useStaticDepositAddress` this never mints a second address for a
// request that already has one: it asks Dextopus what exists first, because
// minting is not idempotent and the profile shows these addresses as permanent.
// The extra list call costs one request the first time and is then persisted.
export function useStableStaticAddress(req: StaticAddressRequest | null) {
  return useQuery<StaticAddress>({
    queryKey: [
      "deposit-static-stable",
      req?.userId ?? null,
      req?.originChainId ?? null,
      req?.originAsset ?? null,
      req?.settlementChainId ?? null,
      req?.settlementAddress ?? null,
    ],
    enabled: req !== null,
    staleTime: PERSISTED_GC_TIME,
    gcTime: PERSISTED_GC_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: (count, error) => isRetryableDextopusError(error) && count < 2,
    queryFn: async () => {
      if (!req) throw new Error("Missing deposit parameters");
      // A listing failure must not fall through to minting: that is how a
      // duplicate gets created for a user who already has an address.
      const listed = await dextopusGet<StaticAddressListResult>(
        `deposit/static/addresses?userId=${encodeURIComponent(req.userId)}`,
        "Couldn't load your deposit address"
      );
      const existing = findStaticAddress(listed.data ?? [], req);
      if (existing) return existing;

      const minted = await dextopusPost<StaticAddressResult>(
        "deposit/static/generate",
        req,
        "Couldn't create a deposit address"
      );
      return minted.data;
    },
  });
}

export function useValidateAddress(purpose: DextopusPurpose = "deposit") {
  return useMutation<ValidateAddressResult, Error, { address: string; chainType: string }>({
    mutationFn: (input) =>
      dextopusPost<ValidateAddressResult>(
        "deposit/validate-address",
        input,
        "Couldn't validate that address",
        purpose
      ),
  });
}

// Polls deposit status until the flow reaches a terminal stage. Pass the
// depositRequestId returned by a quote; polling stops once settled or failed.
//
// Every caller of this hook is an operation the user started in the app: a buy,
// a sell, a conversion, a withdrawal. The funding flow does not appear here at
// all, because a deposit lands on a static address and has no request to poll.
// That makes this the one place the settlement transactions of self-started
// operations are known, so they are recorded here and the deposit watcher rules
// them out instead of reporting a sale as money arriving from outside.
export function useDepositStatus(
  depositRequestId: string | null,
  purpose: DextopusPurpose = "deposit"
) {
  const query = useQuery<DepositStatusResult>({
    queryKey: ["dextopus", "status", purpose, depositRequestId],
    enabled: depositRequestId !== null,
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return POLL_MS;
      const { stage } = depositProgress(data.status, data.executionStatus);
      return TERMINAL_STAGES.has(stage) ? false : POLL_MS;
    },
    queryFn: () => fetchDepositStatus(depositRequestId as string, purpose),
  });

  const hashes = query.data?.destinationTransactionHashes;
  useEffect(() => {
    if (hashes && hashes.length > 0) recordSelfInitiated(hashes);
  }, [hashes]);

  return query;
}

export interface TerminalMessages {
  settled: string;
  failed: string;
  refunded: string;
}

// Fires exactly one toast when a deposit or withdrawal reaches a terminal stage.
// The guard is keyed by depositRequestId so a fresh quote can toast again while
// the same one never fires twice. onSettled runs alongside the settled toast.
export function useTerminalToast(
  status: DepositStatusResult | undefined,
  depositRequestId: string | null,
  messages: TerminalMessages,
  onSettled?: () => void
) {
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!status || !depositRequestId) return;
    const { stage } = depositProgress(status.status, status.executionStatus);
    if (!TERMINAL_STAGES.has(stage) || handled.current === depositRequestId) return;
    handled.current = depositRequestId;
    if (stage === "settled") {
      toast.success(messages.settled);
      onSettled?.();
    } else if (stage === "failed") {
      toast.error(messages.failed);
    } else if (stage === "refunded") {
      toast.info(messages.refunded);
    }
  }, [status, depositRequestId, messages, onSettled]);
}
