"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSwissTournament } from "@/hooks/use-casino-swiss";
import { useCasinoWallet } from "@/hooks/use-casino-wallet";
import { CasinoError, CasinoLoading } from "@/components/dashboard/casino/casino-state";
import { SwissStandings } from "@/components/dashboard/casino/chess/swiss/standings";
import { SwissRoundPairings } from "@/components/dashboard/casino/chess/swiss/pairings";
import {
  defaultPlayerName,
  hasOngoingPairing,
  playerNameError,
  PLAYER_NAME_MAX,
  type SwissDetail,
} from "@/lib/casino/api/swiss";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

type Translator = ReturnType<typeof useTranslations>;

const STATE_KEY: Record<SwissDetail["state"], string> = {
  open: "statusOpen",
  running: "statusRunning",
  finished: "statusFinished",
};

function JoinPanel({
  join,
  joining,
}: {
  join: (input: { name: string; password?: string }) => Promise<unknown>;
  joining: boolean;
}) {
  const t = useTranslations("casino.chess.swiss");
  const wallet = useCasinoWallet();
  // Null means the user has not typed a name, so the wallet-derived suggestion
  // shows; a name they have typed is never replaced.
  const [typedName, setTypedName] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);

  const name = typedName ?? defaultPlayerName(wallet.address);
  const nameError = playerNameError(name);

  const onJoin = async () => {
    setTouched(true);
    if (!wallet.connected) {
      toast.error(t("toastConnect"));
      return;
    }
    if (nameError || joining) return;
    const id = toast.loading(t("toastJoining"));
    try {
      await join({ name, password: password || undefined });
      toast.success(t("toastJoined"), { id });
    } catch (e) {
      toast.error(friendlyError(e, t("toastJoinFailed")), { id });
    }
  };

  const inputClass =
    "ws-inset w-full rounded-lg px-3 py-2.5 font-sans text-[13px] text-white placeholder:text-white/30 focus:outline-none";

  return (
    <div className="ws-glass mb-8 rounded-2xl p-5.5">
      <div className="ws-display mb-4 text-[18px]">{t("joinTitle")}</div>
      <div className="flex flex-wrap gap-3">
        <div className="min-w-[220px] flex-1">
          <div className="mb-2 text-[11px] font-normal tracking-[0.05em] text-white/50 uppercase">
            {t("joinNameLabel")}
          </div>
          <input
            value={name}
            onChange={(e) => setTypedName(e.target.value)}
            onBlur={() => setTouched(true)}
            maxLength={PLAYER_NAME_MAX}
            className={inputClass}
          />
          {touched && nameError ? (
            <div className="mt-1.5 text-[11.5px] font-normal text-white/50">{t("nameInvalid")}</div>
          ) : (
            <div className="mt-1.5 text-[11.5px] font-normal text-white/50">
              {t("joinNameNote")}
            </div>
          )}
        </div>
        <div className="min-w-[180px] flex-1">
          <div className="mb-2 text-[11px] font-normal tracking-[0.05em] text-white/50 uppercase">
            {t("joinPasswordLabel")}
          </div>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("joinPasswordPlaceholder")}
            className={inputClass}
          />
          <div className="mt-1.5 text-[11.5px] font-normal text-white/50">
            {t("joinPasswordNote")}
          </div>
        </div>
      </div>
      <button
        onClick={() => void onJoin()}
        disabled={joining}
        className="text-ink mt-4 w-full cursor-pointer rounded-full bg-white p-3 font-sans text-[13.5px] font-bold transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {joining ? t("joiningLabel") : t("joinSubmit")}
      </button>
    </div>
  );
}

function headerLine(t: Translator, detail: SwissDetail): string {
  const parts = [
    detail.state === "open"
      ? t("notStarted")
      : t("roundOf", { round: detail.round, total: detail.nbRounds }),
    detail.timeControl,
    t("playersCount", { count: detail.participantCount }),
    t("organizerLine", { name: detail.organizer }),
  ];
  return parts.join(" · ");
}

export function SwissDetailSection({ tournamentId }: { tournamentId: string }) {
  const t = useTranslations("casino.chess.swiss");
  const {
    detail,
    yourName,
    isOrganizer,
    isLoading,
    error,
    refetch,
    join,
    joining,
    withdraw,
    withdrawing,
    startNextRound,
    startingRound,
  } = useSwissTournament(tournamentId);

  const onStartRound = async () => {
    if (startingRound) return;
    const id = toast.loading(t("toastStartingRound"));
    try {
      await startNextRound();
      toast.success(t("toastRoundStarted"), { id });
    } catch (e) {
      // The service explains its refusals well (round still in play, too few
      // players), so its message is shown as-is.
      toast.error(friendlyError(e, t("toastRoundFailed")), { id });
    }
  };

  const onWithdraw = async () => {
    if (!detail || withdrawing) return;
    // Leaving mid-round concedes the board this player is due to be playing;
    // without the forfeit their opponent would sit against an empty chair.
    const forfeit = hasOngoingPairing(detail, yourName);
    const id = toast.loading(t("toastWithdrawing"));
    try {
      await withdraw({ forfeit });
      toast.success(t("toastWithdrawn"), { id });
    } catch (e) {
      toast.error(friendlyError(e, t("toastWithdrawFailed")), { id });
    }
  };

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[860px] px-4 pt-10 pb-20 sm:px-6">
        <CasinoError error={error} subject={t("subjectDetail")} onRetry={refetch} />
      </div>
    );
  }
  if (isLoading || !detail) {
    return (
      <div className="mx-auto w-full max-w-[860px] px-4 pt-10 pb-20 sm:px-6">
        <CasinoLoading label={t("loadingDetail")} rows={5} />
      </div>
    );
  }

  // Latest round first: the board people came to see is the one in play.
  const rounds = [...detail.rounds].sort((a, b) => b.round - a.round);
  const joined = yourName !== null;

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 pt-8 pb-20 sm:px-6">
      <Link
        href="/casino/chess/swiss"
        className="mb-5 inline-block text-[12.5px] font-normal text-white/50 transition-colors hover:text-white"
      >
        ← {t("allTournaments")}
      </Link>

      <div className="mb-7">
        <div className="mb-1.5 flex flex-wrap items-center gap-3">
          <div className="ws-display text-[26px]">{detail.name}</div>
          <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white/70">
            {t(STATE_KEY[detail.state])}
          </span>
        </div>
        <div className="text-[12.5px] font-normal text-white/55">{headerLine(t, detail)}</div>
        {detail.state === "finished" && detail.winner ? (
          <div className="text-ink mt-3 inline-block rounded-full bg-white px-4 py-1.5 font-sans text-[13px] font-bold">
            {t("winner", { name: detail.winner })}
          </div>
        ) : null}
      </div>

      {isOrganizer && detail.state !== "finished" ? (
        <div className="ws-inset mb-8 flex flex-wrap items-center justify-between gap-3 rounded-[14px] px-4.5 py-3.5">
          <div className="text-[12.5px] font-normal text-white/55">{t("organizerHint")}</div>
          <button
            onClick={() => void onStartRound()}
            disabled={startingRound}
            className="text-ink cursor-pointer rounded-full bg-white px-5 py-2 font-sans text-[13px] font-bold disabled:cursor-not-allowed disabled:opacity-45"
          >
            {startingRound ? t("startingRound") : t("startRound")}
          </button>
        </div>
      ) : null}

      {!joined && detail.state !== "finished" ? <JoinPanel join={join} joining={joining} /> : null}

      {joined && detail.state !== "finished" ? (
        <div className="ws-inset mb-8 flex flex-wrap items-center justify-between gap-3 rounded-[14px] px-4.5 py-3.5">
          <div className="text-[12.5px] font-normal text-white/55">
            {t("youPlayAs", { name: yourName as string })}
          </div>
          <button
            onClick={() => void onWithdraw()}
            disabled={withdrawing}
            className="cursor-pointer rounded-full border border-white/15 px-4 py-1.5 font-sans text-[12px] font-semibold text-white/70 transition-colors hover:border-white/35 hover:text-white disabled:opacity-45"
          >
            {withdrawing ? t("withdrawingLabel") : t("withdrawButton")}
          </button>
        </div>
      ) : null}

      <div className="ws-display mb-3 text-[18px]">{t("standingsTitle")}</div>
      <SwissStandings standings={detail.standings} yourName={yourName} />

      {rounds.length > 0 ? (
        <>
          <div className="ws-display mt-9 mb-3 text-[18px]">{t("pairingsTitle")}</div>
          {rounds.map((round) => (
            <SwissRoundPairings key={round.round} round={round} yourName={yourName} />
          ))}
        </>
      ) : null}
    </div>
  );
}
