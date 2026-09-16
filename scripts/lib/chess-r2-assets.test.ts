import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHESS_ASSET_PREFIX,
  MIGRATED_PUBLIC_DIRECTORIES,
  contentTypeForAsset,
  summarizeAssetManifest,
  toChessAssetObjectKey,
  validateAssetManifest,
  validateAssetInventory,
  validateAssetSummary,
  walkAssetFiles,
} from "./chess-r2-assets.mjs";

describe("chess R2 asset contract", () => {
  it("uses a versioned object prefix", () => {
    expect(CHESS_ASSET_PREFIX).toBe("chess-assets/v1");
    expect(toChessAssetObjectKey("public/npm/stockfish-web/sf_18.wasm")).toBe(
      "chess-assets/v1/npm/stockfish-web/sf_18.wasm"
    );
  });

  it("covers the heavy engine, voice, and media directories", () => {
    expect(MIGRATED_PUBLIC_DIRECTORIES).toEqual(
      expect.arrayContaining([
        "public/npm",
        "public/chess/lichess/lifat",
        "public/chess/lichess/images",
        "public/chess/lichess/sound",
        "public/chess/lichess/piece",
      ])
    );
  });

  it("rejects paths outside the public directory", () => {
    expect(() => toChessAssetObjectKey("features/casino/index.ts")).toThrow(
      "must be inside public"
    );
    expect(() => toChessAssetObjectKey("public/../package.json")).toThrow("unsafe");
  });

  it("assigns browser-safe MIME types to workers, WASM, and speech models", () => {
    expect(contentTypeForAsset("engine.wasm")).toBe("application/wasm");
    expect(contentTypeForAsset("worker.js")).toBe("text/javascript; charset=utf-8");
    expect(contentTypeForAsset("model.tar.gz")).toBe("application/gzip");
  });

  it("publishes file symlink aliases as independent R2 objects", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "chess-r2-assets-"));
    try {
      const target = path.join(directory, "GenericNotify.mp3");
      const alias = path.join(directory, "Victory.mp3");
      await writeFile(target, "sound");
      await symlink("GenericNotify.mp3", alias);

      expect((await walkAssetFiles(directory)).sort()).toEqual([target, alias].sort());
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("validates and summarizes a deterministic remote manifest", () => {
    const manifest = {
      schemaVersion: 1,
      assetVersion: "v1",
      files: [
        {
          key: "chess-assets/v1/npm/engine.wasm",
          bytes: 20,
          sha256: "a".repeat(64),
          contentType: "application/wasm",
        },
        {
          key: "chess-assets/v1/chess/lichess/sound/Move.mp3",
          bytes: 10,
          sha256: "b".repeat(64),
          contentType: "audio/mpeg",
        },
      ],
    };

    expect(validateAssetManifest(manifest)).toEqual(manifest);
    expect(summarizeAssetManifest(manifest)).toMatchObject({ files: 2, bytes: 30 });
  });

  it("rejects duplicate or malformed manifest entries", () => {
    const entry = {
      key: "chess-assets/v1/npm/engine.wasm",
      bytes: 20,
      sha256: "a".repeat(64),
      contentType: "application/wasm",
    };

    expect(() =>
      validateAssetManifest({
        schemaVersion: 1,
        assetVersion: "v1",
        files: [entry, entry],
      })
    ).toThrow("duplicate");
  });

  it("checks every manifest object against the remote inventory", () => {
    const manifest = {
      schemaVersion: 1,
      assetVersion: "v1",
      files: [
        {
          key: "chess-assets/v1/npm/engine.wasm",
          bytes: 20,
          sha256: "a".repeat(64),
          contentType: "application/wasm",
        },
      ],
    };

    expect(
      validateAssetInventory(manifest, [{ Key: "chess-assets/v1/npm/engine.wasm", Size: 20 }])
    ).toBe(1);
    expect(() => validateAssetInventory(manifest, [])).toThrow("missing remote object");
  });

  it("validates the tracked remote summary used by clean builds", () => {
    const summary = {
      schemaVersion: 1,
      assetVersion: "v1",
      manifestKey: "chess-assets/v1/manifest.json",
      manifestSha256: "c".repeat(64),
      files: 6254,
      bytes: 118261336,
      requiredObjects: ["chess-assets/v1/npm/vosk/vosk.wasm"],
    };

    expect(validateAssetSummary(summary)).toEqual(summary);
    expect(() => validateAssetSummary({ ...summary, manifestSha256: "bad" })).toThrow("checksum");
  });
});
