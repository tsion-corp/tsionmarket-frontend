"use client";

import { useCallback } from "react";
import { useSignTypedData, type SignTypedDataParams } from "@privy-io/react-auth";
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
 * silently (Privy's `showWalletUIs: false` — no popup, same mechanism
 * `features/portfolio/hooks/use-kash-permit.ts` already uses for a plain EIP-712
 * permit). There is no backend-held key anywhere in this flow — the backend
 * independently recovers the signer from what this hook returns and rejects a
 * mismatch (see apps/perp/src/signing/README.md).
 *
 * `@nktkas/hyperliquid`'s `signL1Action`/`signUserSignedAction` do the actual
 * msgpack + keccak256 hashing Hyperliquid's phantom-agent scheme requires —
 * hand-rolling that hash is exactly what Hyperliquid's own docs warn against,
 * so this wraps the SDK rather than reimplementing it, mirroring how the
 * backend used to sign before signing moved client-side.
 */
export function useHyperliquidSigner(address: string | undefined) {
  const { signTypedData } = useSignTypedData();

  // Privy's useSignTypedData() takes the exact same {domain, types, primaryType,
  // message} shape as viem's AbstractViemLocalAccount — this wallet is
  // literally the SDK's documented Privy integration point (see
  // AbstractViemLocalAccount's own doc comment in the SDK's source).
  const wallet = useCallback((): AbstractViemLocalAccount => {
    if (!address) {
      throw new Error("Connect a wallet before signing this action.");
    }
    return {
      address: address as `0x${string}`,
      // Both shapes are {domain, types, primaryType, message} at runtime;
      // the cast is only for a readonly-array variance mismatch between the
      // two packages' otherwise-identical type declarations.
      signTypedData: async (params) => {
        const { signature } = await signTypedData(params as unknown as SignTypedDataParams, {
          address,
        });
        return signature as `0x${string}`;
      },
    };
  }, [address, signTypedData]);

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
