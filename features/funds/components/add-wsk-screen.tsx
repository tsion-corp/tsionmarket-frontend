"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useModalScreen } from "@/components/ui/modal-shell";
import { CheckIcon } from "@/components/ui/icons";
import { useEvmSendBatch } from "@/hooks/use-evm-send";
import { useIntertrainAccount } from "@/hooks/use-intertrain-account";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useWalletSigner } from "@/hooks/use-wallet-signer";
import { wskBalanceKey, useWskBalance } from "@/hooks/use-wsk-balance";
import {
  ARBISCAN,
  ARBITRUM_CHAIN_ID,
  ARBITRUM_NETWORK,
  ARBITRUM_USDC,
  ARBITRUM_WSK_BRIDGE,
  BRIDGE_ABI,
  approveCall,
  depositCall,
  findDeposit,
  formatUsdc,
  formatWsk,
  operationIdFor,
  parseUsdc,
  type EvmCall,
} from "@/lib/intertrain/bridge";
import { getBridgeOperationStatus } from "@/lib/intertrain/rpc";
import { requestWalletUnlock } from "@/lib/signer/unlock-request";
import { awaitReceipt, publicClientForChain } from "@/lib/trade/receipt";

/**
 * Add WSK: Arbitrum USDC in, native Intertrain WSK out, 1:1, credited straight to the new
 * wallet's Intertrain address. The wallet signs one sponsored operation (approve, if needed,
 * then deposit), so there is nothing to pay for in gas. The bridge's relayer then mints the
 * WSK, and this screen follows that to the credit. A deposit in flight is remembered, so a
 * reload picks the same one up again instead of losing track of it.
 */

const POLL_MS = 4_000;
const GIVE_UP_MS = 15 * 60_000;
const pendingKey = (uid: string) => `tsion.wsk.pending.v1.${uid}`;

type Phase = "form" | "working" | "waiting" | "done" | "error";

const short = (value: string, head = 10, tail = 6) =>
  value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function readPending(uid: string): { hash: `0x${string}`; amount: string } | null {
  try {
    const raw = window.localStorage.getItem(pendingKey(uid));
    const parsed = raw ? (JSON.parse(raw) as { hash?: unknown; amount?: unknown }) : null;
    return parsed &&
      typeof parsed.hash === "string" &&
      /^0x[0-9a-f]{64}$/i.test(parsed.hash) &&
      typeof parsed.amount === "string"
      ? { hash: parsed.hash as `0x${string}`, amount: parsed.amount }
      : null;
  } catch {
    return null;
  }
}
function writePending(uid: string, value: { hash: string; amount: string } | null): void {
  try {
    if (value) window.localStorage.setItem(pendingKey(uid), JSON.stringify(value));
    else window.localStorage.removeItem(pendingKey(uid));
  } catch {
    // Without storage a reload forgets the deposit, but the money is safe on its way.
  }
}

function friendly(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/reject|denied|cancel/i.test(message)) return "You cancelled.";
  return message || "Something went wrong.";
}

export function AddWskScreen({
  onBack,
  onAddUsdc,
}: {
  onBack: () => void;
  /** Opens the deposit flow set to settle USDC on Arbitrum. */
  onAddUsdc: () => void;
}) {
  useModalScreen({ back: onBack });
  const queryClient = useQueryClient();
  const wallet = useWalletSigner();
  const account = useIntertrainAccount();
  const sendBatch = useEvmSendBatch();
  const { tokens, refetchFresh } = usePortfolio();
  const wsk = useWskBalance(account.address);

  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [step, setStep] = useState("");
  const [error, setError] = useState("");
  const [hash, setHash] = useState<string | null>(null);
  const [credited, setCredited] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const owner = wallet.addresses?.evm ?? null;
  const usingNewWallet = wallet.kind === "custom";
  const arbUsdc = tokens.find(
    (token) =>
      token.network === ARBITRUM_NETWORK &&
      token.address?.toLowerCase() === ARBITRUM_USDC.toLowerCase()
  );
  const have = BigInt(arbUsdc?.rawBalance ?? "0");

  let wanted: bigint | null = null;
  let amountProblem = "";
  if (amount.trim()) {
    try {
      wanted = parseUsdc(amount);
      if (wanted > have) amountProblem = `You have ${formatUsdc(have)} USDC on Arbitrum.`;
    } catch (e) {
      amountProblem = friendly(e);
    }
  }

  /** From the Arbitrum deposit to the credit on Intertrain. Resolves true once credited. */
  const follow = useCallback(
    async (txHash: `0x${string}`, uid: string, units: string): Promise<boolean> => {
      const client = publicClientForChain(ARBITRUM_CHAIN_ID);
      const startedAt = Date.now();
      let operationId: string | null = null;
      while (alive.current && Date.now() - startedAt < GIVE_UP_MS) {
        try {
          if (!operationId) {
            const receipt = await client.getTransactionReceipt({ hash: txHash }).catch(() => null);
            if (receipt) {
              if (receipt.status !== "success")
                throw new Error("The transaction failed on Arbitrum.");
              const deposit = findDeposit(receipt.logs);
              if (!deposit) {
                throw new Error(
                  "The deposit went through but no bridge event was found. Contact support with your transaction hash."
                );
              }
              operationId = operationIdFor(deposit.depositId);
              if (alive.current) {
                setStep(
                  "Deposit confirmed on Arbitrum. Waiting for Intertrain to credit your Kash…"
                );
              }
            }
          }
          if (operationId && (await getBridgeOperationStatus(operationId)) === "confirmed") {
            writePending(uid, null);
            if (alive.current) setCredited(units);
            void queryClient.invalidateQueries({ queryKey: wskBalanceKey(account.address) });
            void refetchFresh([ARBITRUM_NETWORK]);
            return true;
          }
        } catch (e) {
          // A node that does not answer for a moment is not a failed deposit: keep watching.
          if (e instanceof Error && /failed on Arbitrum|no bridge event/.test(e.message)) throw e;
        }
        await wait(POLL_MS);
      }
      return false;
    },
    [account.address, queryClient, refetchFresh]
  );

  const finishFollowing = useCallback(
    async (txHash: `0x${string}`, uid: string, units: string) => {
      try {
        const done = await follow(txHash, uid, units);
        if (!alive.current) return;
        if (done) {
          setPhase("done");
        } else {
          setPhase("error");
          setError(
            "Your deposit is safe on Arbitrum, but the credit is taking longer than expected. It will still arrive. Keep your transaction hash."
          );
        }
      } catch (e) {
        if (alive.current) {
          setPhase("error");
          setError(friendly(e));
        }
      }
    },
    [follow]
  );

  // A deposit that was in flight when the screen was last closed or reloaded.
  const uid = account.hasWallet ? (wallet.addresses?.evm ?? null) : null;
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !uid || !account.address) return;
    const pending = readPending(uid);
    if (!pending) return;
    resumed.current = true;
    // Read from storage, an external system, so the state follows once it has answered.
    void Promise.resolve().then(() => {
      if (!alive.current) return;
      setHash(pending.hash);
      setAmount(pending.amount);
      setPhase("waiting");
      setStep("Picking up your deposit…");
      void finishFollowing(pending.hash, uid, pending.amount);
    });
  }, [uid, account.address, finishFollowing]);

  async function run() {
    if (!owner || !account.address || wanted === null) return;
    setError("");
    // Set the moment a transaction is sent, so a failure after that point can never put the
    // form back in front of someone whose deposit is already on its way.
    let sent: string | null = null;
    try {
      const value = wanted;
      setPhase("working");
      setStep("Checking the bridge…");
      const client = publicClientForChain(ARBITRUM_CHAIN_ID);
      const [paused, balance, allowance] = await Promise.all([
        client.readContract({
          address: ARBITRUM_WSK_BRIDGE,
          abi: BRIDGE_ABI,
          functionName: "paused",
        }),
        client.readContract({
          address: ARBITRUM_USDC,
          abi: BRIDGE_ABI,
          functionName: "balanceOf",
          args: [owner as `0x${string}`],
        }),
        client.readContract({
          address: ARBITRUM_USDC,
          abi: BRIDGE_ABI,
          functionName: "allowance",
          args: [owner as `0x${string}`, ARBITRUM_WSK_BRIDGE],
        }),
      ]);
      if (paused) throw new Error("The Arbitrum bridge is paused right now.");
      if (balance < value) {
        throw new Error(
          `You have ${formatUsdc(balance)} USDC on Arbitrum. You need ${formatUsdc(value)}.`
        );
      }
      const calls: EvmCall[] = [];
      if (allowance < value) calls.push(approveCall(value));
      calls.push(depositCall(value, account.address));

      setStep("Confirm in your wallet…");
      const txHash = await sendBatch(calls, ARBITRUM_CHAIN_ID, owner);
      sent = txHash;
      setHash(txHash);
      writePending(owner, { hash: txHash, amount: formatUsdc(value) });
      setStep("Waiting for Arbitrum to confirm…");
      await awaitReceipt(client, txHash, "Your deposit");
      setPhase("waiting");
      setStep("Deposit confirmed on Arbitrum. Waiting for Intertrain to credit your Kash…");
      await finishFollowing(txHash, owner, formatUsdc(value));
    } catch (e) {
      if (!alive.current) return;
      setPhase(sent ? "error" : "form");
      setError(friendly(e));
    }
  }

  // ── what the person can do right now ──
  let body: React.ReactNode;
  if (!account.hasWallet || !usingNewWallet) {
    body = (
      <Notice>
        Add Kash needs your new wallet, because that is where your Kash lives.{" "}
        <Link href="/upgrade" className="underline underline-offset-2">
          Set it up and switch to it
        </Link>
        .
      </Notice>
    );
  } else if (!account.address) {
    body = (
      <Notice>
        Unlock your wallet once so we can show your Intertrain address.{" "}
        <button
          type="button"
          onClick={requestWalletUnlock}
          className="underline underline-offset-2"
        >
          Unlock wallet
        </button>
      </Notice>
    );
  } else if (phase === "done") {
    body = (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-[#5dd9a3]/15 text-[#5dd9a3]">
          <CheckIcon size={22} />
        </span>
        <p className="text-[15px] font-medium text-white">{credited} Kash added</p>
        <p className="text-[13px] text-white/55">
          It is in your wallet now: {formatWsk(wsk.data ?? 0n)} Kash in total.
        </p>
        {hash ? (
          <a
            className="text-[13px] text-white/55 underline underline-offset-2"
            href={`${ARBISCAN}/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View on Arbiscan
          </a>
        ) : null}
      </div>
    );
  } else if (phase === "working" || phase === "waiting") {
    body = (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
        <p className="text-[13.5px] text-white/65">{step}</p>
        {hash ? (
          <a
            className="text-[12.5px] text-white/45 underline underline-offset-2"
            href={`${ARBISCAN}/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
          >
            {short(hash)} on Arbiscan
          </a>
        ) : null}
      </div>
    );
  } else {
    const shortfall = wanted !== null && wanted > have;
    body = (
      <div className="flex flex-col gap-3.5">
        <div className="rounded-2xl border border-white/8 bg-black/35 px-4 py-3.5">
          <div className="flex items-baseline justify-between text-[12.5px] text-white/55">
            <span>Amount (USDC on Arbitrum)</span>
            <span>Available {formatUsdc(have)}</span>
          </div>
          <input
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            aria-label="Amount in USDC"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1.5 w-full bg-transparent text-[26px] font-medium text-white outline-none placeholder:text-white/25"
          />
          {amountProblem && !shortfall ? (
            <p role="alert" className="mt-1 text-[12.5px] text-red-300">
              {amountProblem}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5 rounded-2xl border border-white/8 bg-white/3 px-4 py-3 text-[13px]">
          <Row
            label="You receive"
            value={wanted !== null ? `${formatWsk(wanted)} Kash` : "1 USDC = 1 Kash"}
          />
          <Row label="Into" value={short(account.address, 12, 6)} mono />
          <Row
            label="Your Kash balance"
            value={
              wsk.isLoading
                ? "…"
                : wsk.isError
                  ? "Unavailable"
                  : `${formatWsk(wsk.data ?? 0n)} Kash`
            }
          />
        </div>

        {shortfall ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-[13px] text-amber-100">
            {amountProblem} Add USDC on Arbitrum first; it arrives in your wallet and you can come
            straight back.
            <button
              type="button"
              onClick={onAddUsdc}
              className="self-start rounded-full bg-amber-200 px-3.5 py-1.5 text-[12.5px] font-semibold text-black"
            >
              Add USDC on Arbitrum
            </button>
          </div>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-2xl border border-red-300/25 bg-red-300/10 px-4 py-3 text-[13px] text-red-100"
          >
            {error}
          </p>
        ) : null}

        <button
          type="button"
          disabled={wanted === null || shortfall || !usingNewWallet || phase === "error"}
          onClick={run}
          className="cursor-pointer rounded-full bg-[#5dd9a3] py-3.5 text-[14.5px] font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add Kash
        </button>
        {phase === "error" && hash ? (
          <a
            className="text-center text-[12.5px] text-white/55 underline underline-offset-2"
            href={`${ARBISCAN}/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View your deposit on Arbiscan
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="ws-display text-[24px] tracking-[-0.01em]">Add Kash</div>
        <p className="mt-2 text-[13.5px] leading-normal font-normal text-white/65">
          Turn USDC on Arbitrum into Kash on Intertrain, one for one. It arrives in your wallet in a
          few minutes.
        </p>
      </div>
      {body}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-[13.5px] leading-snug text-amber-100">
      {children}
    </p>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-white/50">{label}</span>
      <span className={mono ? "font-mono text-white" : "text-white"}>{value}</span>
    </div>
  );
}
