import { base58 } from "@scure/base";
import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { fromBase64Url, utf8 } from "./encoding";
import { KeyMaterialError, addressOf, generateAccount, parseKeyMaterial } from "./keygen";

describe("account generation", () => {
  it("makes a valid EVM account whose address is derived from its key", () => {
    const account = generateAccount("evm");
    expect(account.family).toBe("evm");
    expect(account.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(getAddress(account.address)).toBe(account.address); // checksummed
    const material = parseKeyMaterial(account.plaintext);
    expect(material.family).toBe("evm");
    expect(addressOf(material)).toBe(account.address);
  });

  it("makes a valid Solana account whose address is derived from its seed", () => {
    const account = generateAccount("solana");
    expect(base58.decode(account.address)).toHaveLength(32);
    const material = parseKeyMaterial(account.plaintext);
    expect(material.family).toBe("solana");
    if (material.family === "solana") expect(fromBase64Url(material.secretKey)).toHaveLength(64);
    expect(addressOf(material)).toBe(account.address);
  });

  it("never repeats a key", () => {
    const addresses = new Set(Array.from({ length: 30 }, () => generateAccount("evm").address));
    expect(addresses.size).toBe(30);
    const solana = new Set(Array.from({ length: 30 }, () => generateAccount("solana").address));
    expect(solana.size).toBe(30);
  });

  it("derives the Solana address from the seed, not from a public half stored alongside it", () => {
    const account = generateAccount("solana");
    const material = parseKeyMaterial(account.plaintext);
    if (material.family !== "solana") throw new Error("unreachable");
    const bytes = fromBase64Url(material.secretKey);
    bytes.fill(7, 32); // corrupt the stored public half
    const tampered = {
      ...material,
      secretKey: btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, ""),
    };
    expect(addressOf(tampered)).toBe(account.address);
  });
});

describe("parseKeyMaterial", () => {
  const evm = () =>
    JSON.parse(new TextDecoder().decode(generateAccount("evm").plaintext)) as Record<
      string,
      unknown
    >;
  const encode = (value: unknown) => utf8(JSON.stringify(value));

  it("rejects anything that is not exactly the expected shape", () => {
    const base = evm();
    for (const bad of [
      { ...base, extra: 1 },
      { ...base, v: 2 },
      { ...base, family: "solana" },
      { ...base, privateKey: "0x1234" },
      { ...base, privateKey: `0x${"G".repeat(64)}` },
      { ...base, privateKey: `0X${"a".repeat(64)}` },
      { v: 1, family: "evm", algorithm: "secp256k1" },
      "a string",
      null,
      [],
    ]) {
      expect(() => parseKeyMaterial(encode(bad))).toThrow(KeyMaterialError);
    }
  });

  it("rejects bytes that are not JSON or not valid UTF-8", () => {
    expect(() => parseKeyMaterial(utf8("not json"))).toThrow(KeyMaterialError);
    expect(() => parseKeyMaterial(Uint8Array.of(0xff, 0xfe, 0xfd))).toThrow(KeyMaterialError);
  });

  it("rejects a Solana key of the wrong length", () => {
    const material = { v: 1, family: "solana", algorithm: "ed25519", secretKey: "AAAA" };
    expect(() => parseKeyMaterial(encode(material))).toThrow(KeyMaterialError);
  });
});
