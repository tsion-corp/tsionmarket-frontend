"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarIcon, ChevronLeftIcon } from "@/components/ui/icons";

interface DateFieldProps {
  label: string;
  required: boolean;
  // ISO date, "yyyy-mm-dd", or "" when unset.
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const TRIGGER_CLASS =
  "flex w-full items-center justify-between gap-2 rounded-[13px] border border-white/10 bg-black/35 px-3.5 py-3 font-sans text-[14.5px] outline-none transition-colors focus:border-accent/45 disabled:opacity-60";

const DISPLAY = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat("en", { month: "long" }).format(new Date(2000, i, 1))
);
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const EARLIEST_YEAR = 1920;

// Local yyyy-mm-dd so a timezone shift never moves the date.
function toIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseIso(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Date of birth picker: a calendar popover with month and year dropdowns, so
// reaching a birth year is a couple of taps rather than scrolling month by
// month. Self-contained (no calendar dependency) and styled for the dark sheet;
// future dates are disabled.
export function DateField({ label, required, value, error, onChange, disabled }: DateFieldProps) {
  const t = useTranslations("fundsKyc");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selected = parseIso(value);
  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();

  // The month currently shown in the grid. Seeded from the selected date, or a
  // sensible default decade for a date of birth. Re-centred in the open handler.
  const [view, setView] = useState(() => selected ?? new Date(2000, 0, 1));

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // The calendar sits inline in the form rather than floating, so it never spills
  // past the modal. Bring it into view when it opens in case it is below the fold.
  useEffect(() => {
    if (open) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [open]);

  const viewYear = view.getFullYear();
  const viewMonth = view.getMonth();
  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = currentYear; y >= EARLIEST_YEAR; y--) list.push(y);
    return list;
  }, [currentYear]);

  // Leading blanks (week starts Sunday) plus each day of the month.
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const atLatestMonth = viewYear === currentYear && viewMonth === today.getMonth();

  const shiftMonth = (delta: number) => setView(new Date(viewYear, viewMonth + delta, 1));

  return (
    <div ref={ref}>
      <span className="mb-1.5 flex items-center gap-1 text-[12px] font-medium tracking-[0.02em] text-white/45 uppercase">
        {label}
        {required ? <span className="text-accent">*</span> : null}
      </span>

      <div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            const next = !open;
            setOpen(next);
            // Re-centre the grid on the current selection each time it opens.
            if (next) setView(selected ?? new Date(2000, 0, 1));
          }}
          className={`${TRIGGER_CLASS} cursor-pointer ${open ? "border-accent/45" : ""}`}
        >
          <span className={selected ? "text-white" : "text-white/30"}>
            {selected ? DISPLAY.format(selected) : t("selectDate")}
          </span>
          <CalendarIcon size={17} className={open ? "text-accent" : "text-white/45"} />
        </button>

        {open ? (
          <div
            ref={panelRef}
            className="mt-2 w-full max-w-[340px] rounded-[16px] border border-white/10 bg-black/20 p-3"
            style={{ colorScheme: "dark" }}
          >
            {/* Month + year navigation. The dropdowns make jumping decades quick. */}
            <div className="mb-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label={t("prevMonth")}
                className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-white/60 hover:bg-white/8 hover:text-white"
              >
                <ChevronLeftIcon size={16} />
              </button>

              <select
                value={viewMonth}
                onChange={(e) => setView(new Date(viewYear, Number(e.target.value), 1))}
                className="focus:border-accent/45 flex-1 cursor-pointer rounded-[10px] border border-white/10 bg-black/40 px-2 py-1.5 font-sans text-[13px] text-white outline-none"
              >
                {MONTH_NAMES.map((name, i) => (
                  <option
                    key={name}
                    value={i}
                    disabled={viewYear === currentYear && i > today.getMonth()}
                  >
                    {name}
                  </option>
                ))}
              </select>

              <select
                value={viewYear}
                onChange={(e) => setView(new Date(Number(e.target.value), viewMonth, 1))}
                className="focus:border-accent/45 cursor-pointer rounded-[10px] border border-white/10 bg-black/40 px-2 py-1.5 font-sans text-[13px] text-white outline-none"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => shiftMonth(1)}
                disabled={atLatestMonth}
                aria-label={t("nextMonth")}
                className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-white/60 hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeftIcon size={16} className="rotate-180" />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-white/35">
              {WEEKDAYS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, i) => {
                if (day == null) return <span key={`b${i}`} />;
                const date = new Date(viewYear, viewMonth, day);
                const isFuture = date > today;
                const isSelected = selected != null && sameDay(date, selected);
                const isToday = sameDay(date, today);
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={isFuture}
                    onClick={() => {
                      onChange(toIso(date));
                      setOpen(false);
                    }}
                    className={`tnum grid h-9 place-items-center rounded-[10px] text-[13px] transition-colors ${
                      isSelected
                        ? "bg-white font-semibold text-black"
                        : isFuture
                          ? "cursor-not-allowed text-white/20"
                          : "cursor-pointer text-white/80 hover:bg-white/10"
                    } ${isToday && !isSelected ? "text-accent" : ""}`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {error ? <span className="text-down mt-1.5 block text-[12px]">{error}</span> : null}
    </div>
  );
}
