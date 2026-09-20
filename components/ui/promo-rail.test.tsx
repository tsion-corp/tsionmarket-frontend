import { act, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import { PromoBanner, PromoRail } from "@/components/ui/promo-rail";

// The pause control's labels come from the shipped catalogue rather than a
// stub, so these assertions fail if `carousel.pause` is dropped or reworded.
function render(ui: React.ReactElement) {
  return rtlRender(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

// The rail rides the shared carousel, which asks the browser for the
// reduced-motion preference, watches its own frame for resizes and, in the
// mode the rail uses, watches whether it is on screen. jsdom ships none of the
// three.
beforeAll(() => {
  window.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia;

  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;

  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
});

beforeEach(() => {
  window.sessionStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function renderRail() {
  return render(
    <PromoRail label="Promotions">
      <PromoBanner
        href="/arkstore"
        title="ArkStore"
        subtitle="Spend Your Winnings"
        background="#2b1a10"
      />
      <PromoBanner
        href="/stake"
        title="Set The Stake"
        subtitle="Back Your Call"
        background="#3a1207"
      />
      <PromoBanner href="/kash" title="Kash" subtitle="Cash Out Fast" background="#101c2b" />
    </PromoRail>
  );
}

function dots(): HTMLElement[] {
  return screen.getAllByRole("button", { name: /^Go to slide \d+$/ });
}

function isActive(dot: HTMLElement): boolean {
  return dot.className.includes("bg-white") && !dot.className.includes("bg-white/45");
}

describe("promo rail", () => {
  it("gives every banner a slide of its own", () => {
    renderRail();
    const slides = document.querySelectorAll("[data-carousel-slide]");
    expect(slides).toHaveLength(3);
    expect(screen.getByRole("link", { name: /ArkStore/ })).toHaveAttribute("href", "/arkstore");
  });

  it("keeps the design's 22px spacing, as margin and padding rather than a gap", () => {
    const { container } = renderRail();
    const track = container.querySelector<HTMLElement>("[data-ws-carousel]");
    expect(track).not.toBeNull();
    expect(track!.style.gap).toBe("");
    expect(track!.style.marginLeft).toBe("-22px");
    expect(container.querySelector<HTMLElement>("[data-carousel-slide]")!.style.paddingLeft).toBe(
      "22px"
    );
  });

  it("keeps moving with the pointer resting on the rail", () => {
    renderRail();
    // The complaint this answers: on a desktop the pointer sits over the middle
    // of the page, so under the default mode the rail never moved.
    fireEvent.mouseEnter(screen.getByRole("region", { name: "Promotions" }));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(isActive(dots()[1])).toBe(true);
  });

  it("carries the pause control that comes with a rail nobody can stop by hovering", () => {
    renderRail();
    const control = screen.getByRole("button", { name: "Pause the banners" });
    expect(control).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(control);
    act(() => {
      vi.advanceTimersByTime(25_000);
    });
    expect(isActive(dots()[0])).toBe(true);
  });
});
