#!/usr/bin/env node
/**
 * Turns a Privy export into the legacy directory, hashing the identifiers.
 *
 *   node scripts/hash-legacy-directory.mjs privy-export.csv > legacy-directory.csv
 *
 * Out: sha256_identifier,evm,solana
 *
 * The output carries nothing readable, so it is safe to paste into a Google
 * Sheet, publish as CSV, commit, or leak — while the lookup still works,
 * because the server hashes whatever identifier it is given and matches that.
 * The input is never written anywhere; keep it off the repo and delete it when
 * you are done.
 *
 * ONE ROW PER IDENTIFIER, not per user. A user with an email and an X account
 * gets two rows carrying the same wallets, because the browser asking later
 * may know either one. Not every legacy user has an address at all: Privy
 * allowed signing in with Twitter, and those accounts carry a handle and
 * nothing else — which is why Decane grew an X provider, and why an
 * email-only directory would strand every one of them.
 *
 * X accounts are keyed on the numeric id, never the @handle: a handle can be
 * released by its owner and registered by somebody else, and keying on one
 * would point a stranger at this wallet. The id is also the same value on both
 * sides — Privy's twitter subject IS X's user id — so the halves join without
 * anything being inferred.
 *
 * Columns are found by HEADER NAME, because an X id is bare digits and cannot
 * be told from any other number by shape. Emails and wallets fall back to
 * shape detection when a header does not name them. Run with --inspect to see
 * what was matched before trusting a run.
 *
 * Nothing but the output CSV goes to stdout, so it can be piped. Every count
 * and warning goes to stderr, and no identifier appears on either — which is
 * the whole reason this is a script and not a paste into a chat window.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const inspect = args.includes("--inspect");

if (!file) {
  console.error("usage: node scripts/hash-legacy-directory.mjs <privy-export.csv> [--inspect]");
  process.exit(2);
}

const hash = (value) => createHash("sha256").update(value.trim().toLowerCase()).digest("hex");

// Split on commas outside quotes: an export can carry a quoted display name.
function cells(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const EVM = /^0x[0-9a-fA-F]{40}$/;
// Base58, and long enough not to catch a stray word.
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const X_ID = /^\d{1,32}$/;
// An X handle: 1-15 of letters, digits and underscore.
const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;

// Header names seen across Privy exports, normalised to letters only.
// Several columns can carry an email — a Privy export has both "Email" and
// "Google email", and one user in the wild has two different ones — so emails
// are collected from EVERY matching column rather than the first.
const HEADERS = {
  email: [/^email/, /emailaddress/, /googleemail/, /^(login|primary)email/],
  // `subject` is Privy's name for the provider's own id. Stronger than a
  // handle, and absent from some exports.
  xId: [/^(twitter|x)(subject|id|userid)$/, /^(twitter|x)accountsubject$/],
  xHandle: [/^(twitter|x)(username|handle)$/, /^(twitter|x)screenname$/],
  evm: [/^(evm|ethereum|eth)/, /walletaddress/],
  solana: [/^(solana|svm)/, /^sol(wallet|address)/],
};

const norm = (h) => h.toLowerCase().replace(/[^a-z]/g, "");

// Emails collect every matching column; everything else takes the first.
function findColumns(header) {
  const found = { email: [] };
  header.forEach((raw, i) => {
    const h = norm(raw);
    if (HEADERS.email.some((p) => p.test(h))) found.email.push(i);
    for (const [key, patterns] of Object.entries(HEADERS)) {
      if (key === "email") continue;
      if (found[key] === undefined && patterns.some((p) => p.test(h))) found[key] = i;
    }
  });
  return found;
}

const lines = readFileSync(file, "utf8").split(/\r?\n/);

// A header is a first non-empty row that carries no email and no wallet — i.e.
// nothing that looks like data.
let columns = {};
let start = 0;
for (let i = 0; i < lines.length; i += 1) {
  if (!lines[i].trim()) continue;
  const row = cells(lines[i]);
  const looksLikeData = row.some((c) => EMAIL.test(c) || EVM.test(c) || SOLANA.test(c));
  if (!looksLikeData) {
    columns = findColumns(row);
    start = i + 1;
  }
  break;
}

if (inspect) {
  console.error("columns matched by header:", JSON.stringify(columns));
}

let users = 0;
let rows = 0;
let withEmail = 0;
let withX = 0;
let skipped = 0;
const seen = new Set();
const out = [];

for (let i = start; i < lines.length; i += 1) {
  const line = lines[i];
  if (!line.trim()) continue;
  const parts = cells(line);

  const at = (key, test) => {
    const idx = columns[key];
    const named = idx !== undefined ? parts[idx] : undefined;
    if (named && (!test || test.test(named))) return named;
    // No header for it, or the named cell was empty: fall back to shape, which
    // works for wallets and cannot work for a bare id or handle.
    return test ? parts.find((c) => test.test(c)) : undefined;
  };

  // Every email column, deduped: "Email" and "Google email" are usually the
  // same address, and occasionally are not.
  const emails = [
    ...new Set(
      (columns.email ?? [])
        .map((i) => parts[i])
        .filter((c) => c && EMAIL.test(c))
        .map((c) => c.trim().toLowerCase())
    ),
  ];
  if (emails.length === 0) {
    const loose = parts.find((c) => EMAIL.test(c));
    if (loose) emails.push(loose.trim().toLowerCase());
  }

  const evm = at("evm", EVM) ?? "";
  const solana = at("solana", SOLANA) ?? "";
  // Only ever read from a named column: any other number in the row would
  // otherwise be taken for an X id and written as somebody's identifier.
  const xId =
    columns.xId !== undefined && X_ID.test(parts[columns.xId] ?? "")
      ? parts[columns.xId]
      : undefined;
  const rawHandle = columns.xHandle !== undefined ? (parts[columns.xHandle] ?? "") : "";
  const xHandle = X_HANDLE.test(rawHandle.replace(/^@/, ""))
    ? rawHandle.replace(/^@/, "")
    : undefined;

  // A user with no wallet on either chain never held money here, so the lookup
  // would answer "account, but nothing to move" — a dead end with a
  // frightening label.
  if (!evm && !solana) {
    skipped += 1;
    continue;
  }
  if (emails.length === 0 && !xId && !xHandle) {
    skipped += 1;
    continue;
  }

  users += 1;
  if (emails.length) withEmail += 1;
  if (xId || xHandle) withX += 1;

  // One row per identifier: the browser asking later may know any of them.
  // The id and the handle are both written where both exist, so a later
  // export that gains ids keeps working without a re-key.
  for (const identifier of [
    ...emails,
    xId ? `x:${xId}` : undefined,
    xHandle ? `x:@${xHandle.toLowerCase()}` : undefined,
  ]) {
    if (!identifier) continue;
    const key = hash(identifier);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`${key},${evm},${solana}`);
    rows += 1;
  }
}

console.log("sha256_identifier,evm,solana");
for (const row of out) console.log(row);

console.error(`${users} users -> ${rows} rows (${withEmail} with an email, ${withX} with an X id)`);
if (skipped) console.error(`skipped ${skipped} (no identifier, or no wallet on either chain)`);
if (withX === 0 && columns.xId === undefined && columns.xHandle === undefined) {
  console.error(
    "WARNING: no X id column was matched. Legacy users who signed in with Twitter\n" +
      "         have no email, so they will be missing from this directory entirely.\n" +
      "         Re-run with --inspect to see which columns were found."
  );
}
console.error("the output contains no identifiers; delete the input when you are done");
