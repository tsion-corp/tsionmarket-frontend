import { describe, expect, it } from "vitest";
import { randomBytes } from "./encoding";
import { generateRecoverySecret } from "./envelope";
import {
  RECOVERY_WORD_COUNT,
  RecoverySecretFormatError,
  confirmRecoveryWords,
  parseRecoverySecret,
  pickConfirmationPositions,
  recoverySecretToBase64Url,
  recoverySecretToWords,
} from "./recovery-secret";

describe("recovery secret formats", () => {
  it("round-trips through 24 words, in any case and spacing", () => {
    const secret = generateRecoverySecret();
    const words = recoverySecretToWords(secret);
    expect(words).toHaveLength(RECOVERY_WORD_COUNT);
    expect(parseRecoverySecret(words.join(" "))).toEqual(secret);
    expect(parseRecoverySecret(`  ${words.join("   ").toUpperCase()}\n`)).toEqual(secret);
  });

  it("round-trips through the 43-character form", () => {
    const secret = generateRecoverySecret();
    const text = recoverySecretToBase64Url(secret);
    expect(text).toHaveLength(43);
    expect(parseRecoverySecret(text)).toEqual(secret);
    expect(parseRecoverySecret(` ${text} `)).toEqual(secret);
  });

  it("catches a mistyped word through the checksum", () => {
    const words = recoverySecretToWords(generateRecoverySecret());
    // Swap one word for a different valid word: the checksum no longer matches.
    const other = words[0] === "abandon" ? "ability" : "abandon";
    expect(() => parseRecoverySecret([other, ...words.slice(1)].join(" "))).toThrow(
      RecoverySecretFormatError
    );
  });

  it("rejects the wrong number of words, unknown words and the wrong length", () => {
    const words = recoverySecretToWords(generateRecoverySecret());
    expect(() => parseRecoverySecret(words.slice(0, 23).join(" "))).toThrow(
      RecoverySecretFormatError
    );
    expect(() => parseRecoverySecret(words.slice(0, 12).join(" "))).toThrow(
      RecoverySecretFormatError
    );
    expect(() => parseRecoverySecret([...words.slice(0, 23), "zzzzzz"].join(" "))).toThrow(
      RecoverySecretFormatError
    );
    expect(() => parseRecoverySecret("")).toThrow(RecoverySecretFormatError);
    expect(() => parseRecoverySecret("short")).toThrow(RecoverySecretFormatError);
    expect(() => parseRecoverySecret(recoverySecretToBase64Url(randomBytes(16)))).toThrow(
      RecoverySecretFormatError
    );
  });

  it("only accepts a 32-byte secret for words", () => {
    expect(() => recoverySecretToWords(randomBytes(16))).toThrow(RecoverySecretFormatError);
  });

  it("gives the same words for the same bytes, and different words for different bytes", () => {
    const secret = generateRecoverySecret();
    expect(recoverySecretToWords(secret)).toEqual(recoverySecretToWords(new Uint8Array(secret)));
    expect(recoverySecretToWords(secret)).not.toEqual(
      recoverySecretToWords(generateRecoverySecret())
    );
  });
});

describe("backup confirmation", () => {
  it("picks distinct, sorted positions in range", () => {
    for (let i = 0; i < 50; i += 1) {
      const positions = pickConfirmationPositions();
      expect(positions).toHaveLength(3);
      expect(new Set(positions).size).toBe(3);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
      for (const p of positions) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThan(24);
      }
    }
  });

  it("does not favour any position (rejection sampling)", () => {
    const counts = new Array<number>(24).fill(0);
    for (let i = 0; i < 4_000; i += 1)
      for (const p of pickConfirmationPositions(1)) counts[p]! += 1;
    const expected = 4_000 / 24;
    for (const count of counts) expect(Math.abs(count - expected)).toBeLessThan(expected * 0.4);
  });

  it("skips bytes that would bias the choice", () => {
    // 255 is above the unbiased limit (240), so it is ignored; 5 is used.
    const bytes = [255, 255, 5, 255, 17, 255, 40];
    const random = () => Uint8Array.from(bytes);
    expect(pickConfirmationPositions(3, 24, random)).toEqual([5, 16, 17]);
  });

  it("confirms only the right words", () => {
    const words = recoverySecretToWords(generateRecoverySecret());
    const positions = [2, 9, 20];
    expect(
      confirmRecoveryWords(
        words,
        positions,
        positions.map((p) => words[p]!)
      )
    ).toBe(true);
    expect(
      confirmRecoveryWords(
        words,
        positions,
        positions.map((p) => ` ${words[p]!.toUpperCase()} `)
      )
    ).toBe(true);
    expect(confirmRecoveryWords(words, positions, [words[2]!, words[9]!, "wrong"])).toBe(false);
    expect(confirmRecoveryWords(words, positions, [words[2]!])).toBe(false);
  });
});
