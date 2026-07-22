import type {
  AllocationSlice,
  FundMethod,
  Holding,
  Market,
  PerpMarket,
  Position,
  Prediction,
} from "@/lib/types";

export const ALLOCATION: AllocationSlice[] = [
  { name: "Tokenized stocks", pct: 38, color: "#A78BFA" },
  { name: "Crypto", pct: 31, color: "#7C9CE7" },
  { name: "Gold & RWA", pct: 19, color: "#E7C97C" },
  { name: "Stablecoins", pct: 12, color: "rgba(255,255,255,0.4)" },
];

export const HOLDINGS: Holding[] = [
  {
    sym: "AAPL",
    name: "Apple",
    amount: "12.4 wAAPL",
    price: "$228.10",
    chg: "+1.2%",
    value: "$2,828",
    bg: "linear-gradient(135deg,#555,#222)",
  },
  {
    sym: "◎",
    name: "Solana",
    amount: "48.2 SOL",
    price: "$174.20",
    chg: "+4.6%",
    value: "$8,396",
    bg: "linear-gradient(135deg,#9945FF,#14F195)",
  },
  {
    sym: "₿",
    name: "Bitcoin",
    amount: "0.21 BTC",
    price: "$71,240",
    chg: "-0.8%",
    value: "$14,960",
    bg: "linear-gradient(135deg,#F7931A,#8a5310)",
  },
  {
    sym: "XAU",
    name: "Gold",
    amount: "3.1 WS-XAU",
    price: "$2,412",
    chg: "+0.3%",
    value: "$7,477",
    bg: "linear-gradient(135deg,#E7C97C,#9c7d2e)",
  },
  {
    sym: "OUSG",
    name: "T-Bill Fund",
    amount: "6,200 WS-OUSG",
    price: "$1.04",
    chg: "+0.01%",
    value: "$6,448",
    bg: "linear-gradient(135deg,#A78BFA,#6d5bd0)",
  },
  {
    sym: "$",
    name: "USD Coin",
    amount: "8,106 USDC",
    price: "$1.00",
    chg: "+0.0%",
    value: "$8,106",
    bg: "#2775CA",
  },
];

export const MARKETS: Market[] = [
  {
    sym: "◎",
    name: "Solana",
    ticker: "SOL",
    price: "$174.20",
    chg: "+4.6%",
    class: "Crypto",
    bg: "linear-gradient(135deg,#9945FF,#14F195)",
  },
  {
    sym: "₿",
    name: "Bitcoin",
    ticker: "BTC",
    price: "$71,240",
    chg: "-0.8%",
    class: "Crypto",
    bg: "linear-gradient(135deg,#F7931A,#8a5310)",
  },
  {
    sym: "AAPL",
    name: "Apple",
    ticker: "wAAPL",
    price: "$228.10",
    chg: "+1.2%",
    class: "US Stock",
    bg: "linear-gradient(135deg,#555,#222)",
  },
  {
    sym: "NVDA",
    name: "Nvidia",
    ticker: "wNVDA",
    price: "$1,204",
    chg: "+3.4%",
    class: "US Stock",
    bg: "linear-gradient(135deg,#76B900,#3c5f00)",
  },
  {
    sym: "TSLA",
    name: "Tesla",
    ticker: "wTSLA",
    price: "$246.80",
    chg: "-1.1%",
    class: "US Stock",
    bg: "linear-gradient(135deg,#E82127,#7a1013)",
  },
  {
    sym: "XAU",
    name: "Gold",
    ticker: "WS-XAU",
    price: "$2,412",
    chg: "+0.3%",
    class: "Commodity",
    bg: "linear-gradient(135deg,#E7C97C,#9c7d2e)",
  },
  {
    sym: "OUSG",
    name: "T-Bill Fund",
    ticker: "WS-OUSG",
    price: "$1.04",
    chg: "+0.01%",
    class: "Treasury",
    bg: "linear-gradient(135deg,#A78BFA,#6d5bd0)",
  },
  {
    sym: "ETH",
    name: "Ethereum",
    ticker: "ETH",
    price: "$3,880",
    chg: "+2.1%",
    class: "Crypto",
    bg: "linear-gradient(135deg,#627EEA,#33427c)",
  },
];

export const MARKET_TABS = ["All", "Stocks", "Crypto", "Gold", "Treasuries"] as const;

export const MARKET_CLASS_MAP: Record<string, string> = {
  Stocks: "US Stock",
  Crypto: "Crypto",
  Gold: "Commodity",
  Treasuries: "Treasury",
};

export const PERP_MARKETS: PerpMarket[] = [
  { pair: "SOL-PERP", price: "$174.20", chg: "+4.6%", active: true },
  { pair: "BTC-PERP", price: "$71,240", chg: "-0.8%" },
  { pair: "ETH-PERP", price: "$3,880", chg: "+2.1%" },
];

export const POSITIONS: Position[] = [
  { side: "LONG", pair: "SOL-PERP", size: "20,000", entry: "$166.40", pnl: "+$896" },
  { side: "SHORT", pair: "BTC-PERP", size: "8,500", entry: "$72,100", pnl: "+$102" },
];

export const PREDICTIONS: Prediction[] = [
  {
    tag: "Politics",
    vol: "$4.2M vol",
    q: "Will the US cut rates before Q4 2026?",
    yes: "68¢",
    no: "32¢",
    pct: 68,
  },
  {
    tag: "Crypto",
    vol: "$2.8M vol",
    q: "Will BTC close above $80k this quarter?",
    yes: "41¢",
    no: "59¢",
    pct: 41,
  },
  {
    tag: "Sports",
    vol: "$1.1M vol",
    q: "Will Real Madrid win the Champions League?",
    yes: "55¢",
    no: "45¢",
    pct: 55,
  },
  {
    tag: "World",
    vol: "$920k vol",
    q: "Will Nigeria's inflation fall below 20% in 2026?",
    yes: "37¢",
    no: "63¢",
    pct: 37,
  },
];

export const SWAP_ROUTES = [
  { name: "Best available rate", pct: "52%" },
  { name: "Secondary source", pct: "31%" },
  { name: "Backup source", pct: "17%" },
];

export const FUND_METHODS: FundMethod[] = [
  { key: "bank", label: "Bank transfer", desc: "Instant · Naira" },
  { key: "card", label: "Debit card", desc: "Visa · Mastercard" },
  { key: "crypto", label: "Crypto deposit", desc: "USDC · USDT" },
];

export const DEMO_USER = {
  name: "Ada Okafor",
  email: "ada@email.com",
  address: "0x8f4e21c09b7a5d3f6e8a90c1d2b3a4f5e6d7c8b9",
};
