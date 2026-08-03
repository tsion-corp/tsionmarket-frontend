// PredictionMarket contract ABI fragment, only the functions this app calls.
// Derived from the documented signatures; keep it as a typed `as const` literal
// so viem infers argument and return types. Money units are 6-dec; side is
// uint8 (0 = YES, 1 = NO); outcome is uint8 (1 = Yes, 2 = No).
export const PREDICTION_ABI = [
  {
    type: "function",
    name: "createMarket",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "closeTime", type: "uint64" },
      { name: "seedUsdc", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "buy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "side", type: "uint8" },
      { name: "usdcIn", type: "uint256" },
      { name: "minSharesOut", type: "uint256" },
    ],
    outputs: [{ name: "sharesOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "sell",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "side", type: "uint8" },
      { name: "sharesIn", type: "uint256" },
      { name: "minUsdcOut", type: "uint256" },
    ],
    outputs: [{ name: "usdcOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "addLiquidity",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "usdcIn", type: "uint256" },
      { name: "minLpOut", type: "uint256" },
    ],
    outputs: [{ name: "lpMinted", type: "uint256" }],
  },
  {
    type: "function",
    name: "removeLiquidity",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "lpIn", type: "uint256" },
      { name: "minUsdcOut", type: "uint256" },
    ],
    outputs: [
      { name: "usdcOut", type: "uint256" },
      { name: "yesOut", type: "uint256" },
      { name: "noOut", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "close",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "resolve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "outcome", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "invalidate",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "redeem",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "side", type: "uint8" },
      { name: "shares", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "claimFor",
    stateMutability: "nonpayable",
    inputs: [{ name: "account", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "priceYes",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenId",
    stateMutability: "view",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "side", type: "uint8" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "pendingWithdrawals",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "markets",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [
      { name: "closeTime", type: "uint64" },
      { name: "status", type: "uint8" },
      { name: "outcome", type: "uint8" },
      { name: "creator", type: "address" },
      { name: "rYes", type: "uint256" },
      { name: "rNo", type: "uint256" },
      { name: "totalLp", type: "uint256" },
      { name: "feeBps", type: "uint16" },
      { name: "collateral", type: "uint256" },
    ],
  },
] as const;
