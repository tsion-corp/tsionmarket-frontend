import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { MarketSquareBanner } from "./market-square-banner";

const SQUARE = "https://square.example.com";

// jsdom ships no ResizeObserver, and the banner scales its artboard with one.
// A stub that reports a width on observe keeps the scaling path exercised
// rather than skipped.
class StubResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.callback(
      [{ target, contentRect: { width: 512 } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver
    );
  }
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function renderBanner(href = SQUARE) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MarketSquareBanner href={href} />
    </NextIntlClientProvider>
  );
}

describe("MarketSquareBanner", () => {
  it("opens the square's own deployment in a new tab, safely", () => {
    // The square is a sibling deployment rather than a route here, so this is a
    // plain anchor. rel is not optional on a target=_blank link.
    renderBanner();
    const link = screen.getByRole("link");

    expect(link).toHaveAttribute("href", SQUARE);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
  });

  it("carries an accessible name, so the banner is not an unlabelled link", () => {
    renderBanner();
    expect(screen.getByRole("link", { name: messages.discovery.squareAria })).toBeInTheDocument();
  });

  it("sets the pitch as real text, not artwork", () => {
    // The words are laid out rather than drawn so they translate and so a
    // screen reader reads them. Every other layer is decoration.
    const { container } = renderBanner();

    expect(container.textContent).toContain("Build your audience live");
    expect(container.textContent).toContain("Stream now and watch your community grow instantly.");
    expect(container.textContent).toContain("Explore");
  });

  it("emphasises the two runs the comp emphasises", () => {
    const { container } = renderBanner();
    const emphasised = [...container.querySelectorAll("span")]
      .map((node) => node.textContent)
      .filter((text) => text === "your audience" || text === "grow instantly.");

    expect(emphasised).toEqual(expect.arrayContaining(["your audience", "grow instantly."]));
  });

  it("hides every decorative layer from assistive tech", () => {
    // Ten layers of artwork. Any one of them announcing itself would bury the
    // two lines that carry the meaning.
    const { container } = renderBanner();
    const images = [...container.querySelectorAll("img")];

    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      expect(image).toHaveAttribute("alt", "");
    }
  });

  it("draws both scalloped edges, the shape the rail's other banners share", () => {
    const { container } = renderBanner();
    const sources = [...container.querySelectorAll("img")].map((node) => node.getAttribute("src"));

    expect(sources).toContain("/market/square-banner/scallop-left.svg");
    expect(sources).toContain("/market/square-banner/scallop-right.svg");
  });

  it("keeps the comp's card shape, so it sits in the rail without resizing it", () => {
    // 339.9381 / 58 is 5.861, the same ratio the rail's existing cards use. A
    // banner of another shape would make the carousel's slides disagree.
    const { container } = renderBanner();
    const link = container.querySelector("a");

    expect(link).toHaveStyle({ aspectRatio: "339.9381 / 58" });
  });
});
