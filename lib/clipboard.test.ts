import { describe, expect, it } from "vitest";
import { copyText, copyTextWhenReady } from "@/lib/clipboard";

// jsdom has no usable clipboard, so these pin the contract at its edges: the
// helpers must resolve a boolean and never throw, whatever the environment or
// the promise does — a failed copy degrades to a toast, never a crash.

describe("copyText", () => {
  it("resolves false where no clipboard mechanism exists", async () => {
    await expect(copyText("hello")).resolves.toBe(false);
  });
});

describe("copyTextWhenReady", () => {
  it("falls back to plain copy when ClipboardItem promises are unsupported", async () => {
    await expect(copyTextWhenReady(Promise.resolve("https://x"))).resolves.toBe(false);
  });

  it("resolves false, not a rejection, when the text promise itself fails", async () => {
    await expect(copyTextWhenReady(Promise.reject(new Error("boom")))).resolves.toBe(false);
  });
});
