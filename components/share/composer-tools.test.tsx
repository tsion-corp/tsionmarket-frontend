import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ComposerTools } from "./composer-tools";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const MARKETS = [
  { symbol: "BTC", name: "Bitcoin", priceUsd: 60000, change24h: 1.2, logo: null },
  { symbol: "ETH", name: "Ethereum", priceUsd: 3000, change24h: -0.4, logo: null },
];

function renderTools(over: Partial<React.ComponentProps<typeof ComposerTools>> = {}) {
  const props = {
    markets: MARKETS,
    topics: [{ key: "crypto", label: "Crypto" }],
    selectedTopics: [],
    onToggleTopic: vi.fn(),
    onInsertSymbol: vi.fn(),
    onInsertText: vi.fn(),
    onPickMedia: vi.fn(),
    ...over,
  };
  render(<ComposerTools {...props} />);
  return props;
}

/** The animated wrapper a tool unfolds. It is in the DOM open or shut. */
function panel(key: "emoji" | "symbol" | "topic"): HTMLElement {
  const node = document.getElementById(`composer-panel-${key}`);
  if (!node) throw new Error(`No panel for ${key}`);
  return node;
}

function expanded(key: "emoji" | "symbol" | "topic"): boolean {
  return panel(key).className.includes("[grid-template-rows:1fr]");
}

/**
 * These panels open inside a modal that caps at 92vh and scrolls, so a panel
 * that renders but lands past the fold is indistinguishable from one that
 * never opened. The rendering is asserted here; the scroll-into-view that
 * makes it visible is a DOM nicety jsdom cannot measure.
 */
describe("ComposerTools", () => {
  it("opens the emoji panel and inserts what is picked", () => {
    const props = renderTools();
    fireEvent.click(screen.getByRole("button", { name: "toolEmoji" }));

    const rocket = screen.getByRole("button", { name: "🚀" });
    expect(rocket).toBeInTheDocument();
    fireEvent.click(rocket);
    expect(props.onInsertText).toHaveBeenCalledWith("🚀");
  });

  it("toggles a panel shut when its tool is pressed again", () => {
    renderTools();
    const tool = screen.getByRole("button", { name: "toolEmoji" });
    fireEvent.click(tool);
    expect(expanded("emoji")).toBe(true);
    fireEvent.click(tool);
    expect(expanded("emoji")).toBe(false);
  });

  /**
   * The reported defect: the tool button lit up and the panel appeared out of
   * nowhere, because the panel was `{panel === "emoji" ? <div/> : null}`. An
   * unmount cannot be animated, so the fold has to happen on a panel that is
   * still in the tree.
   */
  it("keeps a closed panel mounted and collapsed so it can animate", () => {
    renderTools();
    // Closed: still there, but folded to nothing and out of reach.
    const closed = panel("emoji");
    expect(screen.getByRole("button", { name: "🚀" })).toBeInTheDocument();
    expect(closed.className).toContain("[grid-template-rows:0fr]");
    expect(closed.hasAttribute("inert")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "toolEmoji" }));
    expect(panel("emoji").className).toContain("[grid-template-rows:1fr]");
    expect(panel("emoji").hasAttribute("inert")).toBe(false);
  });

  it("points each tool at the panel it unfolds", () => {
    renderTools();
    for (const [tool, key] of [
      ["toolEmoji", "emoji"],
      ["toolSymbol", "symbol"],
      ["toolTopic", "topic"],
    ] as const) {
      const button = screen.getByRole("button", { name: tool });
      expect(button.getAttribute("aria-controls")).toBe(`composer-panel-${key}`);
      expect(button.getAttribute("aria-expanded")).toBe("false");
      fireEvent.click(button);
      expect(button.getAttribute("aria-expanded")).toBe("true");
      fireEvent.click(button);
    }
  });

  // One panel at a time — two open at once would push the composer's own
  // fields further out of the modal than either does alone.
  it("shows only one panel at a time", () => {
    renderTools();
    fireEvent.click(screen.getByRole("button", { name: "toolEmoji" }));
    fireEvent.click(screen.getByRole("button", { name: "toolTopic" }));
    expect(expanded("emoji")).toBe(false);
    expect(expanded("topic")).toBe(true);
  });

  it("offers only symbols this app can trade", () => {
    const props = renderTools();
    fireEvent.click(screen.getByRole("button", { name: "toolSymbol" }));
    fireEvent.click(screen.getByText("$BTC"));
    expect(props.onInsertSymbol).toHaveBeenCalledWith("BTC");
  });
});
