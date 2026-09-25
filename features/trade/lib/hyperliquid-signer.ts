"use client";

import { useCallback } from "react";
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
 * Signs Hyperliquid actions with the user's own ARK embedded wallet, client-side,
 * silently (Decane's embedded EVM provider signs an EIP-712 payload with no
 * popup, same mechanism `features/portfolio/hooks/use-kash-permit.ts` already
 * uses for a plain EIP-712 permit). There is no backend-held key anywhere in
 * this flow — the backend
 * independently recovers the signer from what this hook returns and rejects a
 * mismatch (see apps/perp/src/signing/README.md).
 *
 * `@nktkas/hyperliquid`'s `signL1Action`/`signUserSignedAction` do the actual
 * msgpack + keccak256 hashing Hyperliquid's phantom-agent scheme requires —
 * hand-rolling that hash is exactly what Hyperliquid's own docs warn against,
 * so this wraps the SDK rather than reimplementing it, mirroring how the
 * backend used to sign before signing moved client-side.
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

export function useHyperliquidSigner(address: string | undefined) {
  const { getEthereumProvider } = useSocialWallet();

  // @nktkas's AbstractViemLocalAccount.signTypedData takes viem's
  // {domain, types, primaryType, message} shape. Decane replaces Privy's
  // useSignTypedData: we sign that payload with the embedded EVM wallet's own
  // EIP-1193 provider via eth_signTypedData_v4 — the same drop-to-provider
  // pattern the sportsbook order signer uses.
  const wallet = useCallback((): AbstractViemLocalAccount => {
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
        const provider = (await getEthereumProvider()) as unknown as EIP1193Provider;
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
  }, [address, getEthereumProvider]);

  const signL1 = useCallback(
    async (action: HlL1Action, nonce: number): Promise<HlSignature> => {
      return signL1Action({ wallet: wallet(), action, nonce, isTestnet: HYPERLIQUID_IS_TESTNET });
    },
    [wallet]
  );

  const signWithdrawal = useCallback(
    async (action: HlWithdraw3Action): Promise<HlSignature> => {
      // Same variance mismatch as above: HlWithdraw3Action has no explicit
      // index signature, which the SDK's generic constraint wants.
      return signUserSignedAction({
        wallet: wallet(),
        action: action as unknown as Record<string, unknown> & { signatureChainId: `0x${string}` },
        types: Withdraw3Types,
      });
    },
    [wallet]
  );

  const signDexTransfer = useCallback(
    async (action: HlSendAssetAction): Promise<HlSignature> => {
      return signUserSignedAction({
        wallet: wallet(),
        action: action as unknown as Record<string, unknown> & { signatureChainId: `0x${string}` },
        types: SendAssetTypes,
      });
    },
    [wallet]
  );

  const signBuilderFeeApproval = useCallback(
    async (action: HlApproveBuilderFeeAction): Promise<HlSignature> => {
      return signUserSignedAction({
        wallet: wallet(),
        action: action as unknown as Record<string, unknown> & { signatureChainId: `0x${string}` },
        types: ApproveBuilderFeeTypes,
      });
    },
    [wallet]
  );

  const signSetAbstractionMode = useCallback(
    async (action: HlSetAbstractionAction): Promise<HlSignature> => {
      return signUserSignedAction({
        wallet: wallet(),
        action: action as unknown as Record<string, unknown> & { signatureChainId: `0x${string}` },
        types: UserSetAbstractionTypes,
      });
    },
    [wallet]
  );

  return {
    signL1,
    signWithdrawal,
    signDexTransfer,
    signBuilderFeeApproval,
    signSetAbstractionMode,
  };
}
