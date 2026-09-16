import { readFileSync, statSync } from "node:fs";
import { validateAssetSummary } from "./lib/chess-r2-assets.mjs";

const requiredLocalAssets = [
  "public/compiled/round.KX7CDMD5.js",
  "public/compiled/lib.K4SQT4HR.js",
  "public/compiled/lib.KEXPHETH.js",
  "public/compiled/lib.L56HYLR4.js",
  "public/compiled/lib.LSL3H4TG.js",
  "public/compiled/voice.move.FKEXI2WL.js",
  "public/compiled/voice.vosk.NRDKBVQB.js",
  "public/css/voice.21b8d714.css",
  "public/css/voice.move.help.621e5f43.css",
  "public/chess/lichess/css/site.css",
  "public/chess/lichess/js/analyse-ark.js",
];

for (const path of requiredLocalAssets) {
  const size = statSync(path).size;
  if (size === 0) throw new Error(`Required chess asset is empty: ${path}`);
}

const summary = validateAssetSummary(
  JSON.parse(readFileSync("config/chess-assets-r2.json", "utf8"))
);
const requiredRemoteSuffixes = [
  "/npm/stockfish-web/sf_18.wasm",
  "/npm/vosk/vosk.worker.js",
  "/npm/vosk/vosk.wasm",
  "/chess/lichess/lifat/vosk/model-en-us-0.15.tar.gz",
  "/chess/lichess/sound/standard/Move.mp3",
  "/chess/lichess/piece/cburnett/wK.svg",
];

for (const suffix of requiredRemoteSuffixes) {
  if (!summary.requiredObjects.some((key) => key.endsWith(suffix))) {
    throw new Error(`Chess R2 summary is missing required asset: ${suffix}`);
  }
}

console.log(
  `Verified ${requiredLocalAssets.length} local chess assets and ${summary.files} R2 manifest entries.`
);
