import type { Hex } from "viem";
import { publicClientForChain } from "@/lib/trade/receipt";
import { getSponsoredEvmChainById } from "@/lib/trade/sponsored-evm";
import { validateWalletPackage } from "@/lib/wallet-core/package";
import { walletApi } from "@/lib/wallet-runtime/api";
import { broadcastRaw } from "./broadcast";
import { createCustomSigner, type ChainClient } from "./custom-signer";
import { setCustomWalletSession } from "./session";
import type { WalletSigner } from "./types";

/**
 * The self-custody signer wired to the app: the app's own chain clients for reads and
 * fees, and the broadcast relay for sending. Everything here pulls in the wallet
 * crypto, so it is only ever loaded on demand (see hooks/use-custom-wallet).
 */
export function createAppCustomSigner(
  uid: string,
  pkg: Parameters<typeof createCustomSigner>[0]["pkg"]
): WalletSigner {
  return createCustomSigner({
    uid,
    pkg,
    broadcast: (network, raw) => broadcastRaw(network, raw as Hex),
    client: (chainId) => publicClientForChain(chainId) as unknown as ChainClient,
    networkOf: (chainId) => getSponsoredEvmChainById(chainId)?.network ?? null,
  });
}

const loading = new Map<string, Promise<void>>();

/** Fetch this account's encrypted package (ciphertext only) and make it the session. Many callers, one fetch. */
export function bootstrapCustomWalletSession(uid: string): Promise<void> {
  const existing = loading.get(uid);
  if (existing) return existing;
  const attempt = (async () => {
    const wallet = await walletApi.get();
    if (!wallet) return;
    setCustomWalletSession({ uid, pkg: validateWalletPackage(wallet.package) });
  })().finally(() => loading.delete(uid));
  loading.set(uid, attempt);
  return attempt;
}
