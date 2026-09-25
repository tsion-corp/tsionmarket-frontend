"use client";
import { useRouter } from "next/navigation";
import { useAuthSession } from "@/hooks/use-auth-session";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSessionWallet } from "@/components/providers/server-session";
import { useMatchMarket, usePlaceBet } from "@/features/casino/hooks/use-casino-betting";
import { useChessCashier } from "@/features/casino/hooks/use-chess-cashier";
import {
  cashierFundingPlan,
  confirmChessDeposit,
  isChessDepositPending,
  normalizeUsdcAmount,
} from "@/features/casino/lib/api/cashier";
import { postMatchChatMessage } from "@/features/casino/lib/api/chess";
import { estimatePariMutuelReturn } from "@/features/casino/lib/betting-math";
import type { BetSelection, ChessMatch } from "@/features/casino/lib/api/types";
import { usePortfolio } from "@/hooks/use-portfolio";
import { friendlyError } from "@/lib/errors";
import { formatUsd, fromBaseUnits } from "@/lib/trade/math";
import { USDC_BY_CHAIN } from "@/lib/trade/usdc";
import { toast } from "@/lib/toast";

type SideSelection = Extract<BetSelection, "white" | "black">;

const SIDES: readonly SideSelection[] = ["white", "black"];
const BASE_NETWORK = "base-mainnet";
const BASE_USDC = USDC_BY_CHAIN.base.address.toLowerCase();

interface PendingDeposit {
  amountUsdc: string;
  txHash: string;
}

function baseUsdcBalance(tokens: ReturnType<typeof usePortfolio>["tokens"]): string {
  const token =
    tokens.find(
      (item) => item.network === BASE_NETWORK && item.address?.toLowerCase() === BASE_USDC
    ) ??
    tokens.find(
      (item) => item.network === BASE_NETWORK && item.symbol.toUpperCase() === "USDC"
    );
  if (!token) return "0";
  return fromBaseUnits(BigInt(token.rawBalance), token.decimals);
}

function sameWallet(left: string | null | undefined, right: string | null): boolean {
  return !!left && !!right && left.toLowerCase() === right.toLowerCase();
}

function sideName(side: SideSelection): string {
  return side === "white" ? "White" : "Black";
}

function oddsLabel(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "-" : `${value.toFixed(2)}x`;
}

function settledMessage(
  status: "open" | "settled" | "voided" | undefined,
  winner: BetSelection | null | undefined
): string | null {
  if (status === "voided") return "Market voided. Stakes are refunded.";
  if (status === "settled") {
    if (!winner) return "Market settled.";
    return `${winner[0]?.toUpperCase()}${winner.slice(1)} won.`;
  }
  return null;
}

function BetForm({
  match,
  mobile = false,
  onComplete,
}: {
  match: ChessMatch;
  mobile?: boolean;
  onComplete?: () => void;
}) {
  const { ready, authenticated, evmAddress, solanaAddress, profile } = useAuthSession();
  const router = useRouter();
  const login = () => router.push("/auth");
  const viewer = useSessionWallet("ethereum");
  const cashier = useChessCashier();
  const portfolio = usePortfolio({ scope: "base" });
  const market = useMatchMarket(match.id, viewer);
  const placeBet = usePlaceBet();
  const pendingDeposit = useRef<PendingDeposit | null>(null);
  const [selection, setSelection] = useState<SideSelection | null>(null);
  const [stakeInput, setStakeInput] = useState("");
  const [isFunding, setIsFunding] = useState(false);
  const inputId = useId();

  const odds = market.odds;
  const walletUsdc = baseUsdcBalance(portfolio.tokens);
  const stakeUsdc = normalizeUsdcAmount(stakeInput);
  const funding = stakeUsdc
    ? cashierFundingPlan(stakeUsdc, cashier.available, walletUsdc)
    : null;
  const depositUsdc = funding?.depositUsdc ?? "0";
  const needsDeposit = depositUsdc !== "0";
  const overBalance = funding ? !funding.sufficient : false;
  const isPlayer =
    sameWallet(match.white?.walletAddress, viewer) || sameWallet(match.black?.walletAddress, viewer);
  const marketOpen = match.state === "in_progress" && (odds?.status ?? "open") === "open";
  const rake = (odds?.rakeBps ?? cashier.config?.platformFeeBps ?? 500) / 10_000;
  const potentialReturn =
    selection && odds && stakeUsdc
      ? estimatePariMutuelReturn(Number(stakeUsdc), odds, selection, rake)
      : 0;
  const canSubmit =
    !!viewer &&
    !!selection &&
    !!stakeUsdc &&
    !!odds &&
    cashier.configured &&
    marketOpen &&
    !isPlayer &&
    !overBalance &&
    !cashier.balanceLoading &&
    (!needsDeposit || !portfolio.loading) &&
    !isFunding &&
    !placeBet.isPending;
  const finalMessage = settledMessage(odds?.status, odds?.winningOutcome);

  const submit = async () => {
    if (!viewer) {
      login();
      return;
    }
    if (!selection || !stakeUsdc || !canSubmit) return;

    const toastId = toast.loading("Placing spectator bet...");
    setIsFunding(true);
    try {
      if (needsDeposit) {
        let txHash: string;
        const pending = pendingDeposit.current;
        if (pending) {
          if (pending.amountUsdc !== depositUsdc) {
            throw new Error(
              `Finish confirming the pending ${pending.amountUsdc} USDC deposit before changing the stake.`
            );
          }
          txHash = pending.txHash;
          try {
            await confirmChessDeposit(viewer, txHash);
          } catch (error) {
            if (!isChessDepositPending(error)) throw error;
            throw new Error(
              "Your Base USDC transfer is still confirming. Retry shortly; no second transfer will be sent."
            );
          }
        } else {
          const outcome = await cashier.deposit(depositUsdc);
          txHash = outcome.txHash;
          pendingDeposit.current = { amountUsdc: depositUsdc, txHash };
          if (!outcome.credited) {
            throw new Error(
              "Your Base USDC transfer is still confirming. Retry shortly; no second transfer will be sent."
            );
          }
        }
      }

      await placeBet.mutateAsync({
        matchId: match.id,
        bettor: viewer,
        selection,
        stakeUsdc,
      });
      pendingDeposit.current = null;
      void portfolio.refetchFresh(["base-mainnet"]);
      toast.success(`Bet placed. Estimated return ${formatUsd(potentialReturn)}.`, {
        id: toastId,
        sensitive: true,
      });
      void postMatchChatMessage(
        match.id,
        "spectator",
        `Placed ${formatUsd(Number(stakeUsdc))} on ${sideName(selection)}.`
      ).catch(() => undefined);
      setStakeInput("");
      setSelection(null);
      onComplete?.();
    } catch (error) {
      toast.error(friendlyError(error, "Couldn't place that bet."), { id: toastId });
    } finally {
      setIsFunding(false);
    }
  };

  let actionLabel = "Confirm bet";
  if (cashier.depositPhase === "sending") actionLabel = "Signing Base transfer...";
  else if (cashier.depositPhase === "confirming") actionLabel = "Confirming Base transfer...";
  else if (isFunding || cashier.depositing) actionLabel = "Funding bet...";
  else if (placeBet.isPending) actionLabel = "Placing...";
  else if (!viewer) actionLabel = "Sign in to bet";
  else if (isPlayer) actionLabel = "Players cannot bet";
  else if (!marketOpen) actionLabel = "Market closed";
  else if (market.isLoading) actionLabel = "Loading market...";
  else if (!cashier.configured) actionLabel = "Betting balance unavailable";
  else if (cashier.balanceLoading || (needsDeposit && portfolio.loading))
    actionLabel = "Loading balance...";
  else if (!selection) actionLabel = "Choose White or Black";
  else if (!stakeUsdc) actionLabel = "Enter a stake";
  else if (overBalance) actionLabel = "Insufficient balance";

  return (
    <form
      className={`ark-spectator-bet-card${mobile ? " is-mobile" : ""}`}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <header className="ark-spectator-bet-header">
        <span>
          <strong>Bet on winner</strong>
          <small>Pari-mutuel market</small>
        </span>
        <span className={`ark-spectator-bet-live${marketOpen ? " is-open" : ""}`}>
          {marketOpen ? "Live" : odds?.status ?? "Closed"}
        </span>
      </header>

      {market.error ? (
        <p className="ark-spectator-bet-notice is-error">Could not load this market.</p>
      ) : finalMessage ? (
        <p className="ark-spectator-bet-notice">{finalMessage}</p>
      ) : isPlayer ? (
        <p className="ark-spectator-bet-notice">Players cannot bet on their own game.</p>
      ) : null}

      <div className="ark-spectator-bet-sides" aria-label="Choose the winner">
        {SIDES.map((side) => {
          const active = selection === side;
          const outcome = odds?.outcomes[side];
          return (
            <button
              key={side}
              type="button"
              className={`ark-spectator-bet-side is-${side}${active ? " is-selected" : ""}`}
              aria-pressed={active}
              disabled={!marketOpen || isPlayer || market.isLoading}
              onClick={() => setSelection(side)}
            >
              <span className="ark-spectator-bet-piece" aria-hidden>
                {side === "white" ? "W" : "B"}
              </span>
              <span>
                <strong>{sideName(side)}</strong>
                <small>{oddsLabel(outcome?.odds)}</small>
              </span>
            </button>
          );
        })}
      </div>

      <div className="ark-spectator-bet-entry">
        <label htmlFor={inputId}>Stake</label>
        <span className="ark-spectator-bet-input">
          <input
            id={inputId}
            value={stakeInput}
            onChange={(event) => setStakeInput(event.target.value.replace(/[^0-9.]/gu, ""))}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            aria-invalid={overBalance || undefined}
            disabled={!marketOpen || isPlayer}
          />
          <b>USDC</b>
        </span>
      </div>

      <div className="ark-spectator-bet-summary" data-sensitive="true">
        <span>
          Chess balance <b>{cashier.balanceLoading ? "-" : formatUsd(Number(cashier.available))}</b>
        </span>
        <span>
          Base wallet <b>{portfolio.loading ? "-" : formatUsd(Number(walletUsdc))}</b>
        </span>
        <span>
          Potential payout <b>{stakeUsdc && selection ? formatUsd(potentialReturn) : "-"}</b>
        </span>
      </div>

      <button
        type={viewer ? "submit" : "button"}
        className="ark-spectator-bet-submit"
        disabled={!!viewer && !canSubmit}
        onClick={!viewer ? () => login() : undefined}
      >
        {actionLabel}
      </button>

      {market.myBets.length ? (
        <p className="ark-spectator-bet-existing">
          {market.myBets.length} bet{market.myBets.length === 1 ? "" : "s"} placed on this game
        </p>
      ) : null}
    </form>
  );
}

export function LichessSpectatorBetting({ match }: { match: ChessMatch }) {
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSheetOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sheetOpen]);

  return (
    <>
      <style>{BETTING_CSS}</style>
      <div className="ark-spectator-bet-desktop">
        <BetForm match={match} />
      </div>
      <button
        className="ark-spectator-bet-mobile-trigger"
        type="button"
        onClick={() => setSheetOpen(true)}
      >
        Place Bet
      </button>
      {sheetOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="ark-spectator-bet-sheet-backdrop"
              role="presentation"
              onMouseDown={(event) => {
                if (event.currentTarget === event.target) setSheetOpen(false);
              }}
            >
              <section
                className="ark-spectator-bet-sheet"
                role="dialog"
                aria-modal="true"
                aria-label="Bet on game winner"
              >
                <button
                  className="ark-spectator-bet-sheet-close"
                  type="button"
                  aria-label="Close betting panel"
                  onClick={() => setSheetOpen(false)}
                >
                  x
                </button>
                <BetForm match={match} mobile onComplete={() => setSheetOpen(false)} />
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

const BETTING_CSS = `
.round__app__betting{display:none}
.round__app__betting.is-active{display:contents}
.round__betting{width:100%;font-family:"Noto Sans",sans-serif;color:#b3b3b3}
.ark-spectator-bet-card{overflow:hidden;border:1px solid rgba(255,255,255,.09);border-radius:7px;background:rgba(38,36,33,.97);box-shadow:0 2px 8px rgba(0,0,0,.35)}
.ark-spectator-bet-header{display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.62rem .72rem;border-bottom:1px solid rgba(255,255,255,.08)}
.ark-spectator-bet-header strong{display:block;color:#ddd;font-size:.92rem;line-height:1.1}
.ark-spectator-bet-header small{display:block;margin-top:.14rem;color:#888;font-size:.67rem}
.ark-spectator-bet-live{border-radius:999px;background:#555;color:#ccc;padding:.16rem .42rem;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em}
.ark-spectator-bet-live.is-open{background:rgba(98,153,36,.2);color:#9bc95b}
.ark-spectator-bet-notice{margin:0;padding:.42rem .72rem;background:rgba(255,255,255,.035);color:#aaa;font-size:.7rem;line-height:1.3}
.ark-spectator-bet-notice.is-error{color:#d59191}
.ark-spectator-bet-sides{display:grid;grid-template-columns:1fr 1fr;gap:.42rem;padding:.55rem .65rem .42rem}
.ark-spectator-bet-side{display:flex;align-items:center;gap:.42rem;min-width:0;border:1px solid rgba(255,255,255,.09);border-radius:5px;background:#312e2b;color:#bbb;padding:.4rem .48rem;text-align:left;cursor:pointer}
.ark-spectator-bet-side:hover:not(:disabled){border-color:rgba(255,255,255,.24);background:#3b3835}
.ark-spectator-bet-side.is-selected{border-color:#629924;background:rgba(98,153,36,.14);color:#eee}
.ark-spectator-bet-side:disabled{cursor:not-allowed;opacity:.48}
.ark-spectator-bet-piece{flex:0 0 auto;font-size:1.55rem;line-height:1;text-shadow:0 1px 2px #000}
.ark-spectator-bet-side.is-white .ark-spectator-bet-piece{color:#f0d9b5}
.ark-spectator-bet-side.is-black .ark-spectator-bet-piece{color:#777}
.ark-spectator-bet-side strong,.ark-spectator-bet-side small{display:block;white-space:nowrap}
.ark-spectator-bet-side strong{font-size:.75rem}
.ark-spectator-bet-side small{margin-top:.08rem;color:#999;font-size:.7rem;font-variant-numeric:tabular-nums}
.ark-spectator-bet-entry{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:.55rem;padding:.18rem .65rem .42rem}
.ark-spectator-bet-entry label{font-size:.7rem;font-weight:700;color:#aaa}
.ark-spectator-bet-input{display:flex;align-items:center;border:1px solid rgba(255,255,255,.1);border-radius:5px;background:#262421}
.ark-spectator-bet-input:focus-within{border-color:#629924}
.ark-spectator-bet-input input{min-width:0;width:100%;border:0;background:transparent;color:#eee;padding:.4rem .48rem;outline:0;font-size:.78rem;font-variant-numeric:tabular-nums}
.ark-spectator-bet-input b{padding-right:.45rem;color:#888;font-size:.6rem}
.ark-spectator-bet-summary{display:grid;grid-template-columns:1fr 1fr;gap:.4rem;padding:0 .65rem .45rem;color:#888;font-size:.62rem}
.ark-spectator-bet-summary span:last-child{text-align:right}
.ark-spectator-bet-summary b{display:block;margin-top:.08rem;color:#ccc;font-size:.7rem;font-variant-numeric:tabular-nums}
.ark-spectator-bet-submit{display:block;width:calc(100% - 1.3rem);margin:0 .65rem .58rem;border:0;border-radius:5px;background:linear-gradient(#7baa36,#629924);box-shadow:0 2px 5px rgba(0,0,0,.35);color:#fff;padding:.46rem .55rem;font-size:.75rem;font-weight:700;cursor:pointer}
.ark-spectator-bet-submit:hover:not(:disabled){filter:brightness(1.08)}
.ark-spectator-bet-submit:disabled{background:#4b4947;color:#888;box-shadow:none;cursor:not-allowed}
.ark-spectator-bet-existing{margin:-.18rem .65rem .52rem;color:#888;font-size:.62rem;text-align:center}
.ark-spectator-bet-mobile-trigger,.ark-spectator-bet-sheet-backdrop{display:none}
@media(min-width:800px){
  .round__app__betting.is-active{display:block;grid-area:1/2/3/3;align-self:start;min-width:0;z-index:4}
}
@media(max-width:799px){
  .ark-spectator-bet-desktop{display:none}
  .ark-spectator-bet-mobile-trigger{position:fixed;z-index:1100;display:block;left:50%;bottom:max(1rem,env(safe-area-inset-bottom));transform:translateX(-50%);min-width:9rem;border:0;border-radius:999px;background:linear-gradient(#7baa36,#629924);box-shadow:0 4px 18px rgba(0,0,0,.55);color:#fff;padding:.7rem 1.25rem;font-size:.88rem;font-weight:700}
  .ark-spectator-bet-sheet-backdrop{position:fixed;z-index:2000;inset:0;display:flex;align-items:flex-end;background:rgba(0,0,0,.64)}
  .ark-spectator-bet-sheet{position:relative;width:100%;max-height:min(88vh,38rem);overflow:auto;border-radius:14px 14px 0 0;background:#262421;padding:.85rem .85rem max(.85rem,env(safe-area-inset-bottom));box-shadow:0 -8px 30px rgba(0,0,0,.5)}
  .ark-spectator-bet-sheet-close{position:absolute;z-index:2;top:1.2rem;right:1.25rem;border:0;background:transparent;color:#aaa;font-size:1.5rem;line-height:1;cursor:pointer}
  .ark-spectator-bet-card.is-mobile{border:0;background:transparent;box-shadow:none}
  .ark-spectator-bet-card.is-mobile .ark-spectator-bet-header{padding-left:0;padding-right:2.4rem}
}
`;
