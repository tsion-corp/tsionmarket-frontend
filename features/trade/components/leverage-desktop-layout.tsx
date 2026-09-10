import type { ReactNode } from "react";

interface LeverageDesktopLayoutProps {
  /** Market search field, sitting on its own rail above both columns. */
  search?: ReactNode;
  /** Market identity at the top of the left panel: the picker, or the design's market table. */
  marketList?: ReactNode;
  /** Stands in for the market list while it loads, errors, or comes back empty. */
  marketListFallback?: ReactNode;
  /** Ticket header, leading side: the market select trigger and its 24h change. */
  ticketHeader?: ReactNode;
  /** Ticket header, trailing side: the simple/pro interface switch. */
  modeSwitch?: ReactNode;
  /** The show/hide control, inside the left panel between the market identity
   *  and the chart. The shell does not own its state. */
  chartToggle?: ReactNode;
  /** The chart panel, which brings its own chrome. It fills the left panel's
   *  leftover height under the market identity, and is rendered only while
   *  `chartOpen` is true. */
  chart?: ReactNode;
  /** Order entry: price, quantity and leverage. Owns its own internal spacing. */
  orderEntry?: ReactNode;
  /** The derived order summary card: order value, entry, liquidation, fees. */
  orderSummary?: ReactNode;
  /** Buy/Sell actions, pinned to the foot of the ticket column. */
  directionActions?: ReactNode;
  /** Stands in for the order entry while it loads, errors, or is unavailable. */
  ticketFallback?: ReactNode;
  /** Full-width region under both columns: open positions and resting orders. */
  ledger?: ReactNode;
  /** Whether the chart region is expanded. Defaults to open. */
  chartOpen?: boolean;
  className?: string;
  /** Escape hatch for the left panel, e.g. a different height. */
  marketListClassName?: string;
  /** Escape hatch for the right panel, e.g. a different height. */
  ticketClassName?: string;
}

// A slot counts as filled only when it is real content. `null`, `undefined`,
// `false` and `""` are all what a caller writes for "not this time"
// (`{loading && <Panel />}`, `{error ?? ""}`), and each must collapse the
// whole region rather than leave an empty bordered box behind.
function filled(slot: ReactNode): boolean {
  return slot !== null && slot !== undefined && slot !== false && slot !== "";
}

// Pins the left column to the ticket's height so the two columns end level.
// Only applied while the market list is present and the chart is open, because
// that is the only arrangement with something in the column that wants to grow.
// Applied any wider than that, this height is the bug it was reported as: a
// market card at the top of the panel and several hundred pixels of black under
// it.
//
// It is a definite height, `h-`, and it must stay one. It was `min-h-[924px]`
// and that is what cut the chart off. Everything between this column and the
// chart frame takes its height from `flex-1`, and CSS only treats a flexed
// height as definite when the container it flexed inside had a definite height
// itself. Under a `min-h-` column the whole chain stays indefinite, so the
// TradingView iframe, which is drawn at `height: 100%`, cannot resolve its
// percentage and falls back to an iframe's default 150px: the toolbar, a sliver
// of candles, the date row, then black to the bottom of a panel that is itself
// the right size. Measured in headless Chrome at 1440px wide, with the market
// card at 116px: the frame is 721px either way, and the iframe inside it goes
// from 150px under `min-h-[924px]` to 719px under `h-[924px]`.
const MARKET_COLUMN_HEIGHT = "min-[1080px]:h-[924px]";

// Makes the chart panel fill the height the left panel leaves it, rather than
// the flat 220px ChartPanelShell draws by default.
//
// The height cannot be passed as a prop from here: the chart arrives as an
// already-built node in the `chart` slot, so the shell's `height` prop belongs
// to the route, not to this file. What this shell can do is hand the chart the
// space, and the three rules below turn the shell's fixed frame into a flex
// child that takes it:
//
//   [&>*]                            the ChartPanelShell root, stretched to the
//                                    region so its own column has real height
//   [data-region=chart-panel-frame]  the shell's bordered frame, whose inline
//                                    style={{ height }} only `!` can beat
//
// `min-h-[220px]` is CHART_PANEL_SHELL_HEIGHT from chart-panel-shell.tsx, kept
// as the frame's floor so the chart never collapses: with `h-auto` in place of
// the inline height, a panel that is not being stretched by the column would
// otherwise resolve the frame to nothing, and a TradingView iframe inside a
// zero-height box draws nothing at all.
//
// These rules replace the shell's real number with a flexed height, so they only
// work while the chain above them is definite: MARKET_COLUMN_HEIGHT's `h-`, then
// `flex-1` on the panel, on the chart block, on this region, on the shell root
// and on the frame, with nothing in between switching back to `min-h-` or
// `h-auto`. Break one link and the frame still looks right while the chart
// inside it drops to 150px. Read the note on MARKET_COLUMN_HEIGHT before
// touching any of them.
//
// Gated at min-[1080px] on purpose. Below the breakpoint the columns stack into
// an ordinary scrolling page, no column height applies, and the shell's own
// 220px is the right height.
const CHART_FILLS_PANEL = [
  "min-[1080px]:flex-1",
  "min-[1080px]:[&>*]:flex-1",
  "min-[1080px]:[&_[data-region=chart-panel-frame]]:h-auto!",
  "min-[1080px]:[&_[data-region=chart-panel-frame]]:min-h-[220px]",
  "min-[1080px]:[&_[data-region=chart-panel-frame]]:flex-1",
].join(" ");

// The desktop leverage-trading shell: a search rail, then a left panel holding
// the market identity with the chart filling the rest of it, beside a single
// order ticket that stacks entry, summary and the Buy/Sell actions. Geometry
// only. Every region is a slot the route fills with the panels that already
// exist, so nothing here fetches, polls, prices, sizes or submits anything, and
// the order-entry maths stays where it already lives.
//
// Column widths, panel radii and the 16/12px rhythm come from the "Leverage
// trading, opened charts" frame (Figma 173:42963). The chart sits in the left
// column rather than inside the ticket: a TradingView frame in a 470px ticket is
// nearly all toolbar, while the left column runs to roughly 950px at a 1440px
// viewport.
//
// The left column is ONE panel, not a stack of cards. The market identity sits
// at its top at its own height, and the chart takes everything under it inside
// the same bordered surface. The earlier version made these two separate
// bordered blocks and gave the market panel the growth, which put a small market
// card at the top of a tall empty panel and pushed the chart out below it as a
// second card. That empty area is exactly where the chart belongs.
//
// The split is minmax(560px,1fr) for the panel against a fixed 470px ticket. The
// design pins the list at 602px against a 1047px frame; 560px is taken as its
// floor instead, and it still absorbs any extra width, because this surface runs
// up to 1920px in the app and a fixed panel would leave a dead gutter.
//
// Two columns only from 1080px (560 + 16 gutter + 470 ticket needs 1046, the
// same slack the old 602/430 split had at 1048, so the breakpoint is unchanged).
// Below it everything stacks and scrolls as an ordinary page: this is the
// desktop design, and a 470px ticket next to a 560px panel has nowhere narrower
// to go.
export function LeverageDesktopLayout({
  search,
  marketList,
  marketListFallback,
  ticketHeader,
  modeSwitch,
  chartToggle,
  chart,
  orderEntry,
  orderSummary,
  directionActions,
  ticketFallback,
  ledger,
  chartOpen = true,
  className,
  marketListClassName,
  ticketClassName,
}: LeverageDesktopLayoutProps) {
  const listBody = filled(marketList)
    ? marketList
    : filled(marketListFallback)
      ? marketListFallback
      : null;
  const ticketBody = filled(orderEntry) ? orderEntry : null;
  const ticketStandIn = ticketBody === null && filled(ticketFallback) ? ticketFallback : null;

  const showChart = chartOpen && filled(chart);
  const hasChartBlock = filled(chartToggle) || showChart;
  const hasMarketColumn = listBody !== null || hasChartBlock;
  const hasTicket =
    ticketBody !== null ||
    ticketStandIn !== null ||
    filled(ticketHeader) ||
    filled(modeSwitch) ||
    filled(orderSummary) ||
    filled(directionActions);
  const hasTicketHead = filled(ticketHeader) || filled(modeSwitch);
  const hasTicketStack = ticketBody !== null || ticketStandIn !== null || filled(orderSummary);

  // The column height only makes sense while the chart is there to absorb it.
  // Closed, the panel hugs the market identity and the row that reopens the
  // chart, and the two columns end at different depths. That is the honest
  // result of the user asking for less, and it is the only alternative to the
  // void.
  const marketColumnHeight = listBody !== null && showChart ? MARKET_COLUMN_HEIGHT : "";

  // Clipping the panel's rounded corners is free while the chart holds it open,
  // and a full-bleed market table needs it. Closed, the panel is barely taller
  // than the market card, and clipping would cut the market picker's dropdown
  // off a few pixels under its own trigger.
  const marketPanelClip = showChart ? "overflow-hidden" : "overflow-visible";

  return (
    <div className={`flex w-full flex-col gap-4 ${className ?? ""}`}>
      {filled(search) && (
        <div data-region="search" className="w-full max-w-[394px]">
          {search}
        </div>
      )}

      {(hasMarketColumn || hasTicket) && (
        <div className="grid w-full grid-cols-1 items-start gap-4 min-[1080px]:grid-cols-[minmax(560px,1fr)_470px]">
          {hasMarketColumn && (
            <div
              data-region="market-column"
              // The space before the interpolation is load-bearing. Tailwind
              // extracts class names by scanning source text, so a class butted
              // straight against `${` is read as part of a longer token and the
              // rule is never emitted.
              className={`flex min-w-0 flex-col ${marketColumnHeight}`}
            >
              <section
                // Same scanner rule as above: keep the space before every
                // interpolation. Written without it, this panel's sizing
                // silently did not exist, the column shrank to its content,
                // and the market picker's dropdown was then clipped to
                // nothing by overflow-hidden.
                //
                // The one bordered surface in the left column. It takes the
                // column's height, and its children divide that height between
                // them: the market identity at its own size, the chart with the
                // rest.
                className={`bg-surface border-hairline rounded-card flex min-w-0 flex-col border min-[1080px]:flex-1 ${marketPanelClip} ${
                  marketListClassName ?? ""
                }`}
              >
                {listBody !== null && (
                  // Its own height, never the leftover. The market card is a
                  // fixed lump of identity; giving it the growth is what put
                  // the black area under it.
                  <div data-region="market-list" className="shrink-0">
                    {listBody}
                  </div>
                )}

                {hasChartBlock && (
                  // px/pb inset the chart from the panel's border by the same
                  // 12px the market card above it uses. No top padding when the
                  // card is there: the card's own bottom padding is the gap.
                  <div
                    // Scanner rule again: space before the interpolation.
                    className={`flex flex-col gap-3 px-3 pb-3 min-[1080px]:flex-1 ${
                      listBody === null ? "pt-3" : ""
                    }`}
                  >
                    {filled(chartToggle) && (
                      // The toggle stays directly above the chart rather than
                      // moving up beside the market identity. It carries
                      // aria-expanded and aria-controls for the panel under it,
                      // so control and target read as one thing; and with the
                      // chart closed it is the row that brings it back, which
                      // belongs where the chart was, not in a header.
                      <div data-region="chart-toggle" className="flex shrink-0 items-center gap-2">
                        {chartToggle}
                      </div>
                    )}

                    {/* No chrome: ChartPanelShell (chart-panel-shell.tsx)
                        paints the border, fill and radius itself, and
                        double-wrapping it was a real bug once. The classes
                        here are height only, handing the shell the space the
                        panel leaves. */}
                    {showChart && (
                      <div
                        data-region="chart"
                        // Scanner rule again: space before the interpolation.
                        className={`flex flex-col ${CHART_FILLS_PANEL}`}
                      >
                        {chart}
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}

          {hasTicket && (
            <section
              data-region="ticket"
              // Same scanner rule as the market column above: keep the space
              // before the interpolation or this height is never emitted.
              className={`bg-surface border-hairline flex min-w-0 flex-col justify-center overflow-hidden rounded-3xl border px-[11px] pt-3 pb-[11px] min-[1080px]:h-[924px] ${
                ticketClassName ?? ""
              }`}
            >
              <div className="flex w-full flex-col gap-2">
                <div className="flex flex-col gap-6">
                  {hasTicketHead && (
                    <div className="flex items-center justify-between gap-3">
                      {filled(ticketHeader) ? (
                        <div
                          data-region="ticket-header"
                          className="flex min-w-0 items-center gap-3"
                        >
                          {ticketHeader}
                        </div>
                      ) : (
                        <span />
                      )}
                      {filled(modeSwitch) && (
                        <div data-region="mode-switch" className="shrink-0">
                          {modeSwitch}
                        </div>
                      )}
                    </div>
                  )}

                  {hasTicketStack && (
                    <div className="flex flex-col gap-3">
                      {ticketBody !== null && <div data-region="order-entry">{ticketBody}</div>}
                      {ticketStandIn !== null && ticketStandIn}

                      {filled(orderSummary) && (
                        <div data-region="order-summary">{orderSummary}</div>
                      )}
                    </div>
                  )}
                </div>

                {filled(directionActions) && (
                  <div data-region="direction-actions" className="flex items-stretch gap-2">
                    {directionActions}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {filled(ledger) && <div data-region="ledger">{ledger}</div>}
    </div>
  );
}
