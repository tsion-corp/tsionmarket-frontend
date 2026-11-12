import { describe, expect, it } from "vitest";
import { OpenError, seal } from "./crypto";
import { fromBase64Url, randomBytes, toBase64Url, utf8 } from "./encoding";
import { ROOT_BYTES, RootError, openRoot, sealRoot, seedFromRoot } from "./root";
import { aadRoot } from "./aad";

const WALLET = "wallet-1";

describe("the sealed root", () => {
  it("round-trips the root's bytes", async () => {
    const dek = randomBytes(32);
    const root = randomBytes(ROOT_BYTES);
    const sealed = await sealRoot(dek, WALLET, root);
    expect(await openRoot(dek, WALLET, sealed)).toEqual(root);
    expect(sealed).toMatchObject({ dekVersion: 1, encoding: "base64url", aad: aadRoot(WALLET) });
  });

  it("does not open under another wallet key or for another wallet", async () => {
    const dek = randomBytes(32);
    const sealed = await sealRoot(dek, WALLET, randomBytes(ROOT_BYTES));
    await expect(openRoot(randomBytes(32), WALLET, sealed)).rejects.toBeInstanceOf(OpenError);
    await expect(openRoot(dek, "wallet-2", sealed)).rejects.toBeInstanceOf(OpenError);
  });

  it("fails if the ciphertext, iv or aad is altered", async () => {
    const dek = randomBytes(32);
    const sealed = await sealRoot(dek, WALLET, randomBytes(ROOT_BYTES));
    const flip = (text: string) => {
      const bytes = fromBase64Url(text);
      bytes[0]! ^= 1;
      return toBase64Url(bytes);
    };
    await expect(
      openRoot(dek, WALLET, { ...sealed, ciphertext: flip(sealed.ciphertext) })
    ).rejects.toBeInstanceOf(OpenError);
    await expect(openRoot(dek, WALLET, { ...sealed, iv: flip(sealed.iv) })).rejects.toBeInstanceOf(
      OpenError
    );
    await expect(openRoot(dek, WALLET, { ...sealed, aad: "other" })).rejects.toBeInstanceOf(
      OpenError
    );
  });

  it("refuses to seal anything but exactly 32 bytes", async () => {
    for (const length of [0, 15, 16, 31, 33, 64]) {
      await expect(
        sealRoot(randomBytes(32), WALLET, new Uint8Array(length))
      ).rejects.toBeInstanceOf(RootError);
    }
  });

  it("rejects a blob that opens to anything other than exactly the expected document", async () => {
    const dek = randomBytes(32);
    const aad = aadRoot(WALLET);
    const good = { v: 1, kind: "root-seed", seed: toBase64Url(randomBytes(32)) };
    for (const bad of [
      { ...good, extra: 1 },
      { ...good, v: 2 },
      { ...good, kind: "bip39" },
      { ...good, seed: toBase64Url(randomBytes(15)) },
      { ...good, seed: 5 },
      // The old phrase document is not a root seed.
      { v: 1, kind: "bip39", language: "english", entropy: toBase64Url(randomBytes(32)) },
      { v: 1 },
      "text",
      null,
    ]) {
      const sealed = await seal(dek, utf8(JSON.stringify(bad)), aad);
      await expect(
        openRoot(dek, WALLET, { ...sealed, aad, dekVersion: 1, encoding: "base64url" })
      ).rejects.toBeInstanceOf(RootError);
    }
    const notJson = await seal(dek, utf8("not json"), aad);
    await expect(
      openRoot(dek, WALLET, { ...notJson, aad, dekVersion: 1, encoding: "base64url" })
    ).rejects.toBeInstanceOf(RootError);
  });
});

describe("the seed expanded from the root", () => {
  it("is 64 bytes, deterministic, and different for different roots", async () => {
    const root = randomBytes(ROOT_BYTES);
    const seed = await seedFromRoot(root);
    expect(seed).toHaveLength(64);
    expect(await seedFromRoot(root)).toEqual(seed);
    expect(await seedFromRoot(randomBytes(ROOT_BYTES))).not.toEqual(seed);
    // It is a derivation, not the root itself.
    expect(seed.slice(0, 32)).not.toEqual(root);
  });

  it("refuses a root that is not 32 bytes", () => {
    expect(() => seedFromRoot(new Uint8Array(16))).toThrow(RootError);
  });
});
