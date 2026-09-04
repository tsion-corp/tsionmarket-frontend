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

  const receipt = await bundlerClient.waitForUserOperationReceipt({ hash });
  return receipt.receipt.transactionHash;
}
