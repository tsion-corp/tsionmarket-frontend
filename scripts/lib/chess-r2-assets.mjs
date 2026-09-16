import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export const CHESS_ASSET_VERSION = "v1";
export const CHESS_ASSET_PREFIX = `chess-assets/${CHESS_ASSET_VERSION}`;

export const MIGRATED_PUBLIC_DIRECTORIES = [
  "public/npm",
  "public/chess/lichess/cursors",
  "public/chess/lichess/data",
  "public/chess/lichess/fide",
  "public/chess/lichess/flags",
  "public/chess/lichess/flair",
  "public/chess/lichess/font",
  "public/chess/lichess/images",
  "public/chess/lichess/javascripts",
  "public/chess/lichess/lifat",
  "public/chess/lichess/logo",
  "public/chess/lichess/oops",
  "public/chess/lichess/piece",
  "public/chess/lichess/sound",
  "public/chess/lichess/vendor",
  "public/chess/lichess/video",
];

const CONTENT_TYPES = new Map([
  ["avif", "image/avif"],
  ["bin", "application/octet-stream"],
  ["css", "text/css; charset=utf-8"],
  ["gif", "image/gif"],
  ["gz", "application/gzip"],
  ["ico", "image/x-icon"],
  ["jpeg", "image/jpeg"],
  ["jpg", "image/jpeg"],
  ["js", "text/javascript; charset=utf-8"],
  ["json", "application/json; charset=utf-8"],
  ["mjs", "text/javascript; charset=utf-8"],
  ["mp3", "audio/mpeg"],
  ["ogg", "audio/ogg"],
  ["png", "image/png"],
  ["svg", "image/svg+xml"],
  ["wasm", "application/wasm"],
  ["wav", "audio/wav"],
  ["webp", "image/webp"],
  ["xml", "application/xml; charset=utf-8"],
]);

export function toChessAssetObjectKey(publicPath) {
  const normalized = publicPath.replaceAll("\\", "/");
  const parts = normalized.split("/");

  if (!normalized.startsWith("public/")) {
    throw new Error(`Chess asset path must be inside public: ${publicPath}`);
  }
  if (parts.includes("..") || parts.includes(".")) {
    throw new Error(`Chess asset path is unsafe: ${publicPath}`);
  }

  const relativePath = normalized.slice("public/".length);
  if (!relativePath) throw new Error("Chess asset path cannot be empty");
  return `${CHESS_ASSET_PREFIX}/${relativePath}`;
}

export function contentTypeForAsset(path) {
  const fileName = path.toLowerCase();
  const extension = fileName.endsWith(".tar.gz") ? "gz" : fileName.split(".").at(-1);
  return CONTENT_TYPES.get(extension) ?? "application/octet-stream";
}

export async function walkAssetFiles(directory) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await walkAssetFiles(entryPath)));
      continue;
    }
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;

    // R2 has no symlinks, so publish aliases as independent objects containing
    // their resolved target bytes.
    const file = await stat(entryPath);
    if (file.isFile() && file.size > 0) paths.push(entryPath);
  }
  return paths;
}

export function validateAssetManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Chess asset manifest must be an object");
  }
  if (value.schemaVersion !== 1 || value.assetVersion !== CHESS_ASSET_VERSION) {
    throw new Error("Chess asset manifest version is unsupported");
  }
  if (!Array.isArray(value.files) || value.files.length === 0) {
    throw new Error("Chess asset manifest must contain files");
  }

  const keys = new Set();
  for (const entry of value.files) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Chess asset manifest entry must be an object");
    }
    if (
      typeof entry.key !== "string" ||
      !entry.key.startsWith(`${CHESS_ASSET_PREFIX}/`) ||
      entry.key.split("/").includes("..")
    ) {
      throw new Error(`Chess asset manifest key is invalid: ${String(entry.key)}`);
    }
    if (keys.has(entry.key)) {
      throw new Error(`Chess asset manifest contains duplicate key: ${entry.key}`);
    }
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes <= 0) {
      throw new Error(`Chess asset manifest size is invalid: ${entry.key}`);
    }
    if (typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(entry.sha256)) {
      throw new Error(`Chess asset manifest checksum is invalid: ${entry.key}`);
    }
    if (typeof entry.contentType !== "string" || entry.contentType.length === 0) {
      throw new Error(`Chess asset manifest content type is invalid: ${entry.key}`);
    }
    keys.add(entry.key);
  }

  return value;
}

export function serializeAssetManifest(manifest) {
  validateAssetManifest(manifest);
  const sorted = {
    ...manifest,
    files: [...manifest.files].sort((left, right) => left.key.localeCompare(right.key)),
  };
  return `${JSON.stringify(sorted)}\n`;
}

export function summarizeAssetManifest(manifest) {
  const serialized = serializeAssetManifest(manifest);
  return {
    schemaVersion: 1,
    assetVersion: manifest.assetVersion,
    manifestKey: `${CHESS_ASSET_PREFIX}/manifest.json`,
    manifestSha256: createHash("sha256").update(serialized).digest("hex"),
    files: manifest.files.length,
    bytes: manifest.files.reduce((total, entry) => total + entry.bytes, 0),
  };
}

export function validateAssetInventory(manifest, inventory) {
  validateAssetManifest(manifest);
  const remoteSizes = new Map(
    inventory
      .filter((entry) => typeof entry?.Key === "string" && Number.isSafeInteger(entry?.Size))
      .map((entry) => [entry.Key, entry.Size])
  );

  for (const entry of manifest.files) {
    const remoteSize = remoteSizes.get(entry.key);
    if (remoteSize === undefined) {
      throw new Error(`Chess asset inventory is missing remote object: ${entry.key}`);
    }
    if (remoteSize !== entry.bytes) {
      throw new Error(`Chess asset inventory size mismatch: ${entry.key}`);
    }
  }

  return manifest.files.length;
}

export function validateAssetSummary(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Chess asset summary must be an object");
  }
  if (value.schemaVersion !== 1 || value.assetVersion !== CHESS_ASSET_VERSION) {
    throw new Error("Chess asset summary version is unsupported");
  }
  if (value.manifestKey !== `${CHESS_ASSET_PREFIX}/manifest.json`) {
    throw new Error("Chess asset summary manifest key is invalid");
  }
  if (typeof value.manifestSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(value.manifestSha256)) {
    throw new Error("Chess asset summary checksum is invalid");
  }
  if (!Number.isSafeInteger(value.files) || value.files <= 0) {
    throw new Error("Chess asset summary file count is invalid");
  }
  if (!Number.isSafeInteger(value.bytes) || value.bytes <= 0) {
    throw new Error("Chess asset summary byte count is invalid");
  }
  if (
    !Array.isArray(value.requiredObjects) ||
    value.requiredObjects.length === 0 ||
    value.requiredObjects.some(
      (key) => typeof key !== "string" || !key.startsWith(`${CHESS_ASSET_PREFIX}/`)
    ) ||
    new Set(value.requiredObjects).size !== value.requiredObjects.length
  ) {
    throw new Error("Chess asset summary required objects are invalid");
  }
  return value;
}
