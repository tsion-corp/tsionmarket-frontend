#!/usr/bin/env node
// Regenerates lib/vault/king-of-night-v5-abi.ts from the backend's own
// artifact. Never hand-type this ABI: v5's games() tuple gained two fields in
// the middle, so a transcription that looks right decodes a pot of 7.49e29.
//
//   gh api repos/Worldstreet-Web-Services/tsionark-monorepo/contents/\
//     apps/world-street-vault/src/chain/king-of-night-v5-abi.json \
//     --jq '.content' | base64 -d > /tmp/v5-abi.json
//   node scripts/generate-vault-v5-abi.mjs /tmp/v5-abi.json
import { readFileSync, writeFileSync } from "node:fs";

const source = process.argv[2];
if (!source) {
  console.error("usage: node scripts/generate-vault-v5-abi.mjs <king-of-night-v5-abi.json>");
  process.exit(1);
}

const parsed = JSON.parse(readFileSync(source, "utf8"));
const abi = Array.isArray(parsed) ? parsed : parsed.abi;
if (!Array.isArray(abi)) {
  console.error("No ABI array in that file.");
  process.exit(1);
}

// internalType is the only field dropped, as in the v4 file.
const strip = (node) => {
  if (Array.isArray(node)) return node.map(strip);
  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node)
        .filter(([key]) => key !== "internalType")
        .map(([key, value]) => [key, strip(value)])
    );
  }
  return node;
};

const header = `// The King of Night v5 ABI, from the compiled artifact. Do not hand-type it.
//
// Source: apps/world-street-vault/src/chain/king-of-night-v5-abi.json in the
// backend monorepo. Regenerate with scripts/generate-vault-v5-abi.mjs; only
// \`internalType\` is dropped.
//
// What changed from v4, and why a transcription is dangerous here: games()
// gained \`decimals\` and \`token\` at positions 4 and 5, ahead of minWager and
// pot. Decoding v5 with the v4 tuple does not fail, it reports a pot of
// 7.49e29 wei. claim() became claim(address token), and totalActivePot,
// totalPendingWithdrawals and pendingWithdrawals all take the asset.

export const KING_OF_NIGHT_V5_ABI = ${JSON.stringify(strip(abi), null, 2)} as const;
`;

writeFileSync("lib/vault/king-of-night-v5-abi.ts", header);
console.log(`Wrote lib/vault/king-of-night-v5-abi.ts (${abi.length} entries)`);
