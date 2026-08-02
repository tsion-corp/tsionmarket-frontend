"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChessBoard } from "@/components/dashboard/casino/chess/chess-board";
import { WagerSummary } from "@/components/dashboard/casino/chess/wager-summary";
import { ChevronLeftIcon, ClockIcon, GridIcon, SettingsIcon } from "@/components/ui/icons";
import { useCreateChallenge } from "@/hooks/use-casino-chess";
import { useCasinoWallet } from "@/hooks/use-casino-wallet";
import { useChessCashierStatus } from "@/hooks/use-chess-cashier";
import { exceedsUsdcBalance, normalizeUsdcAmount } from "@/lib/casino/api/cashier";
import { parseTimeControl } from "@/lib/casino/api/chess-wire";
import { BOARD_THEMES, DEFAULT_THEME } from "@/lib/casino/chess/board-theme";
import { initialBoard } from "@/lib/casino/chess/engine";
import { copyText } from "@/lib/clipboard";
import type { ChessTimeControl, CreateChessChallengeInput } from "@/lib/casino/api/types";
import { friendlyError } from "@/lib/errors";
import { truncateAddress } from "@/lib/format";
import { toast } from "@/lib/toast";

const DECIMAL = /^\d*\.?\d*$/;
const STAKE_CHIPS = ["1", "5", "10", "25"] as const;
const SURFACE_BG = "#312E2B";
const SHELL_BG = "rgba(0, 0, 0, 0.20)";
const CARD_BG =
  "linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%)";
const SHADOW = "0 .1rem .1rem 0 rgba(0, 0, 0, 0.20)";
const CARD_SHADOW =
  "inset 0 .1rem 0 0 rgba(255, 255, 255, 0.07), 0 .1rem .2rem 0 rgba(0, 0, 0, 0.20)";
const LANDING_THEME = BOARD_THEMES.find((theme) => theme.id === "green") ?? DEFAULT_THEME;
const LANDING_BOARD = initialBoard();

const CREATE_TIME_GROUPS = [
  {
    title: "Bullet",
    tone: "#E1B02F",
    options: [
      { value: "15s", label: "15 sec" },
      { value: "30s", label: "30 sec" },
      { value: "1m", label: "1 min" },
    ],
  },
  {
    title: "Blitz",
    tone: "#F1CC47",
    options: [
      { value: "2m", label: "2 min" },
      { value: "3+2", label: "3 + 2" },
      { value: "5+3", label: "5 + 3" },
    ],
  },
  {
    title: "Rapid",
    tone: "#81B64C",
    options: [
      { value: "10+0", label: "10 min" },
      { value: "10+5", label: "10 + 5" },
      { value: "15+10", label: "15 + 10" },
    ],
  },
] as const satisfies readonly {
  title: string;
  tone: string;
  options: readonly { value: ChessTimeControl; label: string }[];
}[];

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function selfLabel(name: string | null | undefined, wallet: string | null): string {
  if (name && name !== "Account" && name !== "World Street user") return name;
  return wallet ? truncateAddress(wallet) : "You";
}

function timeCategory(initialSeconds: number): "Bullet" | "Blitz" | "Rapid" {
  if (initialSeconds <= 60) return "Bullet";
  if (initialSeconds <= 300) return "Blitz";
  return "Rapid";
}

function findTimeOption(value: ChessTimeControl): { label: string } | null {
  for (const group of CREATE_TIME_GROUPS) {
    for (const option of group.options) {
      if (option.value === value) return option;
    }
  }
  return null;
}

function TabIcon({
  kind,
  active = false,
}: {
  kind: "new" | "games" | "players";
  active?: boolean;
}) {
  const color = active ? "text-white" : "text-white/70";

  if (kind === "new") {
    return (
      <span className={`relative block h-6 w-6 ${color}`} aria-hidden>
        <span className="absolute inset-x-1 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-current" />
        <span className="absolute inset-y-1 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-current" />
      </span>
    );
  }

  if (kind === "games") {
    return <GridIcon size={24} className={color} />;
  }

  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className={color} aria-hidden>
      <circle cx="9" cy="9" r="3" fill="currentColor" />
      <circle cx="16.5" cy="10" r="2.5" fill="currentColor" opacity="0.78" />
      <path
        d="M4.5 19c.9-2.6 3-4 5.9-4 3 0 5.1 1.4 6 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M13.5 18c.6-1.9 2.1-3 4.1-3 1 0 1.9.2 2.6.7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.78"
      />
    </svg>
  );
}

function SpeedIcon({ tone }: { tone: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8.8 1.7 3.7 8h3L5.8 14.3 11.8 7.4H8.9l-.1-5.7Z"
        fill={tone}
        stroke={tone}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CaretIcon({ open = false }: { open?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      className={open ? "rotate-180" : undefined}
      aria-hidden
    >
      <path
        d="m5 7.5 5 5 5-5"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UsersIcon({ className = "text-white/70" }: { className?: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="8.5" cy="9.25" r="2.75" fill="currentColor" />
      <circle cx="15.75" cy="10" r="2.25" fill="currentColor" opacity="0.78" />
      <path
        d="M4.5 18.5c.8-2.4 2.8-3.7 5.5-3.7 2.7 0 4.7 1.3 5.5 3.7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M13.2 18.2c.5-1.6 1.9-2.6 3.8-2.6.9 0 1.7.2 2.5.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.78"
      />
    </svg>
  );
}

function LandingIcon({
  src,
  alt,
  className = "h-10 w-10",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} />
  );
}

function PlayerBar({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <div
      className="flex min-w-0 items-center gap-4 rounded-[8px] px-3 py-3"
      style={{ background: SHELL_BG, boxShadow: SHADOW }}
    >
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[4px] bg-[#4B4847]">
        <LandingIcon src="/chesscom-icons/play-white.svg" alt="" className="h-8 w-8 opacity-35" />
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-sans text-[1.05rem] font-bold text-white">{label}</span>
        {active ? (
          <span aria-hidden className="inline-flex gap-[3px]">
            <span className="h-4 w-[8px] rounded-[2px] bg-[#81B64C]" />
            <span className="h-4 w-[8px] rounded-[2px] bg-[#5D9948]" />
          </span>
        ) : null}
      </span>
    </div>
  );
}

function ClockBadge({ label }: { label: string }) {
  return (
    <div
      className="flex min-w-[126px] items-center justify-center rounded-[8px] px-5 py-3 text-[1.05rem] font-semibold text-white/88"
      style={{ background: SHELL_BG, boxShadow: SHADOW }}
    >
      {label}
    </div>
  );
}

function RailTab({
  href,
  label,
  icon,
  active = false,
}: {
  href?: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
}) {
  const classes = `grid min-h-[78px] place-items-center px-4 py-3 text-center transition-colors ${
    active ? "bg-black/12 text-white" : "text-white/65 hover:bg-white/4 hover:text-white"
  }`;

  const content = (
    <>
      <span className="mb-2 block">{icon}</span>
      <span className="font-sans text-[0.98rem] font-semibold">{label}</span>
    </>
  );

  if (!href) return <div className={classes}>{content}</div>;
  return (
    <Link href={href} className={classes}>
      {content}
    </Link>
  );
}

function FieldRow({
  label,
  value,
  icon,
  accent,
  open = false,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  accent?: string;
  open?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 text-[0.96rem] font-extrabold text-white/88">{label}</div>
      <div
        className="flex items-center gap-3 rounded-[16px] border border-white/6 px-5 py-4 text-white"
        style={{ background: CARD_BG, boxShadow: CARD_SHADOW }}
      >
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
          style={{ color: accent ?? "rgba(255,255,255,0.75)" }}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-[1.06rem] font-extrabold">{value}</span>
        <span className="text-white/58">
          <CaretIcon open={open} />
        </span>
      </div>
    </div>
  );
}

function StakeCard({
  tStake,
  stake,
  setStake,
  stakeUsdc,
  stakeOverBalance,
  cashierAvailable,
  feeBps,
  feePct,
}: {
  tStake: ReturnType<typeof useTranslations>;
  stake: string;
  setStake: (value: string) => void;
  stakeUsdc: string | undefined;
  stakeOverBalance: boolean;
  cashierAvailable: string;
  feeBps: number;
  feePct: number | null;
}) {
  const chipClass = (active: boolean) =>
    `cursor-pointer rounded-[12px] border px-3.5 py-2 font-sans text-[13px] transition-colors ${
      active
        ? "border-[#81B64C] bg-[#4B5E2F] font-semibold text-white"
        : "border-white/10 bg-black/8 text-white/80 hover:border-white/25"
    }`;

  return (
    <div className="rounded-[16px] border border-white/6 px-4 py-4" style={{ background: CARD_BG }}>
      <div className="mb-3 text-[0.96rem] font-extrabold text-white/88">{tStake("label")}</div>
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
        <div className="flex min-w-[126px] flex-1 items-center gap-1.5 rounded-[12px] border border-white/10 bg-black/8 px-3 py-2.5">
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
      <div className="tnum mt-3 text-[11.5px] font-normal text-white/45">
        {tStake("available", { amount: cashierAvailable })}
      </div>

      {stakeUsdc !== undefined ? (
        <>
          <div className="mt-3">
            <WagerSummary stakeUsdc={stakeUsdc} availableUsdc={cashierAvailable} feeBps={feeBps} />
          </div>
          {stakeOverBalance ? (
            <div className="text-down mt-2.5 text-[12px] font-normal">
              {tStake("needsBalance", { amount: stakeUsdc })}
            </div>
          ) : null}
        </>
      ) : feePct !== null ? (
        <div className="mt-4 text-[11.5px] font-normal text-white/50">
          {tStake("note", { pct: feePct })}
        </div>
      ) : null}
    </div>
  );
}

export function CreateSection() {
  const t = useTranslations("casino.chess.create");
  const tStake = useTranslations("casino.chess.stake");
  const router = useRouter();
  const wallet = useCasinoWallet();
  const cashier = useChessCashierStatus();
  const create = useCreateChallenge();

  const [timeControl, setTimeControl] = useState<ChessTimeControl>("10+0");
  const [stake, setStake] = useState("");

  const selectedTime = useMemo(() => {
    const option = findTimeOption(timeControl);
    const { initialSeconds } = parseTimeControl(timeControl);
    const category = timeCategory(initialSeconds);
    return {
      category,
      clock: formatClock(initialSeconds),
      label: option?.label ?? timeControl,
      panelLabel: `${option?.label ?? timeControl} (${category})`,
    };
  }, [timeControl]);

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
      const input: CreateChessChallengeInput & { stakeUsdc?: string } = {
        timeControl,
        mode: "invite",
        ...(stakeUsdc !== undefined ? { stakeUsdc } : {}),
      };
      const { challenge } = await create.mutateAsync(input);
      const inviteUrl =
        typeof window === "undefined"
          ? `/casino/chess/invite?code=${challenge.id}`
          : `${window.location.origin}/casino/chess/invite?code=${challenge.id}`;
      const copied = await copyText(inviteUrl);
      toast.success(copied ? t("linkCopied") : t("toastCreatedInvite"), { id });

      router.push(`/casino/chess/play?match=${challenge.id}`);
    } catch (e) {
      toast.error(friendlyError(e, t("toastCreateFailed")), { id });
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1560px] px-4 pb-8 sm:px-6 lg:px-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,944px)_430px]">
        <section
          className="rounded-[8px] p-4 shadow-[0_1px_1px_rgba(0,0,0,0.20)]"
          style={{ background: SURFACE_BG }}
        >
          <div className="mx-auto max-w-[944px]">
            <div className="mb-4 flex items-center justify-between gap-4">
              <PlayerBar label="Opponent" />
              <div className="flex items-center gap-3">
                <ClockBadge label={selectedTime.clock} />
                <span
                  className="grid h-[50px] w-[50px] place-items-center rounded-[8px] text-white/55"
                  style={{ background: SHELL_BG, boxShadow: SHADOW }}
                >
                  <SettingsIcon size={18} />
                </span>
              </div>
            </div>
            <div className="overflow-hidden rounded-[2px]">
              <ChessBoard board={LANDING_BOARD} theme={LANDING_THEME} />
            </div>
            <div className="mt-4 flex items-center justify-between gap-4">
              <PlayerBar
                label={selfLabel(wallet.name, wallet.address ?? null)}
                active={wallet.connected}
              />
              <ClockBadge label={selectedTime.clock} />
            </div>
          </div>
        </section>

        <aside
          className="flex min-h-0 flex-col overflow-hidden rounded-[8px] shadow-[0_1px_1px_rgba(0,0,0,0.20)]"
          style={{ background: SHELL_BG }}
        >
          <div className="grid grid-cols-3 border-b border-white/6 bg-black/10">
            <RailTab label="New Game" icon={<TabIcon kind="new" active />} active />
            <RailTab href="/casino/chess/history" label="Games" icon={<TabIcon kind="games" />} />
            <RailTab href="/casino/chess" label="Lobby" icon={<TabIcon kind="players" />} />
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
            <div className="mb-6 flex items-center justify-between gap-3">
              <Link
                href="/casino/chess"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/6 hover:text-white"
                aria-label="Back to chess lobby"
              >
                <ChevronLeftIcon size={24} />
              </Link>
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-[#8D6A26]/22 text-[#D9B15B]">
                  <GridIcon size={22} />
                </span>
                <div className="min-w-0">
                  <div className="truncate font-sans text-[1.9rem] font-extrabold tracking-[-0.05em] text-white">
                    Challenge Link
                  </div>
                  <div className="text-[0.92rem] text-white/52">Play a Friend</div>
                </div>
              </div>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/50">
                <SettingsIcon size={19} />
              </span>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
              <FieldRow
                label="Opponent"
                value="Challenge link"
                icon={<UsersIcon className="text-white/72" />}
              />
              <FieldRow
                label="Game Type"
                value="Standard"
                icon={<GridIcon size={22} className="text-white/72" />}
              />
              <FieldRow
                label="Time Control"
                value={selectedTime.panelLabel}
                icon={<ClockIcon size={22} className="text-[#81B64C]" />}
                accent="#81B64C"
                open
              />

              {CREATE_TIME_GROUPS.map((group) => (
                <div key={group.title}>
                  <div className="mb-3 flex items-center gap-2 text-[0.95rem] font-extrabold text-white/92">
                    <SpeedIcon tone={group.tone} />
                    <span>{group.title}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2.5">
                    {group.options.map((option) => {
                      const active = timeControl === option.value;
                      return (
                        <button
                          key={option.value}
                          onClick={() => setTimeControl(option.value)}
                          className={`cursor-pointer rounded-[12px] border px-3 py-3 text-center font-sans text-[1rem] font-extrabold transition-colors ${
                            active
                              ? "border-[#81B64C] bg-[#3F3D37] text-white shadow-[0_0_0_1px_rgba(129,182,76,0.35)]"
                              : "border-white/6 bg-[#3A3833] text-white/82 hover:border-white/18 hover:text-white"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {cashier.configured ? (
                <StakeCard
                  tStake={tStake}
                  stake={stake}
                  setStake={setStake}
                  stakeUsdc={stakeUsdc}
                  stakeOverBalance={stakeOverBalance}
                  cashierAvailable={cashier.available}
                  feeBps={cashier.config?.platformFeeBps ?? 500}
                  feePct={cashier.feePct}
                />
              ) : null}

              <div className="rounded-[16px] border border-white/6 px-4 py-4 text-[0.92rem] leading-6 text-white/60">
                {t("inviteExplainer")}
              </div>
            </div>

            <div className="mt-5 shrink-0 border-t border-white/6 pt-5">
              <button
                onClick={() => void onCreate()}
                disabled={create.isPending || stakeOverBalance}
                className="w-full cursor-pointer rounded-[16px] bg-[#81B64C] px-4 py-4 font-sans text-[1.06rem] font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_12px_24px_rgba(0,0,0,0.18)] transition-[filter,transform] hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {create.isPending ? t("creating") : t("submitInvite")}
              </button>
              <div className="mt-2 text-center text-[0.82rem] text-white/42">
                {t("inviteCopyNote")}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
