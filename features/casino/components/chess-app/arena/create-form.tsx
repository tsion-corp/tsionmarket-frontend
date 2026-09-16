"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { CasinoError } from "@/features/casino/components/casino-state";
import { loadLichessStyle } from "@/features/casino/components/chess-app/lichess-round";
import { useCreateArena } from "@/features/casino/hooks/use-casino-arena";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import type {
  ArenaConditions,
  ArenaVariant,
} from "@/features/casino/lib/api/arena";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

const THEME_CSS = "/css/lib.theme.all.ca09c987.css";
const SITE_CSS = "/css/site.5a4b7c75.css";
const TOURNAMENT_FORM_CSS = "/css/tournament.form.42065c26.css";

const CLOCK_TIMES = [
  [15, "15 seconds"],
  [30, "30 seconds"],
  [45, "45 seconds"],
  [60, "1 minute"],
  [90, "1½ minutes"],
  [120, "2 minutes"],
  [180, "3 minutes"],
  [240, "4 minutes"],
  [300, "5 minutes"],
  [360, "6 minutes"],
  [420, "7 minutes"],
  [480, "8 minutes"],
  [600, "10 minutes"],
  [900, "15 minutes"],
  [1_200, "20 minutes"],
  [1_800, "30 minutes"],
  [2_700, "45 minutes"],
  [3_600, "60 minutes"],
] as const;

const INCREMENTS = [0, 1, 2, 3, 4, 5, 6, 7, 10, 15, 20, 25, 30, 40, 50, 60] as const;
const DURATIONS = [
  20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90, 100, 110, 120, 150, 180, 210, 240, 270,
  300, 330, 360, 420, 480, 540, 600, 720,
] as const;
const START_DELAYS = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60] as const;
const VARIANTS: ReadonlyArray<{ value: ArenaVariant; label: string }> = [
  { value: "standard", label: "Standard" },
  { value: "chess960", label: "Chess960" },
  { value: "kingOfTheHill", label: "King of the Hill" },
  { value: "threeCheck", label: "Three-check" },
  { value: "antichess", label: "Antichess" },
  { value: "atomic", label: "Atomic" },
  { value: "horde", label: "Horde" },
  { value: "racingKings", label: "Racing Kings" },
  { value: "crazyhouse", label: "Crazyhouse" },
];

function optionalInteger(value: string): number | undefined {
  const clean = value.trim();
  if (!clean) return undefined;
  const parsed = Number.parseInt(clean, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalText(value: string): string | undefined {
  return value.trim() || undefined;
}

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes === 60) return "1 hour";
  if (minutes % 60 === 0) return `${minutes / 60} hours`;
  return `${Math.floor(minutes / 60)} hours ${minutes % 60} minutes`;
}

function CollapsibleFieldset({
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
      className={`toggle-box toggle-box--toggle${open ? "" : " toggle-box--toggle-off"}`}
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
  half = true,
  invalid = false,
  className = "",
  children,
}: {
  id: string;
  label: string;
  help?: ReactNode;
  half?: boolean;
  invalid?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`form-group${half ? " form-half" : ""}${invalid ? " is-invalid" : ""}${className ? ` ${className}` : ""}`}
    >
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
  onChange,
  label,
  help,
}: {
  id: string;
  checked: boolean;
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

export function ArenaCreateForm() {
  const router = useRouter();
  const { login } = usePrivy();
  const wallet = useCasinoWallet();
  const create = useCreateArena();
  const [assetError, setAssetError] = useState<Error | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [payouts, setPayouts] = useState("");
  const [initialSeconds, setInitialSeconds] = useState(120);
  const [incrementSeconds, setIncrementSeconds] = useState(0);
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [variant, setVariant] = useState<ArenaVariant>("standard");
  const [initialFen, setInitialFen] = useState("");
  const [startDelayMinutes, setStartDelayMinutes] = useState(5);
  const [customStartAt, setCustomStartAt] = useState("");
  const [password, setPassword] = useState("");
  const [minimumRatedGames, setMinimumRatedGames] = useState("");
  const [minimumAccountAgeDays, setMinimumAccountAgeDays] = useState("");
  const [minimumRating, setMinimumRating] = useState("");
  const [maximumRating, setMaximumRating] = useState("");
  const [allowList, setAllowList] = useState("");
  const [titledOnly, setTitledOnly] = useState(false);
  const [botsAllowed, setBotsAllowed] = useState(false);
  const [berserkable, setBerserkable] = useState(true);
  const [streakable, setStreakable] = useState(true);
  const [rated, setRated] = useState(true);
  const [hasChat, setHasChat] = useState(true);
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
      loadLichessStyle(TOURNAMENT_FORM_CSS),
    ]).catch((error) => {
      setAssetError(
        error instanceof Error ? error : new Error("Unable to load the tournament form")
      );
    });

    return () => {
      if (!hadDark) root.classList.remove("dark");
      if (hadLight) root.classList.add("light");
      if (hadTransparent) root.classList.add("transp");
    };
  }, []);

  const cleanName = name.trim();
  const renderedName = `${cleanName || wallet.name || "Community"} Arena`;
  const nameError = renderedName.length > 60 ? "Keep the complete name under 60 characters." : null;
  const minRating = optionalInteger(minimumRating);
  const maxRating = optionalInteger(maximumRating);
  const ratingError =
    minRating !== undefined && maxRating !== undefined && minRating > maxRating
      ? "Minimum rating cannot exceed maximum rating."
      : null;
  const berserkPrevented = incrementSeconds > (initialSeconds / 60) * 2;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (!wallet.connected) {
      login();
      return;
    }
    if (nameError || ratingError || create.isPending) return;

    let startDelaySeconds = startDelayMinutes * 60;
    if (customStartAt) {
      startDelaySeconds = Math.round((new Date(customStartAt).getTime() - Date.now()) / 1_000);
      if (!Number.isFinite(startDelaySeconds) || startDelaySeconds < 0) {
        toast.error("The custom start date must be in the future.");
        return;
      }
    }

    const conditions: ArenaConditions = {
      minimumRatedGames: optionalInteger(minimumRatedGames),
      minimumAccountAgeDays: optionalInteger(minimumAccountAgeDays),
      minimumRating: minRating,
      maximumRating: maxRating,
      titledOnly,
      allowList: optionalText(allowList)
        ?.split(/[\s,]+/)
        .map((player) => player.trim())
        .filter(Boolean),
      botsAllowed,
    };

    const toastId = toast.loading("Creating Arena…");
    try {
      const arena = await create.mutateAsync({
        name: renderedName,
        initialSeconds,
        incrementSeconds,
        durationMinutes,
        maxPlayers: 10_000,
        startDelaySeconds,
        variant,
        initialFen: variant === "standard" ? optionalText(initialFen) : undefined,
        rated,
        password: optionalText(password),
        conditions,
        noBerserk: !berserkable || berserkPrevented,
        noStreak: !streakable,
        description: optionalText(description),
        payouts: optionalText(payouts),
        hasChat,
      });
      toast.success("Arena created.", { id: toastId });
      router.push(`/casino/chess/tournaments/${arena.id}?created=1`);
    } catch (error) {
      toast.error(friendlyError(error, "We couldn't create the Arena."), { id: toastId });
    }
  };

  if (assetError) {
    return <CasinoError error={assetError} subject="the tournament form" />;
  }

  return (
    <main className="page-small py-6 sm:py-10">
      <div className="tour__form box box-pad">
        <h1 className="box__top">Create a new tournament</h1>
        <form className="form3" onSubmit={(event) => void submit(event)}>
          <div className="form-group">
            <Link className="text" href="/casino/chess/tournaments#help">
              Our event tips
            </Link>
          </div>

          <CollapsibleFieldset title="Tournament" initiallyOpen>
            <div className="form-split">
              <FormGroup
                id="form3-name"
                label="Name"
                invalid={touched && nameError !== null}
                className="tour-name"
                help={
                  <>
                    Safe tournament names only. Leave empty to use your player name.
                    {touched && nameError ? <span className="error"> {nameError}</span> : null}
                  </>
                }
              >
                <div>
                  <input
                    id="form3-name"
                    name="name"
                    value={name}
                    maxLength={54}
                    onChange={(event) => setName(event.target.value)}
                    className="form-control"
                    autoFocus
                  />
                  <span>Arena</span>
                </div>
              </FormGroup>
              <FormGroup id="form3-minutes" label="Duration">
                <select
                  id="form3-minutes"
                  name="minutes"
                  value={durationMinutes}
                  onChange={(event) => setDurationMinutes(Number(event.target.value))}
                  className="form-control"
                >
                  {DURATIONS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {durationLabel(minutes)}
                    </option>
                  ))}
                </select>
              </FormGroup>
            </div>
            <div className="form-split">
              <FormGroup
                id="form3-description"
                label="Tournament description"
                help="Displayed on the tournament page. Links are allowed."
              >
                <textarea
                  id="form3-description"
                  name="description"
                  rows={4}
                  maxLength={5_000}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="form-control"
                />
              </FormGroup>
              <FormGroup
                id="form3-payouts"
                label="Prize payouts"
                help="Optional display text, for example $500 / $250 / $100."
              >
                <input
                  id="form3-payouts"
                  name="payouts"
                  value={payouts}
                  maxLength={2_000}
                  onChange={(event) => setPayouts(event.target.value)}
                  className="form-control"
                />
              </FormGroup>
            </div>
          </CollapsibleFieldset>

          <CollapsibleFieldset title="Games" initiallyOpen>
            <div className="form-split">
              <FormGroup id="form3-clockTime" label="Clock initial time">
                <select
                  id="form3-clockTime"
                  name="clockTime"
                  value={initialSeconds}
                  onChange={(event) => setInitialSeconds(Number(event.target.value))}
                  className="form-control"
                >
                  {CLOCK_TIMES.map(([seconds, label]) => (
                    <option key={seconds} value={seconds}>
                      {label}
                    </option>
                  ))}
                </select>
              </FormGroup>
              <FormGroup id="form3-clockIncrement" label="Clock increment">
                <select
                  id="form3-clockIncrement"
                  name="clockIncrement"
                  value={incrementSeconds}
                  onChange={(event) => setIncrementSeconds(Number(event.target.value))}
                  className="form-control"
                >
                  {INCREMENTS.map((seconds) => (
                    <option key={seconds} value={seconds}>
                      {seconds} second{seconds === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              </FormGroup>
            </div>
            <div className="form-split">
              <FormGroup id="form3-variant" label="Variant">
                <select
                  id="form3-variant"
                  name="variant"
                  value={variant}
                  onChange={(event) => setVariant(event.target.value as ArenaVariant)}
                  className="form-control"
                >
                  {VARIANTS.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </FormGroup>
              {variant === "standard" ? (
                <FormGroup
                  id="form3-position"
                  label="Start position"
                  className="position"
                  help={
                    <>
                      Paste a valid FEN, or leave empty for the standard starting position. Use the{" "}
                      <Link href="/casino/chess/review">board editor</Link> to build one.
                    </>
                  }
                >
                  <input
                    id="form3-position"
                    name="position"
                    value={initialFen}
                    onChange={(event) => setInitialFen(event.target.value)}
                    className="form-control"
                  />
                </FormGroup>
              ) : (
                <div className="form-group form-half" aria-hidden />
              )}
            </div>
          </CollapsibleFieldset>

          <CollapsibleFieldset title="Start date" initiallyOpen>
            <div className="form-split">
              <FormGroup id="form3-waitMinutes" label="Time before tournament starts">
                <select
                  id="form3-waitMinutes"
                  name="waitMinutes"
                  value={startDelayMinutes}
                  onChange={(event) => {
                    setStartDelayMinutes(Number(event.target.value));
                    setCustomStartAt("");
                  }}
                  className="form-control"
                >
                  {START_DELAYS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} minute{minutes === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              </FormGroup>
              <FormGroup
                id="form3-startDate"
                label="Custom start date"
                help="Optional. Overrides the delay selected on the left."
              >
                <input
                  id="form3-startDate"
                  name="startDate"
                  type="datetime-local"
                  value={customStartAt}
                  onChange={(event) => setCustomStartAt(event.target.value)}
                  className="form-control"
                />
              </FormGroup>
            </div>
          </CollapsibleFieldset>

          <CollapsibleFieldset title="Entry conditions" initiallyOpen={false}>
            <div className="form-split">
              <FormGroup
                id="form3-password"
                label="Tournament entry code"
                help="Set a code to make this a private tournament."
              >
                <input
                  id="form3-password"
                  name="password"
                  type="password"
                  autoComplete="off"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="form-control"
                />
              </FormGroup>
              <FormGroup id="form3-ratedGames" label="Minimum rated games">
                <input
                  id="form3-ratedGames"
                  name="minimumRatedGames"
                  type="number"
                  min={0}
                  value={minimumRatedGames}
                  onChange={(event) => setMinimumRatedGames(event.target.value)}
                  className="form-control"
                />
              </FormGroup>
            </div>
            <div className="form-split">
              <FormGroup id="form3-accountAge" label="Minimum account age in days">
                <input
                  id="form3-accountAge"
                  name="minimumAccountAgeDays"
                  type="number"
                  min={0}
                  value={minimumAccountAgeDays}
                  onChange={(event) => setMinimumAccountAgeDays(event.target.value)}
                  className="form-control"
                />
              </FormGroup>
              <FormGroup id="form3-allowList" label="Predefined users">
                <textarea
                  id="form3-allowList"
                  name="allowList"
                  rows={3}
                  value={allowList}
                  onChange={(event) => setAllowList(event.target.value)}
                  className="form-control"
                />
              </FormGroup>
            </div>
            <div className="form-split">
              <FormGroup
                id="form3-minRating"
                label="Minimum rating"
                invalid={touched && ratingError !== null}
                help={touched && ratingError ? <span className="error">{ratingError}</span> : undefined}
              >
                <input
                  id="form3-minRating"
                  name="minimumRating"
                  type="number"
                  min={0}
                  value={minimumRating}
                  onChange={(event) => setMinimumRating(event.target.value)}
                  className="form-control"
                />
              </FormGroup>
              <FormGroup id="form3-maxRating" label="Maximum rating">
                <input
                  id="form3-maxRating"
                  name="maximumRating"
                  type="number"
                  min={0}
                  value={maximumRating}
                  onChange={(event) => setMaximumRating(event.target.value)}
                  className="form-control"
                />
              </FormGroup>
            </div>
            <div className="form-split">
              <CheckGroup
                id="form3-titledOnly"
                checked={titledOnly}
                onChange={setTitledOnly}
                label="Only titled players"
                help="Only verified titled players can join."
              />
              <CheckGroup
                id="form3-botsAllowed"
                checked={botsAllowed}
                onChange={setBotsAllowed}
                label="Allow bot accounts"
                help="Let bot accounts join and play with their engines."
              />
            </div>
          </CollapsibleFieldset>

          <CollapsibleFieldset title="Features" initiallyOpen={false}>
            <div className="form-split">
              <CheckGroup
                id="form3-berserkable"
                checked={berserkable && !berserkPrevented}
                onChange={setBerserkable}
                label="Allow Berserk"
                help={
                  berserkPrevented
                    ? "This time control cannot enable Berserk."
                    : "Players can halve their clock for an extra tournament point."
                }
              />
              <CheckGroup
                id="form3-streakable"
                checked={streakable}
                onChange={setStreakable}
                label="Arena streaks"
                help="Two wins start a double-point streak."
              />
            </div>
            <div className="form-split">
              <CheckGroup
                id="form3-rated"
                checked={rated}
                onChange={setRated}
                label="Rated"
                help="Games affect the matching chess rating pool."
              />
              <CheckGroup
                id="form3-hasChat"
                checked={hasChat}
                onChange={setHasChat}
                label="Chat room"
                help="Allow tournament participants to use the tournament chat."
              />
            </div>
          </CollapsibleFieldset>

          <div className="form-actions">
            <Link href="/casino/chess/tournaments">Cancel</Link>
            <button className="submit button text" type="submit" disabled={create.isPending}>
              {!wallet.connected
                ? "Connect to create"
                : create.isPending
                  ? "Creating…"
                  : "Create a new tournament"}
            </button>
          </div>
        </form>
      </div>

      <div id="help" className="box box-pad tour__faq page">
        <div className="body">
          <p>You will be notified when the tournament starts.</p>
          <h2>Is it rated?</h2>
          <p>Rated tournaments update the rating pool for each game’s speed and variant.</p>
          <h2>How are scores calculated?</h2>
          <p>A win is worth 2 points, a draw 1 point, and a loss 0 points.</p>
          <h2>Berserk</h2>
          <p>Players may halve their clock before moving to earn one extra point for a win.</p>
          <h2>How is the winner decided?</h2>
          <p>The player with the most points when the Arena clock expires wins.</p>
          <h2>How does pairing work?</h2>
          <p>Active players are paired continuously, avoiding immediate rematches where possible.</p>
          <h2>How does it end?</h2>
          <p>When time runs out, ongoing games finish normally and the final standings are locked.</p>
        </div>
      </div>
    </main>
  );
}
