"use client";

// The lobby chrome shared by the game landing screens: the menu header, the
// action rows, and the joinable-game row. Chess established this shape and
// checkers uses the same one, so the two lobbies read as one product rather
// than two.

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon, ChevronLeftIcon, PlayIcon } from "@/components/ui/icons";
import { CHESS_SURFACE_BG } from "@/features/casino/lib/chess/ui";

export const MENU_SURFACE_BG = CHESS_SURFACE_BG;
export const MENU_SHELL_BG = "rgba(0, 0, 0, 0.20)";
export const MENU_CARD_BG =
  "linear-gradient(180deg, rgba(0, 0, 0, 0.05) 0%, rgba(0, 0, 0, 0.14) 100%)";
export const MENU_SHADOW = "0 .1rem .1rem 0 rgba(0, 0, 0, 0.20)";
export const MENU_CARD_SHADOW =
  "inset 0 .1rem 0 0 rgba(255, 255, 255, 0.08), 0 .1rem .2rem 0 rgba(0, 0, 0, 0.14), 0 .2rem .4rem 0 rgba(0, 0, 0, 0.10)";

/** Title bar of the menu column, with the way back to the arcade. */
export function MenuHeader({ title }: { title: string }) {
  return (
    <div
      className="flex min-h-[64px] items-center justify-between gap-4 px-5 py-4"
      style={{ background: MENU_SHELL_BG, boxShadow: MENU_SHADOW }}
    >
      <div className="font-sans text-[18px] leading-none font-semibold tracking-[-0.02em] text-white">
        {title}
      </div>
      <Link
        href="/casino"
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 font-sans text-[12.5px] font-medium text-white/60 transition-colors hover:border-white/25 hover:text-white"
      >
        <ChevronLeftIcon size={12} />
        Arkade
      </Link>
    </div>
  );
}

function MenuRow({ title, note, icon }: { title: string; note: string; icon: ReactNode }) {
  return (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-white/8 text-white/80">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-sans text-[14.5px] font-medium text-white">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] font-normal text-white/50">
          {note}
        </span>
      </span>
      <ArrowRightIcon className="shrink-0 text-white/35" />
    </>
  );
}

const MENU_ROW_CLASS =
  "flex w-full cursor-pointer items-center gap-3.5 rounded-[8px] px-4 py-3.5 transition-colors hover:bg-white/4";

export function MenuActionButton({
  title,
  note,
  icon,
  onClick,
  ariaLabel,
}: {
  title: string;
  note: string;
  icon: ReactNode;
  onClick: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? title}
      className={MENU_ROW_CLASS}
      style={{ background: MENU_CARD_BG, boxShadow: MENU_CARD_SHADOW }}
    >
      <MenuRow title={title} note={note} icon={icon} />
    </button>
  );
}

export function MenuActionLink({
  title,
  note,
  icon,
  href,
}: {
  title: string;
  note: string;
  icon: ReactNode;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={MENU_ROW_CLASS}
      style={{ background: MENU_CARD_BG, boxShadow: MENU_CARD_SHADOW }}
    >
      <MenuRow title={title} note={note} icon={icon} />
    </Link>
  );
}

/** One of the two seats framing the landing board. */
export function PlayerBar({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <div
      className="flex items-center gap-4 rounded-[8px] px-3 py-3"
      style={{ background: MENU_SHELL_BG, boxShadow: MENU_SHADOW }}
    >
      <span className="grid h-12 w-12 place-items-center rounded-[8px] bg-white/8 text-white/35">
        <PlayIcon size={20} />
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-sans text-[15px] font-medium text-white">{label}</span>
        {active ? (
          <span aria-hidden className="inline-flex gap-[3px]">
            <span className="h-4 w-[8px] rounded-[2px] bg-white/70" />
            <span className="h-4 w-[8px] rounded-[2px] bg-white/35" />
          </span>
        ) : null}
      </span>
    </div>
  );
}

/** A waiting game offered in the menu, with its one action. */
export function StateRow({
  label,
  meta,
  action,
  onAction,
  disabled = false,
}: {
  label: string;
  meta: string;
  action: string;
  onAction: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-[8px] px-4 py-3"
      style={{ background: MENU_CARD_BG, boxShadow: MENU_SHADOW }}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-sans text-[13.5px] font-medium text-white">{label}</div>
        <div className="truncate text-[12px] text-white/64">{meta}</div>
      </div>
      <button
        type="button"
        onClick={onAction}
        disabled={disabled}
        className="text-ink cursor-pointer rounded-full bg-white px-4 py-2 text-[11.5px] font-medium disabled:opacity-45"
      >
        {action}
      </button>
    </div>
  );
}

export function EmptyHint({ lines }: { lines: string[] }) {
  return (
    <div
      className="rounded-[8px] px-4 py-3 text-[13px] leading-6 text-white/72"
      style={{ background: MENU_CARD_BG, boxShadow: MENU_SHADOW }}
    >
      {lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}
