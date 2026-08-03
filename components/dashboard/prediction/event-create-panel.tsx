"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { toBaseUnits } from "@/lib/trade/math";
import { USDC_DECIMALS } from "@/lib/prediction/types";
import { useCreateEvent, type OutcomeInput } from "@/hooks/use-create-event";
import { toast } from "@/lib/toast";

// Multi-outcome EVENT create form: an event title + rules, a shared close time
// and per-outcome seed, and a list of outcomes (label each). On submit it creates
// one on-chain market per outcome SEQUENTIALLY (each a gasless wallet signature),
// showing a per-outcome progress list, then groups them into the event.

const MIN_SEED_USDC = 1_000_000n; // $1
const DURATIONS = [
  { key: "1d", labelKey: "dur_1d", seconds: 86_400 },
  { key: "1w", labelKey: "dur_1w", seconds: 604_800 },
  { key: "1m", labelKey: "dur_1m", seconds: 2_592_000 },
] as const;

interface EventCreatePanelProps {
  onDone: () => void;
  inputClass: string;
  labelClass: string;
  categories: string[];
}

export function EventCreatePanel({
  onDone,
  inputClass,
  labelClass,
  categories,
}: EventCreatePanelProps) {
  const t = useTranslations("prediction");
  const { create, progress, phase, busy } = useCreateEvent();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [rules, setRules] = useState("");
  const [durationKey, setDurationKey] = useState<string>("1w");
  const [seed, setSeed] = useState("");
  // Start with two empty outcomes — an event needs at least two.
  const [outcomes, setOutcomes] = useState<OutcomeInput[]>([{ label: "" }, { label: "" }]);

  const seedUnits = toBaseUnits(seed, USDC_DECIMALS);
  const filledOutcomes = outcomes.filter((o) => o.label.trim().length > 0);
  const valid =
    title.trim().length > 0 && seedUnits >= MIN_SEED_USDC && filledOutcomes.length >= 2 && !busy;

  const setLabel = (i: number, label: string) =>
    setOutcomes((prev) => prev.map((o, idx) => (idx === i ? { ...o, label } : o)));
  const addOutcome = () => setOutcomes((prev) => [...prev, { label: "" }]);
  const removeOutcome = (i: number) =>
    setOutcomes((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)));

  // Resolve the close time to unix seconds, reading the clock in the handler (not
  // during render) so the preset stays relative to submit time. useCallback marks
  // it as a stable event-scope function (satisfies the purity lint on Date.now).
  const resolveCloseTime = useCallback((): number => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const duration = DURATIONS.find((d) => d.key === durationKey)?.seconds ?? 604_800;
    return nowSeconds + duration;
  }, [durationKey]);

  const submit = async () => {
    if (!valid) return;
    const closeTime = resolveCloseTime();
    try {
      const result = await create({
        title: title.trim(),
        category: category.trim() || undefined,
        rules: rules.trim() || undefined,
        closeTime,
        seedUsdc: seedUnits,
        outcomes: filledOutcomes.map((o) => ({ label: o.label.trim() })),
      });
      if (result) {
        toast.success(t("eventCreated"));
        onDone();
      }
    } catch {
      toast.error(t("createMarketFailed"));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>{t("eventTitleLabel")}</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("eventTitlePlaceholder")}
          maxLength={200}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>{t("categoryLabel")}</span>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          list="event-categories"
          placeholder={t("categoryPlaceholder")}
          className={inputClass}
        />
        <datalist id="event-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>{t("rulesLabel")}</span>
        <textarea
          value={rules}
          onChange={(e) => setRules(e.target.value)}
          placeholder={t("rulesPlaceholder")}
          rows={3}
          maxLength={8000}
          className={`${inputClass} resize-none`}
        />
      </label>

      {/* Outcomes */}
      <div className="flex flex-col gap-2">
        <span className={labelClass}>{t("outcomesLabel")}</span>
        {outcomes.map((o, i) => {
          const p = progress[i];
          return (
            <div key={i} className="flex items-center gap-2">
              <input
                value={o.label}
                onChange={(e) => setLabel(i, e.target.value)}
                placeholder={t("outcomePlaceholder", { n: i + 1 })}
                maxLength={120}
                disabled={busy}
                className={`${inputClass} flex-1`}
              />
              {p ? (
                <span className="w-16 shrink-0 text-center text-[11px] font-medium">
                  {p.status === "done" ? (
                    <span className="text-up">✓</span>
                  ) : p.status === "creating" ? (
                    <span className="text-white/60">…</span>
                  ) : p.status === "failed" ? (
                    <span className="text-down">✕</span>
                  ) : (
                    <span className="text-white/30">•</span>
                  )}
                </span>
              ) : outcomes.length > 2 && !busy ? (
                <button
                  onClick={() => removeOutcome(i)}
                  className="hover:text-down shrink-0 cursor-pointer px-2 text-[16px] text-white/40"
                  aria-label="remove"
                >
                  ×
                </button>
              ) : (
                <span className="w-6 shrink-0" />
              )}
            </div>
          );
        })}
        {!busy ? (
          <button
            onClick={addOutcome}
            className="cursor-pointer self-start text-[12.5px] font-medium text-white/55 hover:text-white/85"
          >
            + {t("addOutcome")}
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>{t("seedPerOutcomeLabel")}</span>
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            inputMode="decimal"
            placeholder="1.00"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>{t("closeTimeLabel")}</span>
          <select
            value={durationKey}
            onChange={(e) => setDurationKey(e.target.value)}
            className={inputClass}
          >
            {DURATIONS.map((d) => (
              <option key={d.key} value={d.key} className="bg-black">
                {t(d.labelKey)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-[11.5px] font-normal text-white/40">
        {t("eventCreateNote", { count: filledOutcomes.length || 2 })}
      </p>

      <button
        onClick={submit}
        disabled={!valid}
        className="text-ink cursor-pointer rounded-xl bg-white py-3 font-sans text-sm font-semibold hover:opacity-90 disabled:opacity-50"
      >
        {phase === "creating"
          ? t("eventCreatingMarkets")
          : phase === "grouping"
            ? t("eventGrouping")
            : t("createEventCta")}
      </button>
    </div>
  );
}
