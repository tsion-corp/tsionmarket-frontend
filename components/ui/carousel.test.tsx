import { act, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import { Carousel } from "@/components/ui/carousel";

// The dot labels come from the shipped catalogue rather than a stub, so these
// assertions fail if `carousel.goToSlide` is ever dropped or reworded.
function render(ui: React.ReactElement) {
  return rtlRender(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

// The carousel asks the browser for the reduced-motion preference and Embla
// watches its own frame and slides for resizes. jsdom ships none of the three,
// so all are stubbed. `reduceMotion` lets one test flip the media query result.
let reduceMotion = false;

beforeAll(() => {
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes("prefers-reduced-motion") ? reduceMotion : false,
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
  reduceMotion = false;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function renderThree() {
  return render(
    <Carousel label="Three">
      <a href="/a">Open A</a>
      <a href="/b">Open B</a>
      <a href="/c">Open C</a>
    </Carousel>
  );
}

/** The indicator's dots, in order. */
function dots(): HTMLElement[] {
  return screen.getAllByRole("button", { name: /^Go to slide \d+$/ });
}

/** Whether a dot is drawn as the active one. */
function isActive(dot: HTMLElement): boolean {
  return dot.className.includes("bg-white") && !dot.className.includes("bg-white/45");
}

describe("carousel", () => {
  it("renders each slide once, with no clones", () => {
    renderThree();
    const slides = document.querySelectorAll("[data-carousel-slide]");
    expect(slides).toHaveLength(3);
    expect(Array.from(slides).map((s) => s.textContent)).toEqual(["Open A", "Open B", "Open C"]);
  });

  it("shows no previous or next controls", () => {
    renderThree();
    expect(screen.queryByRole("button", { name: /previous/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^next slide$/i })).toBeNull();
  });

  it("shows a tappable dot for every slide, each with a 44px hit area", () => {
    renderThree();
    const buttons = dots();
    expect(buttons).toHaveLength(3);
    for (const dot of buttons) {
      expect(dot.className).toContain("after:h-11");
      expect(dot.className).toContain("after:w-11");
    }
    // The first slide is the one in view at rest.
    expect(isActive(buttons[0])).toBe(true);
    expect(isActive(buttons[1])).toBe(false);
    expect(isActive(buttons[2])).toBe(false);
  });

  it("jumps to the slide whose dot was tapped", () => {
    renderThree();
    const buttons = dots();
    fireEvent.click(buttons[2]);
    expect(isActive(dots()[2])).toBe(true);
    expect(isActive(dots()[0])).toBe(false);
  });

  it("advances on its own every intervalMs and wraps around", () => {
    renderThree();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(isActive(dots()[1])).toBe(true);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(isActive(dots()[2])).toBe(true);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(isActive(dots()[0])).toBe(true);
  });

  it("pauses the advance while the pointer or focus is on the carousel", () => {
    renderThree();
    const region = screen.getByRole("region", { name: "Three" });

    fireEvent.mouseEnter(region);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(isActive(dots()[0])).toBe(true);

    fireEvent.mouseLeave(region);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(isActive(dots()[1])).toBe(true);
  });

  it("never advances on its own under reduced motion", () => {
    reduceMotion = true;
    renderThree();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(isActive(dots()[0])).toBe(true);
  });

  it("disables autoplay when intervalMs is 0", () => {
    render(
      <Carousel label="Three" intervalMs={0}>
        <a href="/a">Open A</a>
        <a href="/b">Open B</a>
        <a href="/c">Open C</a>
      </Carousel>
    );
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(isActive(dots()[0])).toBe(true);
  });

  it("spaces slides with margin and padding, never a flex gap", () => {
    // Embla measures slides with getBoundingClientRect, which does not see a
    // CSS `gap`. With `loop: true` that made the wraparound offset one gap
    // short, so the last slide sat flush against the first coming round behind
    // it — reported as the banners "kissing" on the discovery shelves. The fix
    // is Embla's own documented technique: a negative margin on the track and
    // a left padding inside each slide's own (border-box) width, both of which
    // Embla does measure. This test fails if anyone reintroduces `gap`.
    const { container } = render(
      <Carousel label="Three" gapPx={22}>
        <a href="/a">Open A</a>
        <a href="/b">Open B</a>
        <a href="/c">Open C</a>
      </Carousel>
    );

    const track = container.querySelector<HTMLElement>("[data-ws-carousel]");
    expect(track).not.toBeNull();
    expect(track!.style.gap).toBe("");
    expect(track!.style.marginLeft).toBe("-22px");

    const slide = container.querySelector<HTMLElement>("[data-carousel-slide]");
    expect(slide).not.toBeNull();
    expect(slide!.style.paddingLeft).toBe("22px");
  });

  it("shows no dots and does not crash with a single slide", () => {
    render(
      <Carousel label="One">
        <a href="/a">Open A</a>
      </Carousel>
    );
    expect(screen.queryAllByRole("button", { name: /^Go to slide \d+$/ })).toHaveLength(0);
    expect(document.querySelectorAll("[data-carousel-slide]")).toHaveLength(1);
  });

  it("does not crash with zero children", () => {
    render(<Carousel label="Empty">{null}</Carousel>);
    expect(screen.getByRole("region", { name: "Empty" })).toBeInTheDocument();
    expect(document.querySelectorAll("[data-carousel-slide]")).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: /^Go to slide \d+$/ })).toHaveLength(0);
  });

  it("keeps the carousel region's accessible name and role description", () => {
    renderThree();
    const region = screen.getByRole("region", { name: "Three" });
    expect(region).toHaveAttribute("aria-roledescription", "carousel");
  });
});
