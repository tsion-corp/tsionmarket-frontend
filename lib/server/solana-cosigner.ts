import "server-only";

import {
  address,
  compileTransaction,
  createKeyPairFromBytes,
  createSolanaRpc,
  decompileTransactionMessageFetchingLookupTables,
  getAddressFromPublicKey,
  getBase58Encoder,
  getBase64EncodedWireTransaction,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  partiallySignTransaction,
  setTransactionMessageFeePayer,
} from "@solana/kit";

// In-house Solana fee sponsorship, following the same contract as the
// platform gas-sponsor service: the transaction is first prepared with the
// sponsor wallet as fee payer (a keyless rewrite), the user signs their slots
// client-side, and only then does the sponsor add its signature and submit
// the fully signed transaction to the RPC. Active whenever SOLANA_PRIVATE_KEY
// is set, replacing the platform service; the key never leaves this server.
//
// The rewrite is a real decompile/recompile, not a byte patch: v0 messages
// index their accounts, so swapping the payer address in place would silently
// re-point every instruction. Lookup tables are fetched when the message uses
// them (Jupiter routes always do).

const RPC_URL = () =>
  `https://solana-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY ?? ""}`;

export function localSponsorConfigured(): boolean {
  return (
    typeof process.env.SOLANA_PRIVATE_KEY === "string" && process.env.SOLANA_PRIVATE_KEY !== ""
  );
}

// Accepts the two shapes wallets export: a base58 string (Phantom/Solflare)
// or a JSON byte array (solana-keygen). Both carry the 64-byte secret key.
export function parseSponsorSecret(raw: string): Uint8Array {
  const trimmed = raw.trim();
  const bytes = trimmed.startsWith("[")
    ? Uint8Array.from(JSON.parse(trimmed) as number[])
    : getBase58Encoder().encode(trimmed);
  if (bytes.length !== 64) {
    throw new Error(`SOLANA_PRIVATE_KEY must decode to 64 bytes, got ${bytes.length}`);
  }
  return new Uint8Array(bytes);
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

export async function localSponsorAddress(): Promise<string> {
  const secret = parseSponsorSecret(process.env.SOLANA_PRIVATE_KEY as string);
  const keyPair = await createKeyPairFromBytes(secret);
  return getAddressFromPublicKey(keyPair.publicKey);
}

export interface PreparedTransaction {
  transaction: string;
  sponsorPublicKey: string;
}

// Rewrites the fee payer to the sponsor without signing anything. The result
// goes back to the client for the user's signature; sponsorship happens after.
// Key-independent, so it works the same whichever sponsor signs later.
export async function rewriteFeePayerWithRpc(
  serializedTransaction: string,
  sponsorAddress: string,
  rpcUrl: string
): Promise<PreparedTransaction> {
  const wire = getTransactionDecoder().decode(base64ToBytes(serializedTransaction));
  const compiled = getCompiledTransactionMessageDecoder().decode(wire.messageBytes);
  const rpc = createSolanaRpc(rpcUrl);
  const message = await decompileTransactionMessageFetchingLookupTables(compiled, rpc);
  const sponsored = setTransactionMessageFeePayer(address(sponsorAddress), message);
  const recompiled = compileTransaction(sponsored);
  return {
    transaction: getBase64EncodedWireTransaction(recompiled),
    sponsorPublicKey: sponsorAddress,
  };
}

export async function prepareWithLocalSponsor(
  serializedTransaction: string
): Promise<PreparedTransaction> {
  return rewriteFeePayerWithRpc(serializedTransaction, await localSponsorAddress(), RPC_URL());
}

export interface CosignSubmitResult {
  transaction: string;
  submittedSignature: string;
  sponsorPublicKey: string;
}

// Adds the sponsor's signature to a user-signed transaction whose fee payer is
// already the sponsor, then submits it. Mirrors the gas-sponsor service's
// contract so the client flow is identical on both paths. Exposed with an
// injectable secret so the transform is unit-testable without the environment.
export async function cosignAndSubmitWithSecret(
  serializedTransaction: string,
  secretKeyBytes: Uint8Array,
  rpcUrl: string
): Promise<CosignSubmitResult> {
  const keyPair = await createKeyPairFromBytes(secretKeyBytes);
  const sponsorAddress = await getAddressFromPublicKey(keyPair.publicKey);

  const wire = getTransactionDecoder().decode(base64ToBytes(serializedTransaction));
  const compiled = getCompiledTransactionMessageDecoder().decode(wire.messageBytes);
  const feePayer = compiled.staticAccounts[0];
  if (feePayer !== sponsorAddress) {
    throw new Error("Transaction fee payer must be the configured sponsor wallet");
  }

  const signed = await partiallySignTransaction([keyPair], wire);
  const wireTransaction = getBase64EncodedWireTransaction(signed);

  const rpc = createSolanaRpc(rpcUrl);
  const signature = await rpc
    .sendTransaction(wireTransaction, {
      encoding: "base64",
      preflightCommitment: "confirmed",
      maxRetries: 3n,
    })
    .send();

  return {
    transaction: wireTransaction,
    submittedSignature: signature,
    sponsorPublicKey: sponsorAddress,
  };
}

export async function cosignAndSubmitWithLocalSponsor(
  serializedTransaction: string
): Promise<CosignSubmitResult> {
  const secret = parseSponsorSecret(process.env.SOLANA_PRIVATE_KEY as string);
  return cosignAndSubmitWithSecret(serializedTransaction, secret, RPC_URL());
}
