"use client";

import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePrivy, useSignMessage } from "@privy-io/react-auth";
import { useEvmSend } from "@/hooks/use-evm-send";
import { readBaseTokenBalance } from "@/hooks/use-base-block";
import { getWalletAddress } from "@/lib/user";
import {
  TradeApiError,
  createWalletChallenge,
  fetchSwapStatus,
  newIdempotencyKey,
  previewSwap,
  quoteSwap,
  registerSubmission,
  verifyWallet,
  type PreparedSwap,
  type SwapRequest,
  type SwapStatus,
} from "@/lib/meme/api";

// One trade at a time, with the states the contract demands kept explicit.
// Only the backend's CONFIRMED ever reads as success.
export type TradePhase =
  "idle" | "linking" | "quoting" | "signing" | "confirming" | "confirmed" | "failed";

const LINKED_KEY = "wsws.meme-linked.v1";
const STATUS_POLL_MS = 4_000;
const TERMINAL: SwapStatus[] = ["CONFIRMED", "FAILED", "REVERTED", "EXPIRED", "CANCELLED"];

function linkedCache(): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(LINKED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function markLinked(key: string) {
  try {
    const set = linkedCache();
    set.add(key);
    window.localStorage.setItem(LINKED_KEY, JSON.stringify([...set]));
  } catch {
    // Losing the hint only means one extra signature next time.
  }
}

export function useMemeTrade() {
  const { user } = usePrivy();
  const { signMessage } = useSignMessage();
  const evmSend = useEvmSend();
  const wallet = getWalletAddress(user, "ethereum");

  const [phase, setPhase] = useState<TradePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [swapId, setSwapId] = useState<string | null>(null);
  // The on-chain verified delivery ("142,244.11 FART"), set the moment the
  // balanceOf delta confirms it — usually minutes before the server does.
  const [received, setReceived] = useState<{ amount: string; symbol: string } | null>(null);
  const activeRef = useRef(false);

  // Challenge → exact-message signature → verify, cached per (user, wallet) so
  // repeat trades skip the signature. The backend stays authoritative: an
  // ownership mismatch clears the cache and relinks once.
  const ensureLinked = useCallback(async () => {
    if (!wallet || !user) throw new Error("Sign in first.");
    const key = `${user.id}:${wallet.toLowerCase()}`;
    if (linkedCache().has(key)) return;
    setPhase("linking");
    const challenge = await createWalletChallenge(wallet);
    const { signature } = await signMessage({ message: challenge.message }, { address: wallet });
    await verifyWallet(challenge.challengeId, signature);
    markLinked(key);
  }, [wallet, user, signMessage]);

  // Standalone linking for the preview path: the backend requires the wallet
  // to be linked before /swaps/preview too, so a never-linked wallet 403s on
  // its very first preview. Runs the same flow, then returns the trade to
  // idle so the form comes back.
  const linkForPreview = useCallback(async () => {
    try {
      await ensureLinked();
      setPhase("idle");
    } catch (e) {
      setPhase("failed");
      setError(e instanceof Error ? e.message : "Couldn't verify your wallet.");
      throw e;
    }
  }, [ensureLinked]);

  const trade = useCallback(
    async (input: Omit<SwapRequest, "walletAddress">): Promise<void> => {
      if (activeRef.current) return;
      if (!wallet) throw new Error("Sign in first.");
      activeRef.current = true;
      setError(null);
      setSwapId(null);
      setReceived(null);
      try {
        const body: SwapRequest = { ...input, walletAddress: wallet };
        const runQuote = () => quoteSwap(body, newIdempotencyKey());

        await ensureLinked();
        setPhase("quoting");
        let quote: PreparedSwap;
        try {
          quote = await runQuote();
        } catch (e) {
          // A stale linked-cache entry: relink once, then quote again.
          if (e instanceof TradeApiError && e.code === "WALLET_OWNERSHIP_MISMATCH" && user) {
            try {
              window.localStorage.removeItem(LINKED_KEY);
            } catch {
              /* cache only */
            }
            await ensureLinked();
            setPhase("quoting");
            quote = await runQuote();
          } else {
            throw e;
          }
        }
        setSwapId(quote.swapId);

        // Snapshot the received asset's balance so delivery can be verified
        // on-chain the moment the swap's receipt lands, independent of the
        // server's slower attestation.
        const receivedToken = quote.buyToken.address as `0x${string}`;
        const balanceBefore = await readBaseTokenBalance(
          receivedToken,
          wallet as `0x${string}`
        ).catch(() => null);

        // Execute every prepared call in order, exactly as returned: one
        // sponsored send per call (never batched — the backend verifies one
        // hash per callIndex), each hash registered before the next call.
        setPhase("signing");
        for (let callIndex = 0; callIndex < quote.calls.length; callIndex += 1) {
          if (Date.now() >= Date.parse(quote.expiresAt)) {
            throw new TradeApiError("QUOTE_EXPIRED", "The quote expired. Try again.", 410);
          }
          const call = quote.calls[callIndex];
          // useEvmSend resolves after the sponsored operation's receipt, so an
          // approval is confirmed before the swap call is sent.
          const hash = await evmSend({
            to: call.to as `0x${string}`,
            data: call.data as `0x${string}`,
            value: BigInt(call.value),
            chainId: quote.chainId,
          });
          await registerSubmission(quote.swapId, callIndex, wallet, hash, newIdempotencyKey());
        }

        // The swap's receipt is in, so the tokens should already sit in the
        // wallet — prove it with a balanceOf delta and say so, while the
        // server's formal verification finishes in the background.
        if (balanceBefore !== null) {
          const balanceAfter = await readBaseTokenBalance(
            receivedToken,
            wallet as `0x${string}`
          ).catch(() => null);
          if (balanceAfter !== null && balanceAfter > balanceBefore) {
            const decimals = quote.buyToken.decimals ?? 18;
            const delta = balanceAfter - balanceBefore;
            const whole = delta / 10n ** BigInt(decimals);
            const frac = delta % 10n ** BigInt(decimals);
            const fracStr = frac.toString().padStart(decimals, "0").slice(0, 4).replace(/0+$/, "");
            setReceived({
              amount: `${whole.toLocaleString()}${fracStr ? `.${fracStr}` : ""}`,
              symbol: quote.buyToken.symbol ?? "",
            });
          }
        }

        // The backend worker verifies on-chain; poll until it says so.
        setPhase("confirming");
        for (;;) {
          const status = await fetchSwapStatus(quote.swapId);
          if (TERMINAL.includes(status.status)) {
            if (status.status === "CONFIRMED") {
              setPhase("confirmed");
              return;
            }
            throw new TradeApiError(status.status, "The trade didn't complete.", 200);
          }
          await new Promise((resolve) => setTimeout(resolve, STATUS_POLL_MS));
        }
      } catch (e) {
        setPhase("failed");
        setError(e instanceof Error ? e.message : "The trade didn't complete.");
        throw e;
      } finally {
        activeRef.current = false;
      }
    },
    [wallet, user, ensureLinked, evmSend]
  );

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
    setSwapId(null);
    setReceived(null);
  }, []);

  return { wallet, phase, error, swapId, received, trade, reset, linkForPreview };
}

// Debounced-by-caller indicative preview; rate limited upstream (20/min).
export function useMemePreview(input: SwapRequest | null) {
  return useQuery({
    queryKey: ["meme", "preview", input],
    queryFn: () => previewSwap(input as SwapRequest),
    enabled: input !== null,
    staleTime: 4_000,
    retry: (count, err) => err instanceof Error && err.message.includes("retrying") && count < 3,
  });
}
