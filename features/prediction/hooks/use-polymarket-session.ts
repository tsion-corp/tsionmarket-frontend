"use client";

import { useCallback, useState } from "react";
import { friendlyError } from "@/lib/errors";
import { useSocialWallet } from "decane-connect-kit";
import { deployDepositWallet, isWalletDeployed } from "@polymarket/client/actions";
import type { EIP1193Provider } from "viem";
import { useAuthSession } from "@/hooks/use-auth-session";
import { ensureUnlocked } from "@/lib/decane";
import { buildSecureClient, type SecureClient } from "@/lib/polymarket/secure-client";

export type SessionStatus = "idle" | "connecting" | "deploying" | "approving" | "ready" | "error";

// Shared across every hook instance so the Deposit Wallet is derived, deployed,
// and approved exactly once per user: betting and funding reuse one client.
let sharedClient: SecureClient | null = null;
let sharedAddress: string | null = null;
let building: Promise<SecureClient> | null = null;

// Lazily builds and onboards the Polymarket trading session for the current
// user. First use derives + deploys the Deposit Wallet (gasless via the builder
// relayer) and sets trading approvals, then caches the ready client process-wide.
export function usePolymarketSession() {
  const { evmAddress } = useAuthSession();
  const wallet = useSocialWallet();
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const ensureReady = useCallback(async (): Promise<SecureClient> => {
    const address = evmAddress;
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
      setStatus("connecting");
      // Onboarding signs through the provider (deploy + approvals), so the
      // Decane session must be unlocked before the client is built.
      await ensureUnlocked(wallet);
      const provider = wallet.getEthereumProvider() as unknown as EIP1193Provider;
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
  }, [evmAddress, wallet]);

  return { ensureReady, status, error, ready: status === "ready" };
}
