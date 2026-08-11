import { describe, expect, it } from "vitest";
import {
  DETECTABLE_ADDRESS_KINDS,
  detectAddressKind,
  extractScannedAddress,
} from "@/lib/wallet-address";
import type { AddressKind } from "@/lib/deposit";

// One known-good address per family the detector claims to support.
const SAMPLE: Record<string, string> = {
  evm: "0x52908400098527886E0F7030069857D2E4169EE7",
  tron: "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7",
  xrp: "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH",
  ton: "EQDrLq-X6jKZNHAScgghh0h1iog3StK71zn8dcmrOj8jPWRA",
  bitcoin: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
  solana: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};

describe("detectAddressKind", () => {
  it("identifies each family it claims to support", () => {
    for (const [kind, addr] of Object.entries(SAMPLE)) {
      expect(detectAddressKind(addr), kind).toBe(kind);
    }
  });

  it("returns null for unrecognized input", () => {
    expect(detectAddressKind("")).toBeNull();
    expect(detectAddressKind("not an address")).toBeNull();
  });
});

describe("DETECTABLE_ADDRESS_KINDS", () => {
  it("contains exactly the kinds detectAddressKind can return", () => {
    // The detector's supported families, from its format checks. If a format
    // is added or removed there, this set (and the pickers filtering on it)
    // must move with it.
    const supported: AddressKind[] = ["evm", "tron", "xrp", "ton", "bitcoin", "solana"];
    expect([...DETECTABLE_ADDRESS_KINDS].sort()).toEqual([...supported].sort());
    for (const kind of supported) {
      expect(detectAddressKind(SAMPLE[kind])).toBe(kind);
    }
  });

  it("excludes families the detector can never validate", () => {
    for (const kind of ["near", "stellar", "sui", "litecoin"] as AddressKind[]) {
      expect(DETECTABLE_ADDRESS_KINDS.has(kind)).toBe(false);
    }
  });
});

describe("extractScannedAddress", () => {
  it("passes a bare address through unchanged", () => {
    expect(extractScannedAddress(SAMPLE.evm)).toBe(SAMPLE.evm);
  });

  it("strips a BIP21 scheme and query string", () => {
    expect(extractScannedAddress(`bitcoin:${SAMPLE.bitcoin}?amount=0.1`)).toBe(SAMPLE.bitcoin);
  });

  it("strips an EIP-681 scheme and chain-id suffix", () => {
    expect(extractScannedAddress(`ethereum:${SAMPLE.evm}@1`)).toBe(SAMPLE.evm);
  });

  it("strips a plain chain-name scheme", () => {
    expect(extractScannedAddress(`solana:${SAMPLE.solana}`)).toBe(SAMPLE.solana);
  });

  it("trims surrounding whitespace", () => {
    expect(extractScannedAddress(`  ${SAMPLE.tron}  `)).toBe(SAMPLE.tron);
  });
});
