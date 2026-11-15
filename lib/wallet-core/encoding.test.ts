import { describe, expect, it } from "vitest";
import {
  bytesEqual,
  concatBytes,
  fromBase64Url,
  randomBytes,
  toBase64Url,
  utf8,
  wipeBytes,
} from "./encoding";

describe("base64url", () => {
  it("round-trips every length, without padding or unsafe characters", () => {
    for (let length = 0; length < 70; length += 1) {
      const bytes = randomBytes(length);
      const text = toBase64Url(bytes);
      expect(text).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(fromBase64Url(text)).toEqual(bytes);
    }
  });

  it("rejects anything that is not strict base64url", () => {
    for (const bad of ["a+b/", "ab==", "ab cd", "ab\ncd", "é", "a", "abcde"]) {
      expect(() => fromBase64Url(bad)).toThrow();
    }
  });
});

describe("byte helpers", () => {
  it("concatenates", () => {
    expect(concatBytes(Uint8Array.of(1, 2), Uint8Array.of(), Uint8Array.of(3))).toEqual(
      Uint8Array.of(1, 2, 3)
    );
  });

  it("compares without early exit and with length awareness", () => {
    expect(bytesEqual(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2, 3))).toBe(true);
    expect(bytesEqual(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2, 4))).toBe(false);
    expect(bytesEqual(Uint8Array.of(1, 2), Uint8Array.of(1, 2, 3))).toBe(false);
  });

  it("wipes buffers and tolerates null", () => {
    const a = Uint8Array.of(9, 9, 9);
    wipeBytes(a, null, undefined);
    expect(a).toEqual(Uint8Array.of(0, 0, 0));
  });

  it("produces different random bytes each time", () => {
    expect(toBase64Url(randomBytes(32))).not.toBe(toBase64Url(randomBytes(32)));
  });

  it("encodes text as UTF-8", () => {
    expect(utf8("é")).toEqual(Uint8Array.of(0xc3, 0xa9));
  });
});
