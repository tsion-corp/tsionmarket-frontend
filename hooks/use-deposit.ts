"use client";

import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { toast } from "@/lib/toast";
import {
  TERMINAL_STAGES,
  depositProgress,
  eligibilityKey,
  type AddressKind,
  type DepositChain,
  type DepositStatusResult,
  type DepositToken,
  type QuoteRequest,
  type QuoteResult,
  type StaticAddress,
  type StaticAddressRequest,
  type StaticAddressResult,
  type ValidateAddressResult,
  type WithdrawDestination,
} from "@/lib/deposit";
import { PERSISTED_GC_TIME } from "@/lib/query-persist";

const ONE_HOUR = 60 * 60 * 1000;
const POLL_MS = 4000;

// The chain and token catalogs are effectively static and are persisted to
// localStorage, so we keep them in memory for a day, never refetch on focus or
// remount, and let them rehydrate instantly on the next visit.
const CATALOG_OPTIONS = {
  staleTime: ONE_HOUR,
  gcTime: PERSISTED_GC_TIME,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  refetchOnMount: false,
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

async function dextopusGet<T>(path: string, fallback: string): Promise<T> {
  const res = await apiFetch(`/api/dextopus/${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new DextopusError(errorMessage(data, fallback), res.status);
  return data as T;
}

async function dextopusPost<T>(path: string, body: unknown, fallback: string): Promise<T> {
  const res = await apiFetch(`/api/dextopus/${path}`, {
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
    "Couldn't load withdrawal destinations"
  );
  return (data.destinations ?? []).map((d) => ({
    destinationChainId: d.destinationChainId,
    blockchain: d.blockchain,
    currency: d.currency,
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
  return (data.tokens ?? []).map((t) => ({
    address: t.address,
    symbol: t.symbol,
    name: t.name,
    decimals: t.decimals,
    chainId: t.chainId,
    logoUrl: t.logoUrl ?? null,
    supportsStaticAddress: eligible.has(eligibilityKey(t.chainId, t.address)),
  }));
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

export function useValidateAddress() {
  return useMutation<ValidateAddressResult, Error, { address: string; chainType: string }>({
    mutationFn: (input) =>
      dextopusPost<ValidateAddressResult>(
        "deposit/validate-address",
        input,
        "Couldn't validate that address"
      ),
  });
}

// Polls deposit status until the flow reaches a terminal stage. Pass the
// depositRequestId returned by a quote; polling stops once settled or failed.
export function useDepositStatus(depositRequestId: string | null) {
  return useQuery<DepositStatusResult>({
    queryKey: ["dextopus", "status", depositRequestId],
    enabled: depositRequestId !== null,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return POLL_MS;
      const { stage } = depositProgress(data.status, data.executionStatus);
      return TERMINAL_STAGES.has(stage) ? false : POLL_MS;
    },
    queryFn: () =>
      dextopusGet<DepositStatusResult>(
        `deposit/status?depositRequestId=${depositRequestId}`,
        "Couldn't check deposit status"
      ),
  });
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
