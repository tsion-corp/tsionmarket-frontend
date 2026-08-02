import { describe, expect, it } from "vitest";
import {
  formatEngineScore,
  parseBestMoveLine,
  parseEngineInfoLine,
  pvToSan,
  uciToSan,
} from "@/lib/casino/chess/engine-analysis";

describe("engine analysis parsing", () => {
  it("parses stockfish info output", () => {
    expect(
      parseEngineInfoLine("info depth 14 seldepth 21 score cp 37 nodes 12345 pv e2e4 e7e5 g1f3")
    ).toEqual({
      depth: 14,
      scoreCp: 37,
      scoreMate: null,
      pv: ["e2e4", "e7e5", "g1f3"],
    });
  });

  it("parses mate lines", () => {
    expect(parseEngineInfoLine("info depth 18 score mate -3 pv h7h8q")).toEqual({
      depth: 18,
      scoreCp: null,
      scoreMate: -3,
      pv: ["h7h8q"],
    });
  });

  it("parses bestmove lines", () => {
    expect(parseBestMoveLine("bestmove e2e4 ponder e7e5")).toBe("e2e4");
  });

  it("formats cp and mate scores for display", () => {
    expect(formatEngineScore(34, null)).toBe("+0.3");
    expect(formatEngineScore(-92, null)).toBe("-0.9");
    expect(formatEngineScore(null, 4)).toBe("#4");
    expect(formatEngineScore(null, -2)).toBe("#-2");
  });

  it("converts a best move from uci to san", () => {
    expect(uciToSan("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "e2e4")).toBe("e4");
  });

  it("converts a principal variation from uci to san", () => {
    expect(
      pvToSan("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", ["e2e4", "e7e5", "g1f3"])
    ).toEqual(["e4", "e5", "Nf3"]);
  });
});
