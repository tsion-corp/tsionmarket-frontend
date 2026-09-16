import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { ArkStoreBanner } from "./ark-store-banner";

// jsdom ships no ResizeObserver, and the banner scales its artboard with one.
// A stub that reports a width on observe keeps the scaling path exercised
// rather than skipped.
class StubResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.callback(
      [{ target, contentRect: { width: 340 } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver
    );
  }
  unobserve() {}
  disconnect() {}
}

beforeAll(() => vi.stubGlobal("ResizeObserver", StubResizeObserver));
afterAll(() => vi.unstubAllGlobals());

function renderBanner() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ArkStoreBanner />
    </NextIntlClientProvider>
  );
}

describe("ArkStoreBanner", () => {
  it("takes its words from the catalogue, not from the file", () => {
    renderBanner();
    expect(screen.getByText(messages.portfolio.arkStorePitch)).toBeInTheDocument();
    expect(screen.getByText(messages.portfolio.arkStoreTagline)).toBeInTheDocument();
  });

  // The artwork is decoration around the pitch: the doorway is the link the
  // caller wraps this in, so the banner itself must offer nothing to click and
  // nothing for a screen reader to read out.
  it("is presentational, with no control and no art in the accessibility tree", () => {
    const { container } = renderBanner();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelectorAll("img[alt='']").length).toBeGreaterThan(0);
  });

  it("scales its artboard to the width it is given", () => {
    const { container } = renderBanner();
    const board = container.querySelector<HTMLElement>(".origin-top-left");
    expect(board?.style.transform).toBe("scale(1)");
  });
});
