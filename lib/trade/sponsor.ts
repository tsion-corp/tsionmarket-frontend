"use client";

import { http, type EIP1193Provider, type SignedAuthorization } from "viem";
import { createBundlerClient, createPaymasterClient } from "viem/account-abstraction";
import { to7702SimpleSmartAccount } from "permissionless/accounts";
import { getSponsoredEvmChainById } from "@/lib/trade/sponsored-evm";
import { isReceiptChain, publicClientForChain } from "@/lib/trade/receipt";

// The shared 7702 Simple Account implementation used by permissionless. The
// EOA delegates to this logic at the same address, so sponsorship does not
// create or migrate funds into a separate smart-wallet address.
const SIMPLE_7702_IMPL = "0xe6Cae83BdE06E4c305530e199D7217f42808555B" as const;
const ENTRY_POINT_V08 = "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108" as const;
const USER_OPERATION_EVENT_TOPIC =
  "0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f" as const;
const USER_OPERATION_RECEIPT_TIMEOUT_MS = 45_000;
const ONCHAIN_RECOVERY_TIMEOUT_MS = 30_000;
const USER_OPERATION_RECEIPT_POLL_MS = 4_000;
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

async function isAlreadyDelegated(request: ReadRequest, address: `0x${string}`): Promise<boolean> {
  const code = (await request({
    method: "eth_getCode",
    params: [address, "latest"],
  })) as string;
  return code.toLowerCase() === `0xef0100${SIMPLE_7702_IMPL.slice(2).toLowerCase()}`;
}

// Sends from the user's embedded EOA through EIP-7702. ZeroDev handles all
// state reads; Alchemy is used only for the bundler/paymaster operations whose
// policy is tied to the primary ALCHEMY_API_KEY account.
export async function sendSponsoredEvmCalls({
  chainId,
  address,
  provider,
  signAuthorization,
  accessToken,
  calls,
}: {
  chainId: number;
  address: `0x${string}`;
  provider: EIP1193Provider;
  signAuthorization: SignAuthorization;
  accessToken: string;
  calls: SponsoredCall[];
}): Promise<`0x${string}`> {
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

  let authorization: SignedAuthorization<number> | undefined;
  if (!(await isAlreadyDelegated(read, address))) {
    const nonce = Number(
      (await read({
        method: "eth_getTransactionCount",
        params: [address, "latest"],
      })) as string
    );
    authorization = await signAuthorization({
      contractAddress: SIMPLE_7702_IMPL,
      chainId: target.chainId,
      nonce,
    });
  }

  const account = await to7702SimpleSmartAccount({
    client,
    owner: provider,
    accountLogicAddress: SIMPLE_7702_IMPL,
  });

  const bundlerClient = createBundlerClient({
    account,
    client,
    chain: target.chain,
    transport: bundlerTransport,
    ...(target.sponsorshipMode === "paymaster"
      ? { paymaster: createPaymasterClient({ transport: bundlerTransport }) }
      : {}),
  });

  const hash = await bundlerClient.sendUserOperation(
    target.sponsorshipMode === "paymaster"
      ? { calls, authorization }
      : {
          calls,
          authorization,
          // Alchemy BSO fills these values under the policy attached by the
          // server proxy. No node read is sent through the bundler transport.
          maxFeePerGas: 0n,
          maxPriorityFeePerGas: 0n,
          preVerificationGas: 0n,
        }
  );

  try {
    const receipt = await bundlerClient.waitForUserOperationReceipt({
      hash,
      pollingInterval: USER_OPERATION_RECEIPT_POLL_MS,
      timeout: USER_OPERATION_RECEIPT_TIMEOUT_MS,
    });
    return receipt.receipt.transactionHash;
  } catch (error) {
    // Alchemy can lag or a local route can be interrupted by a deployment/HMR
    // after accepting the user operation. The EntryPoint event is the source of
    // truth and contains both the operation hash and final transaction hash.
    const recovered = await waitForOnchainRecovery(read, hash);
    if (recovered) return recovered;
    throw new SubmittedEvmOperationError(hash, { cause: error });
  }
}
