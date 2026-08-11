"use client";

import { useCallback, useState } from "react";
import { friendlyError } from "@/lib/errors";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { deployDepositWallet, isWalletDeployed } from "@polymarket/client/actions";
import type { EIP1193Provider } from "viem";
import { getWalletAddress } from "@/lib/user";
import {
  buildSecureClient,
  type SecureClient,
} from "@/features/prediction/lib/polymarket/secure-client";

export type SessionStatus = "idle" | "connecting" | "deploying" | "approving" | "ready" | "error";

// Shared across every hook instance so the Deposit Wallet is derived, deployed,
// and approved exactly once per user — betting and funding reuse one client.
let sharedClient: SecureClient | null = null;
let sharedAddress: string | null = null;
let building: Promise<SecureClient> | null = null;

// Lazily builds and onboards the Polymarket trading session for the current
// user. First use derives + deploys the Deposit Wallet (gasless via the builder
// relayer) and sets trading approvals, then caches the ready client process-wide.
export function usePolymarketSession() {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const ensureReady = useCallback(async (): Promise<SecureClient> => {
    const address = getWalletAddress(user, "ethereum");
    if (!address) throw new Error("No wallet connected");

    // Reset if the signed-in wallet changed.
    if (sharedAddress && sharedAddress !== address) {
      sharedClient = null;
      building = null;
    }
    if (sharedClient) return sharedClient;
    if (building) return building;

    setError(null);
    building = (async () => {
      const wallet = wallets.find((w) => w.address.toLowerCase() === address.toLowerCase());
      if (!wallet) throw new Error("Wallet is not ready. Try again.");

      setStatus("connecting");
      const provider = (await wallet.getEthereumProvider()) as unknown as EIP1193Provider;
      const client = await buildSecureClient(address, provider);

      if (!(await isWalletDeployed(client))) {
        setStatus("deploying");
        const handle = await deployDepositWallet(client);
        await handle.wait();
      }

      setStatus("approving");
      await client.setupTradingApprovals();

      sharedClient = client;
      sharedAddress = address;
      setStatus("ready");
      return client;
    })();

    try {
      return await building;
    } catch (e) {
      setStatus("error");
      setError(friendlyError(e, "Couldn't connect to predictions. Please try again."));
      throw e;
    } finally {
      building = null;
    }
  }, [user, wallets]);

  return { ensureReady, status, error, ready: status === "ready" };
}
