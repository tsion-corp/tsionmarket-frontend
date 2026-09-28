import { erc20Abi, type Address } from "viem";
import { SETTLE_CHAINS } from "@/lib/deposit";
import { publicClientForChain } from "@/lib/trade/receipt";

export interface ArkWalletBalances {
  nativeEthWei: string;
  usdcAtomic: string;
}

export async function readArkWalletBalances(wallet: string): Promise<ArkWalletBalances> {
  const client = publicClientForChain(8453);
  const account = wallet as Address;
  const usdc = SETTLE_CHAINS.base.usdc as Address;
  const [nativeEthWei, usdcAtomic] = await Promise.all([
    client.getBalance({ address: account }),
    client.readContract({
      address: usdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    }),
  ]);
  return { nativeEthWei: nativeEthWei.toString(), usdcAtomic: usdcAtomic.toString() };
}
