"use client";

import { useMemo } from "react";
import { useSocialWallet } from "decane-connect-kit";
import type { EIP1193Provider } from "viem";
import {
  signL1Action,
  signUserSignedAction,
  type AbstractViemLocalAccount,
} from "@nktkas/hyperliquid/signing";
import {
  ApproveBuilderFeeTypes,
  SendAssetTypes,
  UserSetAbstractionTypes,
  Withdraw3Types,
} from "@nktkas/hyperliquid/api/exchange";
import type {
  HlApproveBuilderFeeAction,
  HlSendAssetAction,
  HlL1Action,
  HlSetAbstractionAction,
  HlSignature,
  HlWithdraw3Action,
} from "@/features/trade/lib/hyperliquid-types";

// Must match apps/perp's HYPERLIQUID_IS_TESTNET (see its .env.example) — a
// mismatch here makes every signature this frontend produces fail the
// backend's independent signer-recovery check (signing/hyperliquid-signature-verifier.ts),
// since testnet vs. mainnet selects a different byte in the signed payload.
const HYPERLIQUID_IS_TESTNET = process.env.NEXT_PUBLIC_HYPERLIQUID_IS_TESTNET === "true";

/**
 * Signs Hyperliquid actions with the user's own wallet, client-side, silently
 * (an embedded EVM provider signs an EIP-712 payload with no popup, same
 * mechanism `features/portfolio/hooks/use-kash-permit.ts` already uses for a
 * plain EIP-712 permit). There is no backend-held key anywhere in this flow —
 * the backend independently recovers the signer from what this returns and
 * rejects a mismatch (see apps/perp/src/signing/README.md).
 *
 * `@nktkas/hyperliquid`'s `signL1Action`/`signUserSignedAction` do the actual
 * msgpack + keccak256 hashing Hyperliquid's phantom-agent scheme requires —
 * hand-rolling that hash is exactly what Hyperliquid's own docs warn against,
 * so this wraps the SDK rather than reimplementing it.
 *
 * A factory rather than only a hook: the migration signs for the OLD account
 * with the legacy provider, outside any React tree that holds the current
 * session, and needs exactly the same signatures.
 */
// The EIP-712 domain type row eth_signTypedData_v4 requires. @nktkas passes
// viem-style typed data whose `types` omits EIP712Domain (viem injects it
// internally); the raw provider call does not, so we add it back when absent.
const EIP712_DOMAIN_TYPE = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

export interface HyperliquidSigner {
  signL1(action: HlL1Action, nonce: number): Promise<HlSignature>;
  signWithdrawal(action: HlWithdraw3Action): Promise<HlSignature>;
  signDexTransfer(action: HlSendAssetAction): Promise<HlSignature>;
  signBuilderFeeApproval(action: HlApproveBuilderFeeAction): Promise<HlSignature>;
  signSetAbstractionMode(action: HlSetAbstractionAction): Promise<HlSignature>;
}

type UserSignedAction = Record<string, unknown> & { signatureChainId: `0x${string}` };

export function createHyperliquidSigner({
  address,
  getEthereumProvider,
}: {
  address: string | undefined;
  /** The wallet's own EIP-1193 provider; sync or async, it is awaited. */
  getEthereumProvider: () => unknown;
}): HyperliquidSigner {
  // @nktkas's AbstractViemLocalAccount.signTypedData takes viem's
  // {domain, types, primaryType, message} shape. We sign that payload with
  // the wallet's own EIP-1193 provider via eth_signTypedData_v4 — the same
  // drop-to-provider pattern the sportsbook order signer uses.
  const wallet = (): AbstractViemLocalAccount => {
    if (!address) {
      throw new Error("Connect a wallet before signing this action.");
    }
    return {
      address: address as `0x${string}`,
      signTypedData: async (params) => {
        const p = params as unknown as {
          domain: Record<string, unknown>;
          types: Record<string, unknown>;
          primaryType: string;
          message: Record<string, unknown>;
        };
        const provider = (await getEthereumProvider()) as EIP1193Provider;
        const typedData = {
          domain: p.domain,
          types: p.types.EIP712Domain ? p.types : { EIP712Domain: EIP712_DOMAIN_TYPE, ...p.types },
          primaryType: p.primaryType,
          message: p.message,
        };
        return (await provider.request({
          method: "eth_signTypedData_v4",
          params: [address as `0x${string}`, JSON.stringify(typedData)],
        })) as `0x${string}`;
      },
    };
  };

  const userSigned =
    <A>(types: Parameters<typeof signUserSignedAction>[0]["types"]) =>
    async (action: A): Promise<HlSignature> =>
      signUserSignedAction({
        wallet: wallet(),
        action: action as unknown as UserSignedAction,
        types,
      });

  return {
    // Async so a missing address rejects rather than throwing mid-call.
    signL1: async (action, nonce) =>
      signL1Action({ wallet: wallet(), action, nonce, isTestnet: HYPERLIQUID_IS_TESTNET }),
    signWithdrawal: userSigned<HlWithdraw3Action>(Withdraw3Types),
    signDexTransfer: userSigned<HlSendAssetAction>(SendAssetTypes),
    signBuilderFeeApproval: userSigned<HlApproveBuilderFeeAction>(ApproveBuilderFeeTypes),
    signSetAbstractionMode: userSigned<HlSetAbstractionAction>(UserSetAbstractionTypes),
  };
}

/** The signer for the signed-in account's own embedded wallet. */
export function useHyperliquidSigner(address: string | undefined): HyperliquidSigner {
  const { getEthereumProvider } = useSocialWallet();
  return useMemo(
    () => createHyperliquidSigner({ address, getEthereumProvider }),
    [address, getEthereumProvider]
  );
}
