import { describe, expect, it } from "vitest";
import { splitMoveNotation } from "@/features/casino/components/chess/round/round-moves";

describe("splitMoveNotation", () => {
  it("renders named pieces with chess glyphs", () => {
    expect(splitMoveNotation("Nf6")).toEqual({ glyph: "♘", notation: "f6" });
    expect(splitMoveNotation("Bxc3+")).toEqual({ glyph: "♗", notation: "xc3+" });
  });

  it("leaves pawn moves and castling notation unchanged", () => {
    expect(splitMoveNotation("e4")).toEqual({ glyph: null, notation: "e4" });
    expect(splitMoveNotation("O-O")).toEqual({ glyph: null, notation: "O-O" });
  });
});
