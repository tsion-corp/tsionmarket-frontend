#!/usr/bin/env node
// Who owns this embedded wallet? Looks the address up in Privy so the team
// can log into the right test account and move funds in-app. Read-only: it
// prints login methods, it cannot touch keys or funds.
//
//   node scripts/find-wallet-owner.mjs 0xWALLET
//
// Needs PRIVY_APP_ID (NEXT_PUBLIC_PRIVY_APP_ID works too) and
// PRIVY_APP_SECRET in the environment or in .env/.env.local.

import { readFileSync, existsSync } from "node:fs";

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}
loadDotEnv(".env");
loadDotEnv(".env.local");

const appId = process.env.PRIVY_APP_ID || process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const secret = process.env.PRIVY_APP_SECRET;
const wallet = process.argv[2];

if (!appId || !secret) {
  console.error("PRIVY_APP_ID / PRIVY_APP_SECRET missing (checked env, .env, .env.local)");
  process.exit(1);
}
if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
  console.error("usage: node scripts/find-wallet-owner.mjs 0xWALLET");
  process.exit(1);
}

const res = await fetch("https://auth.privy.io/api/v1/users/wallet/address", {
  method: "POST",
  headers: {
    Authorization: `Basic ${Buffer.from(`${appId}:${secret}`).toString("base64")}`,
    "privy-app-id": appId,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ address: wallet }),
});

if (res.status === 404) {
  console.log("No user in this Privy app owns that wallet.");
  process.exit(0);
}
if (!res.ok) {
  console.error(`Privy answered ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const user = await res.json();
console.log(`Privy user: ${user.id}`);
console.log(`Created:    ${new Date((user.created_at ?? 0) * 1000).toISOString()}`);
console.log("Login methods and linked accounts:");
for (const account of user.linked_accounts ?? []) {
  const label =
    account.type === "wallet"
      ? `wallet ${account.address} (${account.chain_type}${account.wallet_client_type === "privy" ? ", embedded" : ""})`
      : account.type === "email"
        ? `email ${account.address}`
        : account.type === "google_oauth"
          ? `google ${account.email}`
          : `${account.type} ${account.address ?? account.email ?? account.username ?? ""}`;
  console.log(`  - ${label}`);
}
console.log("\nLog in with one of those methods and send the funds from the app's");
console.log("portfolio (send/withdraw). No script can move them, which is the point.");
