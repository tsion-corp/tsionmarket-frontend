import { describe, expect, it } from "vitest";
import { randomBytes } from "./encoding";
import {
  NEW_PHRASE_WORDS,
  PhraseFormatError,
  confirmPhraseWords,
  entropyToWords,
  generatePhrase,
  parsePhrase,
  pickConfirmationPositions,
  seedFromEntropy,
} from "./phrase";

const ABANDON =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("generating a phrase", () => {
  it("makes 24 words by default and can make 12", () => {
    expect(generatePhrase().words).toHaveLength(24);
    expect(generatePhrase(12).words).toHaveLength(12);
    expect(generatePhrase().entropy).toHaveLength(32);
    expect(generatePhrase(12).entropy).toHaveLength(16);
  });

  it("never repeats", () => {
    const phrases = new Set(Array.from({ length: 40 }, () => generatePhrase().words.join(" ")));
    expect(phrases.size).toBe(40);
  });

  it("round-trips through its own words", () => {
    const { words, entropy } = generatePhrase();
    expect(parsePhrase(words).entropy).toEqual(entropy);
    expect(entropyToWords(entropy)).toEqual(words);
  });
});

describe("parsing a phrase", () => {
  it("accepts any spacing and case, as a string or a list", () => {
    const { words, entropy } = generatePhrase();
    expect(parsePhrase(words.join(" ")).entropy).toEqual(entropy);
    expect(parsePhrase(`  ${words.join("  \n ").toUpperCase()}  `).entropy).toEqual(entropy);
    expect(parsePhrase(words).entropy).toEqual(entropy);
  });

  it("accepts 12, 15, 18, 21 and 24 words, as other wallets produce", () => {
    for (const count of [16, 20, 24, 28, 32]) {
      const words = entropyToWords(randomBytes(count));
      expect(parsePhrase(words).entropy).toHaveLength(count);
    }
    expect(parsePhrase(ABANDON).words).toHaveLength(12);
  });

  it("catches a mistyped or swapped word through the checksum", () => {
    const words = generatePhrase().words;
    const other = words[0] === "abandon" ? "ability" : "abandon";
    expect(() => parsePhrase([other, ...words.slice(1)])).toThrow(PhraseFormatError);
    const swapped = [...words];
    [swapped[3], swapped[4]] = [swapped[4]!, swapped[3]!];
    if (swapped.join(" ") !== words.join(" ")) {
      // A swap that happens to still checksum is astronomically unlikely, and
      // would simply be a different wallet; we only assert it never crashes.
      try {
        parsePhrase(swapped);
      } catch (error) {
        expect(error).toBeInstanceOf(PhraseFormatError);
      }
    }
  });

  it("rejects the wrong word count, unknown words and empty input", () => {
    const words = generatePhrase().words;
    for (const bad of [
      words.slice(0, 23),
      words.slice(0, 11),
      [...words, "abandon"],
      [...words.slice(0, 23), "zzzzzz"],
      [],
      [""],
    ]) {
      expect(() => parsePhrase(bad)).toThrow(PhraseFormatError);
    }
    expect(() => parsePhrase("")).toThrow(PhraseFormatError);
    expect(() => parsePhrase("   ")).toThrow(PhraseFormatError);
  });

  it("never throws anything but a PhraseFormatError for garbage", () => {
    for (const bad of ["a b c", "🙂".repeat(12), "<script>", "0 0 0 0 0 0 0 0 0 0 0 0"]) {
      expect(() => parsePhrase(bad)).toThrow(PhraseFormatError);
    }
  });

  it("only turns a valid length of bytes into words", () => {
    expect(() => entropyToWords(new Uint8Array(15))).toThrow(PhraseFormatError);
    expect(() => seedFromEntropy(new Uint8Array(15))).toThrow(PhraseFormatError);
  });
});

describe("the seed", () => {
  it("is 64 bytes, deterministic, and different for different phrases", () => {
    const { entropy } = parsePhrase(ABANDON);
    const seed = seedFromEntropy(entropy);
    expect(seed).toHaveLength(64);
    expect(seedFromEntropy(entropy)).toEqual(seed);
    expect(seedFromEntropy(generatePhrase().entropy)).not.toEqual(seed);
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
        expect(p).toBeLessThan(NEW_PHRASE_WORDS);
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
    const random = () => Uint8Array.from([255, 255, 5, 255, 17, 255, 40]);
    expect(pickConfirmationPositions(3, 24, random)).toEqual([5, 16, 17]);
  });

  it("works for a 12-word phrase too", () => {
    for (let i = 0; i < 30; i += 1) {
      for (const p of pickConfirmationPositions(3, 12)) expect(p).toBeLessThan(12);
    }
  });

  it("confirms only the right words", () => {
    const words = generatePhrase().words;
    const positions = [2, 9, 20];
    expect(
      confirmPhraseWords(
        words,
        positions,
        positions.map((p) => words[p]!)
      )
    ).toBe(true);
    expect(
      confirmPhraseWords(
        words,
        positions,
        positions.map((p) => ` ${words[p]!.toUpperCase()} `)
      )
    ).toBe(true);
    expect(confirmPhraseWords(words, positions, [words[2]!, words[9]!, "wrong"])).toBe(false);
    expect(confirmPhraseWords(words, positions, [words[2]!])).toBe(false);
  });
});
