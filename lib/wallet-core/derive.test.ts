import { describe, expect, it } from "vitest";
import { addressOf, deriveAccount, DERIVATION_PATHS, slip10Ed25519 } from "./derive";
import { parsePhrase, seedFromEntropy } from "./phrase";

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (text: string) =>
  Uint8Array.from(text.match(/../g)!.map((pair) => parseInt(pair, 16)));

const ABANDON =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const HARDHAT = "test test test test test test test test test test test junk";

const seedOf = (phrase: string) => seedFromEntropy(parsePhrase(phrase).entropy);

describe("SLIP-0010 ed25519 (published test vector 1)", () => {
  const seed = fromHex("000102030405060708090a0b0c0d0e0f");

  it.each([
    ["m", [], "2b4be7f19ee27bbf30c667b642d5f4aa69fd169872f8fc3059c08ebae2eb19e7"],
    ["m/0'", [0], "68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3"],
    ["m/0'/1'", [0, 1], "b1d0bad404bf35da785a64ca1ac54b2617211d2777696fbffaf208f746ae84f2"],
    ["m/0'/1'/2'", [0, 1, 2], "92a5b23c0b8a99e37d07df3fb9966917f5d06e02ddbd909c7e184371463e9fc9"],
  ])("derives %s", (_label, path, expected) => {
    expect(hex(slip10Ed25519(seed, path))).toBe(expected);
  });
});

describe("EVM account (m/44'/60'/0'/0/0)", () => {
  it("matches the well-known address for the standard test phrase", () => {
    expect(deriveAccount("evm", seedOf(ABANDON)).address).toBe(
      "0x9858EfFD232B4033E47d90003D41EC34EcaEda94"
    );
  });

  it("matches Hardhat's first account, key and address", () => {
    const account = deriveAccount("evm", seedOf(HARDHAT));
    expect(account.address).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    expect(account.material).toEqual({
      family: "evm",
      privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    });
  });
});

describe("Solana account (m/44'/501'/0'/0')", () => {
  it("matches the address Phantom shows for the standard test phrase", () => {
    expect(deriveAccount("solana", seedOf(ABANDON)).address).toBe(
      "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk"
    );
  });
});

describe("derived accounts", () => {
  it("records the path and algorithm they used", () => {
    const seed = seedOf(ABANDON);
    expect(deriveAccount("evm", seed)).toMatchObject({
      algorithm: "secp256k1",
      derivationPath: DERIVATION_PATHS.evm,
    });
    expect(deriveAccount("solana", seed)).toMatchObject({
      algorithm: "ed25519",
      derivationPath: DERIVATION_PATHS.solana,
    });
  });

  it("is deterministic, and different phrases give different accounts", () => {
    const a = deriveAccount("evm", seedOf(ABANDON));
    expect(deriveAccount("evm", seedOf(ABANDON)).address).toBe(a.address);
    expect(deriveAccount("evm", seedOf(HARDHAT)).address).not.toBe(a.address);
  });

  it("reports an address that the key material itself controls", () => {
    for (const family of ["evm", "solana"] as const) {
      const account = deriveAccount(family, seedOf(ABANDON));
      expect(addressOf(account.material)).toBe(account.address);
    }
  });

  it("derives the EVM and Solana keys independently", () => {
    const seed = seedOf(ABANDON);
    const evm = deriveAccount("evm", seed);
    const sol = deriveAccount("solana", seed);
    expect(evm.publicKey).not.toBe(sol.publicKey);
  });
});
