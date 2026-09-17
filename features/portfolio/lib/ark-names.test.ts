import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import registry from "./ark-names.json";
import { resolveArkName, toArkName } from "./ark-names";

describe("toArkName", () => {
  it("canonicalizes a bare label to a .ark name", () => {
    expect(toArkName("dave")).toBe("dave.ark");
  });

  it("is case-insensitive and trims surrounding space", () => {
    expect(toArkName("  DAVE.ARK ")).toBe("dave.ark");
  });

  it("keeps an already-suffixed name without doubling it", () => {
    expect(toArkName("demitchy.ark")).toBe("demitchy.ark");
  });

  it("rejects a raw EVM address (that is not a name)", () => {
    expect(toArkName("0x7bd263363D4BC844b6627cc63bB3A1a7710D43bA")).toBeNull();
  });

  it("rejects blank and structurally invalid labels", () => {
    expect(toArkName("")).toBeNull();
    expect(toArkName("   ")).toBeNull();
    expect(toArkName("a b")).toBeNull();
    expect(toArkName("foo.bar")).toBeNull();
  });
});

describe("resolveArkName", () => {
  it("resolves a seeded name typed bare", async () => {
    await expect(resolveArkName("dave")).resolves.toEqual({
      name: "dave.ark",
      address: "0x7bd263363D4BC844b6627cc63bB3A1a7710D43bA",
    });
  });

  it("resolves a seeded name typed in full and mixed case", async () => {
    await expect(resolveArkName("Demitchy.Ark")).resolves.toEqual({
      name: "demitchy.ark",
      address: "0xC14733501F25680e6f53c48f7afBe4F946642aD1",
    });
  });

  it("returns null for a name the registry does not know", async () => {
    await expect(resolveArkName("nobody")).resolves.toBeNull();
  });

  it("returns null for a raw address, so it is never treated as a name", async () => {
    await expect(resolveArkName("0x7bd263363D4BC844b6627cc63bB3A1a7710D43bA")).resolves.toBeNull();
  });
});

// The registry is a money routing table: whatever is in it is where a send
// goes. An address that fails its checksum was typed rather than copied from a
// wallet, which is how three invented entries reached the first version of this
// file. A checksum cannot prove someone holds the key, so a new name still
// needs its owner to confirm the address; this only stops the typed ones.
describe("the shipped registry", () => {
  const entries = Object.entries(registry as Record<string, string>);

  it("is not empty", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it("keys every entry by a canonical lowercase .ark name", () => {
    for (const [name] of entries) {
      expect(name).toMatch(/^[a-z0-9-]+\.ark$/);
      expect(toArkName(name)).toBe(name);
    }
  });

  it("carries only addresses in their exact EIP-55 checksummed form", () => {
    for (const [name, address] of entries) {
      expect(`${name} -> ${address}`).toBe(`${name} -> ${getAddress(address)}`);
    }
  });

  it("points each name at a different address", () => {
    const addresses = entries.map(([, address]) => address.toLowerCase());
    expect(new Set(addresses).size).toBe(addresses.length);
  });

  it("resolves every name it ships", async () => {
    for (const [name, address] of entries) {
      await expect(resolveArkName(name)).resolves.toEqual({ name, address });
    }
  });
});
