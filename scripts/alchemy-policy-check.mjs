#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ENTRY_POINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const DUMMY_SIGNATURE =
  "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c";

function loadBsoRegistry() {
  const file = path.join(process.cwd(), "config", "alchemy-bso-evm-networks.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const NETWORK_REGISTRY = loadBsoRegistry();
const DEFAULT_REQUIRED_NETWORKS = NETWORK_REGISTRY.map((entry) => entry.policyNetwork);
const BY_POLICY_NETWORK = new Map(NETWORK_REGISTRY.map((entry) => [entry.policyNetwork, entry]));
const BY_NETWORK = new Map(NETWORK_REGISTRY.map((entry) => [entry.network, entry]));

const NETWORK_ALIASES = new Map([
  ["eth", "ETH_MAINNET"],
  ["ethereum", "ETH_MAINNET"],
  ["base", "BASE_MAINNET"],
  ["arb", "ARB_MAINNET"],
  ["arbitrum", "ARB_MAINNET"],
  ["optimism", "OPT_MAINNET"],
  ["opt", "OPT_MAINNET"],
  ["polygon", "MATIC_MAINNET"],
  ["matic", "MATIC_MAINNET"],
]);

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadLocalEnv() {
  const cwd = process.cwd();
  loadEnvFile(path.join(cwd, ".env"));
  loadEnvFile(path.join(cwd, ".env.local"));
}

function printHelp() {
  console.log(`Alchemy Gas Policy Check

Usage:
  pnpm alchemy:policy-check
  pnpm alchemy:policy-check --mode probe
  pnpm alchemy:policy-check --require base,ethereum,arbitrum,optimism,polygon
  pnpm alchemy:policy-check --policy <policy-id> --token <access-key> --json

Env:
  ALCHEMY_GAS_POLICY_ID
  ALCHEMY_ACCESS_KEY
  ALCHEMY_GAS_MANAGER_ACCESS_KEY
  ALCHEMY_ADMIN_ACCESS_TOKEN
  ALCHEMY_POLICY_REQUIRED_NETWORKS   Comma-separated override for the required network set.

Notes:
  - The default required set is every BSO-supported EVM network in
    config/alchemy-bso-evm-networks.json.
  - mode=admin reads the policy object and per-network stats.
  - mode=probe tests live sponsorship requests with apiKey + policyId per network.
  - admin mode needs an Alchemy Access Key with Gas Manager Read permission.`);
}

function parseArgs(argv) {
  const parsed = {
    json: false,
    mode: "admin",
    policyId: null,
    accessToken: null,
    require: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") parsed.json = true;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--mode") parsed.mode = argv[++i] ?? null;
    else if (arg === "--probe") parsed.mode = "probe";
    else if (arg === "--policy") parsed.policyId = argv[++i] ?? null;
    else if (arg === "--token") parsed.accessToken = argv[++i] ?? null;
    else if (arg === "--require") parsed.require = argv[++i] ?? null;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function canonicalNetwork(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === "all") return "__ALL__";
  const upper = trimmed.toUpperCase();
  return (
    NETWORK_ALIASES.get(trimmed.toLowerCase()) ??
    BY_NETWORK.get(trimmed.toLowerCase())?.policyNetwork ??
    BY_POLICY_NETWORK.get(upper)?.policyNetwork ??
    upper
  );
}

function parseRequiredNetworks(raw) {
  if (!raw) return [...DEFAULT_REQUIRED_NETWORKS];
  const values = raw.split(",").map(canonicalNetwork).filter(Boolean);
  if (values.includes("__ALL__")) return [...DEFAULT_REQUIRED_NETWORKS];
  return [...new Set(values)];
}

async function fetchJson(url, accessToken) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const message =
      data?.error?.msg ??
      data?.error?.message ??
      data?.message ??
      `Alchemy request failed with ${res.status}`;
    throw new Error(`${message} (${res.status})`);
  }
  return data;
}

async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: res.status, ok: res.ok, data };
}

async function fetchJsonWithCredential(url, credential) {
  try {
    const data = await fetchJson(url, credential.value);
    return { data, credential };
  } catch (error) {
    return { error, credential };
  }
}

function summarizePolicy(policy, required, stats) {
  const networks = Array.isArray(policy.networks) ? [...policy.networks].map(String).sort() : [];
  const missing = required.filter((network) => !networks.includes(network));
  const extra = networks.filter((network) => !required.includes(network));
  const statRows = Array.isArray(stats?.policyNetworkStats)
    ? stats.policyNetworkStats.map((row) => ({
        network: row.network,
        signaturesMined: row.signaturesMined,
        signaturesPending: row.signaturesPending,
        usdMined: row.usdMined,
        usdPending: row.usdPending,
      }))
    : [];

  return {
    policyId: policy.policyId,
    policyName: policy.policyName ?? null,
    status: policy.status,
    policyState: policy.policyState,
    policyType: policy.policyType,
    networks,
    requiredNetworks: required,
    missingNetworks: missing,
    extraNetworks: extra,
    coversRequiredNetworks: missing.length === 0,
    networkStats: statRows,
  };
}

function printSummary(summary) {
  if (summary.credentialSource) {
    console.log(`Credential used: ${summary.credentialSource}`);
    console.log("");
  }
  console.log(`Policy ID: ${summary.policyId}`);
  console.log(`Name: ${summary.policyName ?? "—"}`);
  console.log(`Status: ${summary.status}`);
  console.log(`State: ${summary.policyState}`);
  console.log(`Type: ${summary.policyType}`);
  console.log("");
  console.log("Policy networks:");
  for (const network of summary.networks) console.log(`  - ${network}`);
  console.log("");
  console.log("Required networks checked:");
  for (const network of summary.requiredNetworks) console.log(`  - ${network}`);
  console.log("");
  console.log(
    summary.coversRequiredNetworks
      ? "Coverage: PASS"
      : `Coverage: FAIL (${summary.missingNetworks.length} missing)`
  );
  if (summary.missingNetworks.length > 0) {
    console.log("Missing:");
    for (const network of summary.missingNetworks) console.log(`  - ${network}`);
  }
  if (summary.extraNetworks.length > 0) {
    console.log("Extra policy networks:");
    for (const network of summary.extraNetworks) console.log(`  - ${network}`);
  }
  if (summary.networkStats.length > 0) {
    console.log("");
    console.log("Policy network stats:");
    for (const row of summary.networkStats) {
      console.log(
        `  - ${row.network}: mined=${row.signaturesMined} pending=${row.signaturesPending} usdMined=${row.usdMined} usdPending=${row.usdPending}`
      );
    }
  }
}

function formatProbeResult(result) {
  if (result.ok) return "PASS";
  return result.errorCode ? `FAIL (${result.errorCode})` : `FAIL (${result.httpStatus})`;
}

function printProbeSummary(summary) {
  console.log(`Mode: sponsorship probe`);
  console.log(`Policy ID: ${summary.policyId}`);
  console.log(`Credential used: ${summary.credentialSource}`);
  console.log("");
  console.log("Networks probed:");
  for (const row of summary.results) {
    console.log(`  - ${row.network} (${row.policyNetwork}): ${formatProbeResult(row)}`);
    if (row.message) {
      console.log(`    message: ${row.message}`);
    }
  }
}

async function runSponsorshipProbe({ policyId, apiKey, required }) {
  const results = [];
  for (const policyNetwork of required) {
    const target = BY_POLICY_NETWORK.get(policyNetwork);
    if (!target) {
      results.push({
        network: policyNetwork,
        policyNetwork,
        ok: false,
        httpStatus: null,
        errorCode: "UNSUPPORTED_NETWORK_ALIAS",
        message: "No sponsorship endpoint mapping for this network in the shared registry.",
      });
      continue;
    }
    const url = `https://${target.alchemyHost}/v2/${apiKey}`;
    const payload = {
      jsonrpc: "2.0",
      id: 1,
      method: "alchemy_requestGasAndPaymasterAndData",
      params: [
        {
          policyId,
          entryPoint: ENTRY_POINT_V07,
          dummySignature: DUMMY_SIGNATURE,
          userOperation: {
            sender: "0x1234567890123456789012345678901234567890",
            nonce: "0x1",
            callData: "0xabcdef",
          },
        },
      ],
    };
    let response;
    try {
      response = await postJson(url, payload);
    } catch (error) {
      results.push({
        network: target.network,
        policyNetwork,
        ok: false,
        httpStatus: null,
        errorCode: "FETCH_FAILED",
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const errorCode = response.data?.error?.code ?? null;
    const message = response.data?.error?.message ?? null;
    results.push({
      network: target.network,
      policyNetwork,
      ok: response.ok && !response.data?.error,
      httpStatus: response.status,
      errorCode,
      message,
      raw: response.data,
    });
  }
  return {
    mode: "probe",
    policyId,
    credentialSource: "ALCHEMY_API_KEY",
    results,
  };
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (args.mode !== "admin" && args.mode !== "probe") {
    throw new Error(`Unsupported mode: ${args.mode}`);
  }

  const policyId = args.policyId ?? process.env.ALCHEMY_GAS_POLICY_ID ?? null;
  const accessToken = args.accessToken ?? null;
  const required = parseRequiredNetworks(
    args.require ?? process.env.ALCHEMY_POLICY_REQUIRED_NETWORKS ?? ""
  );

  if (!policyId) {
    throw new Error("Missing ALCHEMY_GAS_POLICY_ID. Set it in your env or pass --policy.");
  }
  if (args.mode === "probe") {
    const apiKey = process.env.ALCHEMY_API_KEY ?? accessToken;
    if (!apiKey) {
      throw new Error("Probe mode needs ALCHEMY_API_KEY or --token with an API key.");
    }
    const summary = await runSponsorshipProbe({ policyId, apiKey, required });
    if (args.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    printProbeSummary(summary);
    return;
  }
  const credentials = [];
  if (accessToken) {
    credentials.push({ source: "--token", value: accessToken });
  } else {
    const preferred = process.env.ALCHEMY_ACCESS_KEY;
    const gasManager = process.env.ALCHEMY_GAS_MANAGER_ACCESS_KEY;
    const legacy = process.env.ALCHEMY_ADMIN_ACCESS_TOKEN;
    const apiKey = process.env.ALCHEMY_API_KEY;
    if (preferred) credentials.push({ source: "ALCHEMY_ACCESS_KEY", value: preferred });
    if (gasManager)
      credentials.push({ source: "ALCHEMY_GAS_MANAGER_ACCESS_KEY", value: gasManager });
    if (legacy) credentials.push({ source: "ALCHEMY_ADMIN_ACCESS_TOKEN", value: legacy });
    if (apiKey) credentials.push({ source: "ALCHEMY_API_KEY", value: apiKey });
  }

  if (credentials.length === 0) {
    throw new Error(
      "Missing Alchemy credential. Set ALCHEMY_ACCESS_KEY (preferred), ALCHEMY_GAS_MANAGER_ACCESS_KEY, ALCHEMY_ADMIN_ACCESS_TOKEN, or ALCHEMY_API_KEY."
    );
  }

  const base = "https://manage.g.alchemy.com/api/gasManager/policy";
  let policyPayload = null;
  let credentialUsed = null;
  let lastError = null;

  for (const credential of credentials) {
    const attempt = await fetchJsonWithCredential(`${base}/${policyId}`, credential);
    if (attempt.data) {
      policyPayload = attempt.data;
      credentialUsed = credential;
      break;
    }
    lastError = attempt.error;
  }

  if (!policyPayload || !credentialUsed) {
    const sources = credentials.map((credential) => credential.source).join(", ");
    const detail = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(
      `Alchemy rejected the tested credential(s) [${sources}]. Last error: ${detail}`
    );
  }

  const statsRes = await fetchJson(
    `${base}/${policyId}/stats/detailed`,
    credentialUsed.value
  ).catch((error) => ({
    error: error instanceof Error ? error.message : String(error),
  }));

  const summary = summarizePolicy(
    policyPayload?.data?.policy ?? {},
    required,
    statsRes?.data?.policyStats ? statsRes.data : null
  );
  summary.credentialSource = credentialUsed.source;

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  printSummary(summary);
}

main().catch((error) => {
  console.error(
    error instanceof Error ? `alchemy:policy-check failed: ${error.message}` : String(error)
  );
  process.exitCode = 1;
});
