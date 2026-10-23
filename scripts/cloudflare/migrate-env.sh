#!/usr/bin/env bash
# Copies one Vercel project's environment variables to its Cloudflare Worker.
#
#   scripts/cloudflare/migrate-env.sh staging              # wsws-test -> tsionmarket-staging
#   scripts/cloudflare/migrate-env.sh production           # wsws      -> tsionmarket
#   scripts/cloudflare/migrate-env.sh staging FILLED.env   # use a file you filled in
#
# Server-only variables become Worker secrets (wrangler secret bulk).
# NEXT_PUBLIC_* and R2_PUBLIC_URL are read at build time, so they are printed
# for the Workers Builds "Build variables" settings instead.
# Only variables the app's code mentions are copied; Vercel system variables
# and the ones removed with Square, Mixpanel and Watchtower are skipped.
#
# Vercel returns Sensitive variables as empty strings. If any value is empty,
# nothing is uploaded: the script writes a file listing every variable, with
# the known values filled in, for you to complete and pass back as FILLED.env.
#
# Needs: `vercel login` and `pnpm wrangler login` done beforehand.
set -euo pipefail

TARGET="${1:-}"
FILLED="${2:-}"
case "$TARGET" in
  staging) PROJECT="wsws-test"; WORKER="tsionmarket-staging"; ENV_FLAG=(--env staging) ;;
  production) PROJECT="wsws"; WORKER="tsionmarket"; ENV_FLAG=() ;;
  *) echo "Usage: $0 <staging|production> [filled-env-file]"; exit 1 ;;
esac
VERCEL_SCOPE="${VERCEL_SCOPE:-team_VVR3sZycU0NYXY8wNWH8rtIk}"

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [ -n "$FILLED" ]; then
  SOURCE="$FILLED"
else
  echo "Pulling $PROJECT production variables from Vercel..."
  (cd "$WORK" && vercel link --yes --project "$PROJECT" --scope "$VERCEL_SCOPE" >/dev/null \
    && vercel env pull "$WORK/pulled.env" --environment=production --yes >/dev/null)
  SOURCE="$WORK/pulled.env"
fi

# Names the app reads somewhere in its source.
git grep -hoE '[A-Z][A-Z0-9_]{2,}' -- app features components hooks lib proxy.ts \
  next.config.ts instrumentation-client.ts ':!*.test.*' | sort -u > "$WORK/referenced.txt"

node - "$SOURCE" "$WORK" <<'NODE'
const fs = require("fs");
const [source, work] = process.argv.slice(2);
const referenced = new Set(fs.readFileSync(`${work}/referenced.txt`, "utf8").split("\n"));
const removed = new Set([
  "NEXT_PUBLIC_MIXPANEL_TOKEN", "NEXT_PUBLIC_WATCHTOWER_DSN", "WATCHTOWER_ORG",
  "WATCHTOWER_PROJECT", "WATCHTOWER_AUTH_TOKEN", "CRON_SECRET", "SQUARE_ZONE_URL",
  "NEXT_PUBLIC_MARKET_SQUARE_URL", "NEXT_PUBLIC_MARKET_SQUARE_LIVE",
  "NEXT_PUBLIC_SQUARE_FEATURED", "NEXT_PUBLIC_APP_VERSION",
]);
const isBuild = (name) => name.startsWith("NEXT_PUBLIC_") || name === "R2_PUBLIC_URL";

const vars = new Map();
for (const line of fs.readFileSync(source, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z][A-Z0-9_]*)=(.*)$/);
  if (!m) continue;
  let value = m[2].trim();
  if (value.startsWith('"')) value = JSON.parse(value);
  else if (value.startsWith("'")) value = value.slice(1, -1);
  vars.set(m[1], value);
}

const skipped = [];
const kept = new Map();
for (const [name, value] of vars) {
  if (/^(VERCEL|TURBO|NX)_/.test(name) || removed.has(name) || !referenced.has(name)) {
    skipped.push(name);
  } else {
    kept.set(name, value);
  }
}

const empty = [...kept].filter(([, v]) => v === "").map(([n]) => n);
const secrets = Object.fromEntries([...kept].filter(([n]) => !isBuild(n)));
const build = [...kept].filter(([n]) => isBuild(n));

fs.writeFileSync(`${work}/skipped.txt`, skipped.sort().join("\n"));
fs.writeFileSync(`${work}/empty.txt`, empty.sort().join("\n"));
fs.writeFileSync(`${work}/secrets.json`, JSON.stringify(secrets), { mode: 0o600 });
fs.writeFileSync(
  `${work}/build.env`,
  build.map(([n, v]) => `${n}=${v}`).join("\n"),
  { mode: 0o600 },
);
fs.writeFileSync(
  `${work}/template.env`,
  [...kept].map(([n, v]) => `${n}=${JSON.stringify(v)}`).join("\n") + "\n",
  { mode: 0o600 },
);
console.log(`${kept.size} variables to copy: ${Object.keys(secrets).length} secrets, ${build.length} build variables.`);
NODE

if [ -s "$WORK/skipped.txt" ]; then
  echo "Skipped (not read by the app, Vercel system, or removed):"
  sed 's/^/  /' "$WORK/skipped.txt"
fi

if [ -s "$WORK/empty.txt" ]; then
  OUT="$HOME/tsionmarket-$TARGET.env"
  cp "$WORK/template.env" "$OUT"
  chmod 600 "$OUT"
  echo
  echo "These variables came back empty (Vercel hides Sensitive values):"
  sed 's/^/  /' "$WORK/empty.txt"
  echo
  echo "Nothing was uploaded. Fill in the empty values in"
  echo "  $OUT"
  echo "then run:  $0 $TARGET $OUT"
  echo "Delete that file when you are done."
  exit 1
fi

SECRET_COUNT="$(node -e 'console.log(Object.keys(require(process.argv[1])).length)' "$WORK/secrets.json")"
if [ "$SECRET_COUNT" -gt 64 ]; then
  echo "$SECRET_COUNT secrets is over the Free plan's 64 per Worker. Stopping."
  exit 1
fi

echo "Uploading $SECRET_COUNT secrets to $WORKER..."
pnpm wrangler secret bulk ${ENV_FLAG[@]+"${ENV_FLAG[@]}"} < "$WORK/secrets.json"

echo
echo "Done. Now add these as Build variables in Cloudflare:"
echo "  Workers & Pages > $WORKER > Settings > Build > Variables and secrets"
echo "-----"
cat "$WORK/build.env"
echo
# Workers Builds ships an older pnpm; match the version package.json pins.
echo "PNPM_VERSION=$(node -p 'require("./package.json").packageManager.split("@")[1]')"
echo "-----"
