import { describe, expect, it } from "vitest";
import { getBase58Encoder } from "@solana/kit";
import { signatureToBase58 } from "@/lib/meme/solana-signature";

describe("signatureToBase58", () => {
  it("encodes a 64-byte Ed25519 signature so the service can decode it", () => {
    const bytes = new Uint8Array(64).map((_, i) => (i * 7) % 256);
    const encoded = signatureToBase58(bytes);
    expect(getBase58Encoder().encode(encoded)).toEqual(bytes);
  });

  // The verify route accepts 80-90 chars of base58 and the contract says
  // "the 64-byte Ed25519 signature". Anything else is a client bug, not
  // something to send and let the server reject.
  it("refuses anything that is not 64 bytes", () => {
    expect(() => signatureToBase58(new Uint8Array(63))).toThrow(/64/);
    expect(() => signatureToBase58(new Uint8Array(65))).toThrow(/64/);
  });
});
