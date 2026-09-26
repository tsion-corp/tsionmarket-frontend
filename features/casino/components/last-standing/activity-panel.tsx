"use client";

import { useId, useRef, type JSX, type KeyboardEvent, type ReactNode } from "react";

import { PlayerAvatar } from "@/features/casino/components/last-standing/player-avatar";

export interface ActivityRow {
  id: string;
  /** The full wallet address. Seeds the avatar; never rendered, never logged. */
  address: string;
  /** The truncated form the design shows, e.g. "0x36g3gt…993". */
  addressLabel: string;
  avatarUrl: string | null;
  /** Already-localised, e.g. "Won the round". */
  action: string;
  /** Already formatted for display, e.g. "$0.8". */
  amount: string;
  /** Already-localised relative time, e.g. "Just now". */
  time: string;
  isYou: boolean;
  /** Where this play can be read on chain. Optional: a row built from a socket
   *  frame may not carry a transaction hash yet, and the table still stands
   *  without the link. */
  href?: string;
}

export interface ActivityTab {
  id: string;
  label: string;
}

export interface ActivityPanelProps {
  tabs: ActivityTab[];
  activeTab: string;
  onTabChange(id: string): void;
  columns: { player: string; action: string; amount: string; time: string };
  rows: ActivityRow[];
  emptyLabel: string;
  isLoading?: boolean;
  /** Rendered instead of the table for non-activity tabs. */
  children?: ReactNode;
}

// The row height the design draws, shared by a data row and a skeleton row so
// the table does not jump by a pixel when the real rows arrive.
const ROW_HEIGHT = "h-[54px]";
const SKELETON_ROWS = 5;
// 844:79529: each row's top rule, 8% white.
const ROW_RULE = "border-t border-white/8";

// Cell rhythm (844:79523 / 844:79529): four fixed 150px columns with a 24px
// gap. The gap is each cell's right padding, so a cell but the last is 174px
// wide (border-box). The fixed widths apply once the panel's content box can
// hold them (672px); below that the columns share the width fluidly and the
// table scrolls inside the card, so a phone never overflows.
//
// FOUR EQUAL COLUMNS FROM 672px UP, AND THAT IS A DEPARTURE FROM THE DRAWN
// RHYTHM, ASKED FOR DELIBERATELY.
//
// 929:1056 draws 150px columns on a 174px pitch — 672px of columns however
// wide the card is. Pinning those three and letting the fourth absorb the
// remainder makes the rules span the card but clusters every value on the
// left with a large empty cell after Time, which is what the maintainer saw
// twice and asked to stop: "each column to take equal width to fill the whole
// width of that table". So the width is shared out evenly instead.
//
// Below 672px the columns stay fluid on their own percentages over a 480px
// floor: Player carries a truncated address and needs the extra share there,
// and the table scrolls inside the card rather than widening the page.
const CELL = "px-0 py-0 pr-6 last:pr-0 align-middle";
const COL = [
  "w-[38%] @[672px]:w-1/4",
  "w-[26%] @[672px]:w-1/4",
  "w-[18%] @[672px]:w-1/4",
  "w-[18%] @[672px]:w-1/4",
] as const;
// 844:79524: header and address ink.
const MUTED_INK = "text-[#f4f4f4]/40";

function SkeletonRow({ width }: { width: string }): JSX.Element {
  return <div className={`bg-surface-strong h-[10px] animate-pulse rounded-full ${width}`} />;
}

// The activity panel at the foot of the Last Man Standing screen: a tab row
// over a table of what just happened in the round. Presentational only —
// every string, including the empty line and the column headings, arrives as a
// prop, and the tab state is the caller's.
export function ActivityPanel({
  tabs,
  activeTab,
  onTabChange,
  columns,
  rows,
  emptyLabel,
  isLoading = false,
  children,
}: ActivityPanelProps): JSX.Element {
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const tabId = (id: string) => `${baseId}-tab-${id}`;
  // Keyed by tab id rather than index, so a tab list that changes between
  // renders cannot move focus onto the wrong button.
  const buttons = useRef(new Map<string, HTMLButtonElement | null>());

  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === activeTab)
  );

  // Arrow keys move the selection, as the tabs pattern expects; Home and End
  // jump to the ends. Selection follows focus, which suits a panel whose
  // contents are already in hand.
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (tabs.length === 0) return;

    let next: number;
    if (event.key === "ArrowRight") next = (activeIndex + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (activeIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;

    event.preventDefault();
    const target = tabs[next];
    // Focus moves here rather than in an effect: the panel is controlled, so
    // the caller may re-render at its own pace, and focus must not wait.
    buttons.current.get(target.id)?.focus();
    if (target.id !== activeTab) onTabChange(target.id);
  }

  return (
    // 844:79506: a solid #121314 surface, no border, radius 15, padding 24
    // across and 16 down (16 across on a phone, for the gutter).
    <section className="w-full max-w-full rounded-[15px] bg-[#121314] px-4 py-4 sm:px-6">
      {/* The tab row (844:79509) over its track (844:79518): a full-width 3px
          bar of 5% white, radius 2.4. The track sits in the list's bottom
          padding so the scroller never clips it or the underline on it. */}
      <div className="relative">
        <span
          aria-hidden
          data-testid="activity-tab-track"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] rounded-[2.4px] bg-white/5"
        />
        <div
          role="tablist"
          aria-orientation="horizontal"
          className="relative flex [scrollbar-width:none] gap-9 overflow-x-auto pb-[3px] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((tab) => {
            const selected = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={tabId(tab.id)}
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                ref={(node) => {
                  buttons.current.set(tab.id, node);
                }}
                onClick={() => {
                  if (!selected) onTabChange(tab.id);
                }}
                onKeyDown={onKeyDown}
                // A 101px-wide, 38px-tall centred box per tab (844:79510..15);
                // min-width, so a longer translation grows the box rather than
                // spilling out of it.
                className={`focus-visible:ring-kash/70 ws-quick relative flex h-[38px] min-w-[101px] shrink-0 cursor-pointer items-center justify-center px-[10px] text-[14px] leading-4 whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-0 ${
                  selected ? "text-[#ffe178]" : "text-white/40 hover:text-white/70"
                }`}
              >
                {tab.label}
                {/* The active indicator (844:79521): #FFE178, 3px, radius 50,
                  the tab box's width, laid over the track. aria-selected above
                  carries the same fact, so the colour is never the only
                  signal. */}
                <span
                  aria-hidden
                  data-testid={selected ? "activity-tab-underline" : undefined}
                  className={`absolute inset-x-0 -bottom-[3px] h-[3px] rounded-[50px] ${
                    selected ? "bg-[#ffe178]" : "bg-transparent"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabs.length > 0 ? tabId(tabs[activeIndex].id) : undefined}
        tabIndex={0}
        // 844:79506 gap: 36px from the tabs to the table. The container is
        // what the columns measure against.
        className="@container pt-9 outline-none"
      >
        {children ?? (
          <ActivityTable
            columns={columns}
            rows={rows}
            emptyLabel={emptyLabel}
            isLoading={isLoading}
          />
        )}
      </div>
    </section>
  );
}

// The avatar and the address, as a link to the play on chain when the caller
// supplied one. The link wraps only this cell: a row-wide anchor would swallow
// the whole table row, and the amount beside it is the app's own figure rather
// than something the explorer would confirm.
function PlayerCell({ row }: { row: ActivityRow }): JSX.Element {
  const inner = (
    <>
      {/* Decorative: the address beside it is the label. */}
      <PlayerAvatar src={row.avatarUrl} seed={row.address} alt="" />
      {/* 844:79532: every address, the viewer's included, in the muted ink. */}
      <span className={`tnum truncate text-[14px] leading-4 ${MUTED_INK}`}>{row.addressLabel}</span>
    </>
  );

  if (row.href === undefined) return <span className="flex items-center gap-3">{inner}</span>;

  return (
    <a
      href={row.href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-md transition-opacity hover:opacity-80"
    >
      {inner}
    </a>
  );
}

function ActivityTable({
  columns,
  rows,
  emptyLabel,
  isLoading,
}: Pick<ActivityPanelProps, "columns" | "rows" | "emptyLabel"> & {
  isLoading: boolean;
}): JSX.Element {
  // Loading wins over empty: a first paint with nothing in hand is not the
  // same statement as "nobody has played", and reading it as one is a lie.
  if (!isLoading && rows.length === 0) {
    return (
      <p className={`flex items-center justify-center text-[14px] text-white/40 ${ROW_HEIGHT}`}>
        {emptyLabel}
      </p>
    );
  }

  return (
    // The card scrolls its own table on a narrow screen; the page never does.
    <div className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
      {/* Full width at every container size, so each row's rule — and the one
          under the header, which is the first row's — runs the whole card
          rather than stopping where the columns end. The layout stays auto on
          purpose: a long translation widens its column instead of spilling out
          of a fixed one, and the surplus width lands in the trailing column,
          which carries no drawn width. */}
      <table className="ws-quick w-full min-w-[480px] border-collapse text-left">
        <thead>
          <tr>
            <th scope="col" className={`${CELL} ${COL[0]} pb-3 text-[14px] leading-4 ${MUTED_INK}`}>
              {columns.player}
            </th>
            <th scope="col" className={`${CELL} ${COL[1]} pb-3 text-[14px] leading-4 ${MUTED_INK}`}>
              {columns.action}
            </th>
            <th scope="col" className={`${CELL} ${COL[2]} pb-3 text-[14px] leading-4 ${MUTED_INK}`}>
              {columns.amount}
            </th>
            <th scope="col" className={`${CELL} ${COL[3]} pb-3 text-[14px] leading-4 ${MUTED_INK}`}>
              {columns.time}
            </th>
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <tr
                  key={`skeleton-${i}`}
                  data-testid="activity-skeleton-row"
                  className={`${ROW_RULE} ${ROW_HEIGHT}`}
                >
                  <td className={CELL}>
                    <span className="flex items-center gap-3">
                      <span className="bg-surface-strong size-[28px] shrink-0 animate-pulse rounded-full" />
                      <SkeletonRow width="w-24" />
                    </span>
                  </td>
                  <td className={CELL}>
                    <SkeletonRow width="w-28" />
                  </td>
                  <td className={CELL}>
                    <SkeletonRow width="w-12" />
                  </td>
                  <td className={CELL}>
                    <SkeletonRow width="w-16" />
                  </td>
                </tr>
              ))
            : rows.map((row) => (
                <tr
                  key={row.id}
                  data-you={row.isYou ? "true" : undefined}
                  // No highlight on the viewer's own row: the design draws
                  // every row alike. data-you stays for callers and tests.
                  className={`${ROW_RULE} ${ROW_HEIGHT}`}
                >
                  <td className={CELL}>
                    <PlayerCell row={row} />
                  </td>
                  <td className={`${CELL} text-[14px] text-white`}>{row.action}</td>
                  <td className={`${CELL} tnum text-[14px] text-white`}>{row.amount}</td>
                  {/* The time stays left-aligned in the wider trailing cell:
                      the design sets it at x=522 under its heading, and
                      pushing it to the card's right edge would part it from
                      the heading it belongs to. The slack sits to its right. */}
                  <td className={`${CELL} text-[14px] whitespace-nowrap text-white`}>{row.time}</td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
