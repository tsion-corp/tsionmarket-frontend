"use client";

import {
  createSecureClient,
  forkEnvironmentConfig,
  remoteBuilderSigning,
} from "@polymarket/client";
import { signerFrom } from "@polymarket/client/viem";
import { createWalletClient, custom, type EIP1193Provider } from "viem";
import { polygon } from "viem/chains";
import { BUILDER_SIGN_PATH, POLYGON_RPC_PATH } from "@/lib/polymarket/config";

export type SecureClient = Awaited<ReturnType<typeof createSecureClient>>;

// Production, but reading the chain through our own proxy instead of the
// public endpoint the SDK hardcodes. Everything else (contracts, CLOB, relayer)
// is inherited untouched.
//
// forkEnvironmentConfig is marked experimental by the SDK, so its signature can
// change on an upgrade. It is the only supported way to replace the RPC, and
// the alternative is leaving trading approvals at the mercy of a public node
// that returns 500.
//
// Absolute rather than root-relative: the SDK builds a URL from this value, and
// only the browser reaches it, so resolving against the current origin here is
// safe and unambiguous.
function appEnvironment() {
  return forkEnvironmentConfig({
    name: "wsws",
    rpc: `${window.location.origin}${POLYGON_RPC_PATH}`,
  });
}

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
    environment: appEnvironment(),
  });
}
