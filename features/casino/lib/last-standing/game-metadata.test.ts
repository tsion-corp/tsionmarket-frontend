import { describe, expect, it } from "vitest";
import {
  DESCRIPTION_MAX,
  metadataMessage,
  metadataProblem,
  normalizeMetadata,
  sanitizeText,
  TITLE_MAX,
} from "./game-metadata";

// Ported from apps/world-street-vault/src/domain/game-metadata.ts. The service
// rebuilds this message to verify the signature, so a one-character drift here
// rejects every submission. These pin the bytes, not the behaviour.

const TX = "0xABCDEF0123456789abcdef0123456789ABCDEF0123456789abcdef0123456789";

describe("sanitizeText", () => {
  it("collapses whitespace and trims", () => {
    expect(sanitizeText("  big   friday   game  ")).toBe("big friday game");
  });

  // Tab, newline and carriage return are deliberately NOT stripped: the
  // whitespace collapse turns them into the single space a reader expects, and
  // removing them outright would join words.
  it("turns a newline into a space rather than joining the words", () => {
    expect(sanitizeText("big\nfriday")).toBe("big friday");
    expect(sanitizeText("big\tfriday")).toBe("big friday");
    expect(sanitizeText("big\r\nfriday")).toBe("big friday");
  });

  // The reason this function exists rather than a trim(). These reorder how
  // text RENDERS, so a title can display as something other than what it says.
  it("strips the bidirectional overrides that let a title lie about itself", () => {
    expect(sanitizeText("safe\u202Eelbatsnu")).toBe("safeelbatsnu");
    for (const ch of ["\u202A", "\u202B", "\u202C", "\u202D", "\u202E"]) {
      expect(sanitizeText(`a${ch}b`), `U+${ch.charCodeAt(0).toString(16)}`).toBe("ab");
    }
    for (const ch of ["\u2066", "\u2067", "\u2068", "\u2069"]) {
      expect(sanitizeText(`a${ch}b`), `U+${ch.charCodeAt(0).toString(16)}`).toBe("ab");
    }
  });

  it("strips zero-width characters and control codes", () => {
    expect(sanitizeText("a\u200Bb")).toBe("ab");
    expect(sanitizeText("a\u0000b")).toBe("ab");
    expect(sanitizeText("a\u007Fb")).toBe("ab");
  });
});

describe("normalizeMetadata", () => {
  it("drops a blank description rather than sending an empty one", () => {
    expect(normalizeMetadata({ title: " Friday ", description: "   " })).toEqual({
      title: "Friday",
    });
  });

  it("keeps a description that has content", () => {
    expect(normalizeMetadata({ title: "Friday", description: " big  one " })).toEqual({
      title: "Friday",
      description: "big one",
    });
  });
});

describe("metadataMessage", () => {
  // The exact bytes. The em dash on line one is U+2014 and is copied from the
  // service verbatim; a hyphen here rejects every signature.
  it("is the service's message, byte for byte", () => {
    const msg = metadataMessage(TX, { title: "Friday", description: "big one" }, 1_700_000_000_000);
    expect(msg).toBe(
      [
        "World Street \u2014 name your King of Night game",
        `tx: ${TX.toLowerCase()}`,
        "title: Friday",
        "description: big one",
        "image: ",
        "ts: 1700000000000",
      ].join("\n")
    );
  });

  // We do not offer an image. The LINE still has to be there, empty, because
  // the service builds the same six lines whether or not one was sent.
  it("keeps the image line, empty, when there is no image", () => {
    const msg = metadataMessage(TX, { title: "Friday" }, 1);
    expect(msg).toContain("\nimage: \n");
    expect(msg.split("\n")).toHaveLength(6);
  });

  it("keeps the description line, empty, when there is no description", () => {
    const msg = metadataMessage(TX, { title: "Friday" }, 1);
    expect(msg).toContain("\ndescription: \n");
  });

  it("lowercases the transaction hash", () => {
    expect(metadataMessage(TX, { title: "a" }, 1)).toContain(`tx: ${TX.toLowerCase()}`);
  });

  it("signs the normalised text, so what is signed is what is stored", () => {
    expect(metadataMessage(TX, { title: "  big   game  " }, 1)).toContain("title: big game");
  });
});

describe("metadataProblem", () => {
  it("requires a title", () => {
    expect(metadataProblem({ title: "" })).toBe("title_required");
    expect(metadataProblem({ title: "   " })).toBe("title_required");
    expect(metadataProblem({ title: "\u200B" })).toBe("title_required");
  });

  it("caps the title and the description at the service's limits", () => {
    expect(metadataProblem({ title: "a".repeat(TITLE_MAX) })).toBeNull();
    expect(metadataProblem({ title: "a".repeat(TITLE_MAX + 1) })).toBe("title_too_long");
    expect(metadataProblem({ title: "ok", description: "a".repeat(DESCRIPTION_MAX) })).toBeNull();
    expect(metadataProblem({ title: "ok", description: "a".repeat(DESCRIPTION_MAX + 1) })).toBe(
      "description_too_long"
    );
  });

  // Length is measured after sanitising, as the service measures it, so
  // padding a title with spaces cannot smuggle it past the cap.
  it("measures length after sanitising", () => {
    expect(metadataProblem({ title: `  ${"a".repeat(TITLE_MAX)}  ` })).toBeNull();
  });
});

// This file strips invisible characters, so it must not contain any itself.
// They survived a heredoc once and the tests still passed, because a range
// between literal characters matches the same set as a range between escapes.
// The cost is a source file nobody can review and any tool can mangle.
describe("the source itself", () => {
  it("writes every non-ASCII character as an escape, except the signed em dash", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("./game-metadata.ts", import.meta.url), "utf8");
    const offenders = [...source]
      .filter((ch) => ch.charCodeAt(0) > 126)
      .map((ch) => `U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`);
    // U+2014 is the em dash on the signed message's first line, which is data.
    expect(offenders).toEqual(["U+2014"]);
  });
});
