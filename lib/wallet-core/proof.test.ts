import { describe, expect, it } from "vitest";
import { generateAccount, parseKeyMaterial } from "./keygen";
import { possessionMessage, signPossession, verifyPossession } from "./proof";

const NONCE = "nonce-0123456789abcdef";
const WALLET = "wallet-1";
const ACCOUNT = "account-1";

const accountOf = (family: "evm" | "solana") => {
  const generated = generateAccount(family);
  return { address: generated.address, material: parseKeyMaterial(generated.plaintext) };
};

describe.each(["evm", "solana"] as const)("possession proof (%s)", (family) => {
  it("verifies for the key's own address", async () => {
    const { address, material } = accountOf(family);
    const signature = await signPossession(material, WALLET, ACCOUNT, NONCE);
    expect(
      await verifyPossession({
        family,
        address,
        walletId: WALLET,
        accountId: ACCOUNT,
        nonce: NONCE,
        signature,
      })
    ).toBe(true);
  });

  it("fails for a different address, nonce, account or wallet", async () => {
    const { address, material } = accountOf(family);
    const signature = await signPossession(material, WALLET, ACCOUNT, NONCE);
    const base = { family, address, walletId: WALLET, accountId: ACCOUNT, nonce: NONCE, signature };
    expect(await verifyPossession({ ...base, address: accountOf(family).address })).toBe(false);
    expect(await verifyPossession({ ...base, nonce: "nonce-ffffffffffffffff" })).toBe(false);
    expect(await verifyPossession({ ...base, accountId: "account-2" })).toBe(false);
    expect(await verifyPossession({ ...base, walletId: "wallet-2" })).toBe(false);
  });

  it("fails for a garbled signature or address, never throwing", async () => {
    const { address, material } = accountOf(family);
    const signature = await signPossession(material, WALLET, ACCOUNT, NONCE);
    const base = { family, address, walletId: WALLET, accountId: ACCOUNT, nonce: NONCE, signature };
    expect(await verifyPossession({ ...base, signature: "AAAA" })).toBe(false);
    expect(await verifyPossession({ ...base, signature: "not a signature" })).toBe(false);
    expect(await verifyPossession({ ...base, address: "garbage" })).toBe(false);
  });

  it("does not let someone claim an address they only know", async () => {
    const victim = accountOf(family);
    const attacker = accountOf(family);
    const forged = await signPossession(attacker.material, WALLET, ACCOUNT, NONCE);
    expect(
      await verifyPossession({
        family,
        address: victim.address,
        walletId: WALLET,
        accountId: ACCOUNT,
        nonce: NONCE,
        signature: forged,
      })
    ).toBe(false);
  });
});

describe("possession proof across families", () => {
  it("an EVM signature does not verify as a Solana one and vice versa", async () => {
    const evm = accountOf("evm");
    const sol = accountOf("solana");
    const evmSig = await signPossession(evm.material, WALLET, ACCOUNT, NONCE);
    const solSig = await signPossession(sol.material, WALLET, ACCOUNT, NONCE);
    expect(
      await verifyPossession({
        family: "solana",
        address: sol.address,
        walletId: WALLET,
        accountId: ACCOUNT,
        nonce: NONCE,
        signature: evmSig,
      })
    ).toBe(false);
    expect(
      await verifyPossession({
        family: "evm",
        address: evm.address,
        walletId: WALLET,
        accountId: ACCOUNT,
        nonce: NONCE,
        signature: solSig,
      })
    ).toBe(false);
  });
});

describe("possessionMessage", () => {
  it("is domain-separated and names every input", () => {
    const message = possessionMessage(WALLET, ACCOUNT, NONCE);
    expect(message).toBe(`tsion-wallet-possession:v1:${WALLET}:${ACCOUNT}:${NONCE}`);
  });

  it("rejects ids and nonces that could change the meaning of the message", () => {
    expect(() => possessionMessage("wallet:1", ACCOUNT, NONCE)).toThrow();
    expect(() => possessionMessage(WALLET, "a b", NONCE)).toThrow();
    expect(() => possessionMessage(WALLET, ACCOUNT, "short")).toThrow();
    expect(() => possessionMessage(WALLET, ACCOUNT, "has spaces and punctuation!!")).toThrow();
  });
});
