"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { ModalShell } from "@/components/ui/modal-shell";
import { MODAL_PANEL_CLASS, useModalTrigger } from "@/features/trade/components/meme-sort-menu";
import {
  EMPTY_FILTERS,
  SCREENER_METRICS,
  SCREENER_PRESETS,
  draftFrom,
  readDraft,
  type BoundError,
  type ScreenerDraft,
  type ScreenerFilters,
  type ScreenerMetric,
  type ScreenerPresetId,
} from "@/lib/meme/screener";

// The screener's Filters control (ADR-2026-09-15-meme-trending-screener §3).
// The inputs edit a local draft seeded from the applied filters each time the
// modal opens. Nothing is reported until Apply, so typing never refetches, and
// closing any other way throws the draft away.
//
// One modal serves both surfaces. The desk used to get a popover anchored to
// the button, which meant a second scroll region and a second set of sizes for
// the same seven rows.

const BOUND_KEYS: Record<ScreenerMetric, string> = {
  marketCap: "boundMarketCap",
  price: "boundPrice",
  age: "boundAge",
  transactions: "boundTransactions",
  volume: "boundVolume",
  traders: "boundTraders",
  liquidity: "boundLiquidity",
};

// Example values, not instructions: they show the k, m and b shorthand and a
// sensible scale for each metric. Numbers read the same in every locale.
const EXAMPLES: Record<ScreenerMetric, { min: string; max: string }> = {
  marketCap: { min: "10k", max: "1m" },
  price: { min: "0.00001", max: "0.01" },
  age: { min: "5", max: "1440" },
  transactions: { min: "100", max: "10k" },
  volume: { min: "50k", max: "5m" },
  traders: { min: "50", max: "1k" },
  liquidity: { min: "10k", max: "500k" },
};

const PRESET_KEYS: Record<ScreenerPresetId, { label: string; emoji: string }> = {
  fresh: { label: "presetFresh", emoji: "🌱" },
  movers: { label: "presetMovers", emoji: "🚀" },
  micro: { label: "presetMicro", emoji: "🔬" },
  deep: { label: "presetDeep", emoji: "🌊" },
  crowd: { label: "presetCrowd", emoji: "👥" },
};

const ERROR_KEYS: Record<BoundError, string> = {
  notNumber: "errorNotNumber",
  minAboveMax: "errorMinAboveMax",
};

const SIDES = ["min", "max"] as const;

function FilterIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6h16M7 12h10M10 18h4"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface MemeScreenerFiltersProps {
  variant: "desk" | "phone";
  filters: ScreenerFilters;
  count: number;
  preset: ScreenerPresetId | null;
  onApply: (bounds: ScreenerFilters["bounds"]) => void;
  onPreset: (id: ScreenerPresetId) => void;
}

export function MemeScreenerFilters({
  variant,
  filters,
  count,
  preset,
  onApply,
  onPreset,
}: MemeScreenerFiltersProps) {
  const t = useTranslations("memeScreener");
  const { open, show: showModal, close, triggerRef, panelRef } = useModalTrigger();
  const [draft, setDraft] = useState<ScreenerDraft>(() => draftFrom(filters));
  const baseId = useId();
  const dialogId = useId();
  const phone = variant === "phone";

  // Focus goes to the dialog itself, so its title is read first and no chip
  // or field is changed by a stray key.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open, panelRef]);

  const read = readDraft(draft);
  const errors = read.ok ? {} : read.errors;
  const blank = SCREENER_METRICS.every((m) => draft[m].min === "" && draft[m].max === "");

  const show = () => {
    setDraft(draftFrom(filters));
    showModal();
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!read.ok) return;
    onApply(read.bounds);
    close(true);
  };

  const edit = (metric: ScreenerMetric, side: "min" | "max", value: string) =>
    setDraft((prev) => ({ ...prev, [metric]: { ...prev[metric], [side]: value } }));

  const label = "text-[10.5px] font-medium tracking-[0.1em] text-white/35 uppercase";
  const button = phone
    ? "min-h-11 rounded-[13px] p-3 text-[14px]"
    : "min-h-9 rounded-[12px] px-3 py-2 text-[13px]";

  const fields = (
    <>
      <div role="group" aria-labelledby={`${baseId}-presets`}>
        <div id={`${baseId}-presets`} className={`${label} mb-2`}>
          {t("presetsLabel")}
        </div>
        <div className="flex flex-wrap gap-2">
          {SCREENER_PRESETS.map(({ id }) => {
            const on = preset === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  onPreset(id);
                  close(true);
                }}
                className={`cursor-pointer rounded-full border px-3 py-1.5 font-sans text-[12.5px] font-medium transition-colors ${
                  on
                    ? "border-white/30 bg-white/10 text-white"
                    : "border-white/10 text-white/55 hover:border-white/25 hover:text-white"
                }`}
              >
                <span aria-hidden className="mr-1.5">
                  {PRESET_KEYS[id].emoji}
                </span>
                {t(PRESET_KEYS[id].label)}
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-4 text-[11.5px] leading-[1.5] font-normal text-white/45">
        {t("amountHint")}
      </p>

      {SCREENER_METRICS.map((metric) => {
        const rowId = `${baseId}-${metric}`;
        return (
          <div key={metric} role="group" aria-labelledby={rowId} className="mt-3">
            <div id={rowId} className="mb-1.5 font-sans text-[12px] font-medium text-white/70">
              {t(BOUND_KEYS[metric])}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SIDES.map((side) => {
                const error = errors[metric]?.[side];
                const id = `${rowId}-${side}`;
                return (
                  <div key={side} className="min-w-0">
                    <div className="relative">
                      <span
                        id={`${id}-label`}
                        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-sans text-[11px] font-medium text-white/35"
                      >
                        {t(side)}
                      </span>
                      <input
                        id={id}
                        value={draft[metric][side]}
                        onChange={(e) => edit(metric, side, e.target.value)}
                        inputMode="decimal"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={EXAMPLES[metric][side]}
                        aria-labelledby={`${rowId} ${id}-label`}
                        aria-invalid={error !== undefined}
                        aria-describedby={error ? `${id}-error` : undefined}
                        // 16px on the phone, because iOS zooms the page into any
                        // field set smaller than that.
                        className={`tnum focus:border-accent/60 w-full rounded-[12px] border border-white/12 bg-white/4 pr-3 pl-11 font-sans font-normal text-white transition-colors outline-none placeholder:text-white/30 hover:border-white/20 ${
                          phone ? "h-11 text-[16px]" : "h-9 text-[13px]"
                        } ${error ? "ws-invalid" : ""}`}
                      />
                    </div>
                    {error ? (
                      <p id={`${id}-error`} className="text-down mt-1 text-[11.5px] font-normal">
                        {t(ERROR_KEYS[error])}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );

  const footer = (
    <div className="grid grid-cols-2 gap-2.5">
      <button
        type="button"
        onClick={() => setDraft(draftFrom(EMPTY_FILTERS))}
        disabled={blank}
        className={`cursor-pointer border border-white/14 bg-white/6 font-sans font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 ${button}`}
      >
        {t("reset")}
      </button>
      <button
        type="submit"
        disabled={!read.ok}
        className={`ws-chrome text-ink cursor-pointer bg-white font-sans font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${button}`}
      >
        {t("apply")}
      </button>
    </div>
  );

  // Padded past the shell's close button so a long title never runs under it.
  const title = (
    <div id={`${baseId}-title`} className="ws-display mb-4 pr-10 text-[20px]">
      {t("filtersTitle")}
    </div>
  );

  return (
    <div className="shrink-0">
      <button
        ref={triggerRef}
        type="button"
        data-screener-filters
        onClick={() => (open ? close(false) : show())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        className={`flex h-[36px] cursor-pointer items-center gap-1.5 rounded-full border px-3 font-sans text-[12px] font-semibold transition-colors ${
          count > 0
            ? "border-white/30 bg-white/10 text-white"
            : "border-white/12 bg-white/4 text-white/60 hover:border-white/25 hover:text-white"
        }`}
      >
        <FilterIcon />
        {t("filtersLabel")}
        {count > 0 ? (
          <>
            <span
              aria-hidden
              className="tnum bg-accent/20 text-accent grid size-5 place-items-center rounded-full text-[11px]"
            >
              {count}
            </span>{" "}
            <span className="sr-only">{t("filtersCount", { count })}</span>
          </>
        ) : null}
      </button>

      <ModalShell open={open} onClose={() => close(true)} panelClassName={MODAL_PANEL_CLASS}>
        <div
          ref={panelRef}
          id={dialogId}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${baseId}-title`}
          tabIndex={-1}
          className="outline-none"
        >
          {title}
          <form onSubmit={submit} noValidate>
            {fields}
            <div className="mt-5">{footer}</div>
          </form>
        </div>
      </ModalShell>
    </div>
  );
}
