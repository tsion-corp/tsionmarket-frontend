import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PerpLedgerTabs } from "@/features/trade/components/perp-ledger-tabs";

const TABS = [
  { id: "orders", label: "Orders", panel: <p>resting orders</p> },
  { id: "positions", label: "Positions", panel: <p>open positions</p> },
  { id: "history", label: "History", panel: <p>closed positions</p> },
];

function renderTabs(props: Partial<Parameters<typeof PerpLedgerTabs>[0]> = {}) {
  return render(<PerpLedgerTabs label="Trade ledger" tabs={TABS} {...props} />);
}

function tab(name: string): HTMLElement {
  return screen.getByRole("tab", { name });
}

describe("PerpLedgerTabs", () => {
  it("is a real tablist, with one tab per entry and the first selected", () => {
    renderTabs();

    const strip = screen.getByRole("tablist", { name: "Trade ledger" });
    const tabs = within(strip).getAllByRole("tab");
    expect(tabs.map((node) => node.textContent)).toEqual(["Orders", "Positions", "History"]);
    expect(tab("Orders")).toHaveAttribute("aria-selected", "true");
    expect(tab("Positions")).toHaveAttribute("aria-selected", "false");
    expect(tab("History")).toHaveAttribute("aria-selected", "false");
  });

  it("opens on the tab it is told to", () => {
    renderTabs({ defaultTabId: "positions" });

    expect(tab("Positions")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("open positions")).toBeInTheDocument();
  });

  // One panel at a time. The strip is the phone's whole ledger, so a hidden
  // second panel would be a second copy of a positions list, complete with its
  // own modals, sitting behind the visible one.
  it("shows only the selected tab's panel", () => {
    renderTabs();

    expect(screen.getByText("resting orders")).toBeInTheDocument();
    expect(screen.queryByText("open positions")).not.toBeInTheDocument();
    expect(screen.queryByText("closed positions")).not.toBeInTheDocument();
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  });

  it("swaps the panel when a tab is clicked", () => {
    renderTabs();

    fireEvent.click(tab("Positions"));

    expect(tab("Positions")).toHaveAttribute("aria-selected", "true");
    expect(tab("Orders")).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("open positions")).toBeInTheDocument();
    expect(screen.queryByText("resting orders")).not.toBeInTheDocument();
  });

  it("ties every tab to the panel it opens, both ways", () => {
    renderTabs();

    const panel = screen.getByRole("tabpanel");
    expect(tab("Orders")).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", tab("Orders").id);
  });

  // A roving tabindex: one Tab press reaches the strip, then the arrows move
  // inside it. Without this a keyboard user tabs past every tab to reach the
  // ledger under them.
  it("keeps exactly one tab in the tab order", () => {
    renderTabs();

    expect(tab("Orders")).toHaveAttribute("tabindex", "0");
    expect(tab("Positions")).toHaveAttribute("tabindex", "-1");
    expect(tab("History")).toHaveAttribute("tabindex", "-1");

    fireEvent.click(tab("History"));

    expect(tab("Orders")).toHaveAttribute("tabindex", "-1");
    expect(tab("History")).toHaveAttribute("tabindex", "0");
  });

  it("steps across the strip with the arrow keys, wrapping at both ends", () => {
    renderTabs();

    fireEvent.keyDown(tab("Orders"), { key: "ArrowRight" });
    expect(tab("Positions")).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(tab("Positions"));

    fireEvent.keyDown(tab("Positions"), { key: "ArrowRight" });
    fireEvent.keyDown(tab("History"), { key: "ArrowRight" });
    expect(tab("Orders")).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(tab("Orders"), { key: "ArrowLeft" });
    expect(tab("History")).toHaveAttribute("aria-selected", "true");
  });

  it("jumps to the ends with Home and End", () => {
    renderTabs({ defaultTabId: "positions" });

    fireEvent.keyDown(tab("Positions"), { key: "End" });
    expect(tab("History")).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(tab("History"), { key: "Home" });
    expect(tab("Orders")).toHaveAttribute("aria-selected", "true");
  });

  it("leaves keys it does not handle to the browser", () => {
    renderTabs();

    fireEvent.keyDown(tab("Orders"), { key: "Tab" });

    expect(tab("Orders")).toHaveAttribute("aria-selected", "true");
  });

  // The comp draws a 38px tab. That is under the 44px a thumb needs, and this
  // strip is the phone's only way between the two ledgers, so the hit area is
  // raised to 44 and the 3px rule stays where the comp puts it. jsdom has no
  // layout, so the geometry is asserted on the classes that produce it.
  it("gives every tab a 44px tap target", () => {
    renderTabs();

    for (const node of screen.getAllByRole("tab")) {
      expect(node.className).toContain("h-11");
      expect(node.className).toContain("min-w-11");
    }
  });

  it("renders nothing at all when it is handed no tabs", () => {
    const { container } = render(<PerpLedgerTabs label="Trade ledger" tabs={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  // A defaultTabId that names nothing must not leave the strip with no
  // selection: the first tab is the fallback, the same one an omitted default
  // gets.
  it("falls back to the first tab when the default names no tab", () => {
    renderTabs({ defaultTabId: "nope" });

    expect(tab("Orders")).toHaveAttribute("aria-selected", "true");
  });
});
