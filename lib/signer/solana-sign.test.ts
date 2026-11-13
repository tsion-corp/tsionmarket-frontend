import { ed25519 } from "@noble/curves/ed25519";
import { base58 } from "@scure/base";
import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getTransactionDecoder,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Blockhash,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { describe, expect, it } from "vitest";
import { SolanaTransactionError, signSolanaTransactionBytes } from "./solana-sign";

const seedA = ed25519.utils.randomPrivateKey();
const seedB = ed25519.utils.randomPrivateKey();
const addr = (seed: Uint8Array) => address(base58.encode(ed25519.getPublicKey(seed)));
const BLOCKHASH = base58.encode(new Uint8Array(32).fill(9)) as Blockhash;

/** A real transfer, built by the same library the app builds them with. `payer` signs as fee payer. */
function transfer(from: Uint8Array, payer: Uint8Array = from, version: 0 | "legacy" = 0) {
  const message = pipe(
    createTransactionMessage({ version }),
    (m) => setTransactionMessageFeePayerSigner(createNoopSigner(addr(payer)), m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: BLOCKHASH, lastValidBlockHeight: 100n },
        m
      ),
    (m) =>
      appendTransactionMessageInstructions(
        [
          getTransferSolInstruction({
            source: createNoopSigner(addr(from)),
            destination: addr(seedB),
            amount: 1_000n,
          }),
        ],
        m
      )
  );
  const compiled = compileTransaction(message);
  return { compiled, bytes: new Uint8Array(getTransactionEncoder().encode(compiled)) };
}

describe("signing a Solana transaction", () => {
  it("signs a transfer so the signature verifies over the message, and the library reads it back", () => {
    const { compiled, bytes } = transfer(seedA);
    const signed = signSolanaTransactionBytes(bytes, seedA);
    expect(signed).toHaveLength(bytes.length);

    const decoded = getTransactionDecoder().decode(signed);
    const signature = decoded.signatures[addr(seedA)]!;
    expect(signature).toHaveLength(64);
    expect(
      ed25519.verify(signature, new Uint8Array(compiled.messageBytes), ed25519.getPublicKey(seedA))
    ).toBe(true);
    // Only the message was signed: nothing else in the transaction changed.
    expect(decoded.messageBytes).toEqual(compiled.messageBytes);
  });

  it("signs a legacy transaction the same way", () => {
    const { compiled, bytes } = transfer(seedA, seedA, "legacy");
    expect((bytes[1 + 64] ?? 0) & 0x80).toBe(0); // no version prefix on the message
    const decoded = getTransactionDecoder().decode(signSolanaTransactionBytes(bytes, seedA));
    expect(
      ed25519.verify(
        decoded.signatures[addr(seedA)]!,
        new Uint8Array(compiled.messageBytes),
        ed25519.getPublicKey(seedA)
      )
    ).toBe(true);
  });

  it("fills only its own slot when someone else (a fee sponsor) must sign too", () => {
    const { compiled, bytes } = transfer(seedA, seedB); // B pays the fee, A is also a signer
    const signed = signSolanaTransactionBytes(bytes, seedA);
    const decoded = getTransactionDecoder().decode(signed);
    expect(decoded.signatures[addr(seedA)]).toHaveLength(64);
    expect(decoded.signatures[addr(seedB)]).toBeNull();
    expect(
      ed25519.verify(
        decoded.signatures[addr(seedA)]!,
        new Uint8Array(compiled.messageBytes),
        ed25519.getPublicKey(seedA)
      )
    ).toBe(true);
  });

  it("refuses a transaction this key is not a required signer of", () => {
    const { bytes } = transfer(seedB);
    expect(() => signSolanaTransactionBytes(bytes, seedA)).toThrow(/isn't for this wallet/);
  });

  it("refuses anything that is not a well-formed transaction, without throwing anything else", () => {
    const { bytes } = transfer(seedA);
    const cases: Uint8Array[] = [
      new Uint8Array(0),
      new Uint8Array([0]),
      new Uint8Array([1]),
      bytes.slice(0, 40),
      bytes.slice(0, 70),
      bytes.slice(0, bytes.length - 40),
      new Uint8Array(200).fill(255),
      Uint8Array.from([5, ...new Uint8Array(400)]),
    ];
    for (const garbage of cases) {
      expect(() => signSolanaTransactionBytes(garbage, seedA)).toThrow(SolanaTransactionError);
    }
    // Trailing bytes after a complete message are refused too.
    expect(() => signSolanaTransactionBytes(new Uint8Array([...bytes, 0]), seedA)).toThrow(
      SolanaTransactionError
    );
    // A bad signature count disagreeing with the message header.
    const wrongCount = bytes.slice();
    wrongCount[0] = 2;
    expect(() => signSolanaTransactionBytes(wrongCount, seedA)).toThrow(SolanaTransactionError);
    expect(() => signSolanaTransactionBytes(bytes, new Uint8Array(16))).toThrow(
      SolanaTransactionError
    );
  });

  it("does not modify the transaction it was given", () => {
    const { bytes } = transfer(seedA);
    const before = bytes.slice();
    signSolanaTransactionBytes(bytes, seedA);
    expect(bytes).toEqual(before);
  });
});
