import { describe, expect, it } from "vitest";
import { BROADCAST_GAMES, decodeGameRef, encodeGameRef, gameDeepLink } from "./deep-link";

describe("encodeGameRef", () => {
  it("names the game alongside the id", () => {
    expect(encodeGameRef("chess", "m-1")).toBe("chess:m-1");
    expect(encodeGameRef("checkers", "m-1")).toBe("checkers:m-1");
    expect(encodeGameRef("arkball", "42")).toBe("arkball:42");
    expect(encodeGameRef("last-standing", "7")).toBe("last-standing:7");
  });

  it("refuses an empty id rather than producing a ref that points nowhere", () => {
    expect(() => encodeGameRef("chess", "  ")).toThrow(/without an id/i);
  });
});

describe("decodeGameRef", () => {
  it("round-trips every game in the vocabulary", () => {
    for (const game of BROADCAST_GAMES) {
      expect(decodeGameRef(encodeGameRef(game, "id-9"))).toEqual({ game, id: "id-9" });
    }
  });

  it("keeps a colon that belongs to the id, splitting only on the first one", () => {
    expect(decodeGameRef("chess:a:b")).toEqual({ game: "chess", id: "a:b" });
  });

  it("reads a bare ref as a chess match, which is what the old streams carry", () => {
    expect(decodeGameRef("m-1")).toEqual({ game: "chess", id: "m-1" });
  });

  it("returns null for a game this app cannot route", () => {
    expect(decodeGameRef("poker:m-1")).toBeNull();
  });

  it("returns null when the id half is missing or the ref is empty", () => {
    expect(decodeGameRef("chess:")).toBeNull();
    expect(decodeGameRef("")).toBeNull();
    expect(decodeGameRef("   ")).toBeNull();
  });
});

describe("gameDeepLink", () => {
  it("uses the kind Market Square reserves for a game, with the prefixed ref", () => {
    expect(gameDeepLink("checkers", "m-3")).toEqual({ kind: "game", ref: "checkers:m-3" });
  });
});
