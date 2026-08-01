import type { Interest } from "@/lib/types";

export const INTERESTS: Interest[] = [
  {
    key: "stocks",
    title: "Stocks & ETFs",
    desc: "Own fractional Apple, Nvidia, S&P 500 and more.",
    icon: "chart-bars",
  },
  {
    key: "gold",
    title: "Gold & commodities",
    desc: "Physical-backed gold and metals, tokenized.",
    icon: "gold",
  },
  {
    key: "crypto",
    title: "Crypto & tokens",
    desc: "BTC, ETH, SOL and instant best-price swaps.",
    icon: "coin",
  },
  {
    key: "perps",
    title: "Perps & leverage",
    desc: "Long or short with up to 100x leverage.",
    icon: "trend",
  },
  {
    key: "prediction",
    title: "Prediction markets",
    desc: "Trade politics, sports and world events.",
    icon: "bulb",
  },
  {
    key: "casino",
    title: "Casino & games",
    desc: "Last Man Standing, staked chess and more.",
    icon: "dice",
  },
  {
    key: "earn",
    title: "Earn & bounties",
    desc: "Real tasks that pay out in crypto.",
    icon: "yield",
  },
  {
    key: "realestate",
    title: "Real estate",
    desc: "Fractional property that pays rental income.",
    icon: "house",
  },
  {
    key: "treasuries",
    title: "Treasuries & bonds",
    desc: "T-bill yield onchain, redeemable 1:1.",
    icon: "bond",
  },
];
