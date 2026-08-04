"use client";

import { createClient, http, type EIP1193Provider, type SignedAuthorization } from "viem";
import { createBundlerClient } from "viem/account-abstraction";
import { to7702SimpleSmartAccount } from "permissionless/accounts";
import { getSponsoredEvmChainById } from "@/lib/trade/sponsored-evm";
import { isReceiptChain, publicClientForChain } from "@/lib/trade/receipt";

// The shared 7702 Simple Account implementation used by permissionless. The
// EOA delegates to this logic at the same address, so sponsorship does not
// create or migrate funds into a separate smart-wallet address.
const SIMPLE_7702_IMPL = "0xe6Cae83BdE06E4c305530e199D7217f42808555B" as const;

// Every sponsored EVM transaction routes through our own proxy instead of
// Alchemy directly, so the API key and policy id never reach the client.
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

// A minimal "can serve node reads" shape — satisfied by both a public read
// client (mainnet.base.org node) and the bundler-proxy client. Typed as a bare
// callable so viem's method-union request signatures on either client widen to
// it; `params` is passed through untouched to the JSON-RPC layer.
type ReadRequest = (args: { method: string; params: unknown }) => Promise<unknown>;

async function isAlreadyDelegated(request: ReadRequest, address: `0x${string}`): Promise<boolean> {
  const code = (await request({
    method: "eth_getCode",
    params: [address, "latest"],
  })) as string;
  return code.toLowerCase() === `0xef0100${SIMPLE_7702_IMPL.slice(2).toLowerCase()}`;
}

// Sends a sponsored EVM transaction from the user's embedded EOA, upgraded in
// place via EIP-7702. The EOA signs the one-time delegation if needed, then
// the userOp, and Alchemy's bundler + paymaster path covers the gas cost.
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
  if (!target) {
    throw new Error(`This chain is not configured for sponsored EVM sends (${chainId}).`);
  }

  // Bundler transport: ONLY the ERC-4337 UserOperation methods
  // (eth_sendUserOperation, eth_estimateUserOperationGas, …) go here, through
  // our Alchemy proxy.
  const transport = http(`${BUNDLER_PATH}/${target.network}`, {
    fetchOptions: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  // Read client: ALL plain node reads (eth_getCode, eth_getTransactionCount, gas
  // reads) go to a real node RPC, NOT the Alchemy bundler endpoint. The bundler
  // endpoint is tuned for UserOperation methods; general state reads through it
  // are slow and intermittently time out — the `eth_getCode` the account builder
  // and delegation check issue on EVERY send was hanging there, which is what
  // failed createMarket (once per outcome in a multi-market event). This client
  // is what `to7702SimpleSmartAccount` and the bundler client use for reads;
  // only `sendUserOperation` uses the bundler transport. Chains without a
  // dedicated read node fall back to the bundler transport.
  const client = isReceiptChain(target.chainId)
    ? publicClientForChain(target.chainId)
    : createClient({ chain: target.chain, transport });

  const read: ReadRequest = (args) =>
    (client.request as (a: { method: string; params: unknown }) => Promise<unknown>)(args);

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

  // The bundler client reads through `client` (fast node) and submits the userOp
  // through `transport` (bundler proxy) — the split that keeps eth_getCode off
  // the bundler endpoint.
  const bundlerClient = createBundlerClient({ account, client, chain: target.chain, transport });

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
