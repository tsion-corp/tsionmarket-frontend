import "server-only";

// Dextopus cross-chain deposit/withdrawal. Keys are server-only despite the
// pk_ prefix. Base path is confirmed against the live API when wiring the
// flows; flip DEXTOPUS_BASE if their docs settle on a different prefix.
const DEXTOPUS_BASE = "https://swap-api.dextopus.com/api";
const DEXTOPUS_TIMEOUT_MS = 20_000;

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
  // Existing environments predate the purpose-specific integrations and only
  // have DEXTOPUS_API_KEY. Keep those deployments working while allowing a
  // dedicated key to take precedence whenever one is configured.
  const key =
    process.env[name] ?? (purpose === "deposit" ? undefined : process.env.DEXTOPUS_API_KEY);
  if (!key) throw new Error(`${name} or DEXTOPUS_API_KEY is not set`);
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

  const request = () =>
    fetch(url, {
      method: init.method,
      headers: {
        Accept: "application/json",
        "x-api-key": key,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(DEXTOPUS_TIMEOUT_MS),
      ...(init.revalidate != null
        ? { next: { revalidate: init.revalidate } }
        : { cache: "no-store" }),
    });

  // A quote has no funds attached, so retrying one transient transport failure
  // can only leave an unused address behind. Never retry submit or another
  // money-moving command here: those are reconciled by transaction hash.
  const retryStatus = init.method === "GET" && path === "deposit/status";
  const retryQuote = init.method === "POST" && path === "deposit/quote";
  const delays = retryStatus ? [200, 600, 1_200] : retryQuote ? [300] : [];
  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      response = await request();
    } catch (error) {
      if (attempt >= delays.length) throw error;
      console.warn("Dextopus request transport retry", {
        method: init.method,
        path,
        attempt: attempt + 1,
        error: error instanceof Error ? error.message : "unknown transport failure",
      });
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      continue;
    }
    if (response.status < 500 || attempt >= delays.length) return response;
    await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
  }
}

// The chain and token catalogs barely change, so we cache them server-side to
// shield the shared Dextopus key from repeated client calls. Live paths like
// status and quote are never cached.
export function cacheSecondsFor(path: string): number | undefined {
  if (/^deposit\/(chains|tokens|sources|destinations)/.test(path)) return 600;
  // One request can be observed by the trade sheet, dashboard reconciler and
  // another browser tab. A short shared cache coalesces those reads without
  // making a visible settlement meaningfully stale.
  if (path === "deposit/status") return 5;
  return undefined;
}
