import { readFile } from "node:fs/promises";
import path from "node:path";

const FIXTURE_ROOT = path.join(
  process.cwd(),
  "__tests__",
  "fixtures",
  "chess-puzzle-coach-reference"
);
const ENGINE_FIXTURE_ROOT = path.join(
  process.cwd(),
  "node_modules",
  ".cache",
  "ark-chess-puzzle-coach"
);

const ASSETS = {
  "audio-2752337": {
    root: FIXTURE_ROOT,
    file: "narration-reference.mp3",
    contentType: "audio/mpeg",
  },
  portrait: { root: FIXTURE_ROOT, file: "coach-reference.png", contentType: "image/png" },
  "visemes-2752337": {
    root: FIXTURE_ROOT,
    file: "narration-reference.viseme",
    contentType: "application/json",
  },
  "audio-2752339": {
    root: FIXTURE_ROOT,
    file: "narration-2752339.mp3",
    contentType: "audio/mpeg",
  },
  "visemes-2752339": {
    root: FIXTURE_ROOT,
    file: "narration-2752339.viseme",
    contentType: "application/json",
  },
  "coach-text": {
    root: ENGINE_FIXTURE_ROOT,
    file: "coach-text-asset.bzp",
    contentType: "text/plain; charset=utf-8",
  },
  "engine-js": {
    root: ENGINE_FIXTURE_ROOT,
    file: "explanation-engine.js",
    contentType: "text/javascript; charset=utf-8",
  },
  "engine-wasm": {
    root: ENGINE_FIXTURE_ROOT,
    file: "explanation-engine.wasm",
    contentType: "application/wasm",
  },
} as const;

export const dynamic = "force-dynamic";

function unavailable() {
  return new Response("Not found", {
    status: 404,
    headers: { "cache-control": "no-store" },
  });
}

export async function GET(_request: Request, context: { params: Promise<{ asset: string }> }) {
  if (process.env.NODE_ENV === "production") return unavailable();

  const { asset } = await context.params;
  const entry = ASSETS[asset as keyof typeof ASSETS];
  if (!entry) return unavailable();

  try {
    const body = await readFile(path.join(entry.root, entry.file));
    return new Response(new Uint8Array(body), {
      headers: {
        "cache-control": "private, no-store, max-age=0",
        "content-type": entry.contentType,
        "x-content-type-options": "nosniff",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  } catch {
    return unavailable();
  }
}
