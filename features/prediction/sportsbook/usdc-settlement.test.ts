import { describe, expect, it } from "vitest";
import { decodeFunctionData, type Address } from "viem";
import {
  applySwapSlippage,
  BASE_USDC_ADDRESS,
  BASE_WETH_ADDRESS,
  encodeUsdcToWethSwap,
  encodeWethToUsdcSwap,
  type UniswapV3Quote,
} from "./usdc-settlement";

const SWAP_ABI = [
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

const RECIPIENT = "0x1111111111111111111111111111111111111111" as Address;

function quote(tokenIn: Address, tokenOut: Address): UniswapV3Quote {
  return {
    tokenIn,
    tokenOut,
    fee: 100,
    amountOut: 2_000n,
    minimumAmountOut: 1_980n,
  };
}

describe("sportsbook USDC settlement", () => {
  it("applies the one-percent swap guard with integer precision", () => {
    expect(applySwapSlippage(2_030_442_235_237_505n)).toBe(2_010_137_812_885_129n);
  });

  it("rejects invalid slippage values", () => {
    expect(() => applySwapSlippage(100n, 10_000)).toThrow("Invalid swap slippage");
  });

  it.each([
    {
      encode: encodeUsdcToWethSwap,
      tokenIn: BASE_USDC_ADDRESS,
      tokenOut: BASE_WETH_ADDRESS,
    },
    {
      encode: encodeWethToUsdcSwap,
      tokenIn: BASE_WETH_ADDRESS,
      tokenOut: BASE_USDC_ADDRESS,
    },
  ])("encodes a direct Uniswap V3 $tokenIn swap", ({ encode, tokenIn, tokenOut }) => {
    const decoded = decodeFunctionData({
      abi: SWAP_ABI,
      data: encode(1_000n, quote(tokenIn, tokenOut), RECIPIENT),
    });

    expect(decoded.functionName).toBe("exactInputSingle");
    expect(decoded.args[0]).toEqual({
      tokenIn,
      tokenOut,
      fee: 100,
      recipient: RECIPIENT,
      amountIn: 1_000n,
      amountOutMinimum: 1_980n,
      sqrtPriceLimitX96: 0n,
    });
  });
});
