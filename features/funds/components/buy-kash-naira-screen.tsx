"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useModalScreen } from "@/components/ui/modal-shell";
import { CheckIcon } from "@/components/ui/icons";
import { useIntertrainAccount } from "@/hooks/use-intertrain-account";
import { wskBalanceKey } from "@/hooks/use-wsk-balance";
import {
  createOrder,
  getOrder,
  getQuote,
  instructionRows,
  ngn,
  type KespOrder,
  type KespQuote,
} from "@/lib/intertrain/kesp";
import { requestWalletUnlock } from "@/lib/signer/unlock-request";

/**
 * Buy Kash with naira: pay by bank transfer, and the Kash is minted straight to this wallet's
 * Intertrain address. The order id is the receipt, and an order in flight is remembered so a
 * reload picks it up again.
 */

const MIN = 1500;
const PRESETS = [5000, 10000, 25000, 50000];
const orderKey = (address: string) => `tsion.kesp.order.v1.${address}`;

type Phase = "form" | "paying" | "done" | "expired" | "error";

function savedOrder(address: string): KespOrder | null {
  try {
    const raw = window.localStorage.getItem(orderKey(address));
    return raw ? (JSON.parse(raw) as KespOrder) : null;
  } catch {
    return null;
  }
}
function keepOrder(address: string, order: KespOrder | null) {
  try {
    if (order) window.localStorage.setItem(orderKey(address), JSON.stringify(order));
    else window.localStorage.removeItem(orderKey(address));
  } catch {
    // Without storage a reload forgets the order; the order id in the receipt still finds it.
  }
}

export function BuyKashNairaScreen({ onBack }: { onBack: () => void }) {
  useModalScreen({ back: onBack });
  const queryClient = useQueryClient();
  const account = useIntertrainAccount();
  const address = account.address;

  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<KespQuote | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<KespOrder | null>(null);
  const [state, setState] = useState("");
  const sequence = useRef(0);

  const valid = /^\d+(\.\d{1,2})?$/.test(amount) && Number(amount) >= MIN;

  useEffect(() => {
    if (!valid) return;
    const mine = ++sequence.current;
    const timer = setTimeout(() => {
      getQuote(amount)
        .then((q) => {
          if (mine !== sequence.current) return;
          setQuote(q);
          setError("");
        })
        .catch((e: Error) => mine === sequence.current && setError(e.message));
    }, 450);
    return () => clearTimeout(timer);
  }, [amount, valid]);

  // An order that was open when the screen was last closed.
  useEffect(() => {
    if (!address) return;
    const saved = savedOrder(address);
    if (!saved) return;
    void Promise.resolve().then(() => {
      setOrder(saved);
      setPhase("paying");
    });
  }, [address]);

  async function start() {
    if (!address) return;
    setBusy(true);
    setError("");
    try {
      const created = await createOrder(amount, address);
      keepOrder(address, created);
      setOrder(created);
      setPhase("paying");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (phase !== "paying" || !order || !address) return;
    let stop = false;
    const tick = async () => {
      const result = await getOrder(order.orderId).catch(() => null);
      if (stop || !result) return;
      setState(result.state);
      if (result.state === "delivered") {
        keepOrder(address, null);
        setPhase("done");
        void queryClient.invalidateQueries({ queryKey: wskBalanceKey(address) });
      } else if (result.state === "expired") {
        keepOrder(address, null);
        setPhase("expired");
      } else if (["failed", "review", "needs_review", "refunded"].includes(result.state)) {
        setPhase("error");
      }
    };
    const timer = setInterval(tick, 5000);
    void tick();
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [phase, order, address, queryClient]);

  const rows = order ? instructionRows(order.paymentInstructions) : [];
  const status =
    state === "paid" || state === "delivering"
      ? "Payment received. Minting your Kash…"
      : "Waiting for your transfer…";

  let body: React.ReactNode;
  if (!account.hasWallet) {
    body = (
      <Notice>Buying Kash needs your new wallet, because that is where your Kash lives.</Notice>
    );
  } else if (!address) {
    body = (
      <Notice>
        Unlock your wallet once so we know where to send your Kash.{" "}
        <button
          type="button"
          onClick={requestWalletUnlock}
          className="underline underline-offset-2"
        >
          Unlock wallet
        </button>
      </Notice>
    );
  } else if (phase === "done" && order) {
    body = (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-[#5dd9a3]/15 text-[#5dd9a3]">
          <CheckIcon size={22} />
        </span>
        <p className="text-[15px] font-medium text-white">{order.quote.amountKesp} Kash added</p>
        <p className="text-[13px] text-white/55">It is in your wallet now.</p>
      </div>
    );
  } else if (phase === "paying" && order) {
    body = (
      <div className="flex flex-col gap-3.5">
        <div className="rounded-2xl border border-white/8 bg-black/35 px-4 py-3.5 text-center">
          <div className="text-[12.5px] text-white/55">Transfer exactly</div>
          <div className="text-[26px] font-medium text-white">{ngn(order.quote.amountNgn)}</div>
          <div className="text-[12.5px] text-white/55">You get {order.quote.amountKesp} Kash</div>
        </div>
        <div className="flex flex-col gap-1.5 rounded-2xl border border-white/8 bg-white/3 px-4 py-3 text-[13px]">
          {rows.length ? (
            rows.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3">
                <span className="text-white/50">{k}</span>
                <b className="font-medium break-all text-white">{v}</b>
              </div>
            ))
          ) : (
            <p className="text-white/55">Payment details are on their way. Keep this open.</p>
          )}
        </div>
        <p className="text-[12.5px] text-white/50">
          {status} Pay from your own bank app. Your Kash arrives by itself, and this order id is
          your receipt: {order.orderId}
        </p>
      </div>
    );
  } else if (phase === "expired" && order) {
    body = (
      <Notice>
        This order expired before a payment arrived. If you already paid, contact support with order{" "}
        {order.orderId}.
      </Notice>
    );
  } else if (phase === "error" && order) {
    body = (
      <Notice>
        We received your payment but need to check this order by hand. Nothing is lost. Keep order
        id {order.orderId} and contact support.
      </Notice>
    );
  } else {
    body = (
      <div className="flex flex-col gap-3.5">
        <div className="rounded-2xl border border-white/8 bg-black/35 px-4 py-3.5">
          <div className="text-[12.5px] text-white/55">Amount (NGN)</div>
          <input
            inputMode="decimal"
            autoComplete="off"
            aria-label="Amount in naira"
            placeholder={`From ${MIN.toLocaleString()}`}
            value={amount}
            onChange={(e) => {
              setQuote(null);
              setAmount(e.target.value.replace(/[^0-9.]/g, ""));
            }}
            className="mt-1.5 w-full bg-transparent text-[26px] font-medium text-white outline-none placeholder:text-white/25"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setQuote(null);
                  setAmount(String(p));
                }}
                className="rounded-full border border-white/12 bg-white/5 px-3 py-1 text-[12.5px] text-white/75"
              >
                {p.toLocaleString()}
              </button>
            ))}
          </div>
        </div>
        {valid && quote ? (
          <div className="flex items-baseline justify-between rounded-2xl border border-white/8 bg-white/3 px-4 py-3 text-[13px]">
            <span className="text-white/50">You receive</span>
            <span className="text-white">
              {quote.amountKesp} Kash{" "}
              <span className="text-white/45">(1 Kash = {ngn(quote.sellRateNgnPerKesp)})</span>
            </span>
          </div>
        ) : null}
        {amount && !valid ? (
          <p className="text-[12.5px] text-white/55">Minimum is {ngn(MIN)}.</p>
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
          disabled={!valid || !quote || busy}
          onClick={() => void start()}
          className="cursor-pointer rounded-full bg-[#5dd9a3] py-3.5 text-[14.5px] font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Creating order…" : "Continue"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="ws-display text-[24px] tracking-[-0.01em]">Buy Kash with naira</div>
        <p className="mt-2 text-[13.5px] leading-normal font-normal text-white/65">
          Pay by bank transfer and the Kash is added to your wallet automatically.
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
