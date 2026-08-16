"use client";

import { useCallback, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets as useSolanaWallets } from "@privy-io/react-auth/solana";
import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
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
import { useCreateQuote } from "@/hooks/use-deposit";
import { useEvmSend } from "@/hooks/use-evm-send";
import { getWalletAddress } from "@/lib/user";
import {
  BASE_CHAIN_ID,
  encodeErc20Transfer,
  settlementFor,
  type SettleChain,
  type WalletChainType,
} from "@/lib/deposit";
import { useSponsoredSolanaSend } from "@/hooks/use-sponsored-solana";
import { createAppSolanaRpc } from "@/lib/solana-rpc";

export interface SendUsdcParams {
  chainType: WalletChainType;
  to: string;
  amount: bigint;
  // Which settlement chain's USDC to move. Defaults to Base (EVM) / Solana.
  settle?: SettleChain;
}

// Token-2022, the successor token program some newer mints (e.g. PYUSD) run
// on. Mints owned by it derive different ATAs and need the transfer executed
// by this program instead of the classic Token program.
const TOKEN_2022_PROGRAM_ADDRESS = address("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

// A mint account's owner is the token program that manages it. Deriving ATAs
// or building a transfer with the wrong program targets accounts that don't
// exist, so every SPL transfer resolves the program from the mint first.
async function getMintTokenProgram(
  rpc: ReturnType<typeof createAppSolanaRpc>,
  mint: ReturnType<typeof address>
) {
  const { value } = await rpc.getAccountInfo(mint, { encoding: "base64" }).send();
  if (!value) throw new Error("This token's mint account was not found on Solana");
  const owner = value.owner;
  if (owner !== TOKEN_PROGRAM_ADDRESS && owner !== TOKEN_2022_PROGRAM_ADDRESS) {
    throw new Error("Sending this token isn't supported yet");
  }
  return owner;
}

async function buildSolanaTokenTransfer(
  from: string,
  to: string,
  amount: bigint,
  mintAddress: string,
  decimals: number
): Promise<Uint8Array> {
  const rpc = createAppSolanaRpc();
  const mint = address(mintAddress);
  const owner = address(from);
  const destinationOwner = address(to);
  const signer = createNoopSigner(owner);

  const tokenProgram = await getMintTokenProgram(rpc, mint);
  const [source] = await findAssociatedTokenPda({
    owner,
    mint,
    tokenProgram,
  });
  const [destination] = await findAssociatedTokenPda({
    owner: destinationOwner,
    mint,
    tokenProgram,
  });

  const createDestination = getCreateAssociatedTokenIdempotentInstruction({
    payer: signer,
    ata: destination,
    owner: destinationOwner,
    mint,
    tokenProgram,
  });
  const transfer = getTransferCheckedInstruction(
    {
      source,
      mint,
      destination,
      authority: signer,
      amount,
      decimals,
    },
    { programAddress: tokenProgram }
  );

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
  const evmSend = useEvmSend();
  const sendSponsored = useSponsoredSolanaSend();
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
          const hash = await evmSend({
            to: usdc as `0x${string}`,
            data: encodeErc20Transfer(to, amount) as `0x${string}`,
            chainId,
            address: from,
          });
          return hash;
        }

        const wallet = solanaWallets.find((w) => w.address === from);
        if (!wallet) throw new Error("Solana wallet is not ready");
        const solana = settlementFor("solana");
        const transaction = await buildSolanaTokenTransfer(
          from,
          to,
          amount,
          settle?.usdc ?? solana.asset,
          settle?.decimals ?? solana.decimals
        );
        return await sendSponsored({ transaction, wallet });
      } finally {
        setSending(false);
      }
    },
    [user, evmSend, sendSponsored, solanaWallets]
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
  const rpc = createAppSolanaRpc();
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
  const evmSend = useEvmSend();
  const sendSponsored = useSponsoredSolanaSend();
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
              ? { to: to as `0x${string}`, value: amount, chainId }
              : {
                  to: tokenAddress as `0x${string}`,
                  data: encodeErc20Transfer(to, amount) as `0x${string}`,
                  chainId,
                };
          const hash = await evmSend({ ...tx, address: from });
          return hash;
        }

        const wallet = solanaWallets.find((w) => w.address === from);
        if (!wallet) throw new Error("Solana wallet is not ready");
        const transaction =
          tokenAddress === null
            ? await buildSolanaSolTransfer(from, to, amount)
            : await buildSolanaTokenTransfer(from, to, amount, tokenAddress, decimals);
        return await sendSponsored({ transaction, wallet });
      } finally {
        setSending(false);
      }
    },
    [user, evmSend, sendSponsored, solanaWallets]
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
}

// Withdraws any held token to a different chain and/or asset by reusing the
// deposit pipeline in reverse: quote an origin -> destination conversion
// (strict, so a mismatch auto-refunds to our own wallet instead of getting
// stuck), then send the origin token to the deposit address the quote
// returns. Dextopus takes it from there and delivers to `to`.
export function useReroutedWithdraw() {
  const quote = useCreateQuote();
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
      return { depositRequestId: result.depositRequestId, txHash };
    },
    [quote, sendToken]
  );

  return { withdraw, quoting: quote.isPending, sending };
}
