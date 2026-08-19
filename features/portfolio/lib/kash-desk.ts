"use client";

// Transport and domain types for the on-chain buy/sell desks (KashSale /
// KashRedeem). The backend is the only integration surface: it prices the
// trade, builds the exact EIP-712 permit payload to sign — including the
// permit-domain subtleties (USDC signs as "USD Coin"/"2"; KASH+ signs as
// "Kash"/"1" despite displaying "Kash Plus") — and encodes the transaction
// the wallet submits. The client signs and sends; it never encodes calldata
// or touches contract ABIs for these flows.

import { createServiceClient } from "@/lib/api/service";

const kash = createServiceClient("/api/kash", "Kash is unavailable right now.");

export interface KashDeskInfo {
  chainId: number;
  addresses: {
    token: string;
    sale: string;
    redeem: string;
    usdc: string;
    treasury: string | null;
  };
  priceUsdcPerKash: string;
  priceUsd: string;
  paused: { sale: boolean; redeem: boolean };
  /** The redeem contract's USDC balance — the public backing figure. */
  reserveUsdc: string;
}

export interface KashDeskBuyQuote {
  usdcIn: string;
  kashOut: string;
  kashOutWei: string;
  paused: boolean;
}

export interface KashDeskSellQuote {
  kashIn: string;
  usdcOut: string;
  usdcOutUnits: string;
  reserveUsdc: string;
  /** False when the reserve cannot pay this quote — selling would revert. */
  covered: boolean;
  paused: boolean;
}

/**
 * The EIP-712 payload as the backend serves it. `types` carries only the
 * Permit struct; the EIP712Domain entry is appended client-side (see
 * withDomainType) because eth_signTypedData_v4 requires it while the server
 * keeps its payload minimal.
 */
export interface KashDeskTypedData {
  domain: { name: string; version: string; chainId: number; verifyingContract: string };
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, string | number>;
}

export interface KashDeskPrepared {
  deadline: number;
  typedData: KashDeskTypedData;
  quote: Record<string, string>;
}

export interface KashDeskTx {
  chainId: number;
  to: string;
  value: string;
  data: string;
}

export const getKashDeskInfo = () => kash.get<KashDeskInfo>("/desk");

export const getKashDeskBuyQuote = (usdcAmount: string) =>
  kash.get<KashDeskBuyQuote>("/desk/buy/quote", { usdcAmount });

export const getKashDeskSellQuote = (kashAmount: string) =>
  kash.get<KashDeskSellQuote>("/desk/sell/quote", { kashAmount });

export const postKashDeskPrepareBuy = (wallet: string, usdcAmount: string) =>
  kash.post<KashDeskPrepared>("/desk/buy/prepare", { wallet, usdcAmount });

export const postKashDeskBuyTx = (
  wallet: string,
  usdcAmount: string,
  deadline: number,
  signature: string
) => kash.post<KashDeskTx>("/desk/buy/tx", { wallet, usdcAmount, deadline, signature });

export const postKashDeskPrepareSell = (wallet: string, kashAmount: string) =>
  kash.post<KashDeskPrepared>("/desk/sell/prepare", { wallet, kashAmount });

export const postKashDeskSellTx = (
  wallet: string,
  kashAmount: string,
  deadline: number,
  signature: string
) => kash.post<KashDeskTx>("/desk/sell/tx", { wallet, kashAmount, deadline, signature });

/**
 * The payload with the EIP712Domain type entry providers insist on.
 *
 * eth_signTypedData_v4 validates that `types` describes the domain as well as
 * the message; the backend sends only the Permit struct. The domain fields are
 * the standard four in their canonical order, matching the domain object the
 * backend built.
 */
export function withDomainType(typedData: KashDeskTypedData): KashDeskTypedData {
  if (typedData.types.EIP712Domain) return typedData;
  return {
    ...typedData,
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      ...typedData.types,
    },
  };
}
