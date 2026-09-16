import { describe, expect, it } from "vitest";
import { groupRoomCode, looksLikeRoomCode } from "@/lib/square/room-code";

// The Square's room codes: nine characters from its own alphabet, typed with
// or without the dashes it prints them with.
describe("room codes", () => {
  it("recognises a code with or without its dashes, and nothing else", () => {
    expect(looksLikeRoomCode("bcd-2345-fg")).toBe(true);
    expect(looksLikeRoomCode("BCD2345FG")).toBe(true);
    expect(looksLikeRoomCode("bcd2345f")).toBe(false);
    expect(looksLikeRoomCode("abc2345fg")).toBe(false);
    expect(looksLikeRoomCode("samuel")).toBe(false);
  });

  it("prints a code in the Square's 3-4-2 grouping", () => {
    expect(groupRoomCode("bcd2345fg")).toBe("bcd-2345-fg");
    expect(groupRoomCode("short")).toBe("short");
  });
});
