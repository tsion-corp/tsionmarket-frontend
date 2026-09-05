import { encodeFunctionData, type Address, type Hex } from "viem";
import { publicClientForChain } from "@/lib/trade/receipt";

export const SPORTSBOOK_CHAIN_ID = 8453;
export const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
export const BASE_WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as Address;
export const UNISWAP_V3_QUOTER_ADDRESS = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a" as Address;
export const UNISWAP_V3_ROUTER_ADDRESS = "0x2626664c2603336E57B271c5C0b26F421741e481" as Address;
export const UNISWAP_V3_FEE_TIERS = [100, 500, 3_000, 10_000] as const;

const QUOTER_ABI = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

const SWAP_ROUTER_ABI = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

export interface UniswapV3Quote {
  tokenIn: Address;
  tokenOut: Address;
  fee: (typeof UNISWAP_V3_FEE_TIERS)[number];
  amountOut: bigint;
  minimumAmountOut: bigint;
}

export type UsdcToWethQuote = UniswapV3Quote;
export type WethToUsdcQuote = UniswapV3Quote;

export function applySwapSlippage(amountOut: bigint, slippageBps = 100): bigint {
  if (slippageBps < 0 || slippageBps >= 10_000) throw new Error("Invalid swap slippage");
  return (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
}

async function quoteExactInput(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  slippageBps: number,
  unavailableMessage: string
): Promise<UniswapV3Quote> {
  if (amountIn <= 0n) throw new Error("Enter a valid conversion amount.");
  const client = publicClientForChain(SPORTSBOOK_CHAIN_ID);
  const candidates = await Promise.all(
    UNISWAP_V3_FEE_TIERS.map(async (fee) => {
      try {
        const { result } = await client.simulateContract({
          address: UNISWAP_V3_QUOTER_ADDRESS,
          abi: QUOTER_ABI,
          functionName: "quoteExactInputSingle",
          args: [
            {
              tokenIn,
              tokenOut,
              amountIn,
              fee,
              sqrtPriceLimitX96: 0n,
            },
          ],
        });
        const [amountOut] = result;
        return amountOut > 0n ? { amountOut, fee } : null;
      } catch {
        return null;
      }
    })
  );
  const best = candidates
    .filter(
      (
        candidate
      ): candidate is {
        amountOut: bigint;
        fee: (typeof UNISWAP_V3_FEE_TIERS)[number];
      } => candidate !== null
    )
    .toSorted((left, right) =>
      left.amountOut === right.amountOut ? 0 : left.amountOut > right.amountOut ? -1 : 1
    )[0];
  if (!best) throw new Error(unavailableMessage);
  return {
    tokenIn,
    tokenOut,
    ...best,
    minimumAmountOut: applySwapSlippage(best.amountOut, slippageBps),
  };
}

export function quoteUsdcToWeth(amountIn: bigint, slippageBps = 100): Promise<UsdcToWethQuote> {
  return quoteExactInput(
    BASE_USDC_ADDRESS,
    BASE_WETH_ADDRESS,
    amountIn,
    slippageBps,
    "USDC conversion is unavailable right now."
  );
}

export function quoteWethToUsdc(amountIn: bigint, slippageBps = 100): Promise<WethToUsdcQuote> {
  return quoteExactInput(
    BASE_WETH_ADDRESS,
    BASE_USDC_ADDRESS,
    amountIn,
    slippageBps,
    "Winnings cannot be converted to USDC right now."
  );
}

function encodeExactInputSwap(amountIn: bigint, quote: UniswapV3Quote, recipient: Address): Hex {
  return encodeFunctionData({
    abi: SWAP_ROUTER_ABI,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: quote.tokenIn,
        tokenOut: quote.tokenOut,
        fee: quote.fee,
        recipient,
        amountIn,
        amountOutMinimum: quote.minimumAmountOut,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
}

export function encodeUsdcToWethSwap(
  amountIn: bigint,
  quote: UsdcToWethQuote,
  recipient: Address
): Hex {
  return encodeExactInputSwap(amountIn, quote, recipient);
}

export function encodeWethToUsdcSwap(
  amountIn: bigint,
  quote: WethToUsdcQuote,
  recipient: Address
): Hex {
  return encodeExactInputSwap(amountIn, quote, recipient);
}
