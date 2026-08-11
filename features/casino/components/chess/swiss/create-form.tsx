"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCreateSwiss } from "@/features/casino/hooks/use-casino-swiss";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import { CHESS_PRIMARY_BUTTON_CLASS } from "@/features/casino/lib/chess/ui";
import {
  ROUNDS_MAX,
  ROUNDS_MIN,
  roundsError,
  TOURNAMENT_NAME_MAX,
  tournamentNameError,
  type SwissGameKind,
} from "@/features/casino/lib/api/swiss";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { ChessTimeControl } from "@/features/casino/lib/api/types";

// Local copy of the create screen's presets. Copied, not imported: the create
// section is its own module and this form must not couple to its internals.
const TIME_CONTROL_PRESETS: ReadonlyArray<{
  value: ChessTimeControl;
  label: string;
}> = [
  { value: "5+0", label: "5 min" },
  { value: "10+0", label: "10 min" },
  { value: "15+0", label: "15 min" },
];

const ROUND_PRESETS = [3, 5, 7] as const;

interface SwissCreateFormProps {
  embedded?: boolean;
  onCreated?: (tournamentId: string) => void;
  // Which board game the tournament runs. Chess unless a draughts surface asks
  // for otherwise, which is what every tournament was before draughts existed.
  game?: SwissGameKind;
}

export function SwissCreateForm({
  embedded = false,
  onCreated,
  game = "chess",
}: SwissCreateFormProps) {
  const t = useTranslations("casino.chess.swiss");
  const router = useRouter();
  const wallet = useCasinoWallet();
  const create = useCreateSwiss();

  const [name, setName] = useState("");
  const [rounds, setRounds] = useState<number>(5);
  const [customRounds, setCustomRounds] = useState(false);
  const [timeControl, setTimeControl] = useState<ChessTimeControl>("10+0");
  const [password, setPassword] = useState("");
  const [forbidden, setForbidden] = useState("");
  const [touched, setTouched] = useState(false);

  const nameError = tournamentNameError(name);
  const badRounds = roundsError(rounds);

  const onCreate = async () => {
    setTouched(true);
    if (!wallet.connected) {
      toast.error(t("toastConnect"));
      return;
    }
    if (nameError || badRounds || create.isPending) return;
    const id = toast.loading(t("toastCreating"));
    try {
      const tournament = await create.mutateAsync({
        name,
        game,
        nbRounds: rounds,
        timeControl,
        password: password || undefined,
        forbiddenPairings: forbidden || undefined,
      });
      toast.success(t("toastCreated"), { id });
      onCreated?.(tournament.id);
      router.push(
        game === "draughts"
          ? `/casino/checkers/tournaments/${tournament.id}?created=1`
          : `/casino/chess/swiss/${tournament.id}?created=1`
      );
    } catch (e) {
      toast.error(friendlyError(e, t("toastCreateFailed")), { id });
    }
  };

  const chipClass = (active: boolean) =>
    `cursor-pointer rounded-lg border border-white/10 px-3.5 py-2 font-sans text-[13px] transition-colors ${
      active
        ? "border-accent/45 bg-accent/12 font-semibold text-white"
        : "text-white hover:bg-white/6"
    }`;

  const labelClass = "mb-2.5 text-[11px] font-normal tracking-[0.05em] text-white/50 uppercase";
  const inputClass =
    "ws-inset w-full rounded-lg px-3 py-2.5 font-sans text-[13px] text-white placeholder:text-white/30 focus:outline-none";

  const content = (
    <>
      {!embedded ? <div className="ws-display mb-4 text-[20px]">{t("formTitle")}</div> : null}

      <div className="mb-4.5">
        <div className={labelClass}>{t("nameLabel")}</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched(true)}
          maxLength={TOURNAMENT_NAME_MAX}
          placeholder={t("namePlaceholder")}
          className={inputClass}
        />
        {touched && nameError ? (
          <div className="mt-1.5 text-[11.5px] font-normal text-white/50">
            {nameError === "tooShort" ? t("nameTooShort") : t("nameTooLong")}
          </div>
        ) : null}
      </div>

      <div className="mb-4.5">
        <div className={labelClass}>{t("roundsLabel")}</div>
        <div className="flex flex-wrap items-center gap-2">
          {ROUND_PRESETS.map((n) => (
            <button
              key={n}
              onClick={() => {
                setRounds(n);
                setCustomRounds(false);
              }}
              className={chipClass(!customRounds && rounds === n)}
            >
              {n}
            </button>
          ))}
          <button onClick={() => setCustomRounds(true)} className={chipClass(customRounds)}>
            {t("roundsCustom")}
          </button>
          {customRounds ? (
            <input
              type="number"
              min={ROUNDS_MIN}
              max={ROUNDS_MAX}
              value={Number.isNaN(rounds) ? "" : rounds}
              onChange={(e) => setRounds(e.target.valueAsNumber)}
              className={`${inputClass} w-20`}
            />
          ) : null}
        </div>
        {customRounds && badRounds ? (
          <div className="mt-1.5 text-[11.5px] font-normal text-white/50">{t("roundsRange")}</div>
        ) : null}
      </div>

      <div className="mb-4.5">
        <div className={labelClass}>{t("timeControl")}</div>
        <div className="flex flex-wrap gap-2">
          {TIME_CONTROL_PRESETS.map((tc) => (
            <button
              key={tc.value}
              onClick={() => setTimeControl(tc.value)}
              className={chipClass(timeControl === tc.value)}
            >
              {tc.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <div className={labelClass}>{t("passwordLabel")}</div>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("passwordPlaceholder")}
          className={inputClass}
        />
        <div className="mt-1.5 text-[11.5px] font-normal text-white/50">{t("passwordNote")}</div>
      </div>

      <div className="mb-5">
        <div className={labelClass}>{t("forbiddenLabel")}</div>
        <textarea
          value={forbidden}
          onChange={(e) => setForbidden(e.target.value)}
          placeholder={t("forbiddenPlaceholder")}
          rows={3}
          className={`${inputClass} resize-y font-mono`}
        />
        <div className="mt-1.5 text-[11.5px] font-normal text-white/50">{t("forbiddenNote")}</div>
      </div>

      <button
        onClick={() => void onCreate()}
        disabled={create.isPending}
        className={`${CHESS_PRIMARY_BUTTON_CLASS} w-full p-3.5 font-sans text-[14px] font-medium`}
      >
        {create.isPending ? t("creating") : t("submit")}
      </button>
      <div className="mt-2.5 text-center text-[11.5px] font-normal text-white/50">
        {t("freeNote")}
      </div>
    </>
  );

  if (embedded) return <div>{content}</div>;

  return <div className="ws-glass mb-8 rounded-2xl p-5.5">{content}</div>;
}
