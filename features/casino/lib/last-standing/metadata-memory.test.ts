import { beforeEach, describe, expect, it } from "vitest";
import {
  clearMetadataMemory,
  reconcileMetadata,
  rememberMetadata,
  withKnownMetadata,
  type NamedRow,
} from "./metadata-memory";

const row = (value: NamedRow): NamedRow => value;

beforeEach(() => clearMetadataMemory());

// Reported 2026-09-26: a game's name showed on one read and was gone on the
// next. Every path that produces a row without metadata replaces the cache
// wholesale, and absent was being read as cleared.
describe("a name this session has already seen", () => {
  it("fills a row that arrived without one", () => {
    rememberMetadata([{ gameId: 274, title: "Special LM", description: "Testing" }]);

    expect(withKnownMetadata(row({ gameId: 274 }))).toEqual({
      gameId: 274,
      title: "Special LM",
      description: "Testing",
    });
  });

  it("survives a whole response that carried nothing", () => {
    reconcileMetadata([{ gameId: 274, title: "Special LM" }]);
    const chainRead = reconcileMetadata([row({ gameId: 274 }), row({ gameId: 275 })]);

    expect(chainRead[0].title).toBe("Special LM");
    expect(chainRead[1].title).toBeUndefined();
  });

  it("never overwrites a name the row does carry", () => {
    rememberMetadata([{ gameId: 274, title: "Old" }]);
    rememberMetadata([{ gameId: 274, title: "Renamed" }]);

    expect(withKnownMetadata({ gameId: 274, title: "Fresh" }).title).toBe("Fresh");
    expect(withKnownMetadata(row({ gameId: 274 })).title).toBe("Renamed");
  });

  it("keeps each game's name to itself", () => {
    reconcileMetadata([{ gameId: 274, title: "Special LM" }]);
    expect(withKnownMetadata(row({ gameId: 999 })).title).toBeUndefined();
  });

  // Blank is not a name. Remembering one would fill every later row with an
  // empty heading, which is worse than the number it replaced.
  it.each([undefined, "", "   "])("does not remember %o as a name", (title) => {
    rememberMetadata([{ gameId: 274, title }]);
    expect(withKnownMetadata(row({ gameId: 274 })).title).toBeUndefined();
  });

  it("remembers a name that came with no description", () => {
    rememberMetadata([{ gameId: 274, title: "Special LM" }]);
    const filled = withKnownMetadata(row({ gameId: 274 }));
    expect(filled.title).toBe("Special LM");
    expect(filled.description).toBeUndefined();
  });

  it("leaves a row it has nothing to say about untouched", () => {
    const unnamed = { gameId: 274, pot: "1.16" };
    expect(withKnownMetadata(unnamed)).toBe(unnamed);
  });
});
