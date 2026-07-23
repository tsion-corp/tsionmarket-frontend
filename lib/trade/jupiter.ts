// Keyless Jupiter Swap quote client. lite-api.jup.ag is Jupiter's free, no-key
// host and returns real Solana routes from the Metis routing engine.
// Docs: https://dev.jup.ag/docs/api/swap-api/quote

const JUPITER_QUOTE_URL = "https://lite-api.jup.ag/swap/v1/quote";
const JUPITER_SWAP_URL = "https://lite-api.jup.ag/swap/v1/swap";

export interface JupiterRouteStep {
  label: string;
  percent: number;
}

export interface JupiterQuote {
  inAmount: bigint;
  outAmount: bigint;
  priceImpactPct: number;
  route: JupiterRouteStep[];
}

interface RawRoutePlanStep {
  swapInfo?: { label?: string };
  percent?: number;
}

interface RawQuoteResponse {
  inAmount?: string;
  outAmount?: string;
  priceImpactPct?: string;
  routePlan?: RawRoutePlanStep[];
}

export interface JupiterQuoteRequest {
  inputMint: string;
  outputMint: string;
  amount: bigint;
  slippageBps: number;
  signal?: AbortSignal;
}

function normalize(raw: RawQuoteResponse): JupiterQuote {
  const route = (raw.routePlan ?? []).map((step) => ({
    label: step.swapInfo?.label ?? "Unknown",
    percent: step.percent ?? 0,
  }));
  return {
    inAmount: BigInt(raw.inAmount ?? "0"),
    outAmount: BigInt(raw.outAmount ?? "0"),
    priceImpactPct: parseFloat(raw.priceImpactPct ?? "0"),
    route,
  };
}

async function fetchRawQuote(req: JupiterQuoteRequest): Promise<RawQuoteResponse> {
  const params = new URLSearchParams({
    inputMint: req.inputMint,
    outputMint: req.outputMint,
    amount: req.amount.toString(),
    slippageBps: String(req.slippageBps),
  });
  const res = await fetch(`${JUPITER_QUOTE_URL}?${params.toString()}`, { signal: req.signal });
  if (!res.ok) throw new Error(`Jupiter quote failed: ${res.status}`);
  return res.json();
}

export async function fetchJupiterQuote(req: JupiterQuoteRequest): Promise<JupiterQuote> {
  return normalize(await fetchRawQuote(req));
}

// Re-quotes fresh, then asks Jupiter to build the swap transaction for the
// wallet. Returns the base64 versioned transaction to sign and send.
export async function buildJupiterSwapTransaction(
  req: JupiterQuoteRequest,
  userPublicKey: string
): Promise<string> {
  const quoteResponse = await fetchRawQuote(req);
  const res = await fetch(JUPITER_SWAP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
    }),
  });
  if (!res.ok) throw new Error(`Jupiter swap build failed: ${res.status}`);
  const data = await res.json();
  if (!data.swapTransaction) throw new Error("Jupiter returned no transaction");
  return data.swapTransaction as string;
}
