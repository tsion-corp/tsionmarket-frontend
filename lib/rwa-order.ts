import { formatQty, parseMoney } from "@/lib/format";
import type { RwaAsset } from "@/lib/types";

export type OrderMode = "buy" | "sell";

export interface OrderQuote {
  payLabel: string;
  payBalance: string;
  payAmt: string;
  paySym: string;
  payTicker: string;
  payBg: string;
  getAmt: string;
  getSym: string;
  getTicker: string;
  getBg: string;
}

const USDC = { sym: "$", ticker: "USDC", bg: "#2775CA" };

export function quoteOrder(asset: RwaAsset, mode: OrderMode): OrderQuote {
  const price = parseMoney(asset.price);
  const token = { sym: asset.sym, ticker: asset.ticker, bg: asset.bg };
  const isBuy = mode === "buy";
  const pay = isBuy ? USDC : token;
  const get = isBuy ? token : USDC;
  return {
    payLabel: isBuy ? "You pay" : "You sell",
    payBalance: isBuy ? "Balance 8,420 USDC" : `Balance 120 ${asset.ticker}`,
    payAmt: isBuy ? "10,000" : formatQty(50),
    paySym: pay.sym,
    payTicker: pay.ticker,
    payBg: pay.bg,
    getAmt: isBuy ? formatQty(10000 / price) : formatQty(50 * price),
    getSym: get.sym,
    getTicker: get.ticker,
    getBg: get.bg,
  };
}
