import {
  HeadObjectCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CHESS_ASSET_PREFIX,
  CHESS_ASSET_VERSION,
  MIGRATED_PUBLIC_DIRECTORIES,
  contentTypeForAsset,
  serializeAssetManifest,
  summarizeAssetManifest,
  toChessAssetObjectKey,
  validateAssetManifest,
  validateAssetInventory,
  walkAssetFiles,
} from "./lib/chess-r2-assets.mjs";

const SUMMARY_PATH = "config/chess-assets-r2.json";
const CACHE_CONTROL = "public, max-age=31536000, immutable";
const REQUIRED_REMOTE_OBJECTS = [
  "npm/stockfish-web/sf_18.wasm",
  "npm/vosk/vosk.worker.js",
  "npm/vosk/vosk.wasm",
  "chess/lichess/lifat/vosk/model-en-us-0.15.tar.gz",
  "chess/lichess/sound/standard/Move.mp3",
  "chess/lichess/piece/cburnett/wK.svg",
].map((relativePath) => `${CHESS_ASSET_PREFIX}/${relativePath}`);

const command = process.argv[2] ?? "audit";
if (!["audit", "cors", "publish", "verify"].includes(command)) {
  throw new Error("Usage: node scripts/chess-r2-assets.mjs [audit|cors|publish|verify]");
}

await loadIgnoredEnv();

if (command === "audit") {
  const manifest = await buildLocalManifest();
  printSummary(summarizeWithRoots(manifest));
} else if (command === "cors") {
  await configureCorsOnly();
} else if (command === "publish") {
  await publishAssets();
} else {
  await verifyPublicAssets();
}

async function configureCorsOnly() {
  const client = createR2Client();
  const bucket = requiredEnv("R2_BUCKET");
  await configurePublicCors(client, bucket);
  console.log(`Configured browser CORS for R2 bucket ${bucket}.`);
}

async function loadIgnoredEnv() {
  for (const envPath of [".env.local", ".env"]) {
    if (!existsSync(envPath)) continue;
    const source = await readFile(envPath, "utf8");
    for (const line of source.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator <= 0) continue;
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] ??= value;
    }
  }
}

async function publishAssets() {
  const bucket = requiredEnv("R2_BUCKET");
  const publicUrl = normalizePublicUrl(requiredEnv("R2_PUBLIC_URL"));
  const client = createR2Client();

  console.log("Hashing local chess assets...");
  const manifest = await buildLocalManifest();
  const total = manifest.files.length;
  let completed = 0;
  let uploaded = 0;

  console.log("Configuring R2 browser CORS...");
  await configurePublicCors(client, bucket);
  console.log(`Publishing ${total} immutable chess assets...`);
  await mapWithConcurrency(manifest.files, 16, async (entry) => {
    const localPath = sourcePathForPublicPath(
      path.join("public", entry.key.slice(`${CHESS_ASSET_PREFIX}/`.length))
    );
    if (!(await remoteObjectMatches(client, bucket, entry))) {
      const body = await readFile(localPath);
      await sendWithTimeout(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: entry.key,
          Body: body,
          ContentLength: entry.bytes,
          ContentType: entry.contentType,
          CacheControl: CACHE_CONTROL,
          Metadata: { sha256: entry.sha256 },
        })
      );
      uploaded += 1;
    }
    completed += 1;
    if (completed % 50 === 0 || completed === total) {
      console.log(`Published ${completed}/${total} chess assets (${uploaded} uploaded).`);
    }
  });

  const serializedManifest = serializeAssetManifest(manifest);
  const manifestSha256 = sha256(serializedManifest);
  await sendWithTimeout(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: `${CHESS_ASSET_PREFIX}/manifest.json`,
      Body: serializedManifest,
      ContentType: "application/json; charset=utf-8",
      CacheControl: "public, max-age=300, must-revalidate",
      Metadata: { sha256: manifestSha256 },
    })
  );

  const summary = summarizeWithRoots(manifest);
  await writeFile(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(`Wrote ${SUMMARY_PATH}.`);

  await verifyRemoteManifest(publicUrl, summary, client, bucket);
  printSummary(summary);
}

async function verifyPublicAssets() {
  const bucket = requiredEnv("R2_BUCKET");
  const publicUrl = normalizePublicUrl(requiredEnv("R2_PUBLIC_URL"));
  const summary = JSON.parse(await readFile(SUMMARY_PATH, "utf8"));
  const client = createR2Client();
  await verifyRemoteManifest(publicUrl, summary, client, bucket);
  printSummary(summary);
}

async function buildLocalManifest() {
  const files = [];
  for (const directory of MIGRATED_PUBLIC_DIRECTORIES) {
    const sourceDirectory = sourcePathForPublicPath(directory);
    if (!existsSync(sourceDirectory)) {
      throw new Error(
        `Missing chess asset directory: ${sourceDirectory}. Set CHESS_ASSET_SOURCE_ROOT to a full asset checkout.`
      );
    }
    for (const filePath of await walkAssetFiles(sourceDirectory)) {
      const file = await readFile(filePath);
      const logicalPath = path.join(directory, path.relative(sourceDirectory, filePath));
      files.push({
        key: toChessAssetObjectKey(logicalPath),
        bytes: file.byteLength,
        sha256: sha256(file),
        contentType: contentTypeForAsset(filePath),
      });
    }
  }

  files.sort((left, right) => left.key.localeCompare(right.key));
  return validateAssetManifest({
    schemaVersion: 1,
    assetVersion: CHESS_ASSET_VERSION,
    files,
  });
}

async function configurePublicCors(client, bucket) {
  const configuredOrigins = process.env.R2_ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = configuredOrigins?.length
    ? configuredOrigins
    : [
        "http://localhost:3000",
        "https://staging.tsionark.com",
        "https://wsws-test.vercel.app",
        "https://tsionark.com",
      ];

  await sendWithTimeout(
    client,
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ["*"],
            AllowedMethods: ["GET", "HEAD"],
            AllowedOrigins: allowedOrigins,
            ExposeHeaders: ["Content-Length", "Content-Range", "ETag"],
            MaxAgeSeconds: 86_400,
          },
        ],
      },
    })
  );
}

function createR2Client() {
  return new S3Client({
    endpoint: requiredEnv("R2_ENDPOINT"),
    region: "auto",
    credentials: {
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    },
    maxAttempts: 4,
  });
}

async function remoteObjectMatches(client, bucket, entry) {
  try {
    const response = await sendWithTimeout(
      client,
      new HeadObjectCommand({ Bucket: bucket, Key: entry.key })
    );
    return response.ContentLength === entry.bytes && response.Metadata?.sha256 === entry.sha256;
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    if (status === 404 || error?.name === "NotFound" || error?.name === "NoSuchKey") return false;
    throw error;
  }
}

async function verifyRemoteManifest(publicUrl, summary, client, bucket) {
  if (
    summary?.schemaVersion !== 1 ||
    summary?.assetVersion !== CHESS_ASSET_VERSION ||
    typeof summary?.manifestSha256 !== "string"
  ) {
    throw new Error("Local chess asset summary is invalid");
  }

  const manifestUrl = `${publicUrl}/${summary.manifestKey}`;
  const response = await fetchWithRetries(manifestUrl);
  if (!response.ok) throw new Error(`Public chess manifest returned ${response.status}`);
  const serialized = await response.text();
  if (sha256(serialized) !== summary.manifestSha256) {
    throw new Error("Public chess manifest checksum does not match the tracked summary");
  }

  const manifest = validateAssetManifest(JSON.parse(serialized));
  const calculated = summarizeAssetManifest(manifest);
  if (calculated.files !== summary.files || calculated.bytes !== summary.bytes) {
    throw new Error("Public chess manifest totals do not match the tracked summary");
  }

  for (const key of REQUIRED_REMOTE_OBJECTS) {
    if (!manifest.files.some((entry) => entry.key === key)) {
      throw new Error(`Public chess manifest is missing required object: ${key}`);
    }
  }

  const inventory = await listRemoteInventory(client, bucket);
  const verifiedInventoryCount = validateAssetInventory(manifest, inventory);
  console.log(`Verified ${verifiedInventoryCount} objects against the R2 inventory.`);

  const publicKeys = new Set(REQUIRED_REMOTE_OBJECTS);
  for (const root of summary.roots ?? []) {
    const sample = manifest.files.find((entry) => entry.key.startsWith(`${root.keyPrefix}/`));
    if (sample) publicKeys.add(sample.key);
  }

  const entriesByKey = new Map(manifest.files.map((entry) => [entry.key, entry]));
  let verifiedPublic = 0;
  await mapWithConcurrency([...publicKeys], 8, async (key) => {
    const entry = entriesByKey.get(key);
    if (!entry) throw new Error(`Public verification key is absent from manifest: ${key}`);
    const objectResponse = await fetchWithRetries(`${publicUrl}/${entry.key}`, { method: "HEAD" });
    if (!objectResponse.ok) {
      throw new Error(`Public chess object returned ${objectResponse.status}: ${entry.key}`);
    }
    const contentLength = Number(objectResponse.headers.get("content-length"));
    if (contentLength !== entry.bytes) {
      throw new Error(`Public chess object size mismatch: ${entry.key}`);
    }
    const expectedContentType = entry.contentType.split(";", 1)[0];
    const actualContentType = objectResponse.headers.get("content-type")?.split(";", 1)[0];
    if (actualContentType !== expectedContentType) {
      throw new Error(`Public chess object content type mismatch: ${entry.key}`);
    }
    if (objectResponse.headers.get("cache-control") !== CACHE_CONTROL) {
      throw new Error(`Public chess object cache policy mismatch: ${entry.key}`);
    }
    verifiedPublic += 1;
  });
  console.log(`Verified ${verifiedPublic} representative objects through the public R2 origin.`);
}

async function listRemoteInventory(client, bucket) {
  const inventory = [];
  let continuationToken;
  do {
    const response = await sendWithTimeout(
      client,
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: `${CHESS_ASSET_PREFIX}/`,
        ContinuationToken: continuationToken,
      })
    );
    inventory.push(...(response.Contents ?? []));
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    if (response.IsTruncated && !continuationToken) {
      throw new Error("R2 inventory response is truncated without a continuation token");
    }
  } while (continuationToken);
  return inventory;
}

async function fetchWithRetries(url, init) {
  let response;
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
      if (response.ok || attempt === 4) return response;
    } catch (error) {
      lastError = error;
      if (attempt === 4) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
  if (!response) throw lastError ?? new Error(`No response received for ${url}`);
  return response;
}

async function sendWithTimeout(client, command) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await client.send(command, { abortSignal: AbortSignal.timeout(180_000) });
    } catch (error) {
      lastError = error;
      const status = error?.$metadata?.httpStatusCode;
      if ((status && status < 500) || attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
}

async function mapWithConcurrency(values, concurrency, operation) {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (index < values.length) {
      const current = values[index];
      index += 1;
      await operation(current);
    }
  });
  await Promise.all(workers);
}

function summarizeWithRoots(manifest) {
  const summary = summarizeAssetManifest(manifest);
  return {
    ...summary,
    publicPathPrefix: CHESS_ASSET_PREFIX,
    requiredObjects: REQUIRED_REMOTE_OBJECTS,
    roots: MIGRATED_PUBLIC_DIRECTORIES.map((directory) => {
      const keyPrefix = toChessAssetObjectKey(`${directory}/placeholder`).replace(
        /\/placeholder$/u,
        ""
      );
      const entries = manifest.files.filter((entry) => entry.key.startsWith(`${keyPrefix}/`));
      const rootDigest = entries
        .map((entry) => `${entry.key}\0${entry.bytes}\0${entry.sha256}`)
        .join("\n");
      return {
        publicDirectory: directory,
        keyPrefix,
        files: entries.length,
        bytes: entries.reduce((total, entry) => total + entry.bytes, 0),
        sha256: sha256(rootDigest),
      };
    }),
  };
}

function requiredEnv(key) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function sourcePathForPublicPath(publicPath) {
  const sourceRoot = process.env.CHESS_ASSET_SOURCE_ROOT?.trim() || ".";
  return path.resolve(sourceRoot, publicPath);
}

function normalizePublicUrl(value) {
  return value.replace(/\/+$/u, "");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function printSummary(summary) {
  const mebibytes = (summary.bytes / 1024 / 1024).toFixed(2);
  console.log(`Chess R2 assets: ${summary.files} files, ${mebibytes} MiB.`);
}
