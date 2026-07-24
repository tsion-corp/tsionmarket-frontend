"use client";

import { createSecureClient, remoteBuilderSigning } from "@polymarket/client";
import { signerFrom } from "@polymarket/client/viem";
import { createWalletClient, custom, type EIP1193Provider } from "viem";
import { polygon } from "viem/chains";
import { BUILDER_SIGN_PATH } from "@/lib/polymarket/config";

export type SecureClient = Awaited<ReturnType<typeof createSecureClient>>;

// Builds an authenticated Polymarket client from the user's Privy embedded EOA.
// The EOA signs orders and wallet ops in the browser; the account/funder wallet
// is the signer's deterministic Deposit Wallet (created on first use). Builder
// authentication is remote — the secret lives in /api/polymarket/sign and never
// reaches the client.
export async function buildSecureClient(
  address: string,
  provider: EIP1193Provider
): Promise<SecureClient> {
  const walletClient = createWalletClient({
    account: address as `0x${string}`,
    chain: polygon,
    transport: custom(provider),
  });
  return createSecureClient({
    signer: signerFrom(walletClient),
    apiKey: remoteBuilderSigning({ url: BUILDER_SIGN_PATH }),
  });
}
