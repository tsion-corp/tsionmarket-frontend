import "server-only";

import {
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

// In-house Solana fee sponsorship: the transaction's fee payer is rewritten to
// our sponsor wallet and the sponsor's signature is added server-side, then
// the client signs with the embedded wallet and broadcasts as usual. Active
// whenever SOLANA_PRIVATE_KEY is set, replacing the platform gas-sponsor
// service entirely — the key never leaves this server and nothing here ever
// submits a transaction.
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

export interface CosignResult {
  transaction: string;
  sponsorPublicKey: string;
}

// Rewrites the fee payer to the sponsor and adds the sponsor's signature.
// Exposed with an injectable secret so the transform is unit-testable without
// touching the environment.
export async function cosignTransactionWithSecret(
  serializedTransaction: string,
  secretKeyBytes: Uint8Array,
  rpcUrl: string
): Promise<CosignResult> {
  const keyPair = await createKeyPairFromBytes(secretKeyBytes);
  const sponsorAddress = await getAddressFromPublicKey(keyPair.publicKey);

  const wire = getTransactionDecoder().decode(base64ToBytes(serializedTransaction));
  const compiled = getCompiledTransactionMessageDecoder().decode(wire.messageBytes);
  const rpc = createSolanaRpc(rpcUrl);
  const message = await decompileTransactionMessageFetchingLookupTables(compiled, rpc);
  const sponsored = setTransactionMessageFeePayer(sponsorAddress, message);
  const recompiled = compileTransaction(sponsored);
  const signed = await partiallySignTransaction([keyPair], recompiled);

  return {
    transaction: getBase64EncodedWireTransaction(signed),
    sponsorPublicKey: sponsorAddress,
  };
}

export async function cosignWithLocalSponsor(serializedTransaction: string): Promise<CosignResult> {
  const secret = parseSponsorSecret(process.env.SOLANA_PRIVATE_KEY as string);
  return cosignTransactionWithSecret(serializedTransaction, secret, RPC_URL());
}
