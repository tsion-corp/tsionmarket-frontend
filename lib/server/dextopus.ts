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

// Dextopus issues one key per integration, and we run three: deposits into
// the platform, withdrawals out of it, and everything else that moves money
// through their rails (spot buys and sells, the buy catalog, gas top-ups, the
// casino fund sheet, prediction settlement), which is "trade". Every request
// names its purpose and is signed with that purpose's key; a request created
// under one key cannot be polled under another, so status reads carry the
// purpose too.
export type DextopusPurpose = "deposit" | "withdrawal" | "trade";

// The client says which by prefixing the proxied path: `withdraw/deposit/quote`
// is a withdrawal quote, `trade/deposit/quote` a trade quote, and a bare
// Dextopus path is a deposit. The prefix is stripped before the request goes out.
const PREFIXES: Array<[string, DextopusPurpose]> = [
  ["withdraw/", "withdrawal"],
  ["trade/", "trade"],
];

export function splitPurpose(joined: string): { purpose: DextopusPurpose; path: string } {
  for (const [prefix, purpose] of PREFIXES) {
    if (joined.startsWith(prefix)) return { purpose, path: joined.slice(prefix.length) };
  }
  return { purpose: "deposit", path: joined };
}

const KEY_ENV: Record<DextopusPurpose, string> = {
  deposit: "DEXTOPUS_API_KEY",
  withdrawal: "DEXTOPUS_WITHDRAW_API_KEY",
  trade: "DEXTOPUS_TRADE_API_KEY",
};

function apiKeyFor(purpose: DextopusPurpose): string {
  const name = KEY_ENV[purpose];
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
