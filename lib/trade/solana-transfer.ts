"use client";

// Builders for unsigned Solana transfer transactions. Wallet-agnostic: they
// seat the sender as a noop signer, so any signer (Decane today, the legacy
// Privy wallet on /migrate) can sign the encoded bytes afterwards. Moved out
// of hooks/use-withdraw so the migration flow's legacy send path can share
// them.

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
import { createAppSolanaRpc } from "@/lib/solana-rpc";

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

export async function buildSolanaTokenTransfer(
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

// Native SOL transfer via the system program, for sending SOL itself.
export async function buildSolanaSolTransfer(
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
