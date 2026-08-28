"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCreateSwiss } from "@/features/casino/hooks/use-casino-swiss";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import { useChessCashierStatus } from "@/features/casino/hooks/use-chess-cashier";
import { normalizeUsdcAmount, parseUsdcAmount } from "@/features/casino/lib/api/cashier";
import { CHESS_PRIMARY_BUTTON_CLASS } from "@/features/casino/lib/chess/ui";
import {
  HIGH_STAKES_ENTRY_MIN_USDC,
  HIGH_STAKES_PLAYERS_MAX,
  HIGH_STAKES_PLAYERS_MIN,
  CHAMPIONS_PLAYERS_MAX,
  CHAMPIONS_PLAYERS_MIN,
  championsPlan,
  ROUNDS_MAX,
  ROUNDS_MIN,
  roundsError,
  TOURNAMENT_NAME_MAX,
  tournamentNameError,
  type SwissGameKind,
  type SwissFormat,
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
  format?: SwissFormat;
}

export function SwissCreateForm({
  embedded = false,
  onCreated,
  game = "chess",
  format = "swiss",
}: SwissCreateFormProps) {
  const t = useTranslations("casino.chess.swiss");
  const router = useRouter();
  const wallet = useCasinoWallet();
  const cashier = useChessCashierStatus();
  const create = useCreateSwiss();

  const [name, setName] = useState("");
  const [rounds, setRounds] = useState<number>(5);
  const [customRounds, setCustomRounds] = useState(false);
  const [timeControl, setTimeControl] = useState<ChessTimeControl>("10+0");
  const [password, setPassword] = useState("");
  const [forbidden, setForbidden] = useState("");
  const [highStakes, setHighStakes] = useState(false);
  const [entryFee, setEntryFee] = useState(HIGH_STAKES_ENTRY_MIN_USDC);
  const [maxPlayers, setMaxPlayers] = useState(
    format === "champions" ? CHAMPIONS_PLAYERS_MAX : HIGH_STAKES_PLAYERS_MIN
  );
  const [knockoutGamesPerTie, setKnockoutGamesPerTie] = useState<1 | 2>(1);
  const [touched, setTouched] = useState(false);

  const nameError = tournamentNameError(name);
  const preview = format === "champions" ? championsPlan(maxPlayers) : null;
  const badRounds = format === "swiss" && roundsError(rounds);
  const entryFeeUnits = parseUsdcAmount(entryFee);
  const minimumEntryUnits = parseUsdcAmount(HIGH_STAKES_ENTRY_MIN_USDC) as bigint;
  const normalizedEntryFee = normalizeUsdcAmount(entryFee);
  const badEntryFee = highStakes && (entryFeeUnits === null || entryFeeUnits < minimumEntryUnits);
  const badMaxPlayers =
    (format === "champions" || highStakes) &&
    (!Number.isInteger(maxPlayers) ||
      maxPlayers < (format === "champions" ? CHAMPIONS_PLAYERS_MIN : HIGH_STAKES_PLAYERS_MIN) ||
      maxPlayers >
        (format === "champions"
          ? CHAMPIONS_PLAYERS_MAX
          : highStakes
            ? HIGH_STAKES_PLAYERS_MAX
            : CHAMPIONS_PLAYERS_MAX));

  const onCreate = async () => {
    setTouched(true);
    if (!wallet.connected) {
      toast.error(t("toastConnect"));
      return;
    }
    if (nameError || badRounds || badEntryFee || badMaxPlayers || create.isPending) return;
    const id = toast.loading(t("toastCreating"));
    try {
      const tournament = await create.mutateAsync({
        name,
        game,
        nbRounds: preview?.leagueRounds ?? rounds,
        timeControl,
        format,
        knockoutGamesPerTie,
        ...(format === "champions" ? { maxPlayers } : {}),
        ...(highStakes && normalizedEntryFee
          ? {
              entryFeeUsdc: normalizedEntryFee,
              maxPlayers,
              prizePolicy: "highStakes" as const,
            }
          : {}),
        password: password || undefined,
        forbiddenPairings: forbidden || undefined,
      });
      toast.success(t("toastCreated"), { id });
      onCreated?.(tournament.id);
      router.push(
        game === "draughts"
          ? `/casino/checkers/tournaments/${tournament.id}?created=1`
          : format === "champions"
            ? `/casino/chess/tournaments/${tournament.id}?created=1`
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

      <div className="mb-5 rounded-[12px] border border-white/8 bg-black/12 p-3.5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[13px] font-semibold text-white">Prize tournament</div>
            <div className="mt-1 text-[11.5px] leading-5 text-white/48">
              Each entrant locks the same entry fee. The winner receives 50% of the final pool; the
              platform keeps 50%.
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={highStakes}
            onClick={() =>
              setHighStakes((enabled) => {
                const next = !enabled;
                if (next && format !== "champions" && maxPlayers > HIGH_STAKES_PLAYERS_MAX) {
                  setMaxPlayers(HIGH_STAKES_PLAYERS_MAX);
                }
                return next;
              })
            }
            disabled={!cashier.configured}
            className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-35 ${
              highStakes ? "bg-[#629924]" : "bg-white/14"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                highStakes ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {!cashier.configured ? (
          <div className="mt-2 text-[11.5px] text-white/42">
            Prize tournaments are unavailable until the chess cashier is online.
          </div>
        ) : highStakes ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {format !== "champions" ? (
              <label>
                <span className={labelClass}>Entry per player</span>
                <div className="flex items-center rounded-lg border border-white/8 bg-black/14 px-3">
                  <input
                    inputMode="decimal"
                    value={entryFee}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (/^\d*\.?\d{0,6}$/.test(value)) setEntryFee(value);
                    }}
                    className="tnum min-w-0 flex-1 bg-transparent py-2.5 text-[13px] text-white outline-none"
                  />
                  <span className="text-[10.5px] font-semibold text-white/42">USD</span>
                </div>
                <span
                  className={`mt-1.5 block text-[11px] ${badEntryFee ? "text-down" : "text-white/40"}`}
                >
                  Minimum {HIGH_STAKES_ENTRY_MIN_USDC} USD
                </span>
              </label>
            ) : null}
            {format !== "champions" ? (
              <label>
                <span className={labelClass}>Player capacity</span>
                <input
                  type="number"
                  min={HIGH_STAKES_PLAYERS_MIN}
                  max={HIGH_STAKES_PLAYERS_MAX}
                  value={Number.isNaN(maxPlayers) ? "" : maxPlayers}
                  onChange={(event) => setMaxPlayers(event.target.valueAsNumber)}
                  className={inputClass}
                />
                <span
                  className={`mt-1.5 block text-[11px] ${badMaxPlayers ? "text-down" : "text-white/40"}`}
                >
                  {HIGH_STAKES_PLAYERS_MIN}–{HIGH_STAKES_PLAYERS_MAX} players; at least 4 must join
                  before round 1.
                </span>
              </label>
            ) : null}
            <div className="rounded-lg border border-white/7 bg-white/[0.025] px-3 py-2.5 text-[11.5px] leading-5 text-white/52 sm:col-span-2">
              Creating is free. The entry is locked only when a player joins, and withdrawing before
              the tournament starts refunds it automatically.
            </div>
          </div>
        ) : null}
      </div>

      {format === "champions" ? (
        <div className="mb-5 rounded-[12px] border border-white/8 bg-black/12 p-3.5">
          <div className={labelClass}>Player capacity</div>
          <input
            type="number"
            min={CHAMPIONS_PLAYERS_MIN}
            max={CHAMPIONS_PLAYERS_MAX}
            value={Number.isNaN(maxPlayers) ? "" : maxPlayers}
            onChange={(event) => setMaxPlayers(event.target.valueAsNumber)}
            className={inputClass}
          />
          <div className={`mt-2 text-[11.5px] ${badMaxPlayers ? "text-down" : "text-white/48"}`}>
            Choose 4 to 10,000 players. The final format is calculated from the players who join.
          </div>
          {preview ? (
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11.5px] sm:grid-cols-4">
              <div className="rounded-lg bg-white/4 p-2.5">
                <div className="text-white/40">League</div>
                <div className="mt-1 font-semibold text-white">{preview.leagueRounds} rounds</div>
              </div>
              <div className="rounded-lg bg-white/4 p-2.5">
                <div className="text-white/40">Direct</div>
                <div className="mt-1 font-semibold text-white">{preview.directQualifiers}</div>
              </div>
              <div className="rounded-lg bg-white/4 p-2.5">
                <div className="text-white/40">Playoffs</div>
                <div className="mt-1 font-semibold text-white">{preview.playoffPlayers}</div>
              </div>
              <div className="rounded-lg bg-white/4 p-2.5">
                <div className="text-white/40">Final bracket</div>
                <div className="mt-1 font-semibold text-white">{preview.bracketSize}</div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {format === "swiss" ? (
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
      ) : null}

      {format === "champions" ? (
        <div className="mb-4.5">
          <div className={labelClass}>Knockout ties</div>
          <div className="flex gap-2">
            {([1, 2] as const).map((games) => (
              <button
                key={games}
                type="button"
                onClick={() => setKnockoutGamesPerTie(games)}
                className={chipClass(knockoutGamesPerTie === games)}
              >
                {games === 1 ? "Single game" : "Two games"}
              </button>
            ))}
          </div>
          <div className="mt-2 text-[11.5px] text-white/48">
            A tied knockout goes to a 5 vs 4 minute Armageddon game. Black advances on a draw.
          </div>
        </div>
      ) : null}

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
        disabled={create.isPending || badEntryFee || badMaxPlayers}
        className={`${CHESS_PRIMARY_BUTTON_CLASS} w-full p-3.5 font-sans text-[14px] font-medium`}
      >
        {create.isPending ? t("creating") : t("submit")}
      </button>
      <div className="mt-2.5 text-center text-[11.5px] font-normal text-white/50">
        {highStakes
          ? `${normalizedEntryFee ?? entryFee} USD entry · 50% winner pool · 50% platform`
          : t("freeNote")}
      </div>
    </>
  );

  if (embedded) return <div>{content}</div>;

  return <div className="ws-glass mb-8 rounded-2xl p-5.5">{content}</div>;
}
