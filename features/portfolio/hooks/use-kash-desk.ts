"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useSocialWallet } from "decane-connect-kit";
import { ensureUnlocked } from "@/lib/decane";
import type { EIP1193Provider } from "viem";
import { useEvmSend } from "@/hooks/use-evm-send";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useInvalidateKash } from "@/features/portfolio/hooks/use-kash";
import { getKashAccount, isValidKashAmount, type KashAccount } from "@/features/portfolio/lib/kash";
import {
  getKashDeskBuyQuote,
  getKashDeskInfo,
  getKashDeskSellQuote,
  postKashDeskBuyTx,
  postKashDeskPrepareBuy,
  postKashDeskPrepareSell,
  postKashDeskSellTx,
  withDomainType,
  type KashDeskTx,
} from "@/features/portfolio/lib/kash-desk";

// How long to keep re-checking the account after a desk trade before giving
// up on ever seeing it settle. The transaction itself is already confirmed
// by the time a desk mutation resolves (Base is a sponsored chain — see
// useEvmSend), so what this actually waits out is the backend's own RPC
// replica catching up, not the chain itself.
const ACCOUNT_SETTLE_POLL_MS = 2000;
const ACCOUNT_SETTLE_MAX_ATTEMPTS = 8;

/**
 * Nudges the cached balance toward what a just-confirmed trade should have
 * done to it, so the card reflects the trade instantly instead of sitting on
 * the pre-trade figure until a refetch lands. `deltaKash` is negative for a
 * sell, positive for a buy. Purely a display estimate, immediately
 * superseded by real reads — see waitForKashAccountSettled.
 */
function applyOptimisticKashDelta(
  queryClient: QueryClient,
  wallet: string,
  deltaKash: number
): number | undefined {
  const key = ["kash", "account", wallet];
  const previous = queryClient.getQueryData<KashAccount>(key);
  if (!previous) return undefined;
  const expectedBalance = Math.max(0, Number(previous.balance) + deltaKash);
  const expectedConvertible = Math.max(0, Number(previous.convertible) + deltaKash);
  const price = Number(previous.kashPriceUsd) || 0;
  queryClient.setQueryData<KashAccount>(key, {
    ...previous,
    balance: expectedBalance.toString(),
    convertible: expectedConvertible.toString(),
    balanceUsd: (expectedBalance * price).toString(),
  });
  return expectedBalance;
}

/**
 * Re-reads the account every couple seconds, writing each attempt straight
 * into the cache, until `isSettled` confirms the real chain-backed figure
 * has actually caught up to the optimistic estimate — or the attempt budget
 * runs out, since an RPC that never catches up must not poll forever.
 */
async function waitForKashAccountSettled(
  queryClient: QueryClient,
  wallet: string,
  isSettled: (account: KashAccount) => boolean
): Promise<void> {
  for (let attempt = 0; attempt < ACCOUNT_SETTLE_MAX_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, ACCOUNT_SETTLE_POLL_MS));
    try {
      const fresh = await getKashAccount(wallet);
      queryClient.setQueryData(["kash", "account", wallet], fresh);
      if (isSettled(fresh)) return;
    } catch {
      // A transient read failure isn't a reason to stop early — the loop's
      // own attempt budget is the backstop, not this catch.
    }
  }
}

// Desk configuration (addresses, price, pause state, reserve) moves only when
// ops act, so a minute of staleness is invisible. The query answering at all
// is what switches the UI onto the desk flow — a 503 means the engine has no
// desks configured and the legacy engine flow applies.
const INFO_STALE_MS = 60 * 1000;

export function useKashDeskInfo(enabled: boolean) {
  return useQuery({
    queryKey: ["kash", "desk", "info"],
    queryFn: getKashDeskInfo,
    enabled,
    staleTime: INFO_STALE_MS,
    // A 503 is a configuration statement, not a transient fault: retrying
    // cannot configure the desk addresses.
    retry: false,
  });
}

export function useKashDeskBuyQuote(usdcAmount: string, enabled: boolean) {
  const debounced = useDebouncedValue(usdcAmount.trim(), 300);
  return useQuery({
    queryKey: ["kash", "desk", "buy-quote", debounced],
    queryFn: () => getKashDeskBuyQuote(debounced),
    enabled: enabled && isValidKashAmount(debounced),
  });
}

export function useKashDeskSellQuote(kashAmount: string, enabled: boolean) {
  const debounced = useDebouncedValue(kashAmount.trim(), 300);
  return useQuery({
    queryKey: ["kash", "desk", "sell-quote", debounced],
    queryFn: () => getKashDeskSellQuote(debounced),
    enabled: enabled && isValidKashAmount(debounced),
  });
}

/**
 * Signs the backend-built EIP-712 payload with the holder's embedded wallet.
 * The payload arrives complete — domain, nonce, deadline, spender — so the
 * client cannot get the permit-domain subtleties wrong; it only signs.
 */
function useTypedDataSigner() {
  const wallet = useSocialWallet();
  return useCallback(
    async (owner: string, typedData: Parameters<typeof withDomainType>[0]): Promise<string> => {
      const evm = wallet.addresses?.evm;
      if (!evm || evm.toLowerCase() !== owner.toLowerCase()) {
        throw new Error("Signing wallet is not connected.");
      }
      await ensureUnlocked(wallet);
      const provider = wallet.getEthereumProvider() as unknown as EIP1193Provider;
      return (await provider.request({
        method: "eth_signTypedData_v4",
        params: [owner as `0x${string}`, JSON.stringify(withDomainType(typedData))],
      })) as string;
    },
    [wallet]
  );
}

/** Submits a backend-encoded desk transaction from the user's own wallet. */
function useDeskTxSender() {
  const sendEvm = useEvmSend();
  return useCallback(
    (tx: KashDeskTx) =>
      sendEvm({
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        chainId: tx.chainId,
      }),
    [sendEvm]
  );
}

/**
 * The full on-chain buy: prepare (backend builds the USDC permit payload) →
 * sign (gasless) → tx (backend encodes buyWithPermit) → submit from the
 * user's wallet. USDC moves user → treasury and freshly minted KASH+ arrives
 * in the same transaction; the backend never holds funds.
 */
export function useKashDeskBuy() {
  const signTypedData = useTypedDataSigner();
  const sendTx = useDeskTxSender();
  const invalidate = useInvalidateKash();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ wallet, usdcAmount }: { wallet: string; usdcAmount: string }) => {
      const prepared = await postKashDeskPrepareBuy(wallet, usdcAmount);
      const signature = await signTypedData(wallet, prepared.typedData);
      const tx = await postKashDeskBuyTx(wallet, usdcAmount, prepared.deadline, signature);
      const txHash = await sendTx(tx);
      return { txHash, kashOutWei: prepared.quote.kashOutWei };
    },
    onSuccess: (data, { wallet }) => {
      const kashOut = Number(BigInt(data.kashOutWei)) / 1e18;
      const expectedBalance = applyOptimisticKashDelta(queryClient, wallet, kashOut);
      invalidate();
      if (expectedBalance !== undefined) {
        void waitForKashAccountSettled(
          queryClient,
          wallet,
          (fresh) => Number(fresh.balance) >= expectedBalance - 1e-9
        );
      }
    },
  });
}

/** The full on-chain sell: KASH+ permit → redeemWithPermit → USDC arrives. */
export function useKashDeskSell() {
  const signTypedData = useTypedDataSigner();
  const sendTx = useDeskTxSender();
  const invalidate = useInvalidateKash();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ wallet, kashAmount }: { wallet: string; kashAmount: string }) => {
      const prepared = await postKashDeskPrepareSell(wallet, kashAmount);
      const signature = await signTypedData(wallet, prepared.typedData);
      const tx = await postKashDeskSellTx(wallet, kashAmount, prepared.deadline, signature);
      const txHash = await sendTx(tx);
      return { txHash, usdcOutUnits: prepared.quote.usdcOutUnits };
    },
    onSuccess: (_data, { wallet, kashAmount }) => {
      const expectedBalance = applyOptimisticKashDelta(queryClient, wallet, -Number(kashAmount));
      invalidate();
      if (expectedBalance !== undefined) {
        void waitForKashAccountSettled(
          queryClient,
          wallet,
          (fresh) => Number(fresh.balance) <= expectedBalance + 1e-9
        );
      }
    },
  });
}
