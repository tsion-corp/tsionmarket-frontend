import { describe, expect, it, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";

import {
  ActivityPanel,
  type ActivityPanelProps,
  type ActivityRow,
} from "@/features/casino/components/last-standing/activity-panel";

const TABS = [
  { id: "activity", label: "Activity" },
  { id: "rules", label: "Game rules" },
  { id: "past", label: "Past rounds" },
];

const COLUMNS = { player: "Player", action: "Action", amount: "Amount", time: "Time" };

const ROWS: ActivityRow[] = [
  {
    id: "r1",
    address: "0x36g3gt1111111111111111111111111111993",
    addressLabel: "0x36g3gt…993",
    avatarUrl: null,
    action: "Won the round",
    amount: "$0.8",
    time: "Just now",
    isYou: false,
  },
  {
    id: "r2",
    address: "0x58g1fz2222222222222222222222222222104",
    addressLabel: "0x58g1fz…104",
    avatarUrl: "https://cdn.example/pfp.png",
    action: "Played",
    amount: "$2",
    time: "1 min ago",
    isYou: true,
  },
];

function renderPanel(overrides: Partial<ActivityPanelProps> = {}) {
  const onTabChange = vi.fn();
  const props: ActivityPanelProps = {
    tabs: TABS,
    activeTab: "activity",
    onTabChange,
    columns: COLUMNS,
    rows: ROWS,
    emptyLabel: "No activity yet",
    ...overrides,
  };
  const utils = render(<ActivityPanel {...props} />);
  return { ...utils, onTabChange };
}

describe("ActivityPanel tabs", () => {
  it("renders every tab as a button inside a tablist", () => {
    renderPanel();

    const tablist = screen.getByRole("tablist");
    const tabs = within(tablist).getAllByRole("tab");

    expect(tabs).toHaveLength(3);
    expect(tabs.map((t) => t.textContent)).toEqual(["Activity", "Game rules", "Past rounds"]);
    tabs.forEach((tab) => expect(tab.tagName).toBe("BUTTON"));
  });

  it("marks only the active tab with aria-selected, so colour is not the only signal", () => {
    renderPanel({ activeTab: "rules" });

    expect(screen.getByRole("tab", { name: "Activity" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "Game rules" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tab", { name: "Past rounds" })).toHaveAttribute(
      "aria-selected",
      "false"
    );
  });

  it("reports the selected tab by click", () => {
    const { onTabChange } = renderPanel();

    fireEvent.click(screen.getByRole("tab", { name: "Past rounds" }));

    expect(onTabChange).toHaveBeenCalledTimes(1);
    expect(onTabChange).toHaveBeenCalledWith("past");
  });

  it("does not report a change when the active tab is clicked again", () => {
    const { onTabChange } = renderPanel();

    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));

    expect(onTabChange).not.toHaveBeenCalled();
  });

  it("moves to the next tab on ArrowRight and wraps at the end", () => {
    const { onTabChange, rerender } = renderPanel();

    fireEvent.keyDown(screen.getByRole("tab", { name: "Activity" }), { key: "ArrowRight" });
    expect(onTabChange).toHaveBeenLastCalledWith("rules");

    rerender(
      <ActivityPanel
        tabs={TABS}
        activeTab="past"
        onTabChange={onTabChange}
        columns={COLUMNS}
        rows={ROWS}
        emptyLabel="No activity yet"
      />
    );

    fireEvent.keyDown(screen.getByRole("tab", { name: "Past rounds" }), { key: "ArrowRight" });
    expect(onTabChange).toHaveBeenLastCalledWith("activity");
  });

  it("moves to the previous tab on ArrowLeft and wraps at the start", () => {
    const { onTabChange } = renderPanel();

    fireEvent.keyDown(screen.getByRole("tab", { name: "Activity" }), { key: "ArrowLeft" });

    expect(onTabChange).toHaveBeenLastCalledWith("past");
  });

  it("jumps to the first and last tab on Home and End", () => {
    const { onTabChange } = renderPanel({ activeTab: "rules" });
    const active = screen.getByRole("tab", { name: "Game rules" });

    fireEvent.keyDown(active, { key: "End" });
    expect(onTabChange).toHaveBeenLastCalledWith("past");

    fireEvent.keyDown(active, { key: "Home" });
    expect(onTabChange).toHaveBeenLastCalledWith("activity");
  });

  it("moves focus with the arrow key, and keeps only the active tab in the tab order", () => {
    renderPanel();

    const activity = screen.getByRole("tab", { name: "Activity" });
    const rules = screen.getByRole("tab", { name: "Game rules" });

    expect(activity).toHaveAttribute("tabindex", "0");
    expect(rules).toHaveAttribute("tabindex", "-1");

    fireEvent.keyDown(activity, { key: "ArrowRight" });

    expect(document.activeElement).toBe(rules);
  });

  it("leaves other keys alone", () => {
    const { onTabChange } = renderPanel();

    fireEvent.keyDown(screen.getByRole("tab", { name: "Activity" }), { key: "ArrowDown" });

    expect(onTabChange).not.toHaveBeenCalled();
  });

  // 844:79509 / 844:79518 / 844:79521.
  it("draws the design's tab boxes, underline and track", () => {
    renderPanel();

    const tablist = screen.getByRole("tablist");
    expect(tablist.className).toContain("gap-9");

    const activity = screen.getByRole("tab", { name: "Activity" });
    const rules = screen.getByRole("tab", { name: "Game rules" });
    expect(activity.className).toContain("min-w-[101px]");
    expect(activity.className).toContain("justify-center");
    expect(activity.className).toContain("text-[#ffe178]");
    expect(rules.className).not.toContain("text-[#ffe178]");

    const underline = screen.getByTestId("activity-tab-underline");
    expect(activity).toContainElement(underline);
    expect(underline.className).toContain("bg-[#ffe178]");
    expect(underline.className).toContain("h-[3px]");
    expect(underline.className).toContain("rounded-[50px]");
    expect(underline.className).toContain("inset-x-0");
    expect(screen.getAllByTestId("activity-tab-underline")).toHaveLength(1);

    const track = screen.getByTestId("activity-tab-track");
    expect(track.className).toContain("h-[3px]");
    expect(track.className).toContain("bg-white/5");
    expect(track.className).toContain("rounded-[2.4px]");
    expect(track.className).toContain("inset-x-0");
  });

  it("sits on a solid surface with no border, 36px above the table", () => {
    const { container } = renderPanel();

    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("bg-[#121314]");
    expect(card.className).toContain("rounded-[15px]");
    expect(card.className).not.toContain("ws-card");
    expect(card.className).not.toMatch(/\bborder\b/u);
    expect(screen.getByRole("tabpanel").className).toContain("pt-9");
  });

  it("points the tabpanel at the tab that labels it", () => {
    renderPanel();

    const panel = screen.getByRole("tabpanel");
    const activity = screen.getByRole("tab", { name: "Activity" });

    expect(activity).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", activity.id);
  });
});

describe("ActivityPanel table", () => {
  it("renders a real table with scoped column headers", () => {
    renderPanel();

    const table = screen.getByRole("table");
    const headers = within(table).getAllByRole("columnheader");

    expect(headers.map((h) => h.textContent)).toEqual(["Player", "Action", "Amount", "Time"]);
    headers.forEach((h) => expect(h).toHaveAttribute("scope", "col"));
  });

  it("renders a row's four cells", () => {
    renderPanel();

    const row = screen.getByRole("row", { name: /0x36g3gt…993/u });
    const cells = within(row).getAllByRole("cell");

    expect(cells).toHaveLength(4);
    expect(cells[0]).toHaveTextContent("0x36g3gt…993");
    expect(cells[1]).toHaveTextContent("Won the round");
    expect(cells[2]).toHaveTextContent("$0.8");
    expect(cells[3]).toHaveTextContent("Just now");
  });

  it("renders one row per entry, and no row is interactive", () => {
    renderPanel();

    const table = screen.getByRole("table");
    // The header row plus one row per entry.
    expect(within(table).getAllByRole("row")).toHaveLength(ROWS.length + 1);
    expect(within(table).queryByRole("button")).toBeNull();
    expect(within(table).queryByRole("link")).toBeNull();
  });

  it("marks the viewer's own row", () => {
    renderPanel();

    const mine = screen.getByRole("row", { name: /0x58g1fz…104/u });
    const theirs = screen.getByRole("row", { name: /0x36g3gt…993/u });

    expect(mine).toHaveAttribute("data-you", "true");
    expect(theirs).not.toHaveAttribute("data-you");
  });

  // The design draws the viewer's row like any other: no fill, and the
  // address in the same muted ink.
  it("does not highlight the viewer's own row", () => {
    renderPanel();

    const mine = screen.getByRole("row", { name: /0x58g1fz…104/u });
    const theirs = screen.getByRole("row", { name: /0x36g3gt…993/u });

    expect(mine.className).not.toContain("bg-surface");
    expect(mine.className).toBe(theirs.className);
    expect(within(mine).getByText("0x58g1fz…104").className).toContain("text-[#f4f4f4]/40");
    expect(within(mine).getByText("0x58g1fz…104").className).not.toContain("text-white");
  });

  it("rules each row in 8% white and mutes the headers", () => {
    renderPanel();

    const row = screen.getByRole("row", { name: /0x36g3gt…993/u });
    expect(row.className).toContain("border-white/8");
    screen
      .getAllByRole("columnheader")
      .forEach((h) => expect(h.className).toContain("text-[#f4f4f4]/40"));
  });

  // 929:1056: the row dividers run the full width of the card while the
  // columns keep the drawn 174px pitch inside it. Shrinking the table to its
  // columns stopped every rule 672px in, which reads as dead space.
  //
  // These assertions read classes rather than measuring: the widths come from
  // @container queries, and jsdom computes no layout at all, so a width
  // expectation here would pass or fail for reasons unrelated to the design.
  it("spans its container at every width, so every rule reaches both edges", () => {
    renderPanel();

    const table = screen.getByRole("table");
    expect(table.className).toContain("w-full");
    // Nothing may shrink the table back to its columns at a wide container.
    expect(table.className).not.toMatch(/@\[\d+px\]:w-(?:auto|fit|min|max)\b/u);

    // Both rules are drawn by the rows: the first body row's top border is
    // also the rule under the header, so a full-width table is what carries
    // either of them to the card's edges.
    const first = screen.getByRole("row", { name: /0x36g3gt…993/u });
    const second = screen.getByRole("row", { name: /0x58g1fz…104/u });
    [first, second].forEach((row) => {
      expect(row.className).toContain("border-t");
      expect(row.className).toContain("border-white/8");
    });
  });

  // This guard used to assert the OPPOSITE — that nothing evened the columns
  // out — because 929:1056 draws 150px columns on a 174px pitch and an even
  // share was the shape a tidy-up would drift into. The maintainer then asked
  // for exactly that, twice, having seen the drawn rhythm leave every value
  // clustered left with a large empty cell after Time. So the guard is
  // inverted rather than deleted: the even share is now the decision, and this
  // test is what stops someone restoring the drawn pitch and calling it a fix.
  it("shares the width evenly from a wide panel up, and stays fluid below", () => {
    renderPanel();

    const headers = screen.getAllByRole("columnheader");

    expect(headers.map((h) => h.className.includes("@[672px]:w-1/4"))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    // Nothing is pinned to the drawn 174px pitch any more.
    headers.forEach((h) => expect(h.className).not.toMatch(/@\[672px\]:w-\[(?:174|150)px\]/u));
    headers.slice(0, 3).forEach((h) => expect(h.className).toContain("pr-6"));

    // Below 672px the columns share the width fluidly over a 480px floor:
    // Player carries a truncated address and needs the larger share there.
    expect(headers.map((h) => h.className.match(/(?<!:)w-\[\d+%\]/u)?.[0])).toEqual([
      "w-[38%]",
      "w-[26%]",
      "w-[18%]",
      "w-[18%]",
    ]);
    expect(screen.getByRole("table").className).toContain("min-w-[480px]");
  });

  it("keeps the table scrollable inside the card rather than widening the page", () => {
    const { container } = renderPanel();

    const table = screen.getByRole("table");
    const scroller = table.parentElement as HTMLElement;

    expect(scroller.className).toContain("overflow-x-auto");
    expect((container.firstElementChild as HTMLElement).className).toContain("w-full");
  });
});

describe("ActivityPanel states", () => {
  it("shows skeleton rows of the row height while loading, and no data rows", () => {
    renderPanel({ isLoading: true });

    const skeletons = screen.getAllByTestId("activity-skeleton-row");

    expect(skeletons.length).toBeGreaterThan(0);
    expect(screen.queryByText("Won the round")).toBeNull();
    // Column headers stay put, so the table does not jump when rows arrive.
    expect(screen.getAllByRole("columnheader")).toHaveLength(4);
    skeletons.forEach((row) => expect(row.className).toContain("h-[54px]"));
  });

  it("shows the empty label when there is nothing to list", () => {
    renderPanel({ rows: [] });

    expect(screen.getByText("No activity yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("prefers loading over empty, so an empty first paint does not read as no activity", () => {
    renderPanel({ rows: [], isLoading: true });

    expect(screen.queryByText("No activity yet")).toBeNull();
    expect(screen.getAllByTestId("activity-skeleton-row").length).toBeGreaterThan(0);
  });

  it("renders children instead of the table for a non-activity tab", () => {
    renderPanel({
      activeTab: "rules",
      children: <p>Last one standing wins the pot.</p>,
    });

    expect(screen.getByText("Last one standing wins the pot.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Won the round")).toBeNull();
  });

  it("puts the children inside the tabpanel", () => {
    renderPanel({ activeTab: "past", children: <p>Nothing settled yet.</p> });

    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Nothing settled yet.")).toBeInTheDocument();
  });

  it("does not consult rows or loading when children are given", () => {
    renderPanel({ activeTab: "rules", isLoading: true, children: <p>House rules.</p> });

    expect(screen.getByText("House rules.")).toBeInTheDocument();
    expect(screen.queryByTestId("activity-skeleton-row")).toBeNull();
  });
});

// The old feed linked every row to the play on chain, and the table that
// replaced it has to keep that door open. The link wraps the player cell
// alone: a row-wide anchor would swallow the whole row.
describe("ActivityPanel row links", () => {
  it("links the player cell to the play on chain when given one", () => {
    renderPanel({
      rows: [{ ...ROWS[0], href: "https://basescan.org/tx/0xabc" }],
    });

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://basescan.org/tx/0xabc");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(link).getByText("0x36g3gt…993")).toBeInTheDocument();
  });

  it("draws a plain cell for a row that carries no transaction", () => {
    renderPanel({ rows: [ROWS[0]] });

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("0x36g3gt…993")).toBeInTheDocument();
  });
});
