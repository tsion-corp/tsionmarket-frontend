"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChessCashierLauncher } from "@/features/casino/components/chess/chess-cashier-launcher";
import { ChessBoard } from "@/features/casino/components/chess/chess-board";
import { WagerSummary } from "@/features/casino/components/chess/wager-summary";
import {
  ChevronLeftIcon,
  GameArrowsIcon,
  GridIcon,
  PlayIcon,
  SettingsIcon,
} from "@/components/ui/icons";
import { useCreateChallenge } from "@/features/casino/hooks/use-casino-chess";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import { useChessCashierStatus } from "@/features/casino/hooks/use-chess-cashier";
import { exceedsUsdcBalance, normalizeUsdcAmount } from "@/features/casino/lib/api/cashier";
import { parseTimeControl } from "@/features/casino/lib/api/chess-wire";
import { BOARD_THEMES, DEFAULT_THEME } from "@/features/casino/lib/chess/board-theme";
import { initialBoard } from "@/features/casino/lib/chess/engine";
import {
  CHESS_CARD_BG,
  CHESS_CARD_SHADOW,
  CHESS_PAGE_BOARD_MAX_WIDTH,
  CHESS_PRIMARY_BUTTON_CLASS,
  CHESS_SHELL_BG,
  CHESS_SHELL_SHADOW,
  CHESS_SIDEBAR_BG,
  CHESS_SURFACE_BG,
} from "@/features/casino/lib/chess/ui";
import { copyTextWhenReady } from "@/lib/clipboard";
import type { ChessTimeControl, CreateChessChallengeInput } from "@/features/casino/lib/api/types";
import { friendlyError } from "@/lib/errors";
import { truncateAddress } from "@/lib/format";
import { toast } from "@/lib/toast";
import { shareOrigin } from "@/lib/site-url";

const DECIMAL = /^\d*\.?\d*$/;
const STAKE_CHIPS = ["1", "5", "10", "25"] as const;
const LANDING_THEME = BOARD_THEMES.find((theme) => theme.id === "green") ?? DEFAULT_THEME;
const LANDING_BOARD = initialBoard();

const CREATE_TIME_GROUPS = [
  {
    title: "Game Clock",
    options: [
      { value: "1+0", label: "1 min" },
      { value: "5+0", label: "5 min" },
      { value: "10+0", label: "10 min" },
      { value: "15+0", label: "15 min" },
    ],
  },
] as const satisfies readonly {
  title: string;
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

function PlusIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PlayerBar({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <div
      className="flex min-w-0 items-center gap-4 rounded-[8px] px-3 py-3"
      style={{ background: CHESS_SHELL_BG, boxShadow: CHESS_SHELL_SHADOW }}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-white/8 text-white/45">
        <PlayIcon size={16} />
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[14px] font-medium text-white">{label}</span>
        {active ? (
          <span aria-hidden className="inline-flex gap-[3px]">
            <span className="h-3.5 w-[7px] rounded-[2px] bg-white/70" />
            <span className="h-3.5 w-[7px] rounded-[2px] bg-white/35" />
          </span>
        ) : null}
      </span>
    </div>
  );
}

function ClockBadge({ label }: { label: string }) {
  return (
    <div
      className="flex min-w-[108px] items-center justify-center rounded-[8px] px-3.5 py-2 text-[13px] font-medium text-white/80"
      style={{ background: CHESS_SHELL_BG, boxShadow: CHESS_SHELL_SHADOW }}
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
  const classes = `flex cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2 font-sans text-[13px] font-medium transition-colors ${
    active
      ? "bg-accent/16 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]"
      : "text-white/55 hover:text-white/80"
  }`;

  const content = (
    <>
      <span className="shrink-0">{icon}</span>
      {label}
    </>
  );

  if (!href) return <div className={classes}>{content}</div>;
  return (
    <Link href={href} className={classes}>
      {content}
    </Link>
  );
}

// A settled fact about the game being created, not a control. These carried a
// caret and read as dropdowns, but nothing opened: this screen always creates an
// invite ("Play a Friend" — matchmaking is its own flow), and the service has no
// variant concept, so there is nothing to pick in either case. The caret is gone
// rather than wired to an empty menu.
function InfoRow({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[12px] font-medium tracking-[0.02em] text-white/45 uppercase">
        {label}
      </div>
      <div className="flex items-center gap-2.5 rounded-[14px] border border-white/8 bg-white/4 px-3.5 py-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center text-white/55">{icon}</span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-white">{value}</span>
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
        ? "border-accent/45 bg-accent/12 text-white"
        : "border-white/10 bg-white/4 text-white/60 hover:bg-white/8 hover:text-white"
    }`;

  return (
    <div
      className="rounded-[16px] border border-white/6 px-4 py-4"
      style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
    >
      <div className="mb-2 text-[12px] font-medium tracking-[0.02em] text-white/45 uppercase">
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
        <div className="flex min-w-[126px] flex-1 items-center gap-1.5 rounded-[12px] border border-white/10 bg-black/8 px-3 py-2.5">
          <input
            inputMode="decimal"
            placeholder="0"
            value={stake}
            onChange={(e) => DECIMAL.test(e.target.value) && setStake(e.target.value)}
            className="tnum w-full min-w-0 bg-transparent text-[13px] text-white outline-none placeholder:text-white/30"
          />
          <span className="shrink-0 text-[11px] font-normal text-white/45">USD</span>
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
        // Human PvP is rated whether the game is free or staked. Free games can
        // still opt into equal clock extensions; stakes keep clocks immutable.
        rated: true,
        allowTimeExtensions: stakeUsdc === undefined,
        videoEnabled: true,
        ...(stakeUsdc !== undefined ? { stakeUsdc } : {}),
      };
      // The clipboard write is armed NOW, inside the click's user activation,
      // with a promise for the URL. Copying after the await instead fails
      // silently on Safari/iOS, where activation dies at the first await.
      const created = create.mutateAsync(input);
      const copiedPromise = copyTextWhenReady(
        created.then(({ challenge }) => `${shareOrigin()}/casino/chess/invite?code=${challenge.id}`)
      );
      const { challenge } = await created;
      const copied = await copiedPromise;
      toast.success(copied ? t("linkCopied") : t("toastCreatedInvite"), { id });

      router.push(`/casino/chess/play?match=${challenge.id}`);
    } catch (e) {
      toast.error(friendlyError(e, t("toastCreateFailed")), { id });
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1560px] px-4 pt-5 pb-8 sm:px-6 lg:px-8">
      {/* On desktop the row is bounded to the viewport so the board is wholly
          visible without scrolling; the setup rail beside it scrolls inside
          itself instead. Below xl both stack and the page scrolls normally. */}
      <div className="grid gap-6 xl:h-[calc(100dvh-120px)] xl:grid-cols-[minmax(0,944px)_430px]">
        <section
          className="rounded-[8px] p-3 shadow-[0_1px_1px_rgba(0,0,0,0.20)] sm:p-4 xl:min-h-0"
          style={{ background: CHESS_SURFACE_BG }}
        >
          <div className="mx-auto w-full" style={{ maxWidth: CHESS_PAGE_BOARD_MAX_WIDTH }}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <PlayerBar label="Opponent" />
              <div className="flex items-center gap-3">
                <ClockBadge label={selectedTime.clock} />
                <span
                  className="grid h-[44px] w-[44px] place-items-center rounded-[8px] text-white/55"
                  style={{ background: CHESS_SHELL_BG, boxShadow: CHESS_SHELL_SHADOW }}
                >
                  <SettingsIcon size={16} />
                </span>
              </div>
            </div>
            <div className="overflow-hidden rounded-[2px]">
              <ChessBoard board={LANDING_BOARD} theme={LANDING_THEME} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <PlayerBar
                label={selfLabel(wallet.name, wallet.address ?? null)}
                active={wallet.connected}
              />
              <ClockBadge label={selectedTime.clock} />
            </div>
          </div>
        </section>

        <aside
          className="flex min-h-0 flex-col overflow-hidden rounded-[8px] border border-white/6 shadow-[0_1px_1px_rgba(0,0,0,0.20)] xl:h-full"
          style={{ background: CHESS_SIDEBAR_BG }}
        >
          <div className="ws-inset m-4 mb-0 grid grid-cols-3 gap-1 p-1 sm:mx-6 sm:mt-6">
            <RailTab label="New Game" icon={<PlusIcon />} active />
            <RailTab href="/casino/chess/history" label="Games" icon={<GridIcon size={15} />} />
            <RailTab href="/casino/chess" label="Lobby" icon={<GameArrowsIcon size={15} />} />
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
            {/* Back sits on its own line above the title: the two shared a row,
                which centred a title that is not centred anywhere else in the
                app and left a settings button that opened nothing. */}
            <div className="mb-5">
              <Link
                href="/casino/chess"
                className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-normal text-white/60 transition-colors hover:text-white"
              >
                <ChevronLeftIcon size={14} />
                Back
              </Link>
              <div className="ws-display text-[24px] tracking-[-0.01em] text-white">
                Challenge link
              </div>
              <p className="mt-1 text-[13.5px] leading-normal font-normal text-white/55">
                Pick a clock, create the game, and send the link to whoever you want to play.
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              <ChessCashierLauncher compact />
              <InfoRow
                label="Opponent"
                value="Challenge link"
                icon={<GameArrowsIcon size={16} />}
              />
              <InfoRow label="Game Type" value="Standard" icon={<GridIcon size={16} />} />

              {/* Time control: the buttons are the control, so the selection is
                  summarised in the label rather than in a row that opens nothing. */}
              {CREATE_TIME_GROUPS.map((group) => (
                <div key={group.title}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="text-[12px] font-medium tracking-[0.02em] text-white/45 uppercase">
                      {group.title}
                    </span>
                    <span className="text-[12px] font-normal text-white/45">
                      {selectedTime.panelLabel}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {group.options.map((option) => {
                      const active = timeControl === option.value;
                      return (
                        <button
                          key={option.value}
                          onClick={() => setTimeControl(option.value)}
                          className={`cursor-pointer rounded-[12px] border px-3 py-2.5 text-center text-[13px] font-medium transition-colors ${
                            active
                              ? "border-accent/45 bg-accent/12 text-white"
                              : "border-white/10 bg-white/4 text-white/60 hover:bg-white/8 hover:text-white"
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

              <div className="rounded-[14px] border border-white/8 bg-white/4 px-3.5 py-3 text-[13px] leading-relaxed font-normal text-white/55">
                After you create the game, we open the waiting board, copy the challenge link, and
                show a copy button there again. Send that link manually for now, the first person
                who opens it takes the other side.
              </div>
            </div>

            <div className="mt-5 shrink-0 border-t border-white/6 pt-5">
              <button
                onClick={() => void onCreate()}
                disabled={create.isPending || stakeOverBalance}
                className={`${CHESS_PRIMARY_BUTTON_CLASS} w-full rounded-[14px] px-4 py-3.5 text-[14px] font-semibold`}
              >
                {create.isPending ? t("creating") : t("submitInvite")}
              </button>
              <div className="mt-2 text-center text-[12px] font-normal text-white/45">
                The link is copied right after creation, and you can copy it again from the waiting
                board.
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
