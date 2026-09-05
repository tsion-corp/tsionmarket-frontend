// Reads the wallet's live USDC allowance to the Avantis TradingStorage
// contract on Base. The allowance is consumed on every open, so this is read
// before each trade to decide whether an approve step must be batched in.

import { encodeAllowanceCall, parseAllowance } from "@/lib/trade/erc20";
import { publicClientForChain } from "@/lib/trade/receipt";
import { PERP_CHAIN_ID, TRADING_STORAGE_ADDRESS, USDC_ADDRESS } from "@/lib/perp/logic";

export async function readUsdcAllowance(owner: string): Promise<bigint> {
  const client = publicClientForChain(PERP_CHAIN_ID);
  const { data } = await client.call({
    to: USDC_ADDRESS as `0x${string}`,
    data: encodeAllowanceCall(owner, TRADING_STORAGE_ADDRESS),
  });
  return parseAllowance(data ?? "0x");
}
