"use client";

import type { ReactNode } from "react";

import { Disclosure } from "@/components/ui/disclosure";
import {
  ChartLineIcon,
  ChevronDownIcon,
  ChevronDownSoftIcon,
  CollapseIcon,
  ExpandIcon,
} from "@/components/ui/icons";

// The frame around a chart on the 2.0 desktop trade screens: the identity
// header, the show/hide control, the panel chrome, and one slot the real chart
// renders into.
//
// It draws no chart and imports no charting library. lightweight-charts is
// already landing in a first-load bundle it has no business in, so the engine
// stays the consuming screen's choice and arrives here as children: the meme
// screen passes its area chart, the leverage screen passes the TradingView
// iframe. Nothing here fetches, polls, or holds market state either. The
// timeframe and the open/closed state are both controlled, and every string
// arrives already translated, so the shell reads no catalog and adds no key.
//
// Geometry comes from two frames in the 2.0 desktop file:
//   Leverage trading, opened charts (173:42963), chart region 173:43139-43149
//   Meme, opened charts            (173:46663), chart region 173:46827-46848
// The two regions are one component. Every dimension in the meme frame is the
// leverage frame's multiplied by 0.9388 (height 206.5/220, radius 19.5/20.8,
// border 0.813/0.866, width 382/407), which is the whole ticket column scaled
// down, not a second design. The leverage numbers are the 1:1 ones, so they
// are the ones written here.

export type ChartPanelState = "ready" | "loading" | "empty" | "error";

/** Already-translated copy for the states the panel can land in and the controls it offers. */
export interface ChartPanelLabels {
  /** Announced while the skeleton stands in for the chart. */
  loading: string;
  /** Shown when there is no series to draw yet. */
  empty: string;
  /** Shown when the series could not be loaded. */
  error: string;
  /** Names the retry action. Without it, no retry button is offered. */
  retry?: string;
  /** Names the fullscreen control while the chart sits in the panel. Without it, no fullscreen control is offered. */
  expand?: string;
  /** Names the fullscreen control while the chart is already fullscreen. Falls back to expand. */
  exitFullscreen?: string;
}

export interface ChartPanelTimeframe {
  /** Sent back through onTimeframeChange. */
  value: string;
  /** Already-translated button text, e.g. "1H". */
  label: string;
}

interface ChartPanelToggleProps {
  /** Whether the chart is currently shown. */
  open: boolean;
  /** Reports the state the screen should move to. The toggle stores nothing. */
  onOpenChange: (open: boolean) => void;
  /** Already-translated wording for the current state, e.g. "Close Chart". */
  label: string;
  /** Ties the control to the panel it opens, for assistive tech. */
  controls?: string;
  className?: string;
}

// The "Close Chart" row above the panel: a dot and chart glyph, the label, and a
// chevron that points up while the chart is open. The dot and the glyph are kash
// yellow, which is what the comp draws on every page that carries this row, and
// the label beside them stays white. SpotPairHeader paints the same two marks
// the same way.
//
// Exported on its own because LeverageDesktopLayout takes this row through a
// `chartToggle` slot separate from its `chart` slot. A screen that has no such
// split gets the same row from ChartPanelShell, which renders this component.
export function ChartPanelToggle({
  open,
  onOpenChange,
  label,
  controls,
  className,
}: ChartPanelToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onOpenChange(!open)}
      aria-expanded={open}
      aria-controls={controls}
      className={`ws-pressable flex cursor-pointer items-center gap-2 self-start ${
        className ?? ""
      }`}
    >
      <span className="flex items-center gap-1">
        <span aria-hidden="true" className="bg-kash inline-block size-[3px] rounded-full" />
        <ChartLineIcon size={11} className="text-kash" />
        <span className="text-[14px] font-bold tracking-[-0.07px] text-white">{label}</span>
      </span>
      <ChevronDownSoftIcon
        size={16}
        className={`text-white transition-transform ${open ? "rotate-180" : "rotate-0"}`}
      />
    </button>
  );
}

interface ChartPanelShellProps {
  /** The chart itself. Rendered only when the panel is open and ready. */
  children?: ReactNode;
  /** Copy for the loading, empty and error states. */
  labels: ChartPanelLabels;
  /** Which state the chart region is in. Defaults to ready. */
  state?: ChartPanelState;
  /** Offered on the error state, alongside labels.retry. */
  onRetry?: () => void;
  /** Panel height in pixels. 220 is the height both frames draw. */
  height?: number;

  /** Market name for the header, e.g. "PEPE/SOL". Omit for no header. */
  symbol?: string;
  /** Token avatar shown inside the market pill. */
  symbolIcon?: ReactNode;
  /** Opens the market picker. The shell owns neither the list nor the choice. */
  onSymbolClick?: () => void;
  /** Already-translated accessible name for the market pill. */
  symbolTriggerLabel?: string;
  /**
   * The screen's own market picker, drawn where the identity pill would go.
   * Given one, the shell draws no pill of its own: the picker already names the
   * market, and two copies of the pair across one header row is the duplicate
   * that got the shell's identity props taken off the panel variant in the
   * first place.
   *
   * This is a slot, not a picker. The shell still owns neither the market list
   * nor the choice, and it holds no open/closed state for whatever the node
   * drops down. A screen passes the same picker it uses everywhere else, wired
   * to the same state, so a market chosen here is the screen's market.
   */
  marketPicker?: ReactNode;
  /** Last price, already formatted and localised. */
  price?: string;
  /** 24h change, already formatted, e.g. "+14.25%". */
  change?: string;
  /** Colours the change. Left out, it stays neutral. */
  changeDirection?: "up" | "down";
  /** Trailing header slot, e.g. the leverage screen's Limit/Market switch. */
  headerAccessory?: ReactNode;

  /** Timeframe options. Neither frame draws these, so they are opt-in. */
  timeframes?: readonly ChartPanelTimeframe[];
  /** The selected timeframe. Controlled: the shell holds no selection. */
  timeframe?: string;
  /** Reports the timeframe the screen should move to. */
  onTimeframeChange?: (value: string) => void;
  /** Already-translated accessible name for the timeframe group. */
  timeframeLabel?: string;

  /** Whether the chart is shown. Defaults to open. */
  open?: boolean;
  /** Providing this renders the show/hide row. Controlled, like the timeframe. */
  onOpenChange?: (open: boolean) => void;
  /** Already-translated wording for the show/hide row's current state. */
  toggleLabel?: string;

  /** Whether the consumer is currently showing this chart fullscreen. */
  fullscreen?: boolean;
  /**
   * Providing this renders the fullscreen control in the header's top right,
   * alongside labels.expand. Controlled, like everything else here: the shell
   * reports the state to move to and the screen decides what fullscreen means.
   * No modal and no portal live here. Escaping the panel means a fixed overlay
   * plus an Escape-key listener, which is state and an effect this shell does
   * not hold, and the leverage screen wants the whole desk to go fullscreen,
   * not just the chart. HyperliquidChartPanel already owns exactly that
   * mechanism for its own card.
   */
  onFullscreenChange?: (fullscreen: boolean) => void;

  className?: string;
}

// The default height in both frames. 220px is a real number rather than a
// percentage on purpose: an iframe or a canvas inside a percentage-height box
// resolves to zero, and the surrounding ticket is a flex column whose other
// rows grow with live data.
//
// The chart the frame is handed sizes itself against this number, and the
// leverage screen's chart is a TradingView iframe drawn at `height: 100%`. A
// consumer that replaces the number with a flexed height, which is what
// LeverageDesktopLayout does at desktop widths, owns the whole chain above the
// frame: every ancestor from a definite height down to here has to keep that
// height definite, or the frame grows and the chart inside it collapses to an
// iframe's default 150px. leverage-desktop-layout.tsx carries the measurements.
export const CHART_PANEL_SHELL_HEIGHT = 220;

const PANEL_ID = "chart-panel-shell-body";

export function ChartPanelShell({
  children,
  labels,
  state = "ready",
  onRetry,
  height = CHART_PANEL_SHELL_HEIGHT,
  symbol,
  symbolIcon,
  onSymbolClick,
  symbolTriggerLabel,
  marketPicker,
  price,
  change,
  changeDirection,
  headerAccessory,
  timeframes,
  timeframe,
  onTimeframeChange,
  timeframeLabel,
  open = true,
  onOpenChange,
  toggleLabel,
  fullscreen = false,
  onFullscreenChange,
  className,
}: ChartPanelShellProps) {
  // The fullscreen control lives in the header's top right, so a screen that
  // supplies its own market identity and asks only for fullscreen still gets a
  // header to hang it in. Without that, the control would be dropped in
  // silence. It is gated on `open` as well: there is nothing to enlarge while
  // the panel is collapsed, and aria-controls would name an id that is not in
  // the document.
  const hasFullscreen = Boolean(onFullscreenChange && labels.expand && open);
  // Identity is what earns the header a row of its own. Without it the header
  // has nothing to lay out but the fullscreen button, and a full row for one
  // 28px control is what pushed the chart down the panel: the row, plus the
  // shell's gap under it, put 40px of black between the screen's chart toggle
  // and the chart's own toolbar. So with no identity the header keeps the
  // control and stops taking height. See the className below for where it goes.
  const hasIdentity = Boolean(symbol || price || change || headerAccessory || marketPicker);
  const pinsFullscreen = hasFullscreen && !hasIdentity;
  const hasHeader = hasIdentity || hasFullscreen;
  // Only the pinned variant needs the root as its containing block. Added
  // unconditionally it would race the `fixed` a fullscreen consumer passes in
  // `className`, and which of the two won would come down to the order Tailwind
  // happened to emit them in.
  const rootPosition = pinsFullscreen ? "relative" : "";
  const hasTimeframes = Boolean(timeframes && timeframes.length > 0);
  const hasToggle = Boolean(onOpenChange && toggleLabel);
  // The pinned header is drawn out of flow, so it is not a flex item and takes
  // no gap. Only an identity header is a row the spacing below has to reckon
  // with, and a header earns its row exactly when it carries identity.
  const headerInFlow = hasIdentity;
  // The 12px the panel used to get from the root's flex gap, now carried by
  // whatever the panel's first element is.
  //
  // A margin on the content, not padding on the clip: a collapsed panel is a
  // grid row of zero height, and padding sits outside that box, so `pt-3` left
  // a 12px band under the toggle with the chart shut. Measured in Chrome at
  // 1440px: the shut panel came to rest at 12px rather than 0. A margin is part
  // of what gets clipped, so it goes with everything else.
  //
  // Only owed when something is laid out above the panel.
  const panelLead = headerInFlow || hasToggle ? "mt-3" : "";
  // A ready panel with nothing in it is the blank frame this component exists
  // to prevent, so it falls through to the empty state.
  const hasChart = children !== null && children !== undefined && children !== false;
  const effective: ChartPanelState = state === "ready" && !hasChart ? "empty" : state;

  const changeTone =
    changeDirection === "up"
      ? "text-up"
      : changeDirection === "down"
        ? "text-down"
        : "text-white/70";

  return (
    // The space before each interpolation is load-bearing: Tailwind reads class
    // names out of the source text, and a class butted straight against `${` is
    // scanned as part of a longer token, so its rule is never emitted.
    //
    // No `gap-3` on the root any more. The panel below stays in the tree while
    // it is shut, so the collapse can animate, and a flex gap is drawn between
    // items whatever their height: a shut panel would keep a 12px band under
    // the toggle and push everything below the shell down by it. The same 12px
    // rhythm is spelled out instead, and the panel's share of it lives inside
    // the clip, where a shut panel takes it away with everything else.
    <div className={`flex w-full flex-col ${rootPosition} ${className ?? ""}`}>
      {hasHeader && (
        <div
          data-region="chart-panel-header"
          className={
            pinsFullscreen
              ? // Not a row. A zero-height anchor in the shell's top right
                // corner, so the frame starts where the header used to.
                // `bottom-full` lifts the control clear of the frame rather
                // than over it: the chart draws its own toolbar along the top,
                // and TradingView puts a control in exactly this corner, so an
                // overlay there would cover it. The padding is the shell's own
                // 12px gap, which lands the control's bottom edge level with
                // the bottom of whatever row the screen draws above the chart.
                "absolute right-0 bottom-full flex items-center pb-3"
              : "flex w-full items-center justify-between gap-3"
          }
        >
          <div className="flex min-w-0 items-center gap-3">
            {marketPicker ??
              (symbol &&
                (onSymbolClick ? (
                  <button
                    type="button"
                    onClick={onSymbolClick}
                    aria-label={symbolTriggerLabel}
                    className="ws-pressable bg-surface border-hairline flex h-10 cursor-pointer items-center gap-1 rounded-2xl border-[1.7px] px-[11px] py-1.5"
                  >
                    {symbolIcon}
                    <span className="text-grey-100 truncate text-[15px] font-semibold">
                      {symbol}
                    </span>
                    <ChevronDownIcon size={11} className="text-white/70" />
                  </button>
                ) : (
                  <span className="bg-surface border-hairline flex h-10 items-center gap-1 rounded-2xl border-[1.7px] px-[11px] py-1.5">
                    {symbolIcon}
                    <span className="text-grey-100 truncate text-[15px] font-semibold">
                      {symbol}
                    </span>
                  </span>
                )))}
            {change && (
              <span className={`shrink-0 text-[15px] font-bold ${changeTone}`}>{change}</span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {price && <span className="tnum text-[20px] font-extrabold text-white">{price}</span>}
            {headerAccessory}
            {hasFullscreen && (
              <button
                type="button"
                onClick={() => onFullscreenChange?.(!fullscreen)}
                aria-pressed={fullscreen}
                aria-controls={PANEL_ID}
                aria-label={fullscreen ? (labels.exitFullscreen ?? labels.expand) : labels.expand}
                className="ws-pressable shrink-0 cursor-pointer rounded-lg border border-white/10 bg-white/4 p-1.5 text-white/55 transition-colors hover:border-white/25 hover:text-white"
              >
                {fullscreen ? <CollapseIcon size={14} /> : <ExpandIcon size={14} />}
              </button>
            )}
          </div>
        </div>
      )}

      {onOpenChange && toggleLabel && (
        <div
          data-region="chart-panel-toggle"
          // Scanner rule again: space before the interpolation.
          className={`flex items-center ${headerInFlow ? "mt-3" : ""}`}
        >
          <ChartPanelToggle
            open={open}
            onOpenChange={onOpenChange}
            label={toggleLabel}
            controls={PANEL_ID}
          />
        </div>
      )}

      {/* One box whose only job is height. `Disclosure`'s animating root takes
          no classes of its own, so the two things that root needs are handed to
          it here through `[&>*]`.

          `min-h-0` is what lets a shut panel actually reach zero. A flex item's
          automatic minimum is its content's, and the frame inside carries a
          real height, so without this the collapse stops at the frame's height
          and the panel never closes. Measured in Chrome at 1440px: the desk
          panel settled at 232px instead of 0. It is unconditional for that
          reason.

          `flex-1` is the height chain. LeverageDesktopLayout stretches the
          frame with `[&_[data-region=chart-panel-frame]]:flex-1`, which only
          resolves while every box between the column's definite height and the
          frame is a growing flex child too; the clip inside the root is handed
          `flex flex-col` through className, so the chain runs unbroken from the
          shell root to the frame. It is dropped while the panel is shut: a
          grown flex child with nothing in it would hold open the whole height
          the column gave it.

          Dropping it costs one frame on a stretched panel. The height stops
          being definite the moment the panel shuts, so the fold starts from the
          frame's own height rather than the stretched one: measured in Chrome
          at 1440px, a 511px desk panel steps to 232px and folds smoothly from
          there. Nothing sees it today, because LeverageDesktopLayout takes the
          whole chart region out of the tree when the chart is closed, and every
          other consumer gives the frame a real pixel height that does not move.
          Holding the height would mean holding the hole. */}
      <div
        // Scanner rule again: space before the interpolation.
        className={`flex min-h-0 flex-col [&>*]:min-h-0 ${open ? "flex-1 [&>*]:flex-1" : ""}`}
      >
        <Disclosure open={open} id={PANEL_ID} className="flex flex-col gap-3">
          {hasTimeframes && (
            <div
              data-region="chart-panel-timeframes"
              role="group"
              aria-label={timeframeLabel}
              // Scanner rule again: space before the interpolation.
              className={`ws-inset flex shrink-0 items-center gap-1 self-start p-1 ${panelLead}`}
            >
              {timeframes?.map((option) => {
                const selected = option.value === timeframe;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onTimeframeChange?.(option.value)}
                    className={`ws-pressable cursor-pointer rounded-xl px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                      selected
                        ? "bg-surface-strong text-white"
                        : "text-white/50 hover:text-white/80"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          )}

          <div
            data-region="chart-panel-frame"
            style={{ height }}
            // The 1px top highlight is the hairline colour used as an inset
            // shadow. Tailwind cannot read a colour token from inside a shadow,
            // so the value is spelled out.
            //
            // max-md: strips the border, the radius and that inset shadow on
            // the phone ticket, where the chart is meant to run edge to edge.
            // There is exactly one render call site for this shell (the
            // leverage desk and the phone ticket share it through the same
            // component tree), so a bare CSS variant is safe: the base classes
            // above are untouched, and md: and up render byte-identical to
            // before.
            //
            // Scanner rule again: space before the interpolation.
            className={`bg-surface border-hairline rounded-card w-full overflow-hidden border shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] max-md:rounded-none max-md:border-0 max-md:shadow-none ${
              hasTimeframes ? "" : panelLead
            }`}
          >
            {/* The chart stays gated on the open state even though the frame
                around it does not. The leverage screen's chart is a TradingView
                iframe: wrapped rather than gated, every collapsed ticket on the
                platform would keep one mounted and loading forever. The frame
                is the box that animates, and it carries a real height of its
                own, so the fold still has something to play on. The cost is
                that the body goes at the moment the collapse starts and the
                panel folds on an empty frame. */}
            {!open ? null : effective === "loading" ? (
              <div role="status" aria-live="polite" className="size-full p-3">
                <span className="sr-only">{labels.loading}</span>
                <div
                  data-region="chart-panel-skeleton"
                  aria-hidden="true"
                  className="size-full animate-pulse rounded-[14px] bg-white/6"
                />
              </div>
            ) : effective === "error" ? (
              <div className="grid size-full place-items-center px-5 text-center">
                <div className="max-w-[42ch]">
                  <div className="text-[13.5px] font-normal text-white/55">{labels.error}</div>
                  {onRetry && labels.retry && (
                    <button
                      type="button"
                      onClick={onRetry}
                      className="ws-pressable mt-3 cursor-pointer rounded-full border border-white/15 px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:border-white/35"
                    >
                      {labels.retry}
                    </button>
                  )}
                </div>
              </div>
            ) : effective === "empty" ? (
              <div className="grid size-full place-items-center px-5 text-center text-[13.5px] font-normal text-white/45">
                {labels.empty}
              </div>
            ) : (
              children
            )}
          </div>
        </Disclosure>
      </div>
    </div>
  );
}
