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
    expect(screen.getByRole("button", { name: "🚀" })).toBeInTheDocument();
    fireEvent.click(tool);
    expect(screen.queryByRole("button", { name: "🚀" })).toBeNull();
  });

  // One panel at a time — two open at once would push the composer's own
  // fields further out of the modal than either does alone.
  it("shows only one panel at a time", () => {
    renderTools();
    fireEvent.click(screen.getByRole("button", { name: "toolEmoji" }));
    fireEvent.click(screen.getByRole("button", { name: "toolTopic" }));
    expect(screen.queryByRole("button", { name: "🚀" })).toBeNull();
    expect(screen.getByRole("button", { name: "Crypto" })).toBeInTheDocument();
  });

  it("offers only symbols this app can trade", () => {
    const props = renderTools();
    fireEvent.click(screen.getByRole("button", { name: "toolSymbol" }));
    fireEvent.click(screen.getByText("$BTC"));
    expect(props.onInsertSymbol).toHaveBeenCalledWith("BTC");
  });
});
