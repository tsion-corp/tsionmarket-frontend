"use client";

import { useTranslations } from "next-intl";

// The risk-settings control on the 2.0 desktop perps ticket: the account's
// margin mode, a leverage readout, a slider, and the four preset chips.
// Presentational and fully controlled, so the ticket above it owns both values
// and nothing here can drift out of step with the order the composer is about
// to sign.
//
// Margin mode sits in this card rather than in a header pill because it is the
// same decision leverage is. Both are account-level risk settings for one
// market, both are pushed to the venue by the same call
// (updateLeverage(symbol, leverage, marginMode)), and a trader who changes one
// without seeing the other is choosing risk half-blind. The Figma comp draws
// only the leverage half, so the margin row is additive: omit the two margin
// props and the card is exactly the comp.
//
// Leverage is the one figure on this ticket that is a `number` on purpose. It
// is a whole multiplier bounded by the market's own ceiling (Hyperliquid tops
// out well under 100x), not an asset amount, so it carries no precision risk
// and the venue only accepts integers anyway. Everything it multiplies, the
// order value and the margin, stays in base units and is worked out by the
// composer, never here.
//
// The slider and the chips are two views of the same prop. Neither holds
// state, so "move the slider, the chips follow" is not behaviour that has to
// be kept in sync: there is only one value to read.

// The multipliers the design draws. A market whose ceiling sits below one of
// them simply does not show that chip.
export const LEVERAGE_PRESETS: readonly number[] = [2, 5, 10, 20];

// Cross or isolated, the only two the venue takes. Named here rather than
// imported from the venue's own type module so this card stays a design-system
// piece with no knowledge of Hyperliquid. The values are identical to
// HlMarginMode, so a composer assigns one to the other with no cast.
export type PerpMarginMode = "cross" | "isolated";

const MARGIN_MODES: readonly PerpMarginMode[] = ["cross", "isolated"];

// The thumb's diameter, from the Figma comp (173:43175). It sets how far the
// thumb is inset at each end of the track, the way a native range thumb is.
const THUMB_PX = 23;

// The comp's chip: a violet fill and edge with the Kash yellow on the label
// when it is on (173:43181). Neither the fill nor the edge has a token in this
// app's palette yet, so both are written out; the label takes --color-kash,
// which is the same #FFD62F the slider's filled track uses. The off state
// carries a transparent border of the same weight so picking one does not move
// the row.
//
// The margin chips and the leverage chips share it deliberately: they are one
// family of choices on one card, and drawing them apart would read as two
// unrelated controls.
function chipClass(on: boolean, padding: string): string {
  return (
    `ws-chewy cursor-pointer rounded-lg border ${padding} text-[13px] leading-none whitespace-nowrap transition-colors ` +
    "focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 " +
    "focus-visible:ring-offset-black focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 " +
    (on
      ? "text-kash border-[#7724bb] bg-[rgba(119,36,187,0.4)]"
      : "bg-grey-800 border-transparent text-[#94a3b8] hover:text-white")
  );
}

// Round a leverage onto a whole multiplier inside the market's bounds. A value
// that is not a number at all falls to the floor rather than to NaN, which
// would put the slider in an unset state and the chips on nothing.
export function clampLeverage(value: number, min: number, max: number): number {
  const ceiling = Math.max(min, max);
  if (!Number.isFinite(value)) return value === Number.POSITIVE_INFINITY ? ceiling : min;
  return Math.min(ceiling, Math.max(min, Math.round(value)));
}

// How much of the track is filled, as a percentage. Measured from the floor,
// not from zero: at 1x on a 1x..20x market the track is empty, not 5% full.
export function leverageFillPercent(value: number, min: number, max: number): number {
  const span = max - min;
  if (span <= 0) return 0;
  const clamped = clampLeverage(value, min, max);
  return ((clamped - min) / span) * 100;
}

// The presets a market can actually take. Filtering rather than disabling: a
// chip for a multiplier the venue would reject is not a choice, it is a dead
// control.
export function visiblePresets(
  presets: readonly number[],
  min: number,
  max: number
): readonly number[] {
  return presets.filter((preset) => preset >= min && preset <= max);
}

export interface PerpLeverageCardProps {
  // The current multiplier. Controlled: this component never holds it.
  leverage: number;
  // Fires with a whole multiplier inside [min, max]. A value the market cannot
  // take never leaves this component.
  onLeverageChange: (next: number) => void;
  // The market's ceiling, from the venue's own asset record.
  max: number;
  // The floor. 1x is the lowest a perp venue accepts, so it is the default.
  min?: number;
  // Override only to draw a different set of chips. The values are multipliers,
  // not positions, so the order given is the order drawn.
  presets?: readonly number[];
  // The account's margin mode for this market. Supply both this and
  // onMarginModeChange to draw the row; omit both and the card is the comp's
  // leverage card and nothing else. Half-supplying draws nothing, so a
  // forgotten handler cannot ship a control that silently does nothing.
  marginMode?: PerpMarginMode;
  onMarginModeChange?: (next: PerpMarginMode) => void;
  // Set while an order is in flight, so risk settings cannot move under a
  // signature.
  disabled?: boolean;
  className?: string;
}

export function PerpLeverageCard({
  leverage,
  onLeverageChange,
  max,
  min = 1,
  presets = LEVERAGE_PRESETS,
  marginMode,
  onMarginModeChange,
  disabled = false,
  className,
}: PerpLeverageCardProps) {
  const t = useTranslations("perps");
  const ceiling = Math.max(min, max);
  const current = clampLeverage(leverage, min, ceiling);
  const percent = leverageFillPercent(current, min, ceiling);
  const chips = visiblePresets(presets, min, ceiling);

  const margin =
    marginMode !== undefined && onMarginModeChange !== undefined
      ? { mode: marginMode, onChange: onMarginModeChange }
      : null;

  // The readout carries one decimal, as the comp draws it ("10.0x"). The value
  // is a whole multiplier, so this is a fixed display format and not a
  // rounding: nothing is lost on the way to the string.
  const readout = t("leverageValue", { value: current.toFixed(1) });

  // A native range thumb's centre travels from half a thumb in to half a thumb
  // short of the far end, so the mark never overhangs the track. The painted
  // thumb has to follow the same path or it drifts from the value the keyboard
  // is setting. The fill ends under the thumb's centre for the same reason.
  const travel = `calc(${percent}% + ${(0.5 - percent / 100) * THUMB_PX}px)`;

  const pick = (next: number) => {
    const value = clampLeverage(next, min, ceiling);
    if (value !== current) onLeverageChange(value);
  };

  return (
    <div
      className={`rounded-card border-hairline bg-surface flex w-full flex-col gap-4 border-2 p-4 ${className ?? ""}`}
    >
      {margin ? (
        <div className="flex items-center justify-between gap-3">
          <span className="ws-discovery-title text-[13px] tracking-[-0.26px] whitespace-nowrap text-[rgba(148,163,184,0.5)]">
            {t("marginMode")}
          </span>
          {/* aria-pressed rather than a radio group, so the two chips announce
              the same way the leverage presets beside them do. */}
          <div role="group" aria-label={t("marginMode")} className="flex items-center gap-2">
            {MARGIN_MODES.map((option) => {
              const on = option === margin.mode;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={on}
                  disabled={disabled}
                  onClick={() => {
                    if (option !== margin.mode) margin.onChange(option);
                  }}
                  className={chipClass(on, "px-3 py-1.5")}
                >
                  {option === "cross" ? t("marginCross") : t("marginIsolated")}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="ws-discovery-title flex items-center justify-between gap-3 whitespace-nowrap">
        <span className="text-[13px] tracking-[-0.26px] text-[rgba(148,163,184,0.5)]">
          {t("leverage")}
        </span>
        <span className="text-[14px] text-[#f8fafc]">{readout}</span>
      </div>

      {/* The track is painted in divs and the real control sits transparent on
          top of it. Styling a native range's thumb needs ::-webkit-slider-thumb
          and ::-moz-range-thumb rules, which live in a stylesheet, not in a
          utility class; overlaying keeps the keyboard, the pointer and the
          slider role that the native input already gets right. */}
      <div className="relative h-[23px] w-full">
        <div
          aria-hidden
          className="bg-grey-700 absolute top-1/2 h-[6px] w-full -translate-y-1/2 rounded-full"
        />
        <div
          aria-hidden
          className="bg-kash absolute top-1/2 h-[6px] -translate-y-1/2 rounded-full"
          style={{ width: travel }}
        />
        <div
          aria-hidden
          className="absolute top-1/2 size-[23px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/60 bg-[#f8fafc]"
          style={{ left: travel }}
        />
        <input
          type="range"
          min={min}
          max={ceiling}
          step={1}
          value={current}
          disabled={disabled}
          aria-label={t("leverage")}
          // Screen readers would otherwise announce a bare "10" for a figure
          // that only means anything with its unit.
          aria-valuetext={readout}
          onChange={(event) => pick(Number(event.target.value))}
          className="absolute inset-0 size-full cursor-pointer appearance-none bg-transparent opacity-0 disabled:cursor-not-allowed"
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        {chips.map((preset) => {
          const on = preset === current;
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => pick(preset)}
              className={chipClass(on, "px-4 py-1.5")}
            >
              {t("leverageValue", { value: String(preset) })}
            </button>
          );
        })}
      </div>
    </div>
  );
}
