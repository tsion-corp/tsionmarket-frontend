import { describe, expect, it } from "vitest";
import {
  RECOVERY_SECRET_BYTES,
  RECOVERY_SECRET_GROUPS,
  RecoverySecretFormatError,
  confirmSecretGroups,
  encodeRecoverySecret,
  generateRecoverySecret,
  parseRecoverySecret,
  pickConfirmationPositions,
  recoverySecretGroups,
} from "./recovery-secret";

const SEQ = Uint8Array.from({ length: 32 }, (_, i) => i);
const SEQ_TEXT = "000G-40R4-0M30-E209-185G-R38E-1W81-24GK-2GAH-C5RR-34D1-P70X-3RFG-ZE94";
const ZERO_TEXT = "0000-0000-0000-0000-0000-0000-0000-0000-0000-0000-0000-0000-0000-FA8Q";
const ONES_TEXT = "ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZG-ACH7";
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const rejects = (text: string) =>
  expect(() => parseRecoverySecret(text)).toThrow(RecoverySecretFormatError);

describe("the encoding", () => {
  it("is the standard Crockford base32 of the bytes, then a checksum (fixed vectors)", () => {
    // The data part of the sequence vector is the well-known Crockford encoding of 0..31.
    expect(encodeRecoverySecret(SEQ)).toBe(SEQ_TEXT);
    expect(encodeRecoverySecret(new Uint8Array(32))).toBe(ZERO_TEXT);
    expect(encodeRecoverySecret(new Uint8Array(32).fill(255))).toBe(ONES_TEXT);
  });

  it("is 14 groups of four from an alphabet with no I, L, O or U", () => {
    for (let i = 0; i < 20; i += 1) {
      const text = encodeRecoverySecret(generateRecoverySecret());
      expect(text).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){13}[0-9A-HJKMNP-TV-Z]{4}$/);
      expect(text.split("-")).toHaveLength(RECOVERY_SECRET_GROUPS);
    }
  });

  it("round-trips any secret", () => {
    for (let i = 0; i < 300; i += 1) {
      const secret = generateRecoverySecret();
      expect(parseRecoverySecret(encodeRecoverySecret(secret))).toEqual(secret);
    }
    expect(parseRecoverySecret(SEQ_TEXT)).toEqual(SEQ);
  });

  it("refuses to encode anything but 32 bytes", () => {
    for (const length of [0, 16, 31, 33, 64]) {
      expect(() => encodeRecoverySecret(new Uint8Array(length))).toThrow(RecoverySecretFormatError);
    }
  });

  it("exposes the groups in order", () => {
    expect(recoverySecretGroups(SEQ)).toEqual(SEQ_TEXT.split("-"));
  });
});

describe("generating", () => {
  it("is 32 random bytes, different every time", () => {
    const a = generateRecoverySecret();
    const b = generateRecoverySecret();
    expect(a).toHaveLength(RECOVERY_SECRET_BYTES);
    expect(a).not.toEqual(b);
  });
});

describe("reading what a person types", () => {
  it("accepts any case, spacing, missing dashes, and the look-alikes Crockford folds together", () => {
    const messy = [
      SEQ_TEXT.toLowerCase(),
      SEQ_TEXT.replace(/-/g, " "),
      SEQ_TEXT.replace(/-/g, ""),
      `  ${SEQ_TEXT.replace(/-/g, "\n")}  `,
      SEQ_TEXT.replace(/-/g, "_"),
      // 0 typed as O, 1 typed as I or l
      SEQ_TEXT.replace(/0/g, "O").replace(/1/g, "l"),
      SEQ_TEXT.replace(/1/g, "I"),
    ];
    for (const text of messy) expect(parseRecoverySecret(text)).toEqual(SEQ);
  });

  it("rejects the wrong length, empty input and characters outside the alphabet", () => {
    rejects("");
    rejects("0000");
    rejects(`${SEQ_TEXT}0`);
    rejects(SEQ_TEXT.slice(0, -1));
    rejects(SEQ_TEXT.replace("000G", "000U")); // U is not in the alphabet
    rejects(SEQ_TEXT.replace("000G", "000!"));
    rejects(SEQ_TEXT.replace("000G", "000é"));
  });

  it("catches every single mistyped character, in every position", () => {
    const chars = SEQ_TEXT.replace(/-/g, "");
    for (let i = 0; i < chars.length; i += 1) {
      for (const symbol of ALPHABET) {
        if (symbol === chars[i]) continue;
        // Folded look-alikes read as the same symbol, which is not a mistake.
        if (/[01]/.test(symbol) && /[01]/.test(chars[i]!) && chars[i] === symbol) continue;
        const changed = chars.slice(0, i) + symbol + chars.slice(i + 1);
        expect(() => parseRecoverySecret(changed), `position ${i} -> ${symbol}`).toThrow();
      }
    }
  });

  it("catches two groups swapped", () => {
    const groups = SEQ_TEXT.split("-");
    [groups[2], groups[3]] = [groups[3]!, groups[2]!];
    rejects(groups.join("-"));
  });

  it("rejects spare padding bits being set, even with a matching-looking checksum", () => {
    // The 52nd symbol holds 1 real bit and 4 padding bits that must be zero.
    const chars = ONES_TEXT.replace(/-/g, "");
    rejects(chars.slice(0, 51) + "Z" + chars.slice(52));
  });

  it("does not repair or guess: a secret with one group dropped is refused", () => {
    rejects(SEQ_TEXT.split("-").slice(1).join("-"));
  });
});

describe("confirming the copy", () => {
  const groups = SEQ_TEXT.split("-");

  it("picks distinct, sorted, in-range groups", () => {
    for (let i = 0; i < 50; i += 1) {
      const picked = pickConfirmationPositions();
      expect(new Set(picked).size).toBe(3);
      expect([...picked].sort((a, b) => a - b)).toEqual(picked);
      expect(picked.every((p) => Number.isInteger(p) && p >= 0 && p < RECOVERY_SECRET_GROUPS)).toBe(
        true
      );
    }
  });

  it("does not favour a position (rejection sampling)", () => {
    const counts = new Array(RECOVERY_SECRET_GROUPS).fill(0);
    for (let i = 0; i < 4000; i += 1) for (const p of pickConfirmationPositions(1)) counts[p] += 1;
    const expected = 4000 / RECOVERY_SECRET_GROUPS;
    for (const c of counts) expect(Math.abs(c - expected)).toBeLessThan(expected * 0.35);
  });

  it("accepts the right groups however they are typed, and nothing else", () => {
    const positions = [1, 6, 13];
    const right = positions.map((p) => groups[p]!);
    expect(confirmSecretGroups(groups, positions, right)).toBe(true);
    expect(
      confirmSecretGroups(
        groups,
        positions,
        right.map((g) => ` ${g.toLowerCase()} `)
      )
    ).toBe(true);
    expect(confirmSecretGroups(groups, positions, ["0000", right[1]!, right[2]!])).toBe(false);
    expect(confirmSecretGroups(groups, positions, ["", "", ""])).toBe(false);
    expect(confirmSecretGroups(groups, positions, right.slice(0, 2))).toBe(false);
    // Half a group is not a group.
    expect(confirmSecretGroups(groups, [1], [groups[1]!.slice(0, 2)])).toBe(false);
  });
});
