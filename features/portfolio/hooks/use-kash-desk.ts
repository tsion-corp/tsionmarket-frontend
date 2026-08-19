"use client";

import { useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useWallets } from "@privy-io/react-auth";
import type { EIP1193Provider } from "viem";
import { useEvmSend } from "@/hooks/use-evm-send";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useInvalidateKash } from "@/features/portfolio/hooks/use-kash";
import { isValidKashAmount } from "@/features/portfolio/lib/kash";
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
  const { wallets } = useWallets();
  return useCallback(
    async (owner: string, typedData: Parameters<typeof withDomainType>[0]): Promise<string> => {
      const wallet = wallets.find((w) => w.address.toLowerCase() === owner.toLowerCase());
      if (!wallet) throw new Error("Signing wallet is not connected.");
      const provider = (await wallet.getEthereumProvider()) as unknown as EIP1193Provider;
      return (await provider.request({
        method: "eth_signTypedData_v4",
        params: [owner as `0x${string}`, JSON.stringify(withDomainType(typedData))],
      })) as string;
    },
    [wallets]
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

  return useMutation({
    mutationFn: async ({ wallet, usdcAmount }: { wallet: string; usdcAmount: string }) => {
      const prepared = await postKashDeskPrepareBuy(wallet, usdcAmount);
      const signature = await signTypedData(wallet, prepared.typedData);
      const tx = await postKashDeskBuyTx(wallet, usdcAmount, prepared.deadline, signature);
      const txHash = await sendTx(tx);
      return { txHash, kashOutWei: prepared.quote.kashOutWei };
    },
    onSuccess: invalidate,
  });
}

/** The full on-chain sell: KASH+ permit → redeemWithPermit → USDC arrives. */
export function useKashDeskSell() {
  const signTypedData = useTypedDataSigner();
  const sendTx = useDeskTxSender();
  const invalidate = useInvalidateKash();

  return useMutation({
    mutationFn: async ({ wallet, kashAmount }: { wallet: string; kashAmount: string }) => {
      const prepared = await postKashDeskPrepareSell(wallet, kashAmount);
      const signature = await signTypedData(wallet, prepared.typedData);
      const tx = await postKashDeskSellTx(wallet, kashAmount, prepared.deadline, signature);
      const txHash = await sendTx(tx);
      return { txHash, usdcOutUnits: prepared.quote.usdcOutUnits };
    },
    onSuccess: invalidate,
  });
}
