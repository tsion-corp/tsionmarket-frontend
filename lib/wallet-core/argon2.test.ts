import { argon2id as noble } from "@noble/hashes/argon2";
import { describe, expect, it, vi } from "vitest";
import {
  ARGON2_CEILINGS,
  ARGON2_FLOORS,
  Argon2ParamsError,
  Argon2UnavailableError,
  DEFAULT_ARGON2,
  assertSafeArgon2Params,
  calibrateArgon2,
  deriveArgon2id,
  isBelowDefault,
  newSalt,
  rawArgon2id,
  type Argon2Params,
} from "./argon2";

const FAST: Argon2Params = {
  memoryKiB: ARGON2_FLOORS.memoryKiB,
  iterations: 2,
  parallelism: 1,
  hashLength: 32,
};
const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

describe("the Argon2id implementation we ship", () => {
  // Two independent implementations (WebAssembly and pure JavaScript) must agree.
  it.each([
    { t: 2, m: 64, p: 1 },
    { t: 3, m: 32, p: 4 },
    { t: 1, m: 128, p: 2 },
    { t: 4, m: 8, p: 1 },
  ])("matches an independent implementation at t=$t m=$m p=$p", async ({ t, m, p }) => {
    const salt = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
    const ours = await rawArgon2id("a passphrase", salt, {
      memoryKiB: m,
      iterations: t,
      parallelism: p,
      hashLength: 32,
    });
    const theirs = noble("a passphrase", salt, { t, m, p, dkLen: 32 });
    expect(hex(ours)).toBe(hex(theirs));
  });

  it("the reference implementation reproduces the RFC 9106 Argon2id test vector", () => {
    const tag = noble(new Uint8Array(32).fill(1), new Uint8Array(16).fill(2), {
      t: 3,
      m: 32,
      p: 4,
      key: new Uint8Array(8).fill(3),
      personalization: new Uint8Array(12).fill(4),
      dkLen: 32,
    });
    expect(hex(tag)).toBe("0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659");
  });
});

describe("deriveArgon2id", () => {
  it("is deterministic and depends on the secret, the salt and every parameter", async () => {
    const salt = newSalt();
    const base = await deriveArgon2id("same secret", salt, FAST);
    expect(await deriveArgon2id("same secret", salt, FAST)).toEqual(base);
    expect(await deriveArgon2id("other secret", salt, FAST)).not.toEqual(base);
    expect(await deriveArgon2id("same secret", newSalt(), FAST)).not.toEqual(base);
    expect(await deriveArgon2id("same secret", salt, { ...FAST, iterations: 3 })).not.toEqual(base);
    expect(base).toHaveLength(32);
  });

  it("refuses unsafe parameters and short salts before doing any work", async () => {
    const salt = newSalt();
    await expect(deriveArgon2id("x", salt, { ...FAST, memoryKiB: 1_024 })).rejects.toBeInstanceOf(
      Argon2ParamsError
    );
    await expect(deriveArgon2id("x", salt, { ...FAST, iterations: 1 })).rejects.toBeInstanceOf(
      Argon2ParamsError
    );
    await expect(deriveArgon2id("x", new Uint8Array(8), FAST)).rejects.toBeInstanceOf(
      Argon2ParamsError
    );
  });
});

describe("assertSafeArgon2Params", () => {
  it("accepts the defaults and the floors", () => {
    expect(() => assertSafeArgon2Params(DEFAULT_ARGON2)).not.toThrow();
    expect(() => assertSafeArgon2Params(FAST)).not.toThrow();
  });

  it.each([
    ["memory below the floor", { ...DEFAULT_ARGON2, memoryKiB: ARGON2_FLOORS.memoryKiB - 1 }],
    ["memory above the ceiling", { ...DEFAULT_ARGON2, memoryKiB: ARGON2_CEILINGS.memoryKiB + 1 }],
    ["iterations below the floor", { ...DEFAULT_ARGON2, iterations: 1 }],
    [
      "iterations above the ceiling",
      { ...DEFAULT_ARGON2, iterations: ARGON2_CEILINGS.iterations + 1 },
    ],
    ["zero parallelism", { ...DEFAULT_ARGON2, parallelism: 0 }],
    ["too much parallelism", { ...DEFAULT_ARGON2, parallelism: ARGON2_CEILINGS.parallelism + 1 }],
    ["a different output length", { ...DEFAULT_ARGON2, hashLength: 16 }],
    ["a fractional value", { ...DEFAULT_ARGON2, iterations: 2.5 }],
    ["not-a-number", { ...DEFAULT_ARGON2, memoryKiB: Number.NaN }],
    ["a string", { ...DEFAULT_ARGON2, memoryKiB: "65536" }],
    ["infinity", { ...DEFAULT_ARGON2, memoryKiB: Number.POSITIVE_INFINITY }],
    ["null", null],
    ["nothing", undefined],
  ])("rejects %s", (_label, value) => {
    expect(() => assertSafeArgon2Params(value)).toThrow(Argon2ParamsError);
  });
});

describe("isBelowDefault", () => {
  it("flags anything weaker than the defaults", () => {
    expect(isBelowDefault(DEFAULT_ARGON2)).toBe(false);
    expect(isBelowDefault(FAST)).toBe(true);
    expect(isBelowDefault({ ...DEFAULT_ARGON2, memoryKiB: 131_072 })).toBe(false);
  });
});

describe("calibrateArgon2", () => {
  const timeline = (durations: Array<number | "fail">) => {
    let clock = 0;
    let call = 0;
    return {
      now: () => clock,
      derive: vi.fn(async () => {
        const step = durations[call++];
        if (step === "fail" || step === undefined) throw new Error("allocation failed");
        clock += step;
      }),
    };
  };

  it("takes the default when it fits the budget", async () => {
    const t = timeline([800]);
    expect((await calibrateArgon2({ ...t })).memoryKiB).toBe(65_536);
  });

  it("steps down when the default is too slow", async () => {
    const t = timeline([4_000, 900]);
    expect((await calibrateArgon2({ ...t })).memoryKiB).toBe(49_152);
  });

  it("steps down when the default cannot allocate", async () => {
    const t = timeline(["fail", 700]);
    expect((await calibrateArgon2({ ...t })).memoryKiB).toBe(49_152);
  });

  it("uses the floor, never less, when everything is slow", async () => {
    const t = timeline([5_000, 5_000, 5_000]);
    expect((await calibrateArgon2({ ...t })).memoryKiB).toBe(32_768);
  });

  it("refuses rather than weaken when nothing will run", async () => {
    const t = timeline(["fail", "fail", "fail"]);
    await expect(calibrateArgon2({ ...t })).rejects.toBeInstanceOf(Argon2UnavailableError);
  });

  it("never tries anything below the floor even if asked to", async () => {
    const t = timeline([100]);
    const params = await calibrateArgon2({ ...t, ladderKiB: [8_192, 1_024] });
    expect(params.memoryKiB).toBeGreaterThanOrEqual(ARGON2_FLOORS.memoryKiB);
  });

  it("keeps the other parameters at their defaults", async () => {
    const t = timeline([100]);
    const params = await calibrateArgon2({ ...t });
    expect(params).toMatchObject({ iterations: 3, parallelism: 1, hashLength: 32 });
  });
});
