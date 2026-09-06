// Reports the JavaScript a browser must load before each route is
// interactive, and fails when a route exceeds its budget.
//
//   node scripts/first-load.mjs          print the table
//   node scripts/first-load.mjs --check  also fail on a budget breach
//
// Runs against a finished `next build`. `next build` stopped printing first-load
// sizes in Next 16 (they were inaccurate for Server Components), so this reads
// what the build knows: each route's client-reference manifest lists the entry
// chunks for that route, and its build manifest lists the root chunks every
// route shares. Both are gzipped here, because that is what travels.
//
// The numbers are the initial payload, not everything reachable. A chunk
// loaded later through next/dynamic or an `await import` does not count, which
// is the point: moving code behind one of those shows up as a drop.
//
// Budgets live in first-load-budget.json beside this file. They are a ratchet:
// set just above what a route ships today, lowered when it improves, and never
// raised without saying why in the commit.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { gzipSync } from "node:zlib";

const root = process.cwd();
const distDir = join(root, ".next");
const check = process.argv.includes("--check");

if (!existsSync(join(distDir, "server", "app"))) {
  console.error("No production build found. Run `pnpm build` first.");
  process.exit(2);
}

const budget = JSON.parse(
  readFileSync(new URL("./first-load-budget.json", import.meta.url), "utf8")
);

const gzipped = new Map();
function gzipSize(chunk) {
  if (!gzipped.has(chunk)) {
    try {
      gzipped.set(chunk, gzipSync(readFileSync(join(distDir, chunk))).length);
    } catch {
      gzipped.set(chunk, 0);
    }
  }
  return gzipped.get(chunk);
}

function manifests(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) manifests(path, out);
    else if (entry.name === "page_client-reference-manifest.js") out.push(path);
  }
  return out;
}

// "/(session)/(app)/dashboard/page" -> "/dashboard". Route groups are folders,
// not URL segments, and the trailing "/page" is the file, not the route.
function routeOf(manifestKey) {
  const url = manifestKey.replace(/\/\([^)]+\)/g, "").replace(/\/page$/, "");
  return url === "" ? "/" : url;
}

const rows = [];
for (const file of manifests(join(distDir, "server", "app"))) {
  const source = readFileSync(file, "utf8");
  const match = source.match(
    /globalThis\.__RSC_MANIFEST\[("[^"]+")\]\s*=\s*(\{[\s\S]*\})\s*;?\s*$/
  );
  if (!match) continue;
  const manifest = JSON.parse(match[2]);
  const chunks = new Set();
  for (const list of Object.values(manifest.entryJSFiles ?? {})) {
    for (const chunk of list) chunks.add(chunk.replace(/^\/?_next\//, ""));
  }
  const segmentDir = join(
    dirname(file),
    basename(file).replace("_client-reference-manifest.js", "")
  );
  const buildManifest = join(segmentDir, "build-manifest.json");
  if (existsSync(buildManifest)) {
    for (const chunk of JSON.parse(readFileSync(buildManifest, "utf8")).rootMainFiles ?? []) {
      chunks.add(chunk);
    }
  }
  const js = [...chunks].filter((chunk) => chunk.endsWith(".js"));
  rows.push({
    route: routeOf(JSON.parse(match[1])),
    chunks: js.length,
    kb: js.reduce((sum, chunk) => sum + gzipSize(chunk), 0) / 1024,
  });
}

rows.sort((a, b) => b.kb - a.kb);

function budgetFor(route) {
  if (route in budget.routes) return budget.routes[route];
  return budget.default;
}

const breaches = [];
console.log("Initial client JS per route, gzip:\n");
for (const row of rows) {
  const limit = budgetFor(row.route);
  const over = row.kb > limit;
  if (over) breaches.push({ ...row, limit });
  console.log(
    `${row.kb.toFixed(0).padStart(6)} kB  ${String(row.chunks).padStart(3)} chunks  ${over ? "OVER" : "    "}  ${row.route}  (budget ${limit})`
  );
}

if (breaches.length > 0) {
  console.log("\nOver budget:");
  for (const b of breaches) {
    console.log(`  ${b.route}: ${b.kb.toFixed(0)} kB against ${b.limit} kB`);
  }
  console.log(
    "\nEither move code out of the initial payload (next/dynamic, a deep import instead of a barrel, a provider scoped to the routes that need it) or raise the budget in scripts/first-load-budget.json and say why in the commit."
  );
  if (check) process.exit(1);
}
