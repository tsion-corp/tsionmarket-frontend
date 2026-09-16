import { describe, expect, it } from "vitest";
import {
  lichessCssPath,
  lichessEsmPath,
  lichessPublicAssetPath,
  lichessRoundStyles,
  resolveLichessPublicAssetPath,
} from "./lichess-assets";

describe("Lichess round assets", () => {
  it("maps the copied voice modules to their hashed build output", () => {
    expect(lichessEsmPath("voice.move")).toBe("/compiled/voice.move.FKEXI2WL.js");
    expect(lichessEsmPath("voice.vosk")).toBe("/compiled/voice.vosk.NRDKBVQB.js");
  });

  it("maps dynamically loaded voice help CSS to its hashed file", () => {
    expect(lichessCssPath("voice.move.help")).toBe("/css/voice.move.help.621e5f43.css");
    expect(lichessCssPath("unknown.module")).toBe("/css/unknown.module.css");
  });

  it("loads the base voice controls with the round", () => {
    expect(lichessRoundStyles).toContain("/css/voice.21b8d714.css");
  });

  it("serves the LFS voice model from the copied Lichess asset tree", () => {
    expect(lichessPublicAssetPath("lifat/vosk/model-en-us-0.15.tar.gz")).toBe(
      "/chess/lichess/lifat/vosk/model-en-us-0.15.tar.gz"
    );
    expect(lichessPublicAssetPath("npm/vosk/vosk.worker.js")).toBe("/npm/vosk/vosk.worker.js");
  });

  it("resolves Lichess media through the versioned public asset origin", () => {
    const baseUrl = "https://assets.example.com/";

    expect(resolveLichessPublicAssetPath("/lifat/vosk/model-en-us-0.15.tar.gz", baseUrl)).toBe(
      "https://assets.example.com/chess-assets/v1/chess/lichess/lifat/vosk/model-en-us-0.15.tar.gz"
    );
    expect(resolveLichessPublicAssetPath("sound/standard/Move.mp3", baseUrl)).toBe(
      "https://assets.example.com/chess-assets/v1/chess/lichess/sound/standard/Move.mp3"
    );
  });

  it("resolves npm engines through the versioned public asset origin", () => {
    expect(
      resolveLichessPublicAssetPath("npm/stockfish-web/sf_18.wasm", "https://assets.example.com")
    ).toBe("https://assets.example.com/chess-assets/v1/npm/stockfish-web/sf_18.wasm");
  });

  it("keeps bundled voice grammars on the application origin", () => {
    expect(
      resolveLichessPublicAssetPath("compiled/grammar/move-en.json", "https://assets.example.com")
    ).toBe("/compiled/grammar/move-en.json");
  });

  it("keeps legacy same-origin paths when no public asset origin is configured", () => {
    expect(resolveLichessPublicAssetPath("lifat/vosk/model-en-us-0.15.tar.gz", "")).toBe(
      "/chess/lichess/lifat/vosk/model-en-us-0.15.tar.gz"
    );
    expect(resolveLichessPublicAssetPath("npm/vosk/vosk.worker.js", undefined)).toBe(
      "/npm/vosk/vosk.worker.js"
    );
  });
});
