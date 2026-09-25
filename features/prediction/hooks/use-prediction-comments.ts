"use client";

import { useCallback, useState } from "react";
import { useSocialWallet } from "decane-connect-kit";
import { useQueryClient } from "@tanstack/react-query";
import type { EIP1193Provider } from "viem";
import { likeComment, postComment } from "@/features/prediction/lib/api";
import { commentMessage, likeMessage } from "@/features/prediction/lib/comment-signing";
import { useAuthSession } from "@/hooks/use-auth-session";
import { ensureUnlocked } from "@/lib/decane";

// Signature-verified comment writes. The backend has no auth and holds no key,
// so the user's embedded wallet SIGNS a deterministic message (EIP-191
// personal_sign) proving authorship; the API recovers the signer and rejects a
// mismatch. This hook produces that signature and posts. No gas, no on-chain tx.

type Scope = { scope: "group" | "market"; scopeId: string };

async function personalSign(
  provider: EIP1193Provider,
  address: string,
  message: string
): Promise<string> {
  // EIP-191 personal_sign: params are [message, address]. viem's provider
  // request typing is broad; the Decane embedded wallet's provider supports it.
  return (await provider.request({
    method: "personal_sign",
    params: [message as `0x${string}`, address as `0x${string}`],
  })) as string;
}

export function usePredictionComments(target: Scope) {
  const { evmAddress: wallet } = useAuthSession();
  const socialWallet = useSocialWallet();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const getProvider = useCallback(async (): Promise<{
    provider: EIP1193Provider;
    address: string;
  }> => {
    if (!wallet) throw new Error("Connect a wallet to comment.");
    // personal_sign goes through the provider, so the session must be unlocked.
    await ensureUnlocked(socialWallet);
    const provider = socialWallet.getEthereumProvider() as unknown as EIP1193Provider;
    return { provider, address: wallet };
  }, [socialWallet, wallet]);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["prediction", "comments", target.scope, target.scopeId],
    });
  }, [queryClient, target.scope, target.scopeId]);

  const submit = useCallback(
    async (body: string, parentId?: string): Promise<void> => {
      const text = body.trim();
      if (!text) return;
      setBusy(true);
      try {
        const { provider, address } = await getProvider();
        const timestamp = Date.now();
        const message = commentMessage({
          scope: target.scope,
          scopeId: target.scopeId,
          body: text,
          timestamp,
        });
        const signature = await personalSign(provider, address, message);
        await postComment({
          scope: target.scope,
          scopeId: target.scopeId,
          body: text,
          wallet: address,
          signature,
          timestamp,
          parentId,
        });
        invalidate();
      } finally {
        setBusy(false);
      }
    },
    [getProvider, invalidate, target.scope, target.scopeId]
  );

  const like = useCallback(
    async (commentId: string): Promise<void> => {
      const { provider, address } = await getProvider();
      const timestamp = Date.now();
      const signature = await personalSign(provider, address, likeMessage(commentId, timestamp));
      await likeComment(commentId, { wallet: address, signature, timestamp });
      invalidate();
    },
    [getProvider, invalidate]
  );

  return { submit, like, busy, wallet, canComment: !!wallet };
}
