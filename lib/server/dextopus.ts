import "server-only";

// Dextopus cross-chain deposit/withdrawal. Keys are server-only despite the
// pk_ prefix. Base path is confirmed against the live API when wiring the
// flows; flip DEXTOPUS_BASE if their docs settle on a different prefix.
const DEXTOPUS_BASE = "https://swap-api.dextopus.com/api";

// Only deposit-scoped paths may be proxied. Withdrawal reuses /deposit/quote.
const ALLOWED_PREFIXES = ["deposit/"];

export function isAllowedPath(path: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

// Dextopus issues one key per integration, and deposits and withdrawals are
// two integrations with their own settlement and reporting. Every request
// names its purpose and is signed with that purpose's key; a withdrawal
// created under one key cannot be polled under the other, so the status read
// carries the purpose too.
export type DextopusPurpose = "deposit" | "withdrawal";

// The client says which by prefixing the proxied path: `withdraw/deposit/quote`
// is a withdrawal quote. The prefix is stripped before the request goes out.
const WITHDRAW_PREFIX = "withdraw/";

export function splitPurpose(joined: string): { purpose: DextopusPurpose; path: string } {
  return joined.startsWith(WITHDRAW_PREFIX)
    ? { purpose: "withdrawal", path: joined.slice(WITHDRAW_PREFIX.length) }
    : { purpose: "deposit", path: joined };
}

function apiKeyFor(purpose: DextopusPurpose): string {
  const name = purpose === "withdrawal" ? "DEXTOPUS_WITHDRAW_API_KEY" : "DEXTOPUS_API_KEY";
  const key = process.env[name];
  if (!key) throw new Error(`${name} is not set`);
  return key;
}

export async function dextopusRequest(
  path: string,
  init: {
    method: "GET" | "POST";
    purpose: DextopusPurpose;
    query?: URLSearchParams;
    body?: unknown;
    revalidate?: number;
  }
): Promise<Response> {
  const key = apiKeyFor(init.purpose);

  const url = new URL(`${DEXTOPUS_BASE}/${path}`);
  if (init.query) url.search = init.query.toString();

  return fetch(url, {
    method: init.method,
    headers: {
      "x-api-key": key,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    ...(init.revalidate != null
      ? { next: { revalidate: init.revalidate } }
      : { cache: "no-store" }),
  });
}

// The chain and token catalogs barely change, so we cache them server-side to
// shield the shared Dextopus key from repeated client calls. Live paths like
// status and quote are never cached.
export function cacheSecondsFor(path: string): number | undefined {
  if (/^deposit\/(chains|tokens|sources|destinations)/.test(path)) return 600;
  return undefined;
}
