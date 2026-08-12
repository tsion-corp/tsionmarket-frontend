import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AccountRole,
  appendTransactionMessageInstruction,
  compileTransaction,
  createKeyPairFromBytes,
  createTransactionMessage,
  getAddressFromPublicKey,
  getBase64EncodedWireTransaction,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  partiallySignTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Blockhash,
} from "@solana/kit";
import {
  cosignAndSubmitWithSecret,
  parseSponsorSecret,
  rewriteFeePayerWithRpc,
} from "@/lib/server/solana-cosigner";

// RFC 8032 Ed25519 test vectors: fixed, valid seed+public pairs, so the test
// needs no key generation and no randomness.
const SPONSOR_SECRET = new Uint8Array([
  ...Buffer.from("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60", "hex"),
  ...Buffer.from("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a", "hex"),
]);
const USER_SECRET = new Uint8Array([
  ...Buffer.from("4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb", "hex"),
  ...Buffer.from("3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c", "hex"),
]);

// Only reached by the submit test, which stubs fetch; the prepare fixture uses
// no lookup tables, so decompilation does not fetch anything.
const RPC_URL = "http://127.0.0.1:1";

const BLOCKHASH = "11111111111111111111111111111111" as Blockhash;
const SYSTEM_PROGRAM = "11111111111111111111111111111112";

async function transactionWithFeePayer(feePayer: string, userAddress: string): Promise<string> {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(feePayer as never, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: BLOCKHASH, lastValidBlockHeight: 1n },
        m
      ),
    (m) =>
      appendTransactionMessageInstruction(
        {
          programAddress: SYSTEM_PROGRAM as never,
          accounts: [{ address: userAddress as never, role: AccountRole.WRITABLE_SIGNER }],
          data: new Uint8Array([2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]),
        },
        m
      )
  );
  return getBase64EncodedWireTransaction(compileTransaction(message));
}

async function keyAddresses(): Promise<{ sponsorAddress: string; userAddress: string }> {
  const sponsorKeyPair = await createKeyPairFromBytes(SPONSOR_SECRET);
  const userKeyPair = await createKeyPairFromBytes(USER_SECRET);
  return {
    sponsorAddress: await getAddressFromPublicKey(sponsorKeyPair.publicKey),
    userAddress: await getAddressFromPublicKey(userKeyPair.publicKey),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseSponsorSecret", () => {
  it("accepts a JSON byte array", () => {
    const parsed = parseSponsorSecret(JSON.stringify(Array.from(SPONSOR_SECRET)));
    expect(parsed).toEqual(SPONSOR_SECRET);
  });

  it("rejects a key of the wrong size", () => {
    expect(() => parseSponsorSecret(JSON.stringify([1, 2, 3]))).toThrow(/64 bytes/);
  });
});

describe("rewriteFeePayerWithRpc", () => {
  it("reseats the sponsor as fee payer and signs nothing", async () => {
    const { sponsorAddress, userAddress } = await keyAddresses();
    const wire = await transactionWithFeePayer(userAddress, userAddress);

    const result = await rewriteFeePayerWithRpc(wire, sponsorAddress, RPC_URL);
    expect(result.sponsorPublicKey).toBe(sponsorAddress);

    const tx = getTransactionDecoder().decode(
      Uint8Array.from(Buffer.from(result.transaction, "base64"))
    );
    const compiled = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);

    // The sponsor pays the fee (static account 0), the user is still a
    // required signer, and both signature slots wait: the user signs on the
    // client and the sponsor signs at submit time.
    expect(compiled.staticAccounts[0]).toBe(sponsorAddress);
    expect(compiled.staticAccounts).toContain(userAddress);
    expect(compiled.header.numSignerAccounts).toBe(2);
    const signatures = tx.signatures as Record<string, Uint8Array | null>;
    expect(signatures[sponsorAddress] ?? null).toBeNull();
    expect(signatures[userAddress] ?? null).toBeNull();
  });
});

describe("cosignAndSubmitWithSecret", () => {
  it("signs the sponsor slot of a user-signed transaction and submits it", async () => {
    const { sponsorAddress, userAddress } = await keyAddresses();
    const wire = await transactionWithFeePayer(sponsorAddress, userAddress);

    // The user signs first, exactly as the client does after prepare.
    const userKeyPair = await createKeyPairFromBytes(USER_SECRET);
    const decoded = getTransactionDecoder().decode(Uint8Array.from(Buffer.from(wire, "base64")));
    const userSigned = await partiallySignTransaction([userKeyPair], decoded);
    const userSignedWire = getBase64EncodedWireTransaction(userSigned);

    const submitted = "5" + "1".repeat(86);
    const fetchMock = vi.fn(async () =>
      Response.json({ jsonrpc: "2.0", id: "1", result: submitted })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await cosignAndSubmitWithSecret(userSignedWire, SPONSOR_SECRET, RPC_URL);
    expect(result.sponsorPublicKey).toBe(sponsorAddress);
    expect(result.submittedSignature).toBe(submitted);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // What went to the RPC is fully signed: both slots filled.
    const tx = getTransactionDecoder().decode(
      Uint8Array.from(Buffer.from(result.transaction, "base64"))
    );
    const signatures = tx.signatures as Record<string, Uint8Array | null>;
    expect(signatures[sponsorAddress]).toBeTruthy();
    expect(signatures[userAddress]).toBeTruthy();
  });

  it("rejects a transaction whose fee payer is not the sponsor", async () => {
    const { userAddress } = await keyAddresses();
    const wire = await transactionWithFeePayer(userAddress, userAddress);
    await expect(cosignAndSubmitWithSecret(wire, SPONSOR_SECRET, RPC_URL)).rejects.toThrow(
      /fee payer/
    );
  });
});
