import { describe, expect, it } from "vitest";
import { OpenError, seal } from "./crypto";
import { fromBase64Url, randomBytes, toBase64Url, utf8 } from "./encoding";
import { generatePhrase } from "./phrase";
import { RootError, openRoot, sealRoot } from "./root";
import { aadRoot } from "./aad";

const WALLET = "wallet-1";

describe("the encrypted root", () => {
  it("round-trips the phrase's bytes", async () => {
    const dek = randomBytes(32);
    const { entropy } = generatePhrase();
    const sealed = await sealRoot(dek, WALLET, entropy);
    expect(await openRoot(dek, WALLET, sealed)).toEqual(entropy);
    expect(sealed).toMatchObject({ dekVersion: 1, encoding: "base64url", aad: aadRoot(WALLET) });
  });

  it("also holds a 12-word phrase", async () => {
    const dek = randomBytes(32);
    const { entropy } = generatePhrase(12);
    expect(await openRoot(dek, WALLET, await sealRoot(dek, WALLET, entropy))).toEqual(entropy);
  });

  it("does not open under another wallet key or for another wallet", async () => {
    const dek = randomBytes(32);
    const sealed = await sealRoot(dek, WALLET, generatePhrase().entropy);
    await expect(openRoot(randomBytes(32), WALLET, sealed)).rejects.toBeInstanceOf(OpenError);
    await expect(openRoot(dek, "wallet-2", sealed)).rejects.toBeInstanceOf(OpenError);
  });

  it("fails if the ciphertext, iv or aad is altered", async () => {
    const dek = randomBytes(32);
    const sealed = await sealRoot(dek, WALLET, generatePhrase().entropy);
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

  it("refuses to seal an invalid amount of entropy", async () => {
    await expect(sealRoot(randomBytes(32), WALLET, new Uint8Array(15))).rejects.toBeInstanceOf(
      RootError
    );
  });

  it("rejects a blob that opens to anything other than exactly the expected document", async () => {
    const dek = randomBytes(32);
    const aad = aadRoot(WALLET);
    const good = {
      v: 1,
      kind: "bip39",
      language: "english",
      entropy: toBase64Url(randomBytes(32)),
    };
    for (const bad of [
      { ...good, extra: 1 },
      { ...good, v: 2 },
      { ...good, kind: "seed" },
      { ...good, language: "french" },
      { ...good, entropy: toBase64Url(randomBytes(15)) },
      { ...good, entropy: 5 },
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
