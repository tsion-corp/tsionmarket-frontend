import { apiFetch } from "@/lib/api";
import { BUY_ORIGIN, toBuyRoutes, type BuyRoute } from "@/lib/buy";
import { fetchBuyQuote, type BuyQuote } from "@/lib/buy-quote";

const BASE_CHAIN_ID = 8453;
const NATIVE_ETH = "0x0000000000000000000000000000000000000000";
const USDC_DECIMALS = 6n;
const ETH_WEI = 10n ** 18n;
const MINIMUM_USDC = 10n ** USDC_DECIMALS;
const INITIAL_BUFFER_BPS = 1_500n;
const QUOTE_RETRY_BUFFER_BPS = 500n;

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

export function minimumUsdcForNativeEth(requiredWei: bigint, ethPriceUsd: number): bigint {
  if (requiredWei <= 0n) throw new Error("The Ark name price must be greater than zero.");
  if (!Number.isFinite(ethPriceUsd) || ethPriceUsd <= 0) {
    throw new Error("The ETH price is not available yet.");
  }
  const priceMicros = BigInt(Math.ceil(ethPriceUsd * 1_000_000));
  const amount = ceilDiv(
    requiredWei * priceMicros * (10_000n + INITIAL_BUFFER_BPS),
    ETH_WEI * 10_000n
  );
  return amount > MINIMUM_USDC ? amount : MINIMUM_USDC;
}

export function formatUsdcForNativeEth(requiredWei: bigint, ethPriceUsd: number): string | null {
  if (requiredWei <= 0n || !Number.isFinite(ethPriceUsd) || ethPriceUsd <= 0) return null;
  const priceMicros = BigInt(Math.ceil(ethPriceUsd * 1_000_000));
  const usdcMicros = ceilDiv(requiredWei * priceMicros, ETH_WEI);
  const cents = ceilDiv(usdcMicros, 10_000n);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

export function nextUsdcQuoteAmount(
  currentAmount: bigint,
  requiredWei: bigint,
  minimumOutput: bigint
): bigint {
  if (minimumOutput <= 0n) throw new Error("Dextopus returned no ETH for this quote.");
  const adjusted = ceilDiv(
    currentAmount * requiredWei * (10_000n + QUOTE_RETRY_BUFFER_BPS),
    minimumOutput * 10_000n
  );
  return adjusted > currentAmount ? adjusted : currentAmount + 1n;
}

export async function fetchArkEthRoute(): Promise<BuyRoute | null> {
  const params = new URLSearchParams({
    originChainId: String(BUY_ORIGIN.chainId),
    originAddress: BUY_ORIGIN.asset,
  });
  const response = await apiFetch(
    `/api/dextopus/trade/deposit/destinations?${params.toString()}`,
    {},
    { requireAuth: true }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Dextopus ETH routes are unavailable.");
  return (
    toBuyRoutes(data).find(
      (route) =>
        route.destinationChainId === BASE_CHAIN_ID &&
        route.symbol.toUpperCase() === "ETH" &&
        route.asset.toLowerCase() === NATIVE_ETH
    ) ?? null
  );
}

export async function quoteArkEthFunding(input: {
  route: BuyRoute;
  requiredWei: bigint;
  ethPriceUsd: number;
  recipient: string;
}): Promise<{ amount: bigint; quote: BuyQuote }> {
  let amount = minimumUsdcForNativeEth(input.requiredWei, input.ethPriceUsd);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const quote = await fetchBuyQuote({
      route: input.route,
      amount,
      recipient: input.recipient,
      refundTo: input.recipient,
      slippageBps: 300,
    });
    if (quote.minOutput >= input.requiredWei) return { amount, quote };
    amount = nextUsdcQuoteAmount(amount, input.requiredWei, quote.minOutput);
  }
  throw new Error("Dextopus couldn't quote enough ETH for this name. Try again shortly.");
}
