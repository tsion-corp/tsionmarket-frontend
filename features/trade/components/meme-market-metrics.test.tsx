import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import {
  MemeMarketMetrics,
  type MemeMarketMetricsData,
  type MemeMarketMetricsProps,
} from "@/features/trade/components/meme-market-metrics";

// The keys this component adds live in messages/*.json, which another change
// owns. Merging them here keeps the test honest about the copy it expects
// while leaving the catalogs to their owner.
const METRIC_MESSAGES = {
  metricsShow: "View Market Metrics",
  metricsHide: "Close Market Metrics",
  metricsRegion: "Market metrics",
  metricsLoading: "Loading market metrics",
  metricsError: "Market metrics couldn't be loaded.",
  metricsRetry: "Try again",
  metricsEmpty: "No market metrics for this coin yet.",
  metricUnavailable: "Unavailable",
  metricMarketCap: "Market Cap",
  metricVolume24h: "Volume (24h)",
  metricLiquidity: "Liquidity",
  metricAge: "Age",
  metricAgeDays: "{days, plural, one {# day} other {# days}}",
  metricActiveTraders: "Active Traders",
  metricBuyers: "Buyers",
  metricSellers: "Sellers",
};

const messages = { ...en, meme: { ...en.meme, ...METRIC_MESSAGES } };

const fullMetrics: MemeMarketMetricsData = {
  marketCap: { display: "$84.2M" },
  volume24h: { display: "$12.4M" },
  liquidity: { display: "$3.2M" },
  ageDays: 187,
  traders: { buyers: "1,245", sellers: "892", buyerSharePercent: 58.2 },
};

function renderPanel(props: Partial<MemeMarketMetricsProps> = {}) {
  const onToggle = props.onToggle ?? vi.fn();
  const view = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MemeMarketMetrics
        expanded
        onToggle={onToggle}
        status="ready"
        metrics={fullMetrics}
        {...props}
      />
    </NextIntlClientProvider>
  );
  return { ...view, onToggle };
}

// The stat item that carries this label, so a value assertion cannot pick up
// the matching figure from a neighbouring card.
function statFor(label: string): HTMLElement {
  const labelNode = screen.getByText(label);
  const item = labelNode.closest("[data-metric]");
  if (!(item instanceof HTMLElement)) throw new Error(`no stat item for ${label}`);
  return item;
}

describe("MemeMarketMetrics", () => {
  it("renders the design's four metrics, in order, with their units", () => {
    renderPanel();
    const labels = screen.getAllByTestId("meme-metric-label").map((node) => node.textContent);
    expect(labels).toEqual(["Market Cap", "Volume (24h)", "Liquidity", "Age"]);
    expect(within(statFor("Market Cap")).getByText("$84.2M")).toBeInTheDocument();
    expect(within(statFor("Volume (24h)")).getByText("$12.4M")).toBeInTheDocument();
    expect(within(statFor("Liquidity")).getByText("$3.2M")).toBeInTheDocument();
    expect(within(statFor("Age")).getByText("187 days")).toBeInTheDocument();
  });

  it("renders the unavailable treatment for a missing value, never a zero", () => {
    renderPanel({
      metrics: { ...fullMetrics, marketCap: { display: null }, ageDays: null },
    });

    const marketCap = statFor("Market Cap");
    expect(within(marketCap).getByText("Unavailable")).toBeInTheDocument();
    expect(marketCap).toHaveAttribute("data-unavailable", "true");
    expect(marketCap.textContent).not.toMatch(/0/);
    expect(marketCap.textContent).not.toMatch(/\$/);

    const age = statFor("Age");
    expect(within(age).getByText("Unavailable")).toBeInTheDocument();
    expect(age.textContent).not.toMatch(/0 days/);

    // A metric that did arrive is untouched by its neighbour's absence.
    expect(statFor("Liquidity")).toHaveAttribute("data-unavailable", "false");
  });

  it("treats a blank display string as unavailable rather than printing nothing", () => {
    renderPanel({ metrics: { ...fullMetrics, liquidity: { display: "   " } } });
    const liquidity = statFor("Liquidity");
    expect(liquidity).toHaveAttribute("data-unavailable", "true");
    expect(within(liquidity).getByText("Unavailable")).toBeInTheDocument();
  });

  it("renders a negative change with the down treatment and a positive one with up", () => {
    renderPanel({
      metrics: {
        ...fullMetrics,
        volume24h: { display: "$12.4M", change: { display: "-3.10%", direction: "down" } },
        marketCap: { display: "$84.2M", change: { display: "+14.25%", direction: "up" } },
      },
    });

    const down = screen.getByText("-3.10%");
    expect(down).toHaveClass("text-down");
    expect(down).not.toHaveClass("text-up");

    const up = screen.getByText("+14.25%");
    expect(up).toHaveClass("text-up");
    expect(up).not.toHaveClass("text-down");
  });

  // The dot and the mark are kash yellow on every other disclosure trigger in
  // the app (see the spot pair header and the meme board's own). This one drew
  // them in the row's white, which read as a different control.
  it("draws the dot and the glyph in the kash yellow", () => {
    renderPanel({ expanded: false });

    const trigger = screen.getByRole("button", { name: "View Market Metrics" });
    expect(trigger.querySelector("span.rounded-full")).toHaveClass("bg-kash");
    expect(trigger.querySelector("svg")).toHaveClass("text-kash");
  });

  it("reports the toggle and describes the disclosure to assistive tech", () => {
    const onToggle = vi.fn();
    renderPanel({ expanded: false, onToggle });

    const toggle = screen.getByRole("button", { name: "View Market Metrics" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    const controls = toggle.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    const panel = document.getElementById(controls as string);
    expect(panel).not.toBeNull();
    // Closed is a collapsed panel, not a removed one: see the mounted-while-closed
    // test below for why, and Disclosure for how.
    expect(panel).toHaveAttribute("inert");

    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("asks the parent to close when it is already open, and holds no state of its own", () => {
    const onToggle = vi.fn();
    renderPanel({ expanded: true, onToggle });

    const toggle = screen.getByRole("button", { name: "Close Market Metrics" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledWith(false);
    // The parent owns the state, so the panel is still open until it says so.
    expect(screen.getByRole("button", { name: "Close Market Metrics" })).toBeInTheDocument();
  });

  // The defect: the panel was swapped out of the layout with `hidden`, which is
  // an instant disappearance. The trigger's chevron rotated smoothly and the
  // metrics block under it snapped. Animating the collapse means the block has
  // to still be there while it folds, which is what Disclosure holds open.
  it("keeps the metrics mounted and collapsed while closed, rather than swapping them out", () => {
    renderPanel({ expanded: false, panelId: "metrics-panel" });

    const panel = document.getElementById("metrics-panel") as HTMLElement;
    expect(panel).not.toHaveAttribute("hidden");
    expect(panel.className).toContain("[grid-template-rows:0fr]");
    expect(panel.className).toContain("transition-[grid-template-rows,opacity]");
    // Mounted, so the fold has something to fold, and out of the tab order and
    // the accessibility tree, so it costs nothing to have kept it.
    expect(panel).toHaveAttribute("inert");
    expect(within(panel).getByText("$84.2M")).toBeInTheDocument();
  });

  it("unfolds to the metrics' own height when it opens", () => {
    renderPanel({ expanded: true, panelId: "metrics-panel" });

    const panel = document.getElementById("metrics-panel") as HTMLElement;
    expect(panel.className).toContain("[grid-template-rows:1fr]");
    expect(panel).not.toHaveAttribute("inert");
  });

  // The gap between the trigger and the panel has to fold with the panel. Left
  // on the section as a flex gap it would survive the collapse, leaving a band
  // of empty space under a closed trigger that was never there before. Put on
  // the Disclosure's className it would be no better: that lands on the grid
  // item, whose own padding counts towards the 0fr track, so the shut panel
  // would stand 12px tall instead of collapsing. It belongs on the content.
  it("folds the gap under the trigger away with the panel", () => {
    renderPanel({ expanded: false, panelId: "metrics-panel" });

    const section = document.getElementById("metrics-panel")?.parentElement as HTMLElement;
    expect(section.className).not.toContain("gap-");

    const clip = document.querySelector("#metrics-panel > .overflow-hidden") as HTMLElement;
    expect(clip.className).not.toMatch(/(^|\s)-?(m|p)(t|b|y)?-/);
    expect(screen.getByRole("group", { name: "Market metrics" }).className).toContain("pt-3");
  });

  it("announces a loading panel instead of empty metric cards", () => {
    renderPanel({ status: "loading", metrics: null });
    expect(screen.getByRole("status")).toHaveTextContent("Loading market metrics");
    expect(screen.queryByText("Unavailable")).toBeNull();
    expect(screen.queryByTestId("meme-metric-label")).toBeNull();
  });

  it("shows an error with a retry the caller can act on", () => {
    const onRetry = vi.fn();
    renderPanel({ status: "error", metrics: null, onRetry });

    expect(screen.getByRole("alert")).toHaveTextContent("Market metrics couldn't be loaded.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("omits the retry when the caller offers no way to retry", () => {
    renderPanel({ status: "error", metrics: null });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("says the coin has no metrics rather than drawing four empty cards", () => {
    renderPanel({ status: "ready", metrics: null });
    expect(screen.getByText("No market metrics for this coin yet.")).toBeInTheDocument();
    expect(screen.queryByTestId("meme-metric-label")).toBeNull();
  });

  it("splits the trader bar by the buyers' share and colours each side", () => {
    renderPanel();
    expect(screen.getByText("Active Traders")).toBeInTheDocument();
    expect(screen.getByText("1,245")).toHaveClass("text-buy");
    expect(screen.getByText("892")).toHaveClass("text-sell");
    expect(screen.getByText("58.2% / 41.8%")).toBeInTheDocument();
    expect(screen.getByTestId("meme-trader-buy-share")).toHaveStyle({ width: "58.2%" });
  });

  it("clamps a share the service reports outside 0-100", () => {
    renderPanel({
      metrics: {
        ...fullMetrics,
        traders: { buyers: "10", sellers: "0", buyerSharePercent: 140 },
      },
    });
    expect(screen.getByTestId("meme-trader-buy-share")).toHaveStyle({ width: "100%" });
    expect(screen.getByText("100.0% / 0.0%")).toBeInTheDocument();
  });

  it("marks the trader split unavailable when the service publishes none", () => {
    renderPanel({ metrics: { ...fullMetrics, traders: null } });
    const card = screen.getByTestId("meme-traders-card");
    expect(card).toHaveAttribute("data-unavailable", "true");
    expect(within(card).getByText("Unavailable")).toBeInTheDocument();
    expect(within(card).queryByTestId("meme-trader-buy-share")).toBeNull();
  });

  // The label stays white. Only the two marks before it carry the yellow, so
  // the row still reads as one control rather than a coloured heading.
  it("keeps the trigger label in the row's own white", () => {
    renderPanel({ expanded: false });
    const toggle = screen.getByRole("button", { name: "View Market Metrics" });

    expect(toggle).toHaveClass("text-white");
    expect(toggle.querySelector("svg")?.querySelector("path")).toHaveAttribute(
      "stroke",
      "currentColor"
    );
  });

  it("suppresses its own trigger when the parent draws one, and still renders the panel", () => {
    renderPanel({ showTrigger: false, panelId: "board-metrics-panel" });

    expect(screen.queryByRole("button", { name: "View Market Metrics" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close Market Metrics" })).toBeNull();

    const panel = document.getElementById("board-metrics-panel");
    expect(panel).not.toBeNull();
    expect(panel).not.toHaveAttribute("hidden");
    expect(within(panel as HTMLElement).getByText("$84.2M")).toBeInTheDocument();
  });

  it("takes the panel id from the parent so an outside trigger's aria-controls resolves", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <>
          <button type="button" aria-expanded={false} aria-controls="rail-metrics-panel">
            View Market Metrics
          </button>
          <MemeMarketMetrics
            expanded={false}
            onToggle={vi.fn()}
            status="ready"
            metrics={fullMetrics}
            showTrigger={false}
            panelId="rail-metrics-panel"
          />
        </>
      </NextIntlClientProvider>
    );

    const railTrigger = screen.getByRole("button", { name: "View Market Metrics" });
    const panel = document.getElementById(railTrigger.getAttribute("aria-controls") as string);
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute("inert");
    // The named group is inside the panel the trigger points at: the panel
    // element itself is the animated box, and Disclosure owns its markup.
    expect(
      within(panel as HTMLElement).getByRole("group", { name: "Market metrics" })
    ).toBeTruthy();
  });
});

// The phone comp (Figma 122:7205 "memecoin - Close Market Metrics" and
// 122:7351 "memecoin - Sell Metrics", both 402 wide) measures the metric tile
// at 70px and the traders card at 110.5px, where this file shipped 73px and
// 117.5px. The file is also mounted by the desktop meme desk, so every phone
// step below has to ship with the `md:` class that restores what desktop had.
// jsdom has no layout and no media queries, so these assert the class pair:
// dropping either half is what a later edit would get wrong.
describe("MemeMarketMetrics phone sizing", () => {
  function classesOf(node: Element | null | undefined): string[] {
    if (!node) throw new Error("no node to read classes from");
    return (node.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
  }

  function expectClasses(node: Element | null | undefined, expected: string[]) {
    const classes = classesOf(node);
    for (const name of expected) expect(classes).toContain(name);
  }

  it("draws the metric tile at the comp's 70px box on phones, and the desk's 73px box on desktop", () => {
    renderPanel();
    const tile = statFor("Market Cap");
    expectClasses(tile, ["min-h-[70px]", "md:min-h-[73px]", "p-[12.5px]", "md:p-[13px]"]);
  });

  it("steps the tile's label and value type to the comp on phones and restores the desk's", () => {
    renderPanel();
    const tile = statFor("Market Cap");
    const label = within(tile).getByTestId("meme-metric-label");
    expectClasses(label, ["text-[11.5px]", "leading-[14px]", "md:text-[12px]", "md:leading-[1.5]"]);
    expectClasses(within(tile).getByText("$84.2M"), [
      "text-[14.6px]",
      "leading-[18px]",
      "md:text-[15px]",
      "md:leading-[1.5]",
    ]);
  });

  it("reserves the phone tile height while loading, so the panel does not jump on arrival", () => {
    const { container } = renderPanel({ status: "loading", metrics: null });
    const blocks = [...container.querySelectorAll(".animate-pulse")];
    const tiles = blocks.slice(0, 4);
    expect(tiles).toHaveLength(4);
    for (const block of tiles) expectClasses(block, ["h-[70px]", "md:h-[73px]"]);
  });

  it("steps the traders card corner and its chevron to the comp on phones", () => {
    renderPanel();
    const card = screen.getByTestId("meme-traders-card");
    expectClasses(card, ["rounded-[19px]", "md:rounded-card"]);
    const chevron = card.querySelector("svg");
    expect(chevron).not.toBeNull();
    expect(chevron).toHaveAttribute("width", "19");
    expectClasses(chevron, ["md:size-[17px]"]);
  });

  it("steps the trader legend type to the comp on phones and restores the desk's", () => {
    renderPanel();
    const card = screen.getByTestId("meme-traders-card");
    for (const name of ["Buyers", "Sellers"]) {
      expectClasses(within(card).getByText(name), [
        "text-[10.4px]",
        "leading-[13px]",
        "md:text-[11px]",
        "md:leading-[1.5]",
      ]);
    }
    for (const count of ["1,245", "892"]) {
      expectClasses(within(card).getByText(count), ["leading-[16px]", "md:leading-[1.5]"]);
    }
    expectClasses(within(card).getByText("58.2% / 41.8%"), [
      "text-[11.4px]",
      "leading-[14px]",
      "md:text-[12px]",
      "md:leading-[1.5]",
    ]);
  });

  it("gives the disclosure trigger a 44px hit area without growing the comp's 16px row", () => {
    renderPanel({ expanded: false });
    const toggle = screen.getByRole("button", { name: "View Market Metrics" });
    const classes = classesOf(toggle);
    expect(classes).toContain("relative");
    expect(classes).toContain("after:absolute");
    expect(classes).toContain("after:h-11");
    expect(classes).toContain("after:min-w-11");
    // A min-height would push the row past the comp's 16px and move the panel
    // down with it, so the target has to be an overlay rather than padding.
    expect(classes.some((name) => name.startsWith("min-h-"))).toBe(false);
  });

  it("sets the trigger's phone gaps and glyph sizes to the comp, restoring the desk's", () => {
    renderPanel({ expanded: false });
    const toggle = screen.getByRole("button", { name: "View Market Metrics" });
    // The comp groups dot, mark and label on a 4px rhythm and holds the
    // chevron 8px off the end of that group.
    const dot = toggle.querySelector("span[aria-hidden]");
    expectClasses(dot?.parentElement, ["gap-1", "md:gap-2"]);
    // The inherited 1.5 leading made the row 18px where the comp is 16px.
    expectClasses(screen.getByText("View Market Metrics"), [
      "text-[12px]",
      "leading-[15px]",
      "md:text-[12.6px]",
      "md:leading-[1.5]",
    ]);

    const [mark, chevron] = [...toggle.querySelectorAll("svg")];
    expect(mark).toHaveAttribute("width", "13");
    expectClasses(mark, ["md:size-[14px]"]);
    expect(chevron).toHaveAttribute("width", "16");
    expectClasses(chevron, ["md:size-[17px]"]);
  });

  it("gives the retry control a 44px touch target on phones and leaves the desk's alone", () => {
    renderPanel({ status: "error", metrics: null, onRetry: vi.fn() });
    expectClasses(screen.getByRole("button", { name: "Try again" }), [
      "min-h-11",
      "min-w-11",
      "md:min-h-[auto]",
      "md:min-w-[auto]",
    ]);
  });

  // Both new comp states draw the traders chevron identically: a static
  // down-pointing glyph in an 18.96px box, never rotated, over the same card
  // content. The design specifies no second disclosure, so it must not gain a
  // control.
  it("keeps the traders chevron a glyph the design never wires to anything", () => {
    renderPanel();
    const card = screen.getByTestId("meme-traders-card");
    expect(within(card).queryAllByRole("button")).toHaveLength(0);
    const glyph = card.querySelector("svg")?.parentElement;
    expect(glyph).toHaveAttribute("aria-hidden");
    expect(glyph?.tagName).toBe("SPAN");
    expect(classesOf(card.querySelector("svg")).some((n) => n.includes("rotate"))).toBe(false);
  });
});
