"use client";

import { createClient, http, type EIP1193Provider, type SignedAuthorization } from "viem";
import { base } from "viem/chains";
import { createBundlerClient } from "viem/account-abstraction";
import { to7702SimpleSmartAccount } from "permissionless/accounts";

// Reference EIP-7702 "Simple Account" implementation. Deployed and verified on
// Base mainnet (checked via eth_getCode). Delegating an EOA's code to this
// address turns it into a sponsorable ERC-4337 account at the *same* address,
// so no separate smart-account address or balance migration is ever needed.
const SIMPLE_7702_IMPL = "0xe6Cae83BdE06E4c305530e199D7217f42808555B" as const;

// Every Base transaction in the sponsored flow routes through our own proxy
// (see app/api/base-bundler/route.ts) instead of Alchemy directly, so the API
// key and sponsorship policy id never reach the client.
const BUNDLER_PATH = "/api/base-bundler";

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

async function isAlreadyDelegated(
  client: ReturnType<typeof createClient>,
  address: `0x${string}`
): Promise<boolean> {
  const code = (await client.request({
    method: "eth_getCode",
    params: [address, "latest"],
  })) as string;
  return code.toLowerCase() === `0xef0100${SIMPLE_7702_IMPL.slice(2).toLowerCase()}`;
}

// Sends a sponsored Base transaction from the user's own embedded EOA, upgraded
// in place via EIP-7702 (same address, no balance migration). The EOA only
// signs the one-time delegation (skipped once already delegated) plus its
// normal userOp signature; the bundler covers every gas cost.
export async function sendSponsoredBaseCalls({
  address,
  provider,
  signAuthorization,
  accessToken,
  calls,
}: {
  address: `0x${string}`;
  provider: EIP1193Provider;
  signAuthorization: SignAuthorization;
  accessToken: string;
  calls: SponsoredCall[];
}): Promise<`0x${string}`> {
  const transport = http(BUNDLER_PATH, {
    fetchOptions: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const client = createClient({ chain: base, transport });

  let authorization: SignedAuthorization<number> | undefined;
  if (!(await isAlreadyDelegated(client, address))) {
    const nonce = Number(
      (await client.request({
        method: "eth_getTransactionCount",
        params: [address, "latest"],
      })) as string
    );
    authorization = await signAuthorization({
      contractAddress: SIMPLE_7702_IMPL,
      chainId: base.id,
      nonce,
    });
  }

  const account = await to7702SimpleSmartAccount({ client, owner: provider });

  const bundlerClient = createBundlerClient({ account, client, chain: base, transport });

  const hash = await bundlerClient.sendUserOperation({
    calls,
    authorization,
    // The bundler fills these in for a sponsored operation; a non-zero value
    // here is what Alchemy's bundler-level sponsorship rejects.
    maxFeePerGas: 0n,
    maxPriorityFeePerGas: 0n,
    preVerificationGas: 0n,
  });

  const receipt = await bundlerClient.waitForUserOperationReceipt({ hash });
  return receipt.receipt.transactionHash;
}
