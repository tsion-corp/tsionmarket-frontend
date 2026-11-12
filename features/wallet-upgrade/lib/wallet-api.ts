"use client";

import { apiFetch } from "@/lib/api";
import { unwrap } from "@/lib/api/envelope";
import { authMode, readUpgradeEnv } from "@/lib/wallet-upgrade/environment";
import type { WalletPackage } from "@/lib/wallet-core";

const MESSAGE = "The wallet service is unavailable.";
const BASE = "/api/wallet-upgrade/wallet";

export interface ServerWallet {
  walletId: string;
  version: number;
  securityVersion: number;
  digest: string;
  package: unknown;
  devices: Array<{ deviceId: string; publicKey: string }>;
}

export type Authorization =
  { type: "device"; deviceId: string; signature: string } | { type: "recovery"; signature: string };

export type ChallengePurpose = "create" | "commit" | "device" | "revoke";

/** What the flow needs from the service, so it can be tested without one. */
export interface WalletApi {
  /** The caller's wallet, or null when they have none yet. */
  get(): Promise<ServerWallet | null>;
  challenge(purpose: ChallengePurpose): Promise<string>;
  create(body: {
    package: WalletPackage;
    nonce: string;
    proofs: Array<{ accountId: string; signature: string }>;
    device: { deviceId: string; publicKey: string };
  }): Promise<void>;
  commit(body: {
    package: WalletPackage;
    nonce: string;
    authorization: Authorization;
  }): Promise<void>;
  enrollDevice(body: {
    deviceId: string;
    publicKey: string;
    nonce: string;
    enrollSignature: string;
    authorization: Authorization;
  }): Promise<void>;
}

// Under Decane the call carries the Decane access token (apiFetch attaches it, and
// waits for it rather than firing a request that would 401). Under Clerk the session
// cookie rides along and the route reads that instead.
const needsDecaneToken = authMode(readUpgradeEnv()) === "decane";

async function call<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await apiFetch(
    `${BASE}${path}`,
    {
      method,
      cache: "no-store",
      ...(body === undefined
        ? {}
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    },
    { requireAuth: needsDecaneToken }
  );
  return unwrap<T>(res, MESSAGE);
}

export const walletApi: WalletApi = {
  async get() {
    try {
      return await call<ServerWallet>("/me", "GET");
    } catch (error) {
      if ((error as { code?: unknown }).code === "WALLET_NOT_FOUND") return null;
      throw error;
    }
  },
  async challenge(purpose) {
    return (await call<{ nonce: string }>("/me/challenges", "POST", { purpose })).nonce;
  },
  async create(body) {
    await call("", "POST", body);
  },
  async commit(body) {
    await call("/me/package", "PUT", body);
  },
  async enrollDevice(body) {
    await call("/me/devices", "POST", body);
  },
};
