"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CasinoError } from "@/features/casino/components/casino-state";
import { loadLichessStyle } from "@/features/casino/components/chess-app/lichess-round";
import { useCreateSwiss } from "@/features/casino/hooks/use-casino-swiss";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import { useChessCashierStatus } from "@/features/casino/hooks/use-chess-cashier";
import { normalizeUsdcAmount, parseUsdcAmount } from "@/features/casino/lib/api/cashier";
import {
  CHAMPIONS_PLAYERS_MAX,
  CHAMPIONS_PLAYERS_MIN,
  HIGH_STAKES_ENTRY_MIN_USDC,
  HIGH_STAKES_PLAYERS_MAX,
  HIGH_STAKES_PLAYERS_MIN,
  ROUNDS_MAX,
  ROUNDS_MIN,
  TOURNAMENT_NAME_MAX,
  championsPlan,
  roundsError,
  tournamentNameError,
  type SwissFormat,
  type SwissGameKind,
} from "@/features/casino/lib/api/swiss";
import type { ChessTimeControl } from "@/features/casino/lib/api/types";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

const THEME_CSS = "/css/lib.theme.all.ca09c987.css";
const SITE_CSS = "/css/site.5a4b7c75.css";
const SWISS_FORM_CSS = "/css/swiss.form.8fccd342.css";

const TIME_CONTROL_PRESETS: ReadonlyArray<{
  value: ChessTimeControl;
  label: string;
}> = [
  { value: "5+0", label: "5 minutes + 0 seconds" },
  { value: "10+0", label: "10 minutes + 0 seconds" },
  { value: "15+0", label: "15 minutes + 0 seconds" },
];

interface SwissCreateFormProps {
  embedded?: boolean;
  onCreated?: (tournamentId: string) => void;
  game?: SwissGameKind;
  format?: SwissFormat;
}

function SwissFieldset({
  title,
  initiallyOpen,
  children,
}: {
  title: string;
  initiallyOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const toggle = () => setOpen((current) => !current);

  return (
    <fieldset
      className={
        open ? "toggle-box toggle-box--toggle" : "toggle-box toggle-box--toggle toggle-box--toggle-off"
      }
    >
      <legend
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggle();
          }
        }}
      >
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function FormGroup({
  id,
  label,
  help,
  invalid = false,
  children,
}: {
  id: string;
  label: string;
  help?: ReactNode;
  invalid?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={invalid ? "form-group form-half is-invalid" : "form-group form-half"}>
      <label className="form-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {help ? <small className="form-help">{help}</small> : null}
    </div>
  );
}

function CheckGroup({
  id,
  checked,
  disabled = false,
  onChange,
  label,
  help,
}: {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  help: ReactNode;
}) {
  return (
    <div className="form-check form-group form-half">
      <div className="form-check__container">
        <span className="form-check__input">
          <input
            id={id}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
          />
          <label className="form-check__label" htmlFor={id} />
        </span>
        <label className="form-label" htmlFor={id}>
          {label}
        </label>
      </div>
      <small className="form-help">{help}</small>
    </div>
  );
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
  const [assetError, setAssetError] = useState<Error | null>(null);
  const [name, setName] = useState("");
  const [rounds, setRounds] = useState<number>(5);
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

  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    const hadLight = root.classList.contains("light");
    const hadTransparent = root.classList.contains("transp");
    root.classList.remove("light", "transp");
    root.classList.add("dark");

    void Promise.all([
      loadLichessStyle(THEME_CSS),
      loadLichessStyle(SITE_CSS),
      loadLichessStyle(SWISS_FORM_CSS),
    ]).catch((error) => {
      setAssetError(error instanceof Error ? error : new Error("Unable to load the Swiss form"));
    });

    return () => {
      if (!hadDark) root.classList.remove("dark");
      if (hadLight) root.classList.add("light");
      if (hadTransparent) root.classList.add("transp");
    };
  }, []);

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
        (format === "champions" ? CHAMPIONS_PLAYERS_MAX : HIGH_STAKES_PLAYERS_MAX));

  const onCreate = async () => {
    setTouched(true);
    if (!wallet.connected) {
      toast.error(t("toastConnect"));
      return;
    }
    if (nameError || badRounds || badEntryFee || badMaxPlayers || create.isPending) return;

    const toastId = toast.loading(t("toastCreating"));
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
      toast.success(t("toastCreated"), { id: toastId });
      onCreated?.(tournament.id);
      const destination =
        game === "draughts"
          ? "/casino/checkers/tournaments/" + tournament.id + "?created=1"
          : format === "champions"
            ? "/casino/chess/tournaments/" + tournament.id + "?created=1"
            : "/casino/chess/swiss/" + tournament.id + "?created=1";
      router.push(destination);
    } catch (error) {
      toast.error(friendlyError(error, t("toastCreateFailed")), { id: toastId });
    }
  };

  if (assetError) {
    return <CasinoError error={assetError} subject="the Swiss tournament form" />;
  }

  const content = (
    <form
      className="form3"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void onCreate();
      }}
    >
      {!embedded ? <h1 className="box__top">{t("formTitle")}</h1> : null}

      <div className="form-group">
        <Link className="text" href="/casino/chess/swiss#help">
          Tournament format and pairing guide
        </Link>
      </div>

      <SwissFieldset title="Tournament" initiallyOpen>
        <div className="form-split">
          <FormGroup
            id="swiss-name"
            label={t("nameLabel")}
            invalid={touched && nameError !== null}
            help={
              touched && nameError
                ? nameError === "tooShort"
                  ? t("nameTooShort")
                  : t("nameTooLong")
                : "Use a clear, safe name for the event."
            }
          >
            <input
              id="swiss-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => setTouched(true)}
              maxLength={TOURNAMENT_NAME_MAX}
              placeholder={t("namePlaceholder")}
              className="form-control"
              autoFocus={!embedded}
            />
          </FormGroup>
          {format === "swiss" ? (
            <FormGroup
              id="swiss-rounds"
              label={t("roundsLabel")}
              invalid={Boolean(badRounds)}
              help={badRounds ? t("roundsRange") : ROUNDS_MIN + " to " + ROUNDS_MAX + " rounds."}
            >
              <input
                id="swiss-rounds"
                type="number"
                min={ROUNDS_MIN}
                max={ROUNDS_MAX}
                value={Number.isNaN(rounds) ? "" : rounds}
                onChange={(event) => setRounds(event.target.valueAsNumber)}
                className="form-control"
              />
            </FormGroup>
          ) : (
            <FormGroup
              id="swiss-capacity"
              label="Player capacity"
              invalid={badMaxPlayers}
              help="Choose 4 to 10,000 players. The final bracket follows the joined field."
            >
              <input
                id="swiss-capacity"
                type="number"
                min={CHAMPIONS_PLAYERS_MIN}
                max={CHAMPIONS_PLAYERS_MAX}
                value={Number.isNaN(maxPlayers) ? "" : maxPlayers}
                onChange={(event) => setMaxPlayers(event.target.valueAsNumber)}
                className="form-control"
              />
            </FormGroup>
          )}
        </div>

        <div className="form-split">
          <CheckGroup
            id="swiss-prize"
            checked={highStakes}
            disabled={!cashier.configured}
            onChange={(enabled) => {
              if (enabled && format !== "champions" && maxPlayers > HIGH_STAKES_PLAYERS_MAX) {
                setMaxPlayers(HIGH_STAKES_PLAYERS_MAX);
              }
              setHighStakes(enabled);
            }}
            label="Prize tournament"
            help={
              cashier.configured
                ? "Entrants lock equal fees. The winner pool receives 50%; the platform keeps 50%."
                : "Prize tournaments are unavailable until the chess cashier is online."
            }
          />
          <div className="form-group form-half" aria-hidden />
        </div>

        {highStakes ? (
          <>
            <div className="form-split">
              {format !== "champions" ? (
                <FormGroup
                  id="swiss-entry"
                  label="Entry per player"
                  invalid={badEntryFee}
                  help={"Minimum " + HIGH_STAKES_ENTRY_MIN_USDC + " USD."}
                >
                  <input
                    id="swiss-entry"
                    inputMode="decimal"
                    value={entryFee}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (/^\d*\.?\d{0,6}$/.test(value)) setEntryFee(value);
                    }}
                    className="form-control"
                  />
                </FormGroup>
              ) : (
                <div className="form-group form-half" aria-hidden />
              )}
              {format !== "champions" ? (
                <FormGroup
                  id="swiss-max-players"
                  label="Player capacity"
                  invalid={badMaxPlayers}
                  help={
                    HIGH_STAKES_PLAYERS_MIN +
                    " to " +
                    HIGH_STAKES_PLAYERS_MAX +
                    " players; at least 4 must join."
                  }
                >
                  <input
                    id="swiss-max-players"
                    type="number"
                    min={HIGH_STAKES_PLAYERS_MIN}
                    max={HIGH_STAKES_PLAYERS_MAX}
                    value={Number.isNaN(maxPlayers) ? "" : maxPlayers}
                    onChange={(event) => setMaxPlayers(event.target.valueAsNumber)}
                    className="form-control"
                  />
                </FormGroup>
              ) : (
                <div className="form-group form-half" aria-hidden />
              )}
            </div>
            <small className="form-help">
              Creating is free. Entry is locked only when a player joins and refunded if they
              withdraw before the tournament starts.
            </small>
          </>
        ) : null}

        {format === "champions" && preview ? (
          <small className="form-help">
            {preview.leagueRounds} league rounds, {preview.directQualifiers} direct qualifiers,{" "}
            {preview.playoffPlayers} playoff places, and a {preview.bracketSize}-player bracket.
          </small>
        ) : null}
      </SwissFieldset>

      <SwissFieldset title="Games" initiallyOpen>
        <div className="form-split">
          <FormGroup id="swiss-clock" label={t("timeControl")}>
            <select
              id="swiss-clock"
              value={timeControl}
              onChange={(event) => setTimeControl(event.target.value as ChessTimeControl)}
              className="form-control"
            >
              {TIME_CONTROL_PRESETS.map((control) => (
                <option key={control.value} value={control.value}>
                  {control.label}
                </option>
              ))}
            </select>
          </FormGroup>
          {format === "champions" ? (
            <FormGroup
              id="swiss-knockout-games"
              label="Knockout ties"
              help="Ties go to Armageddon; Black advances on a draw."
            >
              <select
                id="swiss-knockout-games"
                value={knockoutGamesPerTie}
                onChange={(event) =>
                  setKnockoutGamesPerTie(Number(event.target.value) === 2 ? 2 : 1)
                }
                className="form-control"
              >
                <option value={1}>Single game</option>
                <option value={2}>Two games</option>
              </select>
            </FormGroup>
          ) : (
            <div className="form-group form-half" aria-hidden />
          )}
        </div>
      </SwissFieldset>

      <SwissFieldset title="Entry conditions" initiallyOpen={false}>
        <div className="form-split">
          <FormGroup id="swiss-password" label={t("passwordLabel")} help={t("passwordNote")}>
            <input
              id="swiss-password"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("passwordPlaceholder")}
              className="form-control"
            />
          </FormGroup>
          <div className="form-group form-half" aria-hidden />
        </div>
      </SwissFieldset>

      <SwissFieldset title="Custom pairings" initiallyOpen={false}>
        <div className="form-split">
          <FormGroup
            id="swiss-forbidden"
            label={t("forbiddenLabel")}
            help={t("forbiddenNote")}
          >
            <textarea
              id="swiss-forbidden"
              value={forbidden}
              onChange={(event) => setForbidden(event.target.value)}
              placeholder={t("forbiddenPlaceholder")}
              rows={4}
              className="form-control"
            />
          </FormGroup>
          <div className="form-group form-half" aria-hidden />
        </div>
      </SwissFieldset>

      <div className="form-actions">
        <Link href="/casino/chess/swiss">Cancel</Link>
        <button
          type="submit"
          disabled={create.isPending || badEntryFee || badMaxPlayers}
          className="submit button text"
        >
          {create.isPending ? t("creating") : t("submit")}
        </button>
      </div>
      <small className="form-help" style={{ display: "block", textAlign: "center" }}>
        {highStakes
          ? (normalizedEntryFee ?? entryFee) + " USD entry - 50% winner pool - 50% platform"
          : t("freeNote")}
      </small>
    </form>
  );

  if (embedded) return <div className="swiss__form">{content}</div>;

  return (
    <main className="page-small py-6 sm:py-10">
      <div className="swiss__form tour__form box box-pad">{content}</div>
    </main>
  );
}
