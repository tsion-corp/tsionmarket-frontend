"use client";

import { http, type EIP1193Provider, type SignedAuthorization } from "viem";
import {
  createBundlerClient,
  UserOperationReceiptNotFoundError,
  WaitForUserOperationReceiptTimeoutError,
  type BundlerClient,
} from "viem/account-abstraction";
import { to7702SimpleSmartAccount } from "permissionless/accounts";
import { getSponsoredEvmChainById } from "@/lib/trade/sponsored-evm";
import { isReceiptChain, publicClientForChain } from "@/lib/trade/receipt";
import { isDelegated, rememberDelegated, SIMPLE_7702_IMPLEMENTATION } from "@/lib/trade/delegation";
import { requestGasAndPaymaster, type BundlerRequest } from "@/lib/trade/gas-manager";
import type { ReceiptLog } from "@/lib/meme/delivery";

const ENTRY_POINT_V08 = "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108" as const;
const USER_OPERATION_EVENT_TOPIC =
  "0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f" as const;
const USER_OPERATION_RECEIPT_TIMEOUT_MS = 45_000;
const ONCHAIN_RECOVERY_TIMEOUT_MS = 30_000;
const USER_OPERATION_RECEIPT_FIRST_LOOK_MS = 2_000;
const USER_OPERATION_RECEIPT_POLL_MS = 3_000;
const ONCHAIN_RECOVERY_POLL_MS = 5_000;
const ONCHAIN_RECOVERY_BLOCKS = 2_000n;

// The proxy exposes only Alchemy's UserOperation/paymaster methods. Every
// ordinary eth_* read uses the separate ZeroDev-backed read client below.
const BUNDLER_PATH = "/api/alchemy-bundler";

export interface SponsoredCall {
  to: `0x${string}`;
  data?: `0x${string}`;
  value?: bigint;
}

// What a sponsored send comes back with. The logs are the operation's own,
// straight from the bundler's receipt, so a caller can read what the
// operation delivered without a balance read; null when the receipt never
// came and the hash was recovered from the EntryPoint event instead.
export interface SponsoredSendReceipt {
  transactionHash: `0x${string}`;
  logs: ReceiptLog[] | null;
}

export type SignAuthorization = (input: {
  contractAddress: `0x${string}`;
  chainId?: number;
  nonce?: number;
}) => Promise<SignedAuthorization<number>>;

type ReadRequest = (args: { method: string; params: unknown }) => Promise<unknown>;

export class SubmittedEvmOperationError extends Error {
  readonly code = "EVM_OPERATION_SUBMITTED";

  constructor(
    readonly userOperationHash: `0x${string}`,
    options?: { cause?: unknown }
  ) {
    super("The transaction was submitted but its on-chain receipt is not available yet.", options);
    this.name = "SubmittedEvmOperationError";
  }
}

export function isSubmittedEvmOperationError(error: unknown): error is SubmittedEvmOperationError {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return error.code === "EVM_OPERATION_SUBMITTED";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface EntryPointLog {
  transactionHash?: `0x${string}`;
}

async function recoverTransactionHash(
  request: ReadRequest,
  userOperationHash: `0x${string}`,
  fromBlock: string
): Promise<`0x${string}` | null> {
  const logs = (await request({
    method: "eth_getLogs",
    params: [
      {
        address: ENTRY_POINT_V08,
        fromBlock,
        toBlock: "latest",
        topics: [USER_OPERATION_EVENT_TOPIC, userOperationHash],
      },
    ],
  })) as EntryPointLog[];
  return logs.at(-1)?.transactionHash ?? null;
}

async function waitForOnchainRecovery(
  request: ReadRequest,
  userOperationHash: `0x${string}`
): Promise<`0x${string}` | null> {
  const deadline = Date.now() + ONCHAIN_RECOVERY_TIMEOUT_MS;
  let fromBlock: string | null = null;
  do {
    try {
      if (!fromBlock) {
        const latestHex = (await request({ method: "eth_blockNumber", params: [] })) as string;
        const latest = BigInt(latestHex);
        const from = latest > ONCHAIN_RECOVERY_BLOCKS ? latest - ONCHAIN_RECOVERY_BLOCKS : 0n;
        fromBlock = `0x${from.toString(16)}`;
      }
      const hash = await recoverTransactionHash(request, userOperationHash, fromBlock);
      if (hash) return hash;
    } catch {
      // A transient read-provider failure must not hide a transaction the
      // bundler already accepted. Keep polling within the bounded window.
    }
    await sleep(ONCHAIN_RECOVERY_POLL_MS);
  } while (Date.now() < deadline);
  return null;
}

// Sends from the user's embedded EOA through EIP-7702. ZeroDev handles the
// two state reads (delegation, once per wallet, and the account nonce);
// Alchemy fills gas and paymaster data in one call under the policy the proxy
// attaches (ADR-2026-09-09-one-call-sponsorship), then bundles the operation.
export interface SponsoredSendInput {
  chainId: number;
  address: `0x${string}`;
  provider: EIP1193Provider;
  signAuthorization: SignAuthorization;
  accessToken: string;
  calls: SponsoredCall[];
}

export async function sendSponsoredEvmCalls(input: SponsoredSendInput): Promise<`0x${string}`> {
  return (await sendSponsoredEvmCallsWithReceipt(input)).transactionHash;
}

export async function sendSponsoredEvmCallsWithReceipt({
  chainId,
  address,
  provider,
  signAuthorization,
  accessToken,
  calls,
}: SponsoredSendInput): Promise<SponsoredSendReceipt> {
  const target = getSponsoredEvmChainById(chainId);
  if (!target?.gasPolicy || !isReceiptChain(target.chainId)) {
    throw new Error(`This chain is not configured for sponsored EVM sends (${chainId}).`);
  }

  const bundlerTransport = http(`${BUNDLER_PATH}/${target.network}`, {
    fetchOptions: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const client = publicClientForChain(target.chainId);
  const read: ReadRequest = (args) =>
    (client.request as (input: { method: string; params: unknown }) => Promise<unknown>)(args);

  const account = await to7702SimpleSmartAccount({
    client,
    owner: provider,
    accountLogicAddress: SIMPLE_7702_IMPLEMENTATION,
  });

  // The delegation check and the nonce are independent reads; issued together
  // they travel in one JSON-RPC batch.
  const [delegated, nonce, callData] = await Promise.all([
    isDelegated(read, target.chainId, address),
    account.getNonce(),
    account.encodeCalls(calls),
  ]);

  // viem re-reads the code to decide whether the account needs deploying or
  // an authorization; the answer is already in hand.
  account.isDeployed = async () => delegated;

  let authorization: SignedAuthorization<number> | undefined;
  if (!delegated) {
    const authNonce = Number(
      (await read({ method: "eth_getTransactionCount", params: [address, "latest"] })) as string
    );
    authorization = await signAuthorization({
      contractAddress: SIMPLE_7702_IMPLEMENTATION,
      chainId: target.chainId,
      nonce: authNonce,
    });
  }

  const bundlerClient = createBundlerClient({
    account,
    client,
    chain: target.chain,
    transport: bundlerTransport,
  });
  const bundlerRequest: BundlerRequest = (args) =>
    (bundlerClient.request as (input: { method: string; params?: unknown[] }) => Promise<unknown>)(
      args
    );

  let hash: `0x${string}`;
  if (target.sponsorshipMode === "paymaster") {
    const sponsored = await requestGasAndPaymaster({
      request: bundlerRequest,
      entryPoint: ENTRY_POINT_V08,
      sender: address,
      nonce,
      callData,
      dummySignature: await account.getStubSignature(),
      authorization,
    });
    // Every field is filled, so viem signs and sends without estimating.
    hash = await bundlerClient.sendUserOperation({ calls, authorization, nonce, ...sponsored });
  } else {
    // Alchemy BSO fills these values under the policy attached by the server
    // proxy. No node read is sent through the bundler transport.
    hash = await bundlerClient.sendUserOperation({
      calls,
      authorization,
      nonce,
      maxFeePerGas: 0n,
      maxPriorityFeePerGas: 0n,
      preVerificationGas: 0n,
    });
  }

  try {
    const receipt = await waitForReceipt(bundlerClient, hash);
    if (authorization) rememberDelegated(target.chainId, address);
    return receipt;
  } catch (error) {
    // Alchemy can lag or a local route can be interrupted by a deployment/HMR
    // after accepting the user operation. The EntryPoint event is the source of
    // truth and contains both the operation hash and final transaction hash.
    const recovered = await waitForOnchainRecovery(read, hash);
    if (recovered) return { transactionHash: recovered, logs: null };
    throw new SubmittedEvmOperationError(hash, { cause: error });
  }
}

// The bundler cannot have a receipt before the next block, so the first look
// waits one Base block rather than asking at once, then asks every
// USER_OPERATION_RECEIPT_POLL_MS until the deadline.
async function waitForReceipt(
  bundlerClient: BundlerClient,
  hash: `0x${string}`
): Promise<SponsoredSendReceipt> {
  const deadline = Date.now() + USER_OPERATION_RECEIPT_TIMEOUT_MS;
  await sleep(USER_OPERATION_RECEIPT_FIRST_LOOK_MS);
  for (;;) {
    try {
      const receipt = await bundlerClient.getUserOperationReceipt({ hash });
      return { transactionHash: receipt.receipt.transactionHash, logs: receipt.logs };
    } catch (error) {
      if (!(error instanceof UserOperationReceiptNotFoundError)) throw error;
    }
    if (Date.now() >= deadline) {
      throw new WaitForUserOperationReceiptTimeoutError({ hash });
    }
    await sleep(USER_OPERATION_RECEIPT_POLL_MS);
  }
}
