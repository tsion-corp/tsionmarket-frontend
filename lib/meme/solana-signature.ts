import { getBase58Decoder } from "@solana/kit";

const ED25519_SIGNATURE_BYTES = 64;

// The trade service's Solana wallet link takes the raw Ed25519 signature,
// base58-encoded. Privy hands back bytes; the length check catches a wrong
// wallet API (a signed transaction, a hex string) before it reaches the
// server as an opaque 400.
export function signatureToBase58(signature: Uint8Array): string {
  if (signature.length !== ED25519_SIGNATURE_BYTES) {
    throw new Error(
      `Expected a ${ED25519_SIGNATURE_BYTES}-byte Ed25519 signature, got ${signature.length} bytes.`
    );
  }
  return getBase58Decoder().decode(signature);
}
