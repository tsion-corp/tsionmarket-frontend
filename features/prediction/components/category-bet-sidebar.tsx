"use client";
import { useAuthSession } from "@/hooks/use-auth-session";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSendToken } from "@/hooks/use-withdraw";
import {
  lowOddsSelectionCount,
  MAX_LOW_ODDS_SELECTIONS,
  type HouseSelection,
} from "../house-slip-store";
import {
  confirmHouseTicket,
  fetchHouseTicketByBookingCode,
  fetchHouseTickets,
  prepareHouseTicket,
  type HouseTicket,
} from "../markets/api";
import { POLYMARKET_BET_CODE_LENGTH } from "../ticket-code";
import {
  HouseTicketModal,
  houseTicketStatusLabel,
  houseTicketSummary,
  houseTicketTone,
  type HouseTicketTone,
} from "./house-ticket-modal";
import { TicketCodeLookup } from "./ticket-code-lookup";
import {
  PredictionBetEmpty,
  PredictionBetPanel,
  PredictionBetSidebarFrame,
} from "./prediction-bet-sidebar";
import { openSignIn } from "@/hooks/use-sign-in";
import { useSignInPrompt } from "@/hooks/use-require-session";
import { isShortBalanceError } from "@/lib/errors";
import { useAddFundsAction } from "@/hooks/use-funds-modal";

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const MIN_STAKE_E6 = 100_000n;
const MIN_LEGS = 3;
const MAX_LEGS = 20;
const MAX_PAYOUT_USDC = 5_000;
const PENDING_KEY = "prediction-house-pending-confirmation-v1";

interface PendingConfirmation {
  ticketId: string;
  transactionHash: string;
}

interface CategoryBetSidebarProps {
  selections: HouseSelection[];
  desktopOpen: boolean;
  mobileOpen: boolean;
  onDesktopOpenChange: (open: boolean) => void;
  onMobileOpenChange: (open: boolean) => void;
  onRemove: (conditionId: string) => void;
  onClear: () => void;
}

function parseUsdc(value: string): bigint | null {
  const match = /^(\d+)(?:\.(\d{0,6}))?$/u.exec(value.trim());
  if (!match) return null;
  try {
    return BigInt(match[1]) * 1_000_000n + BigInt((match[2] ?? "").padEnd(6, "0"));
  } catch {
    return null;
  }
}

function formatE6(value: string | bigint): string {
  const atomic = typeof value === "bigint" ? value : BigInt(value);
  const whole = atomic / 1_000_000n;
  const fraction = (atomic % 1_000_000n).toString().padStart(6, "0").replace(/0+$/u, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

const TICKET_ROW_TONE: Record<HouseTicketTone, { icon: string; summary: string; mark: string }> = {
  active: {
    icon: "border-[#47758f] bg-[#23465a] text-[#9ddfff]",
    summary: "text-[#8ebed3]",
    mark: "•",
  },
  lost: {
    icon: "border-[#8d3e48] bg-[#51262c] text-[#ff9da8]",
    summary: "text-[#ef7e8b]",
    mark: "x",
  },
  won: {
    icon: "border-[#3d7b5f] bg-[#24503c] text-[#80dbae]",
    summary: "text-[#80dbae]",
    mark: "✓",
  },
  void: {
    icon: "border-[#5b5b5b] bg-[#333] text-[#bbb]",
    summary: "text-[#999]",
    mark: "-",
  },
};

function combinedOdds(selections: HouseSelection[]) {
  return selections.reduce((total, selection) => {
    const odds =
      selection.side === "yes"
        ? selection.prediction.yesDecimalOdds
        : selection.prediction.noDecimalOdds;
    return total * odds;
  }, 1);
}

function readPending(): PendingConfirmation | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(
      window.localStorage.getItem(PENDING_KEY) ?? "null"
    ) as Partial<PendingConfirmation> | null;
    return typeof value?.ticketId === "string" && typeof value.transactionHash === "string"
      ? { ticketId: value.ticketId, transactionHash: value.transactionHash }
      : null;
  } catch {
    return null;
  }
}

async function confirmWithRetry(pending: PendingConfirmation) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await confirmHouseTicket(pending.ticketId, pending.transactionHash);
    } catch (error) {
      lastError = error;
      const status = (error as { status?: number }).status;
      if (status !== 502 && status !== 503) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, 1_500));
    }
  }
  throw lastError;
}

function MyHouseBets({ enabled }: { enabled: boolean }) {
  const { authenticated } = useAuthSession();
  const login = openSignIn;
  const [selectedTicket, setSelectedTicket] = useState<HouseTicket | null>(null);
  const query = useQuery({
    queryKey: ["house-prediction-tickets"],
    queryFn: fetchHouseTickets,
    enabled: enabled && authenticated,
    staleTime: 10_000,
    refetchInterval: enabled ? 30_000 : false,
    retry: false,
  });

  if (!authenticated) {
    return (
      <div className="px-5 py-14 text-center">
        <p className="text-xs text-[#999]">Sign in to view your prediction tickets.</p>
        <button
          type="button"
          onClick={login}
          className="mt-4 cursor-pointer rounded-lg bg-[#b9fcff] px-5 py-2 text-xs font-semibold text-[#171717]"
        >
          Sign in
        </button>
      </div>
    );
  }
  if (query.isPending) {
    return (
      <>
        <p className="px-5 py-12 text-center text-xs text-[#888]">Loading your tickets...</p>
        <HouseTicketModal ticket={selectedTicket} onClose={() => setSelectedTicket(null)} />
      </>
    );
  }
  if (query.isError) {
    return (
      <>
        <div className="px-5 py-12 text-center">
          <p className="text-xs text-[#ef9ca5]">Your tickets could not be loaded.</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="mt-3 cursor-pointer text-xs font-semibold text-[#b9fcff]"
          >
            Try again
          </button>
        </div>
        <HouseTicketModal ticket={selectedTicket} onClose={() => setSelectedTicket(null)} />
      </>
    );
  }
  if (!query.data.tickets.length) {
    return (
      <>
        <p className="px-5 py-12 text-center text-xs text-[#888]">No tickets yet.</p>
        <HouseTicketModal ticket={selectedTicket} onClose={() => setSelectedTicket(null)} />
      </>
    );
  }

  return (
    <>
      <div className="divide-y divide-[#2b2b2b] border-y border-[#2b2b2b]">
        {query.data.tickets.map((ticket) => {
          const tone = TICKET_ROW_TONE[houseTicketTone(ticket)];
          return (
            <button
              key={ticket.id}
              type="button"
              onClick={() => setSelectedTicket(ticket)}
              aria-label={`Open ticket ${ticket.bookingCode}`}
              className="flex min-h-[96px] w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#1b1b1b]"
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-full border text-xs font-bold ${tone.icon}`}
              >
                {tone.mark}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold text-white">
                  {ticket.legs.length} selection combo
                </span>
                <span className="mt-0.5 block truncate text-[9px] font-bold tracking-[0.08em] text-[#777] uppercase">
                  {ticket.bookingCode} · {houseTicketStatusLabel(ticket)}
                </span>
                <span className={`mt-2 line-clamp-2 block text-[10px] leading-4 ${tone.summary}`}>
                  {houseTicketSummary(ticket)}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[14px] font-bold text-white tabular-nums">
                  {formatE6(ticket.stakeE6)}
                </span>
                <span className="mt-0.5 block text-[9px] font-semibold text-[#777]">USDC</span>
              </span>
            </button>
          );
        })}
      </div>
      <HouseTicketModal ticket={selectedTicket} onClose={() => setSelectedTicket(null)} />
    </>
  );
}

function AccumulatorSlip({
  selections,
  onRemove,
  onClear,
  onAccepted,
  onBusyChange,
}: {
  selections: HouseSelection[];
  onRemove: (conditionId: string) => void;
  onClear: () => void;
  onAccepted: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { authenticated } = useAuthSession();
  const login = useSignInPrompt("bet");
  const fundsAction = useAddFundsAction();
  const { sendToken } = useSendToken();
  const queryClient = useQueryClient();
  const [stake, setStake] = useState("0.10");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingConfirmation | null>(readPending);
  const stakeE6 = parseUsdc(stake);
  const odds = combinedOdds(selections);
  const lowOddsCount = lowOddsSelectionCount(selections);
  const estimatedWin = stakeE6
    ? Math.min((Number(stakeE6) / 1_000_000) * odds, MAX_PAYOUT_USDC)
    : 0;
  const valid =
    selections.length >= MIN_LEGS &&
    selections.length <= MAX_LEGS &&
    lowOddsCount <= MAX_LOW_ODDS_SELECTIONS &&
    stakeE6 != null &&
    stakeE6 >= MIN_STAKE_E6;

  const place = async () => {
    if (!authenticated) {
      login();
      return;
    }
    if ((!pending && !valid) || stakeE6 == null) return;
    setBusy(true);
    onBusyChange(true);
    try {
      let confirmation = pending;
      if (!confirmation) {
        const prepared = await prepareHouseTicket(
          stakeE6,
          selections.map(({ prediction, side }) => ({
            eventId: prediction.eventId,
            marketId: prediction.marketId,
            conditionId: prediction.conditionId,
            outcome: side,
          }))
        );
        const transactionHash = await sendToken({
          network: "base-mainnet",
          tokenAddress: BASE_USDC,
          decimals: 6,
          to: prepared.treasuryAddress,
          amount: BigInt(prepared.stakeE6),
        });
        confirmation = { ticketId: prepared.id, transactionHash };
        setPending(confirmation);
        window.localStorage.setItem(PENDING_KEY, JSON.stringify(confirmation));
      }
      const ticket = await confirmWithRetry(confirmation);
      window.localStorage.removeItem(PENDING_KEY);
      setPending(null);
      onClear();
      await queryClient.invalidateQueries({ queryKey: ["house-prediction-tickets"] });
      toast.success(`Ticket ${ticket.bookingCode} accepted`);
      onAccepted();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The accumulator could not be placed.",
        isShortBalanceError(error) ? { action: fundsAction } : undefined
      );
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-4 pt-3 text-[10px] text-[#999]">
        <span className="rounded-md bg-[#3b3b3b] px-2 py-1">Accumulator</span>
        <button
          type="button"
          disabled={busy}
          onClick={onClear}
          className="cursor-pointer hover:text-white disabled:opacity-40"
        >
          Clear all
        </button>
      </div>
      <div className="space-y-2 p-3">
        {selections.map(({ prediction, side }, index) => {
          const selectionOdds =
            side === "yes" ? prediction.yesDecimalOdds : prediction.noDecimalOdds;
          return (
            <article
              key={prediction.conditionId}
              className="rounded-lg border border-[#303030] bg-[#191919] p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold text-[#777]">Pick {index + 1}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[#ddd]">
                    {prediction.q}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold text-white">
                    {side === "yes" ? "Yes" : "No"}{" "}
                    <span className="text-[#80dbae]">{selectionOdds.toFixed(2)}</span>
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRemove(prediction.conditionId)}
                  aria-label={`Remove ${prediction.q}`}
                  className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full bg-[#292929] text-[#888] hover:text-white disabled:opacity-40"
                >
                  x
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <div className="mt-auto border-t border-[#2b2b2b] p-4">
        <label className="block text-[10px] font-semibold text-[#999]">
          Stake (Base USDC)
          <div className="mt-2 flex h-11 items-center rounded-lg border border-[#383838] bg-[#191919] px-3">
            <span className="text-sm text-[#777]">$</span>
            <input
              value={stake}
              disabled={busy || pending != null}
              onChange={(event) => setStake(event.target.value)}
              inputMode="decimal"
              aria-label="Stake in USDC"
              className="min-w-0 flex-1 bg-transparent px-2 text-sm font-semibold text-white outline-none"
            />
            <span className="text-[10px] text-[#888]">USDC</span>
          </div>
        </label>
        <div className="mt-3 space-y-1.5 text-[10px]">
          <div className="flex justify-between text-[#888]">
            <span>Total odds</span>
            <span className="font-semibold text-white">{odds.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-[#888]">
            <span>Possible win</span>
            <span className="font-semibold text-white">
              {Number.isFinite(estimatedWin) ? estimatedWin.toFixed(2) : "-"} USDC
            </span>
          </div>
        </div>
        {selections.length < MIN_LEGS ? (
          <p className="mt-3 text-[10px] text-[#ef9ca5]">
            Add {MIN_LEGS - selections.length} more{" "}
            {MIN_LEGS - selections.length === 1 ? "market" : "markets"}.
          </p>
        ) : lowOddsCount > MAX_LOW_ODDS_SELECTIONS ? (
          <p className="mt-3 text-[10px] text-[#ef9ca5]">
            Maximum 3 selections with odds between 1.01 and 1.08.
          </p>
        ) : stakeE6 == null || stakeE6 < MIN_STAKE_E6 ? (
          <p className="mt-3 text-[10px] text-[#ef9ca5]">Minimum stake is 0.10 USDC.</p>
        ) : null}
        <button
          type="button"
          disabled={busy || (!pending && !valid)}
          onClick={() => void place()}
          className="mt-4 h-11 w-full cursor-pointer rounded-lg bg-[#b9fcff] text-xs font-bold text-[#171717] hover:bg-[#a8f5f8] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Confirming ticket..." : pending ? "Confirm funded ticket" : "Place accumulator"}
        </button>
        <p className="mt-2 text-center text-[9px] leading-4 text-[#666]">
          One losing selection loses the entire ticket. Maximum return is 5,000 USDC. Network gas is
          sponsored.
        </p>
      </div>
    </div>
  );
}

function BetPanel({
  selections,
  onRemove,
  onClear,
  onClose,
}: {
  selections: HouseSelection[];
  onRemove: (conditionId: string) => void;
  onClear: () => void;
  onClose?: () => void;
}) {
  const [tab, setTab] = useState<"slip" | "bets">("slip");
  const [busy, setBusy] = useState(false);
  const [lookedUpTicket, setLookedUpTicket] = useState<HouseTicket | null>(null);
  return (
    <>
      <PredictionBetPanel
        count={selections.length}
        tab={tab}
        busy={busy}
        onTabChange={setTab}
        onClose={onClose}
        slip={
          <>
            {selections.length === 0 ? (
              <TicketCodeLookup
                codeLength={POLYMARKET_BET_CODE_LENGTH}
                provider="Polymarket"
                onLookup={async (code) =>
                  setLookedUpTicket(await fetchHouseTicketByBookingCode(code))
                }
              />
            ) : null}
            {selections.length === 0 ? (
              <PredictionBetEmpty
                title="Ticket is empty"
                body="Select Yes or No on at least three markets to build an accumulator."
              />
            ) : (
              <AccumulatorSlip
                selections={selections}
                onRemove={onRemove}
                onClear={onClear}
                onAccepted={() => setTab("bets")}
                onBusyChange={setBusy}
              />
            )}
          </>
        }
        bets={
          <div className="min-h-0 flex-1 overflow-y-auto">
            <MyHouseBets enabled />
          </div>
        }
      />
      <HouseTicketModal ticket={lookedUpTicket} onClose={() => setLookedUpTicket(null)} />
    </>
  );
}

export function CategoryBetSidebar({
  selections,
  desktopOpen,
  mobileOpen,
  onDesktopOpenChange,
  onMobileOpenChange,
  onRemove,
  onClear,
}: CategoryBetSidebarProps) {
  const panel = (close?: () => void) => (
    <BetPanel selections={selections} onRemove={onRemove} onClear={onClear} onClose={close} />
  );
  return (
    <PredictionBetSidebarFrame
      count={selections.length}
      desktopOpen={desktopOpen}
      mobileOpen={mobileOpen}
      onDesktopOpenChange={onDesktopOpenChange}
      onMobileOpenChange={onMobileOpenChange}
      renderPanel={panel}
    />
  );
}
