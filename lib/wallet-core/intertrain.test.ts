import { mnemonicToSeedSync } from "@scure/bip39";
import { bech32m } from "@scure/base";
import { describe, expect, it } from "vitest";
import {
  deriveIntertrainKey,
  intertrainAddressFromPublicKey,
  normalizeIntertrainAddress,
} from "./intertrain";

const VECTOR =
  "legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth title";

// The same bytes Intertrain's own wallet derives for this phrase (mna1q8lye5pxhet776htmfrgf2ffrvztuf0j65dyuyjz).
const VECTOR_BYTES = bech32m.decodeToBytes("mna1q8lye5pxhet776htmfrgf2ffrvztuf0j65dyuyjz").bytes;

describe("Intertrain account", () => {
  it("matches the native wallet's account for a known seed, under the wsk prefix", () => {
    const key = deriveIntertrainKey(mnemonicToSeedSync(VECTOR));
    const decoded = bech32m.decodeToBytes(key.address);
    expect(decoded.prefix).toBe("wsk");
    expect(decoded.bytes).toEqual(VECTOR_BYTES);
    expect(intertrainAddressFromPublicKey(key.publicKey, "mna")).toBe(
      "mna1q8lye5pxhet776htmfrgf2ffrvztuf0j65dyuyjz"
    );
  });

  it("keeps accounts separate and the default stable", () => {
    const seed = mnemonicToSeedSync(VECTOR);
    const first = deriveIntertrainKey(seed);
    expect(deriveIntertrainKey(seed, 1).address).not.toBe(first.address);
    expect(deriveIntertrainKey(seed).address).toBe(first.address);
  });

  it("reads either spelling and refuses anything the node could not credit", () => {
    const wsk = deriveIntertrainKey(mnemonicToSeedSync(VECTOR)).address;
    expect(normalizeIntertrainAddress("mna1q8lye5pxhet776htmfrgf2ffrvztuf0j65dyuyjz")).toBe(wsk);
    expect(normalizeIntertrainAddress(` ${wsk.toUpperCase()} `)).toBe(wsk);
    const short = bech32m.encodeFromBytes("wsk", new Uint8Array(20));
    const wrongVersion = bech32m.encodeFromBytes("wsk", new Uint8Array(21));
    for (const bad of ["", "nope", short, wrongVersion, wsk.slice(0, -1) + "q"]) {
      expect(() => normalizeIntertrainAddress(bad)).toThrow();
    }
  });

  it("refuses a seed of the wrong length", () => {
    expect(() => deriveIntertrainKey(new Uint8Array(32))).toThrow();
  });
});
