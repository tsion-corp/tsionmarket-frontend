import { SPONSORED_EVM_CHAINS } from "@/lib/trade/sponsored-evm";

/**
 * RPC endpoints for the Decane kit, one per readable EVM chain in the registry.
 *
 * The kit's own user-paid send (`wallet.sendTransaction` on `evm:<id>`) reads
 * the nonce, estimates gas, fetches fee data and broadcasts through an RPC it
 * resolves from `rpcUrls`, falling back to a short built-in list of majors.
 * HyperEVM, ApeChain and Monad are not on that list, so a sell or send of
 * HYPE, APE or MON from the Decane wallet failed at once with "No RPC URL for
 * evm:999" — before any signing, whatever the chain could do. This maps every
 * chain the portfolio can read to the public endpoint viem records for it.
 *
 * Public endpoints, not the app's /api/evm-rpc proxy: the kit's provider
 * cannot carry the session header the proxy requires. Custom chains defined
 * against the proxy (no viem chain) are left out for the same reason.
 */
export function decaneRpcUrls(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const config of SPONSORED_EVM_CHAINS) {
    if (!config.supportsReceiptPolling) continue;
    const url = config.chain.rpcUrls.default?.http?.[0];
    if (!url || !/^https?:\/\//.test(url)) continue;
    out[`evm:${config.chainId}`] = url;
  }
  return out;
}
