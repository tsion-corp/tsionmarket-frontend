"use client";

import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePrivy, useSignMessage } from "@privy-io/react-auth";
import {
  useSignMessage as useSolanaSignMessage,
  useWallets as useSolanaWallets,
} from "@privy-io/react-auth/solana";
import { useEvmSendWithReceipt } from "@/hooks/use-evm-send";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useSponsoredSolanaSend } from "@/hooks/use-sponsored-solana";
import { formatReceived, receivedFromLogs, type ReceiptLog } from "@/lib/meme/delivery";
import { getWalletAddress } from "@/lib/user";
import {
  TradeApiError,
  createSolanaWalletChallenge,
  createWalletChallenge,
  fetchSwapStatus,
  newIdempotencyKey,
  previewSwap,
  quoteSolanaSwap,
  quoteSwap,
  registerSolanaSubmission,
  registerSubmission,
  verifySolanaWallet,
  verifyWallet,
  type PreparedSwap,
  type SwapRequest,
  type SwapStatus,
} from "@/lib/meme/api";
import { SOLANA_CHAIN_ID, networkOf } from "@/lib/meme/chain";
import { signatureToBase58 } from "@/lib/meme/solana-signature";
import { track } from "@/lib/analytics/mixpanel";

// One trade at a time, with the states the contract demands kept explicit.
// Only the backend's CONFIRMED ever reads as success.
//
// Two chains, one state machine. The token's chainId picks the wallet, the
// wallet-link flow and the execution path: Base runs the quote's ordered EVM
// calls through the sponsored bundler; Solana hands the quote's one unsigned
// transaction to the gas sponsor. Both end at the same status poll.

export interface MemeTradeInput extends Omit<SwapRequest, "walletAddress"> {
  chainId: number;
}

export interface MemePreviewInput extends SwapRequest {
  chainId: number;
}
export type TradePhase =
  "idle" | "linking" | "quoting" | "signing" | "confirming" | "confirmed" | "failed";

const LINKED_KEY = "wsws.meme-linked.v1";
// The service's verification usually lands within a few seconds of the
// receipt: look early, then back off so a slow one is not asked every four
// seconds for as long as it takes.
const STATUS_POLL_STEPS_MS = [2_000, 3_000, 5_000, 8_000] as const;
const TERMINAL: SwapStatus[] = ["CONFIRMED", "FAILED", "REVERTED", "EXPIRED", "CANCELLED"];

function statusPollDelay(attempt: number): number {
  return STATUS_POLL_STEPS_MS[Math.min(attempt, STATUS_POLL_STEPS_MS.length - 1)];
}

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
  const { signMessage: signSolanaMessage } = useSolanaSignMessage();
  const { wallets: solanaWallets } = useSolanaWallets();
  const evmSend = useEvmSendWithReceipt();
  const { applyReceipt } = usePortfolio();
  const sendSponsoredSolana = useSponsoredSolanaSend();
  const wallet = getWalletAddress(user, "ethereum");
  const solanaWallet = getWalletAddress(user, "solana");

  const walletFor = useCallback(
    (chainId: number): string | null => (chainId === SOLANA_CHAIN_ID ? solanaWallet : wallet),
    [wallet, solanaWallet]
  );

  const [phase, setPhase] = useState<TradePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [swapId, setSwapId] = useState<string | null>(null);
  // The on-chain verified delivery ("142,244.11 FART"), set the moment the
  // balanceOf delta confirms it — usually minutes before the server does.
  const [received, setReceived] = useState<{ amount: string; symbol: string } | null>(null);
  // What the confirmation needs to offer a share: the settled transaction and
  // the chain it settled on.
  const [settled, setSettled] = useState<{ txHash: string; chainId: number } | null>(null);
  const activeRef = useRef(false);

  // Challenge → exact-message signature → verify, cached per (user, wallet) so
  // repeat trades skip the signature. The backend stays authoritative: an
  // ownership mismatch clears the cache and relinks once.
  const ensureLinked = useCallback(
    async (chainId: number) => {
      if (!user) throw new Error("Sign in first.");
      if (chainId === SOLANA_CHAIN_ID) {
        // The Solana sibling: the same challenge shape, signed as raw bytes
        // by the embedded Solana wallet, and sent back as base58. The address
        // is never lowercased, on the wire or in the cache key.
        if (!solanaWallet) throw new Error("Sign in first.");
        const key = `${user.id}:solana:${solanaWallet}`;
        if (linkedCache().has(key)) return;
        const signer = solanaWallets.find((w) => w.address === solanaWallet);
        if (!signer) throw new Error("Your Solana wallet is still connecting. Try again.");
        setPhase("linking");
        const challenge = await createSolanaWalletChallenge(solanaWallet);
        const { signature } = await signSolanaMessage({
          message: new TextEncoder().encode(challenge.message),
          wallet: signer,
        });
        await verifySolanaWallet(challenge.challengeId, signatureToBase58(signature));
        markLinked(key);
        return;
      }
      if (!wallet) throw new Error("Sign in first.");
      const key = `${user.id}:${wallet.toLowerCase()}`;
      if (linkedCache().has(key)) return;
      setPhase("linking");
      const challenge = await createWalletChallenge(wallet);
      const { signature } = await signMessage({ message: challenge.message }, { address: wallet });
      await verifyWallet(challenge.challengeId, signature);
      markLinked(key);
    },
    [wallet, solanaWallet, solanaWallets, user, signMessage, signSolanaMessage]
  );

  // Standalone linking for the preview path: the backend requires the wallet
  // to be linked before /swaps/preview too, so a never-linked wallet 403s on
  // its very first preview. Runs the same flow, then returns the trade to
  // idle so the form comes back.
  const linkForPreview = useCallback(
    async (chainId: number) => {
      try {
        await ensureLinked(chainId);
        setPhase("idle");
      } catch (e) {
        setPhase("failed");
        setError(e instanceof Error ? e.message : "Couldn't verify your wallet.");
        throw e;
      }
    },
    [ensureLinked]
  );

  // Solana: quote -> sponsor (prepare, user signs, sponsor submits) -> register
  // the signature. The quote is one transaction, so there is nothing to
  // execute in order and no balance-delta proof yet; CONFIRMED is the word.
  const tradeSolana = useCallback(
    async (body: SwapRequest): Promise<void> => {
      const signer = solanaWallets.find((w) => w.address === body.walletAddress);
      if (!signer) throw new Error("Your Solana wallet is still connecting. Try again.");
      const runQuote = () => quoteSolanaSwap(body, newIdempotencyKey());

      await ensureLinked(SOLANA_CHAIN_ID);
      setPhase("quoting");
      let quote;
      try {
        quote = await runQuote();
      } catch (e) {
        if (e instanceof TradeApiError && e.code === "WALLET_OWNERSHIP_MISMATCH" && user) {
          try {
            window.localStorage.removeItem(LINKED_KEY);
          } catch {
            /* cache only */
          }
          await ensureLinked(SOLANA_CHAIN_ID);
          setPhase("quoting");
          quote = await runQuote();
        } else {
          throw e;
        }
      }
      setSwapId(quote.swapId);

      if (Date.now() >= Date.parse(quote.expiresAt)) {
        throw new TradeApiError("QUOTE_EXPIRED", "The quote expired. Try again.", 410);
      }
      setPhase("signing");
      // The sponsor reseats itself as fee payer BEFORE the user signs, and
      // nothing touches the transaction after; that order is the contract.
      const signature = await sendSponsoredSolana({
        transaction: quote.unsignedTransactionBase64,
        wallet: signer,
        prefundRent: false,
      });
      await registerSolanaSubmission(quote.swapId, body.walletAddress, signature);
      setSettled({ txHash: signature, chainId: SOLANA_CHAIN_ID });

      setPhase("confirming");
      for (let attempt = 0; ; attempt += 1) {
        const status = await fetchSwapStatus(quote.swapId);
        if (TERMINAL.includes(status.status)) {
          if (status.status === "CONFIRMED") {
            setPhase("confirmed");
            return;
          }
          throw new TradeApiError(status.status, "The trade didn't complete.", 200);
        }
        await new Promise((resolve) => setTimeout(resolve, statusPollDelay(attempt)));
      }
    },
    [solanaWallets, ensureLinked, user, sendSponsoredSolana]
  );

  const trade = useCallback(
    async ({ chainId, ...input }: MemeTradeInput): Promise<void> => {
      if (activeRef.current) return;
      const chainWallet = walletFor(chainId);
      if (!chainWallet) throw new Error("Sign in first.");
      activeRef.current = true;
      setError(null);
      setSwapId(null);
      setReceived(null);
      try {
        if (chainId === SOLANA_CHAIN_ID) {
          await tradeSolana({ ...input, walletAddress: chainWallet });
          return;
        }
        const wallet = chainWallet;
        const body: SwapRequest = { ...input, walletAddress: wallet };
        const runQuote = () => quoteSwap(body, newIdempotencyKey());

        await ensureLinked(chainId);
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
            await ensureLinked(chainId);
            setPhase("quoting");
            quote = await runQuote();
          } else {
            throw e;
          }
        }
        setSwapId(quote.swapId);

        const receivedToken = quote.buyToken.address as `0x${string}`;
        // Execute every prepared call in order, exactly as returned: one
        // sponsored send per call (never batched — the backend verifies one
        // hash per callIndex), each hash registered before the next call.
        setPhase("signing");
        let settledHash: string | null = null;
        let receivedLogs: ReceiptLog[] | null = null;
        let registrationRefused: TradeApiError | null = null;
        for (let callIndex = 0; callIndex < quote.calls.length; callIndex += 1) {
          if (Date.now() >= Date.parse(quote.expiresAt)) {
            throw new TradeApiError("QUOTE_EXPIRED", "The quote expired. Try again.", 410);
          }
          const call = quote.calls[callIndex];
          // useEvmSend resolves after the sponsored operation's receipt, so an
          // approval is confirmed before the swap call is sent.
          const { hash, logs } = await evmSend({
            to: call.to as `0x${string}`,
            data: call.data as `0x${string}`,
            value: BigInt(call.value),
            chainId: quote.chainId,
          });
          receivedLogs = logs;
          // The balance on screen moves with the receipt, before any re-read.
          if (logs) applyReceipt(networkOf(quote.chainId) ?? "base-mainnet", wallet, logs);
          // The call has executed by the time it is registered (evmSend
          // resolved on its receipt). A 409 here means the service will not
          // record it, usually because it has already marked the swap FAILED
          // after failing its own transaction-target check on the sponsored
          // user operation. That is a recording refusal, not a failed trade:
          // the remaining calls still run and the balance delta below decides
          // the outcome, exactly as for a FAILED status. Any other error is
          // still an error.
          try {
            await registerSubmission(quote.swapId, callIndex, wallet, hash, newIdempotencyKey());
          } catch (e) {
            if (!(e instanceof TradeApiError && e.status === 409)) throw e;
            registrationRefused = e;
            console.warn(
              `[meme] swap ${quote.swapId} call ${callIndex} not recorded: ${e.message}`
            );
          }
          // The last call IS the swap; anything before it is an approval, so
          // this ends up holding the hash worth pointing a share at.
          settledHash = hash;
          setSettled({ txHash: hash, chainId: quote.chainId });
        }

        // The swap's receipt is in hand, and its own logs say what the wallet
        // was paid: proof of delivery with no balance read, while the
        // server's formal verification finishes in the background.
        const received = receivedFromLogs(receivedLogs, receivedToken, wallet as `0x${string}`);
        const delivered = received !== null && received > 0n;
        if (delivered) {
          setReceived({
            amount: formatReceived(received, quote.buyToken.decimals ?? 18),
            symbol: quote.buyToken.symbol ?? "",
          });
        }

        // A refused registration means the service already holds a terminal
        // verdict for this swap; polling would only repeat it. Decide on the
        // wallet's balance now, the way a FAILED status is decided below.
        if (registrationRefused) {
          if (!delivered) throw registrationRefused;
          console.warn(
            `[meme] swap ${quote.swapId} delivered on-chain (${settledHash}) but the trade service refused its registration`
          );
          track("trade_recording_mismatch", {
            vertical: "memecoin",
            asset: quote.sellToken.symbol ?? quote.sellToken.address,
            swap_id: quote.swapId,
            recorded: registrationRefused.code,
          });
          setPhase("confirmed");
          return;
        }

        // The backend worker verifies on-chain; poll until it says so.
        setPhase("confirming");
        for (let attempt = 0; ; attempt += 1) {
          const status = await fetchSwapStatus(quote.swapId);
          if (TERMINAL.includes(status.status)) {
            if (status.status === "CONFIRMED") {
              setPhase("confirmed");
              return;
            }
            // The wallet's balance moved: the trade happened, whatever the
            // service recorded. Its verifier compares a sponsored user
            // operation's bundle transaction with the prepared call and
            // fails, which is a recording fault, not a failed trade. Telling
            // the user their money did not move when it did is the one thing
            // this screen must never do. The discrepancy is logged for the
            // trade team instead.
            if (delivered) {
              console.warn(
                `[meme] swap ${quote.swapId} delivered on-chain (${settledHash}) but the trade service recorded ${status.status}`
              );
              track("trade_recording_mismatch", {
                vertical: "memecoin",
                asset: quote.sellToken.symbol ?? quote.sellToken.address,
                swap_id: quote.swapId,
                recorded: status.status,
              });
              setPhase("confirmed");
              return;
            }
            throw new TradeApiError(status.status, "The trade didn't complete.", 200);
          }
          await new Promise((resolve) => setTimeout(resolve, statusPollDelay(attempt)));
        }
      } catch (e) {
        setPhase("failed");
        setError(e instanceof Error ? e.message : "The trade didn't complete.");
        throw e;
      } finally {
        activeRef.current = false;
      }
    },
    [walletFor, user, ensureLinked, evmSend, applyReceipt, tradeSolana]
  );

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
    setSwapId(null);
    setReceived(null);
    // Or the next trade offers to share the previous one.
    setSettled(null);
  }, []);

  return {
    wallet,
    walletFor,
    phase,
    error,
    swapId,
    received,
    settled,
    trade,
    reset,
    linkForPreview,
  };
}

// Debounced-by-caller indicative preview; rate limited upstream (20/min).
export function useMemePreview(input: MemePreviewInput | null) {
  return useQuery({
    queryKey: ["meme", "preview", input],
    queryFn: () => {
      const { chainId, ...body } = input as MemePreviewInput;
      return previewSwap(body, chainId);
    },
    enabled: input !== null,
    staleTime: 4_000,
    retry: (count, err) => err instanceof Error && err.message.includes("retrying") && count < 3,
  });
}
