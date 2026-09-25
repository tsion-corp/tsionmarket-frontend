"use client";

import { useCallback, useState } from "react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useCreateQuote, type DextopusPurpose } from "@/hooks/use-deposit";
import { useEvmSend } from "@/hooks/use-evm-send";
import { buildSolanaSolTransfer, buildSolanaTokenTransfer } from "@/lib/trade/solana-transfer";
import {
  BASE_CHAIN_ID,
  encodeErc20Transfer,
  settlementFor,
  type SettleChain,
  type WalletChainType,
} from "@/lib/deposit";
import { useSponsoredSolanaSend } from "@/hooks/use-sponsored-solana";

export interface SendUsdcParams {
  chainType: WalletChainType;
  to: string;
  amount: bigint;
  // Which settlement chain's USDC to move. Defaults to Base (EVM) / Solana.
  settle?: SettleChain;
}

// Sends USDC from the user's embedded wallet. EVM settles USDC on Base as an
// ERC-20 transfer; Solana settles USDC via an SPL transfer. Returns the tx hash.
export function useSendUsdc() {
  const { evmAddress, solanaAddress } = useAuthSession();
  const evmSend = useEvmSend();
  const sendSponsored = useSponsoredSolanaSend();
  const [sending, setSending] = useState(false);

  const sendUsdc = useCallback(
    async ({ chainType, to, amount, settle }: SendUsdcParams): Promise<string> => {
      setSending(true);
      try {
        const from = chainType === "ethereum" ? evmAddress : solanaAddress;
        if (!from) throw new Error(`No ${chainType} wallet found`);

        if (chainType === "ethereum") {
          const usdc = settle?.usdc ?? settlementFor("ethereum").asset;
          const chainId = settle?.chainId ?? BASE_CHAIN_ID;
          const hash = await evmSend({
            to: usdc as `0x${string}`,
            data: encodeErc20Transfer(to, amount) as `0x${string}`,
            chainId,
            address: from,
          });
          return hash;
        }

        const solana = settlementFor("solana");
        const transaction = await buildSolanaTokenTransfer(
          from,
          to,
          amount,
          settle?.usdc ?? solana.asset,
          settle?.decimals ?? solana.decimals
        );
        return await sendSponsored({ transaction, prefundRent: true });
      } finally {
        setSending(false);
      }
    },
    [evmAddress, solanaAddress, evmSend, sendSponsored]
  );

  return { sendUsdc, sending };
}

// EVM chain ids by Alchemy network, for direct token/native sends.
// Every EVM chain we hold balances on, so sends and sells work on all of them.
// Keep in sync with EVM_NETWORKS in lib/server/alchemy.ts and
// NETWORK_TO_CHAIN in lib/sell.ts. A chain missing here is exactly the
// "Unsupported network" error a sell or send throws — this list previously
// lagged behind both when spot's buyable set grew, so a token bought (and
// shown in holdings) on a chain missing here could never actually be sold or
// sent. useEvmSend already degrades gracefully for a chain not in the gas
// sponsorship registry (a plain, user-paid transaction instead of a
// sponsored one), so nothing here needs to be held back for that reason.
const EVM_CHAIN_ID: Record<string, number> = {
  "base-mainnet": 8453,
  "eth-mainnet": 1,
  "arb-mainnet": 42161,
  "opt-mainnet": 10,
  "polygon-mainnet": 137,
  "apechain-mainnet": 33139,
  "berachain-mainnet": 80094,
  "bnb-mainnet": 56,
  "celo-mainnet": 42220,
  "gensyn-mainnet": 685689,
  "hyperliquid-mainnet": 999,
  "ink-mainnet": 57073,
  "monad-mainnet": 143,
  "robinhood-mainnet": 4663,
  "shape-mainnet": 360,
  "soneium-mainnet": 1868,
  "unichain-mainnet": 130,
  "worldchain-mainnet": 480,
  "gnosis-mainnet": 100,
  "linea-mainnet": 59144,
  "zksync-mainnet": 324,
  "scroll-mainnet": 534352,
  "avax-mainnet": 43114,
  "blast-mainnet": 81457,
  "zora-mainnet": 7777777,
  "ronin-mainnet": 2020,
  "abstract-mainnet": 2741,
  "mythos-mainnet": 42018,
};

export interface SendTokenParams {
  // Alchemy network id of the token's chain.
  network: string;
  // Token contract/mint address, or null for the chain's native gas token.
  tokenAddress: string | null;
  decimals: number;
  to: string;
  amount: bigint;
}

// Sends any held token to an external address on its own chain: native or ERC-20
// on EVM, native SOL or SPL on Solana. Self-custody — the embedded wallet signs.
export function useSendToken() {
  const { evmAddress, solanaAddress } = useAuthSession();
  const evmSend = useEvmSend();
  const sendSponsored = useSponsoredSolanaSend();
  const [sending, setSending] = useState(false);

  const sendToken = useCallback(
    async ({ network, tokenAddress, decimals, to, amount }: SendTokenParams): Promise<string> => {
      setSending(true);
      try {
        const isSolana = network === "solana-mainnet";
        const from = isSolana ? solanaAddress : evmAddress;
        if (!from) throw new Error(`No ${isSolana ? "solana" : "ethereum"} wallet found`);

        if (!isSolana) {
          const chainId = EVM_CHAIN_ID[network];
          if (!chainId) throw new Error("Unsupported network");
          const tx =
            tokenAddress === null
              ? { to: to as `0x${string}`, value: amount, chainId }
              : {
                  to: tokenAddress as `0x${string}`,
                  data: encodeErc20Transfer(to, amount) as `0x${string}`,
                  chainId,
                };
          const hash = await evmSend({ ...tx, address: from });
          return hash;
        }

        const transaction =
          tokenAddress === null
            ? await buildSolanaSolTransfer(from, to, amount)
            : await buildSolanaTokenTransfer(from, to, amount, tokenAddress, decimals);
        return await sendSponsored({
          transaction,
          prefundRent: tokenAddress !== null,
        });
      } finally {
        setSending(false);
      }
    },
    [evmAddress, solanaAddress, evmSend, sendSponsored]
  );

  return { sendToken, sending };
}

export interface ReroutedWithdrawParams {
  // Alchemy network id the held token lives on (e.g. "base-mainnet").
  originNetwork: string;
  // Dextopus chain id for that same network.
  originChainId: number;
  // The held token's contract/mint address. Never null: native gas tokens
  // don't go through this path, only ERC-20/SPL holdings do.
  originTokenAddress: string;
  originDecimals: number;
  destinationChainId: number;
  destinationAsset: string;
  to: string;
  amount: bigint;
  // The user's own wallet on the origin chain's family, so Dextopus can
  // refund there if the amount comes in under or over the quote.
  refundTo: string;
}

export interface ReroutedWithdrawResult {
  depositRequestId: string;
  txHash: string;
  amountOut: string;
  minAmountOut: string;
}

// Withdraws any held token to a different chain and/or asset by reusing the
// deposit pipeline in reverse: quote an origin -> destination conversion
// (strict, so a mismatch auto-refunds to our own wallet instead of getting
// stuck), then send the origin token to the deposit address the quote
// returns. Dextopus takes it from there and delivers to `to`.
export function useReroutedWithdraw(purpose: DextopusPurpose = "withdrawal") {
  const quote = useCreateQuote(purpose);
  const { sendToken, sending } = useSendToken();

  const withdraw = useCallback(
    async ({
      originNetwork,
      originChainId,
      originTokenAddress,
      originDecimals,
      destinationChainId,
      destinationAsset,
      to,
      amount,
      refundTo,
    }: ReroutedWithdrawParams): Promise<ReroutedWithdrawResult> => {
      const result = await quote.mutateAsync({
        originChainId,
        destinationChainId,
        originAsset: originTokenAddress,
        destinationAsset,
        amount: amount.toString(),
        recipient: to,
        refundTo,
        strict: true,
      });
      const txHash = await sendToken({
        network: originNetwork,
        tokenAddress: originTokenAddress,
        decimals: originDecimals,
        to: result.depositAddress,
        amount,
      });
      // Dextopus observes its unique deposit address on-chain. Its current
      // deposit integration does not expose a submit endpoint for these
      // requests, so status reconciliation begins after the source transfer.
      return {
        depositRequestId: result.depositRequestId,
        txHash,
        amountOut: result.amountOut,
        minAmountOut: result.minAmountOut,
      };
    },
    [quote, sendToken]
  );

  return { withdraw, quoting: quote.isPending, sending };
}
