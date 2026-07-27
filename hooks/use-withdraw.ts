"use client";

import { useCallback, useState } from "react";
import { usePrivy, useSendTransaction } from "@privy-io/react-auth";
import {
  useSignAndSendTransaction,
  useWallets as useSolanaWallets,
} from "@privy-io/react-auth/solana";
import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createSolanaRpc,
  createTransactionMessage,
  getBase58Decoder,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
} from "@solana-program/token";
import { getTransferSolInstruction } from "@solana-program/system";
import { usePortfolio } from "@/hooks/use-portfolio";
import { getWalletAddress } from "@/lib/user";
import {
  BASE_CHAIN_ID,
  encodeErc20Transfer,
  settlementFor,
  type SettleChain,
  type WalletChainType,
} from "@/lib/deposit";

// Public Solana mainnet RPC, the same endpoint Dextopus lists for the chain.
const SOLANA_RPC = "https://api.mainnet-beta.solana.com";

// The native asset that pays the network fee on each settlement chain, keyed by
// the Alchemy portfolio network so we can find the balance.
const GAS_ASSET: Record<WalletChainType, { symbol: string; network: string }> = {
  ethereum: { symbol: "ETH", network: "base-mainnet" },
  solana: { symbol: "SOL", network: "solana-mainnet" },
};

export interface GasStatus {
  hasGas: boolean;
  nativeSymbol: string;
  loading: boolean;
}

// Sponsorship is off, so a send needs the wallet to hold a little of the chain's
// native asset. This reads the portfolio for that balance so the UI can warn and
// block before a send fails on-chain.
export function useGasStatus(chainType: WalletChainType): GasStatus {
  const { tokens, loading } = usePortfolio();
  const gas = GAS_ASSET[chainType];
  const held = tokens.some(
    (t) => t.symbol === gas.symbol && t.network === gas.network && t.balance > 0
  );
  return { hasGas: held, nativeSymbol: gas.symbol, loading };
}

export interface SendUsdcParams {
  chainType: WalletChainType;
  to: string;
  amount: bigint;
  // Which settlement chain's USDC to move. Defaults to Base (EVM) / Solana.
  settle?: SettleChain;
}

async function buildSolanaUsdcTransfer(
  from: string,
  to: string,
  amount: bigint,
  mintAddress: string,
  decimals: number
): Promise<Uint8Array> {
  const rpc = createSolanaRpc(SOLANA_RPC);
  const mint = address(mintAddress);
  const owner = address(from);
  const destinationOwner = address(to);
  const signer = createNoopSigner(owner);

  const [source] = await findAssociatedTokenPda({
    owner,
    mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const [destination] = await findAssociatedTokenPda({
    owner: destinationOwner,
    mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  const createDestination = getCreateAssociatedTokenIdempotentInstruction({
    payer: signer,
    ata: destination,
    owner: destinationOwner,
    mint,
  });
  const transfer = getTransferCheckedInstruction({
    source,
    mint,
    destination,
    authority: signer,
    amount,
    decimals,
  });

  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstructions([createDestination, transfer], m)
  );

  const compiled = compileTransaction(message);
  return getTransactionEncoder().encode(compiled) as Uint8Array;
}

// Sends USDC from the user's embedded wallet. EVM settles USDC on Base as an
// ERC-20 transfer; Solana settles USDC via an SPL transfer. Returns the tx hash.
export function useSendUsdc() {
  const { user } = usePrivy();
  const { sendTransaction } = useSendTransaction();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const { wallets: solanaWallets } = useSolanaWallets();
  const [sending, setSending] = useState(false);

  const sendUsdc = useCallback(
    async ({ chainType, to, amount, settle }: SendUsdcParams): Promise<string> => {
      setSending(true);
      try {
        const from = getWalletAddress(user, chainType);
        if (!from) throw new Error(`No ${chainType} wallet found`);

        if (chainType === "ethereum") {
          const usdc = settle?.usdc ?? settlementFor("ethereum").asset;
          const chainId = settle?.chainId ?? BASE_CHAIN_ID;
          const { hash } = await sendTransaction(
            { to: usdc, data: encodeErc20Transfer(to, amount), chainId },
            { address: from }
          );
          return hash;
        }

        const wallet = solanaWallets.find((w) => w.address === from);
        if (!wallet) throw new Error("Solana wallet is not ready");
        const solana = settlementFor("solana");
        const transaction = await buildSolanaUsdcTransfer(
          from,
          to,
          amount,
          settle?.usdc ?? solana.asset,
          settle?.decimals ?? solana.decimals
        );
        const { signature } = await signAndSendTransaction({ transaction, wallet });
        return getBase58Decoder().decode(signature);
      } finally {
        setSending(false);
      }
    },
    [user, sendTransaction, signAndSendTransaction, solanaWallets]
  );

  return { sendUsdc, sending };
}

// EVM chain ids by Alchemy network, for direct token/native sends.
// Every EVM chain we hold balances on, so sends and sells work on all of them.
// Keep in sync with the portfolio's supported chains (lib/server/alchemy).
const EVM_CHAIN_ID: Record<string, number> = {
  "base-mainnet": 8453,
  "eth-mainnet": 1,
  "arb-mainnet": 42161,
  "opt-mainnet": 10,
  "polygon-mainnet": 137,
};

// Native SOL transfer via the system program, for sending SOL itself.
async function buildSolanaSolTransfer(
  from: string,
  to: string,
  amount: bigint
): Promise<Uint8Array> {
  const rpc = createSolanaRpc(SOLANA_RPC);
  const source = createNoopSigner(address(from));
  const transfer = getTransferSolInstruction({ source, destination: address(to), amount });
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(source, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstructions([transfer], m)
  );
  return getTransactionEncoder().encode(compileTransaction(message)) as Uint8Array;
}

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
  const { user } = usePrivy();
  const { sendTransaction } = useSendTransaction();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const { wallets: solanaWallets } = useSolanaWallets();
  const [sending, setSending] = useState(false);

  const sendToken = useCallback(
    async ({ network, tokenAddress, decimals, to, amount }: SendTokenParams): Promise<string> => {
      setSending(true);
      try {
        const isSolana = network === "solana-mainnet";
        const chainType: WalletChainType = isSolana ? "solana" : "ethereum";
        const from = getWalletAddress(user, chainType);
        if (!from) throw new Error(`No ${chainType} wallet found`);

        if (!isSolana) {
          const chainId = EVM_CHAIN_ID[network];
          if (!chainId) throw new Error("Unsupported network");
          const tx =
            tokenAddress === null
              ? { to, value: `0x${amount.toString(16)}` as `0x${string}`, chainId }
              : { to: tokenAddress, data: encodeErc20Transfer(to, amount), chainId };
          const { hash } = await sendTransaction(tx, { address: from });
          return hash;
        }

        const wallet = solanaWallets.find((w) => w.address === from);
        if (!wallet) throw new Error("Solana wallet is not ready");
        const transaction =
          tokenAddress === null
            ? await buildSolanaSolTransfer(from, to, amount)
            : await buildSolanaUsdcTransfer(from, to, amount, tokenAddress, decimals);
        const { signature } = await signAndSendTransaction({ transaction, wallet });
        return getBase58Decoder().decode(signature);
      } finally {
        setSending(false);
      }
    },
    [user, sendTransaction, signAndSendTransaction, solanaWallets]
  );

  return { sendToken, sending };
}
