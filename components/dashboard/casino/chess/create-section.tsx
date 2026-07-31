"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCreateChallenge } from "@/hooks/use-casino-chess";
import { useCasinoWallet } from "@/hooks/use-casino-wallet";
import { useChessCashierStatus } from "@/hooks/use-chess-cashier";
import { exceedsUsdcBalance, normalizeUsdcAmount } from "@/lib/casino/api/cashier";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import {
  TIME_CONTROL_PRESETS,
  type ChessTimeControl,
  type CreateChessChallengeInput,
} from "@/lib/casino/api/types";

const DECIMAL = /^\d*\.?\d*$/;
const STAKE_CHIPS = ["1", "5", "10", "25"] as const;

export function CreateSection() {
  const t = useTranslations("casino.chess.create");
  const tStake = useTranslations("casino.chess.stake");
  const router = useRouter();
  const wallet = useCasinoWallet();
  const cashier = useChessCashierStatus();
  const create = useCreateChallenge();

  const [mode, setMode] = useState<"invite" | "auto">("invite");
  const [timeControl, setTimeControl] = useState<ChessTimeControl>("5+3");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [stake, setStake] = useState("");

  // The stake only exists once the cashier is live. Empty or zero means a
  // free game, exactly what this screen always created.
  const stakeUsdc = (cashier.configured ? normalizeUsdcAmount(stake) : null) ?? undefined;
  const stakeOverBalance =
    stakeUsdc !== undefined && exceedsUsdcBalance(stakeUsdc, cashier.available);

  const onCreate = async () => {
    if (!wallet.connected) {
      toast.error(t("toastConnect"));
      return;
    }
    if (create.isPending || stakeOverBalance) return;
    const id = toast.loading(t("toastCreating"));
    try {
      // Widened rather than inlined so the optional stake passes the create
      // mutation's CreateChessChallengeInput parameter without an excess
      // property error; the API client forwards it as stake_usdc.
      const input: CreateChessChallengeInput & { stakeUsdc?: string } = {
        timeControl,
        mode,
        ...(stakeUsdc !== undefined ? { stakeUsdc } : {}),
      };
      const { challenge, ticket } = await create.mutateAsync(input);
      if (mode === "auto" && ticket) {
        toast.success(t("toastCreatedAuto"), { id });
        router.push(`/casino/chess/matchmaking?ticket=${ticket.id}`);
        return;
      }
      toast.success(t("toastCreatedInvite"), { id });
      setInviteUrl(
        challenge.inviteCode
          ? `${window.location.origin}/casino/chess/invite?code=${challenge.inviteCode}`
          : null
      );
    } catch (e) {
      toast.error(friendlyError(e, t("toastCreateFailed")), { id });
    }
  };

  const chipClass = (active: boolean) =>
    `cursor-pointer rounded-lg border border-white/10 px-3.5 py-2 font-sans text-[13px] transition-colors ${
      active ? "bg-accent text-ink border-accent font-semibold" : "text-white hover:bg-white/6"
    }`;

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pt-10 pb-20 sm:px-6">
      <div className="ws-display mb-6 text-[26px]">{t("title")}</div>

      <div className="ws-inset mb-5 flex gap-2 rounded-full p-1">
        {(["invite", "auto"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setInviteUrl(null);
            }}
            className={`flex-1 cursor-pointer rounded-full py-2.5 font-sans text-[13px] font-semibold transition-colors ${
              mode === m ? "text-ink bg-white" : "text-white/50"
            }`}
          >
            {m === "invite" ? t("modeInvite") : t("modeAuto")}
          </button>
        ))}
      </div>

      <div className="ws-glass mb-4.5 rounded-2xl p-5.5">
        <div className="mb-2.5 text-[11px] font-normal tracking-[0.05em] text-white/50 uppercase">
          {t("timeControl")}
        </div>
        <div className="flex flex-wrap gap-2">
          {TIME_CONTROL_PRESETS.map((tc) => (
            <button
              key={tc}
              onClick={() => setTimeControl(tc)}
              className={chipClass(timeControl === tc)}
            >
              {tc}
            </button>
          ))}
        </div>
        <div className="mt-4 text-[11.5px] font-normal text-white/50">{t("randomColourNote")}</div>
      </div>

      {cashier.configured ? (
        <div className="ws-glass mb-4.5 rounded-2xl p-5.5">
          <div className="mb-2.5 text-[11px] font-normal tracking-[0.05em] text-white/50 uppercase">
            {tStake("label")}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {STAKE_CHIPS.map((v) => (
              <button
                key={v}
                onClick={() => setStake(stake === v ? "" : v)}
                className={chipClass(stake === v)}
              >
                {v}
              </button>
            ))}
            <div className="ws-inset flex min-w-[110px] flex-1 items-center gap-1.5 rounded-lg px-3 py-2">
              <input
                inputMode="decimal"
                placeholder="0"
                value={stake}
                onChange={(e) => DECIMAL.test(e.target.value) && setStake(e.target.value)}
                className="tnum w-full min-w-0 bg-transparent text-[13px] text-white outline-none placeholder:text-white/30"
              />
              <span className="shrink-0 text-[11px] font-normal text-white/45">USDC</span>
            </div>
          </div>
          {stakeOverBalance ? (
            <div className="text-down mt-2.5 text-[12px] font-normal">
              {tStake("needsBalance", { amount: stakeUsdc ?? "0" })}
            </div>
          ) : null}
          {cashier.feePct !== null ? (
            <div className="mt-4 text-[11.5px] font-normal text-white/50">
              {tStake("note", { pct: cashier.feePct })}
            </div>
          ) : null}
        </div>
      ) : null}

      {inviteUrl ? (
        <div className="border-accent/35 rounded-[14px] border bg-white/4 px-5 py-4.5">
          <div className="mb-2 text-[12px] font-normal text-white/50">{t("inviteReady")}</div>
          <div className="flex gap-2">
            <div className="text-accent ws-inset min-w-0 flex-1 truncate rounded-lg px-3 py-2.5 text-[12px]">
              {inviteUrl}
            </div>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(inviteUrl);
                toast.success(t("linkCopied"));
              }}
              className="bg-accent text-ink cursor-pointer rounded-lg px-4 font-sans text-[12px] font-bold"
            >
              {t("copy")}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => void onCreate()}
          disabled={create.isPending || stakeOverBalance}
          className="text-ink w-full cursor-pointer rounded-full bg-white p-3.5 font-sans text-[14px] font-bold transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {create.isPending
            ? t("creating")
            : mode === "invite"
              ? t("submitInvite")
              : t("submitAuto")}
        </button>
      )}
    </div>
  );
}
