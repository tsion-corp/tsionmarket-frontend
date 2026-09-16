import { describe, expect, it } from "vitest";
import { lichessBoardSoundName, resolveLichessSoundPath } from "./lichess-sound";

describe("Lichess sound adapter", () => {
  it("uses the copied Lichess sound directory", () => {
    expect(resolveLichessSoundPath("standard", "move")).toBe(
      "/chess/lichess/sound/standard/Move.mp3"
    );
    expect(resolveLichessSoundPath("standard", "capture")).toBe(
      "/chess/lichess/sound/standard/Capture.mp3"
    );
  });

  it("selects capture, check, and checkmate sounds from SAN", () => {
    expect(lichessBoardSoundName("e4")).toEqual(["move"]);
    expect(lichessBoardSoundName("exd6")).toEqual(["capture"]);
    expect(lichessBoardSoundName("Qxf7+")).toEqual(["capture", "check"]);
    expect(lichessBoardSoundName("Qh7#")).toEqual(["move", "checkmate"]);
  });

  it("uses Lichess silence for sounds absent from the standard set", () => {
    expect(resolveLichessSoundPath("standard", "check")).toBe("/chess/lichess/sound/Silence.mp3");
  });
});
