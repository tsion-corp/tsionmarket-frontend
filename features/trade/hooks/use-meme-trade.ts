"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy, useSignMessage, useWallets } from "@privy-io/react-auth";
import {
  useSignMessage as useSolanaSignMessage,
  useWallets as useSolanaWallets,
} from "@privy-io/react-auth/solana";
import { useEvmSendWithReceipt } from "@/hooks/use-evm-send";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useSponsoredSolanaSend } from "@/hooks/use-sponsored-solana";
import { formatReceived, receivedFromLogs, type ReceiptLog } from "@/lib/meme/delivery";
import { formatUsdcAtomic } from "@/lib/meme/format";
import { memePortfolioKeys } from "@/lib/meme/portfolio";
import { isSubmittedEvmOperationError } from "@/lib/trade/sponsor";
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
  type SubmissionHash,
  type SwapRequest,
  type SwapStatus,
} from "@/lib/meme/api";
import { SOLANA_CHAIN_ID, networkOf } from "@/lib/meme/chain";
import { signatureToBase58 } from "@/lib/meme/solana-signature";
import { track } from "@/lib/analytics/mixpanel";
import { reportTradeRecordingMismatch } from "@/lib/analytics/watchtower";

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

// The three ways a trade ends without failing, and they are not one thing:
//
//  - `confirmed`: the trade service said CONFIRMED. The only success there is.
//  - `delivered`: the swap's own receipt proves the wallet was paid, but the
//    service recorded FAILED/REVERTED or refused the registration (409). The
//    money moved; the ledger has not caught up. The user is told exactly
//    that, never "bought" or "sold", and the trade team is told too.
//  - `pending`: the status poll ran to its ceiling without a terminal state.
//    Nothing is claimed either way; the swap stays in the transactions list.
export type TradeOutcome = "confirmed" | "delivered" | "pending";

// What `trade()` resolves with. The ids ride along because the caller's
// closure holds the render-time state, which is stale by the time the await
// returns, and the toast it shows next needs the reference.
export interface TradeResult {
  outcome: TradeOutcome;
  swapId: string | null;
  requestId: string | null;
}

// The support reference for a delivered or pending trade, as shown on screen:
// the swap the service knows, and its request id when a response carried one.
export function tradeRef(swapId: string | null, requestId: string | null): string {
  return [swapId, requestId].filter((id): id is string => Boolean(id)).join(" · ") || "—";
}

// The toast a desk shows once `trade()` resolves, from the `meme` namespace.
// Shared by every surface that runs a Base trade inline so none of them can
// drift back to saying "bought" on a trade the service has not confirmed.
export function memeOutcomeToast(
  t: (key: string, values?: Record<string, string>) => string,
  result: TradeResult,
  side: "BUY" | "SELL",
  symbol: string
): string {
  if (result.outcome === "delivered" || result.outcome === "pending") {
    const ref = tradeRef(result.swapId, result.requestId);
    return result.outcome === "delivered"
      ? t("toastDelivered", { symbol, ref })
      : t("toastPending", { symbol, ref });
  }
  return side === "BUY" ? t("toastBought", { symbol }) : t("toastSold", { symbol });
}

export type TradePhase =
  | "idle"
  | "linking"
  | "quoting"
  | "signing"
  | "confirming"
  | "confirmed"
  | "delivered"
  | "pending"
  | "failed";

const LINKED_KEY = "wsws.meme-linked.v1";
// The service's verification usually lands within a few seconds of the
// receipt: look early, then back off so a slow one is not asked every four
// seconds for as long as it takes.
const STATUS_POLL_STEPS_MS = [2_000, 3_000, 5_000, 8_000] as const;
// How long the poll waits for a terminal state before the trade is `pending`.
// Ten minutes is far past any verification the service has been seen to
// finish, and a poll with no end holds a sheet shut for as long as it runs.
const STATUS_POLL_CEILING_MS = 10 * 60_000;
// The contract's one sanctioned same-key retry: a provider failure while
// quoting is retried once, unchanged, after a short pause.
const QUOTE_PROVIDER_RETRY_MS = 1_500;
const TERMINAL: SwapStatus[] = ["CONFIRMED", "FAILED", "REVERTED", "EXPIRED", "CANCELLED"];

function statusPollDelay(attempt: number): number {
  return STATUS_POLL_STEPS_MS[Math.min(attempt, STATUS_POLL_STEPS_MS.length - 1)];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Polls the shared status route until a terminal state or the ceiling.
// Returns the terminal status, or null when the ceiling was reached first.
async function awaitTerminalStatus(swapId: string): Promise<SwapStatus | null> {
  const startedAt = Date.now();
  for (let attempt = 0; ; attempt += 1) {
    const status = await fetchSwapStatus(swapId);
    if (TERMINAL.includes(status.status)) return status.status;
    if (Date.now() - startedAt >= STATUS_POLL_CEILING_MS) return null;
    await sleep(statusPollDelay(attempt));
  }
}

// One quote request under one Idempotency-Key. QUOTE_PROVIDER_ERROR is the
// only failure the contract says to retry with the SAME key ("retry
// carefully"): once, after a pause. Every other failure is thrown as it is,
// and any later attempt is a new user action with a new key.
async function quoteWithProviderRetry<T>(run: (idempotencyKey: string) => Promise<T>): Promise<T> {
  const key = newIdempotencyKey();
  try {
    return await run(key);
  } catch (e) {
    if (!(e instanceof TradeApiError && e.code === "QUOTE_PROVIDER_ERROR")) throw e;
    console.warn(`[meme] quote provider error (request ${e.requestId ?? "none"}); retrying once`);
    await sleep(QUOTE_PROVIDER_RETRY_MS);
    return run(key);
  }
}

function linkedCache(): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(LINKED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

// Drops one wallet's hint, never the whole set: the other chain's wallet is
// linked independently and must not be charged a second signature for this
// chain's failure.
function forgetLinked(key: string) {
  try {
    const set = linkedCache();
    set.delete(key);
    window.localStorage.setItem(LINKED_KEY, JSON.stringify([...set]));
  } catch {
    // Storage can be blocked; the hint is only an optimisation.
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
  const { wallets: evmWallets } = useWallets();
  const { signMessage: signSolanaMessage } = useSolanaSignMessage();
  const { wallets: solanaWallets } = useSolanaWallets();
  const evmSend = useEvmSendWithReceipt();
  const { applyReceipt } = usePortfolio();
  const sendSponsoredSolana = useSponsoredSolanaSend();
  const queryClient = useQueryClient();
  const wallet = getWalletAddress(user, "ethereum");
  const solanaWallet = getWalletAddress(user, "solana");

  const walletFor = useCallback(
    (chainId: number): string | null => (chainId === SOLANA_CHAIN_ID ? solanaWallet : wallet),
    [wallet, solanaWallet]
  );

  const [phase, setPhase] = useState<TradePhase>("idle");
  // The failure as thrown, not flattened to text: the screen maps its code to
  // copy in the reader's language and shows its requestId as the reference.
  const [error, setError] = useState<unknown>(null);
  const [swapId, setSwapId] = useState<string | null>(null);
  // The service's request id behind a `delivered` verdict (the 409's), for
  // the "still recording (ref …)" line. Null when the verdict came from a
  // status poll, whose success envelope carries none.
  const [requestId, setRequestId] = useState<string | null>(null);
  // The on-chain verified delivery ("142,244.11 FART"), set the moment the
  // balanceOf delta confirms it — usually minutes before the server does.
  const [received, setReceived] = useState<{ amount: string; symbol: string } | null>(null);
  // What the confirmation needs to offer a share: the settled transaction and
  // the chain it settled on.
  const [settled, setSettled] = useState<{ txHash: string; chainId: number } | null>(null);
  // The platform fee the executable quote states, in USDC, once that quote is
  // in hand. Only the Solana quote carries one (the Base quote names no fee;
  // its preview does). Null until then, and null when the quote states none.
  const [quotedFee, setQuotedFee] = useState<string | null>(null);
  const activeRef = useRef(false);

  // The service's portfolio is built from CONFIRMED swaps only, so the moment
  // one is confirmed its summary, positions, detail and activity are all out
  // of date, and they share one key prefix. A delivered or pending trade has
  // changed nothing there yet and refreshes nothing. The refetch runs in the
  // background; its failures land on those queries, not on this trade.
  const refreshServicePortfolio = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: memePortfolioKeys.all });
  }, [queryClient]);

  // Challenge → exact-message signature → verify, cached per (user, wallet) so
  // repeat trades skip the signature. The backend stays authoritative: an
  // ownership mismatch clears the cache and relinks once.
  const ensureLinked = useCallback(
    async (chainId: number, { force = false }: { force?: boolean } = {}) => {
      if (!user) throw new Error("Sign in first.");
      if (chainId === SOLANA_CHAIN_ID) {
        // The Solana sibling: the same challenge shape, signed as raw bytes
        // by the embedded Solana wallet, and sent back as base58. The address
        // is never lowercased, on the wire or in the cache key.
        if (!solanaWallet) throw new Error("Sign in first.");
        const key = `${user.id}:solana:${solanaWallet}`;
        if (force) forgetLinked(key);
        else if (linkedCache().has(key)) return;
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
      // The address is known before the signer for it is up, so check the
      // signer exists rather than spending a challenge it cannot sign.
      const signer = evmWallets.find((w) => w.walletClientType === "privy");
      if (!signer) throw new Error("Your wallet is still connecting. Try again.");
      const key = `${user.id}:${wallet.toLowerCase()}`;
      if (force) forgetLinked(key);
      else if (linkedCache().has(key)) return;
      setPhase("linking");
      const challenge = await createWalletChallenge(wallet);
      const { signature } = await signMessage({ message: challenge.message }, { address: wallet });
      await verifyWallet(challenge.challengeId, signature);
      markLinked(key);
    },
    [wallet, solanaWallet, solanaWallets, evmWallets, user, signMessage, signSolanaMessage]
  );

  // Standalone linking for the preview path: the backend requires the wallet
  // to be linked before /swaps/preview too, so a never-linked wallet 403s on
  // its very first preview. Runs the same flow, then returns the trade to
  // idle so the form comes back.
  const linkForPreview = useCallback(
    async (chainId: number) => {
      try {
        // Forced: this only runs after the service said the wallet is not
        // linked, so the browser's hint is wrong whatever it says. Trusting it
        // here made the relink a no-op, and the preview refused forever.
        await ensureLinked(chainId, { force: true });
        setPhase("idle");
      } catch (e) {
        setPhase("failed");
        setError(e);
        throw e;
      }
    },
    [ensureLinked]
  );

  // A delivered-but-unrecorded trade, told to everyone who needs to know: the
  // console for whoever is debugging, analytics for the count, Watchtower for
  // the trade team with the ids that find the swap. The user hears
  // "delivered, still being recorded", never "done".
  const settleAsDelivered = useCallback(
    (quote: PreparedSwap, hash: string | null, recorded: string, ref: string | null) => {
      console.warn(
        `[meme] swap ${quote.swapId} delivered on-chain (${hash ?? "no hash"}) but the trade service recorded ${recorded} (request ${ref ?? "none"})`
      );
      track("trade_recording_mismatch", {
        vertical: "memecoin",
        asset: quote.sellToken.symbol ?? quote.sellToken.address,
        swap_id: quote.swapId,
        recorded,
        request_id: ref ?? undefined,
        hash: hash ?? undefined,
      });
      reportTradeRecordingMismatch({ swapId: quote.swapId, requestId: ref, hash, recorded });
      setRequestId(ref);
      setPhase("delivered");
    },
    []
  );

  // Solana: quote -> sponsor (prepare, user signs, sponsor submits) -> register
  // the signature. The quote is one transaction, so there is nothing to
  // execute in order and no balance-delta proof yet; CONFIRMED is the word.
  const tradeSolana = useCallback(
    async (body: SwapRequest): Promise<TradeResult> => {
      const signer = solanaWallets.find((w) => w.address === body.walletAddress);
      if (!signer) throw new Error("Your Solana wallet is still connecting. Try again.");
      const runQuote = () => quoteWithProviderRetry((key) => quoteSolanaSwap(body, key));

      await ensureLinked(SOLANA_CHAIN_ID);
      setPhase("quoting");
      let quote;
      try {
        quote = await runQuote();
      } catch (e) {
        if (e instanceof TradeApiError && e.code === "WALLET_OWNERSHIP_MISMATCH" && user) {
          await ensureLinked(SOLANA_CHAIN_ID, { force: true });
          setPhase("quoting");
          quote = await runQuote();
        } else {
          throw e;
        }
      }
      setSwapId(quote.swapId);
      setQuotedFee(
        quote.platformFeeAmountAtomic === undefined
          ? null
          : formatUsdcAtomic(quote.platformFeeAmountAtomic)
      );

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
      const status = await awaitTerminalStatus(quote.swapId);
      if (status === null) {
        console.warn(`[meme] swap ${quote.swapId} still not terminal after the poll ceiling`);
        setPhase("pending");
        return { outcome: "pending", swapId: quote.swapId, requestId: null };
      }
      if (status === "CONFIRMED") {
        refreshServicePortfolio();
        setPhase("confirmed");
        return { outcome: "confirmed", swapId: quote.swapId, requestId: null };
      }
      throw new TradeApiError(status, "The trade didn't complete.", 200);
    },
    [solanaWallets, ensureLinked, user, sendSponsoredSolana, refreshServicePortfolio]
  );

  const trade = useCallback(
    async ({ chainId, ...input }: MemeTradeInput): Promise<TradeResult> => {
      // A second press while one runs is the same action, not a new one, and
      // nothing is known about it yet.
      if (activeRef.current) return { outcome: "pending", swapId: null, requestId: null };
      const chainWallet = walletFor(chainId);
      if (!chainWallet) throw new Error("Sign in first.");
      activeRef.current = true;
      setError(null);
      setSwapId(null);
      setRequestId(null);
      setReceived(null);
      setQuotedFee(null);
      try {
        if (chainId === SOLANA_CHAIN_ID) {
          return await tradeSolana({ ...input, walletAddress: chainWallet });
        }
        const wallet = chainWallet;
        const body: SwapRequest = { ...input, walletAddress: wallet };
        const runQuote = () => quoteWithProviderRetry((key) => quoteSwap(body, key));

        await ensureLinked(chainId);
        setPhase("quoting");
        let quote: PreparedSwap;
        try {
          quote = await runQuote();
        } catch (e) {
          // A stale linked-cache entry: relink once, then quote again.
          if (e instanceof TradeApiError && e.code === "WALLET_OWNERSHIP_MISMATCH" && user) {
            await ensureLinked(chainId, { force: true });
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
          // approval is confirmed before the swap call is sent. When the
          // bundler accepted the operation but never produced a receipt, the
          // operation's own hash is what there is to register: the contract
          // takes `userOperationHash` for exactly that, and the status poll
          // decides the outcome, as it would for any other submission.
          let submission: SubmissionHash;
          let logs: ReceiptLog[] | null = null;
          let txHash: string | null = null;
          try {
            const sent = await evmSend({
              to: call.to as `0x${string}`,
              data: call.data as `0x${string}`,
              value: BigInt(call.value),
              chainId: quote.chainId,
            });
            submission = { transactionHash: sent.hash };
            txHash = sent.hash;
            logs = sent.logs;
          } catch (e) {
            if (!isSubmittedEvmOperationError(e)) throw e;
            console.warn(
              `[meme] swap ${quote.swapId} call ${callIndex} has no receipt yet; registering user operation ${e.userOperationHash}`
            );
            submission = { userOperationHash: e.userOperationHash };
          }
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
            await registerSubmission(
              quote.swapId,
              callIndex,
              wallet,
              submission,
              newIdempotencyKey()
            );
          } catch (e) {
            if (!(e instanceof TradeApiError && e.status === 409)) throw e;
            registrationRefused = e;
            console.warn(
              `[meme] swap ${quote.swapId} call ${callIndex} not recorded: ${e.code} (request ${e.requestId ?? "none"})`
            );
          }
          // The last call IS the swap; anything before it is an approval, so
          // this ends up holding the hash worth pointing a share at. A user
          // operation hash is not one: an explorer link to it would be dead.
          if (txHash) {
            settledHash = txHash;
            setSettled({ txHash, chainId: quote.chainId });
          }
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
          settleAsDelivered(
            quote,
            settledHash,
            registrationRefused.code,
            registrationRefused.requestId
          );
          return {
            outcome: "delivered",
            swapId: quote.swapId,
            requestId: registrationRefused.requestId,
          };
        }

        // The backend worker verifies on-chain; poll until it says so.
        setPhase("confirming");
        const status = await awaitTerminalStatus(quote.swapId);
        if (status === null) {
          // No verdict inside the ceiling. Nothing is claimed either way; the
          // swap stays in the transactions list and the service's status is
          // still the only thing that will ever call it confirmed.
          console.warn(
            `[meme] swap ${quote.swapId} (${settledHash ?? "no hash"}) still not terminal after the poll ceiling`
          );
          setPhase("pending");
          return { outcome: "pending", swapId: quote.swapId, requestId: null };
        }
        if (status === "CONFIRMED") {
          refreshServicePortfolio();
          setPhase("confirmed");
          return { outcome: "confirmed", swapId: quote.swapId, requestId: null };
        }
        // The wallet's balance moved: the trade happened, whatever the
        // service recorded. Its verifier compares a sponsored user
        // operation's bundle transaction with the prepared call and fails,
        // which is a recording fault, not a failed trade. Telling the user
        // their money did not move when it did is the one thing this screen
        // must never do; calling it confirmed when the service has not is
        // the other. So: delivered, and the discrepancy goes to the trade
        // team.
        if (delivered) {
          settleAsDelivered(quote, settledHash, status, null);
          return { outcome: "delivered", swapId: quote.swapId, requestId: null };
        }
        throw new TradeApiError(status, "The trade didn't complete.", 200);
      } catch (e) {
        setPhase("failed");
        setError(e);
        throw e;
      } finally {
        activeRef.current = false;
      }
    },
    [
      walletFor,
      user,
      ensureLinked,
      evmSend,
      applyReceipt,
      tradeSolana,
      settleAsDelivered,
      refreshServicePortfolio,
    ]
  );

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
    setSwapId(null);
    setRequestId(null);
    setReceived(null);
    setQuotedFee(null);
    // Or the next trade offers to share the previous one.
    setSettled(null);
  }, []);

  return {
    wallet,
    walletFor,
    phase,
    error,
    swapId,
    requestId,
    received,
    settled,
    quotedFee,
    trade,
    reset,
    linkForPreview,
  };
}

// Debounced-by-caller indicative preview; rate limited upstream (20/min).
//
// `consented` is the risk-consent gate (useRiskConsent): for a LOW_LIQUIDITY
// token nothing is sent until the user has accepted the warning, because the
// contract wants that confirmation before a quote is requested. Every caller
// passes it, so no surface can forget the gate.
//
// A quote has a lifetime and the service publishes it. The lapse is recorded
// by a timer rather than read off the clock in render, so the caller
// re-renders exactly once, at the moment the price stops being one the user
// can act on; a quote that arrived already stale gets a zero-delay timer.
// `quote` is null from then on, so every surface blanks a lapsed quote the same
// way, and `expired` says why.
export function useMemePreview(input: MemePreviewInput | null, consented: boolean) {
  const query = useQuery({
    queryKey: ["meme", "preview", input],
    queryFn: () => {
      const { chainId, ...body } = input as MemePreviewInput;
      return previewSwap(body, chainId);
    },
    enabled: input !== null && consented,
    staleTime: 4_000,
    retry: (count, err) => err instanceof Error && err.message.includes("retrying") && count < 3,
  });

  const data = query.data ?? null;
  const expiresAt = data ? Date.parse(data.expiresAt) : null;
  const [lapsedAt, setLapsedAt] = useState<number | null>(null);
  useEffect(() => {
    if (expiresAt === null || Number.isNaN(expiresAt)) return;
    const id = setTimeout(() => setLapsedAt(expiresAt), Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(id);
  }, [expiresAt]);
  // Tied to the quote it belongs to, so the record of the last lapse can never
  // condemn the quote that replaced it.
  const expired = lapsedAt !== null && lapsedAt === expiresAt;

  return {
    quote: data && !expired ? data : null,
    expired,
    refetch: query.refetch,
    isFetching: query.isFetching,
    error: query.error,
  };
}

// A first-ever preview 403s (WALLET_OWNERSHIP_MISMATCH) until the wallet is
// linked, because the service wants the link before /swaps/preview too. Link
// once (a headless signature) and ask again. One attempt per chain per mounted
// surface (the link is per chain's wallet, and a desk can switch from a Base
// coin to a Solana one): a second mismatch is real, and linkForPreview has
// already put that failure on the trade state, where the surface shows it.
export function usePreviewRelink(
  error: unknown,
  chainId: number | null,
  linkForPreview: (chainId: number) => Promise<void>,
  refetch: () => unknown
) {
  const triedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (chainId === null || triedRef.current.has(chainId)) return;
    if (!(error instanceof TradeApiError && error.code === "WALLET_OWNERSHIP_MISMATCH")) return;
    triedRef.current.add(chainId);
    linkForPreview(chainId)
      .then(() => refetch())
      .catch((e: unknown) => {
        // Only a link that happened counts as the one attempt.
        triedRef.current.delete(chainId);
        console.warn("[meme] linking the wallet for a preview failed", e);
      });
  }, [error, chainId, linkForPreview, refetch]);
}
