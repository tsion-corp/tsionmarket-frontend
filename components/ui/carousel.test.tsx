import { act, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import {
  Carousel,
  INTERACTION_PAUSE_MS,
  WHEEL_COOLDOWN_MS,
  WHEEL_STEP_PX,
} from "@/components/ui/carousel";

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

// Every observer the carousel makes, so a test can tell it the rail left the
// screen. The stub never observes anything by itself.
const intersectionObservers: StubIntersectionObserver[] = [];

class StubIntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: readonly number[] = [];

  constructor(private readonly callback: IntersectionObserverCallback) {
    intersectionObservers.push(this);
  }

  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** Drives the carousel's own callback the way a real observer would. */
  report(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver
    );
  }
}

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

  globalThis.IntersectionObserver =
    StubIntersectionObserver as unknown as typeof IntersectionObserver;
});

beforeEach(() => {
  reduceMotion = false;
  intersectionObservers.length = 0;
  window.sessionStorage.clear();
  defineVisibilityState("visible");
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

function renderPersist(props: { intervalMs?: number } = {}) {
  return render(
    <Carousel label="Three" autoAdvance="persist" {...props}>
      <a href="/a">Open A</a>
      <a href="/b">Open B</a>
      <a href="/c">Open C</a>
    </Carousel>
  );
}

/** The node Embla drives, which is also the node the wheel listener sits on. */
function viewport(): HTMLElement {
  const track = document.querySelector("[data-ws-carousel]");
  if (!track?.parentElement) throw new Error("no carousel viewport in the document");
  return track.parentElement;
}

// Dispatched by hand rather than through fireEvent, because these tests assert
// on the event itself: whether the carousel took the gesture or left it to the
// page.
function wheel(init: WheelEventInit): WheelEvent {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init });
  act(() => {
    viewport().dispatchEvent(event);
  });
  return event;
}

// jsdom has no way to hide a tab, so the property is redefined. It is an own
// property of `document` and configurable, so every test can set it again.
function defineVisibilityState(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

function setTabHidden(hidden: boolean) {
  defineVisibilityState(hidden ? "hidden" : "visible");
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

function leaveScreen(isIntersecting: boolean) {
  act(() => {
    for (const observer of intersectionObservers) observer.report(isIntersecting);
  });
}

/** The pause/play control, if this carousel renders one. */
function pauseControl(): HTMLElement | null {
  return screen.queryByRole("button", { name: /^(Pause|Play) the banners$/ });
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

// Embla binds pointer and touch drag only, and the viewport is overflow-hidden
// over a transform-driven track, so before this a trackpad could not move a
// rail at all: the only way to page one was to press and drag.
describe("carousel wheel scrolling", () => {
  it("steps once for one horizontal flick, not once per event", () => {
    renderThree();
    // Trackpad momentum arrives as dozens of small deltas, none of them a step
    // on its own. The threshold is passed on the second of these; the rest
    // fall inside the cooldown.
    const nudge = WHEEL_STEP_PX * 0.75;
    for (let i = 0; i < 5; i += 1) wheel({ deltaX: nudge });
    expect(isActive(dots()[1])).toBe(true);
  });

  it("takes the gesture only while it can move, so the page still scrolls at the end", () => {
    renderThree();
    const taken = wheel({ deltaX: 50 });
    expect(taken.defaultPrevented).toBe(true);

    // One slide never loops, so it can scroll neither way: the gesture belongs
    // to the page and the rail must not trap it.
    render(
      <Carousel label="One">
        <a href="/a">Open A</a>
      </Carousel>
    );
    const ends = document.querySelectorAll("[data-ws-carousel]");
    const lonely = ends[ends.length - 1].parentElement!;
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 200 });
    act(() => {
      lonely.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
  });

  it("needs the cooldown to pass before a second step", () => {
    renderThree();
    wheel({ deltaX: 50 });
    expect(isActive(dots()[1])).toBe(true);

    wheel({ deltaX: 50 });
    expect(isActive(dots()[1])).toBe(true);

    act(() => {
      vi.advanceTimersByTime(WHEEL_COOLDOWN_MS);
    });
    wheel({ deltaX: 50 });
    expect(isActive(dots()[2])).toBe(true);
  });

  it("ignores a vertical wheel and leaves it to the page", () => {
    renderThree();
    const event = wheel({ deltaY: 400 });
    expect(event.defaultPrevented).toBe(false);
    expect(isActive(dots()[0])).toBe(true);
  });

  it("steps on shift plus a vertical wheel, the mouse convention", () => {
    renderThree();
    const event = wheel({ deltaY: 60, shiftKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(isActive(dots()[1])).toBe(true);
  });

  it("scrolls back on a negative delta", () => {
    renderThree();
    wheel({ deltaX: -50 });
    expect(isActive(dots()[2])).toBe(true);
  });

  it("normalises a delta reported in lines or pages before measuring it", () => {
    const pixels = renderThree();
    // Three pixels is nothing, and must not step.
    wheel({ deltaX: 3, deltaMode: 0 });
    expect(isActive(dots()[0])).toBe(true);
    pixels.unmount();

    // Three lines is 48px, which passes the WHEEL_STEP_PX threshold.
    const lines = renderThree();
    wheel({ deltaX: 3, deltaMode: 1 });
    expect(isActive(dots()[1])).toBe(true);
    lines.unmount();

    // One page is a viewport, which always passes it.
    renderThree();
    wheel({ deltaX: 1, deltaMode: 2 });
    expect(isActive(dots()[1])).toBe(true);
  });
});

// `autoAdvance="persist"` is the promo rail's mode: the banners keep moving
// under a resting pointer, which is what the maintainer asked for. Everything
// else in the app keeps the default, so the six discovery shelves still pause
// on hover.
describe("carousel persistent auto-advance", () => {
  // The live region says whether a move is worth announcing. A rail that is
  // still advancing under a resting pointer is moving on its own, so it stays
  // "off": a reader who has not asked for the slides should not have them read
  // out. It goes "polite" only once the rail has actually stopped.
  it("announces slides only once it has actually stopped moving", () => {
    const { container } = renderPersist();
    const track = () => container.querySelector("[data-ws-carousel]");
    const region = screen.getByRole("region", { name: "Three" });

    expect(track()).toHaveAttribute("aria-live", "off");
    fireEvent.mouseEnter(region);
    expect(track()).toHaveAttribute("aria-live", "off");

    fireEvent.click(pauseControl()!);
    expect(track()).toHaveAttribute("aria-live", "polite");
  });

  it("keeps advancing with the pointer resting on the section", () => {
    renderPersist();
    fireEvent.mouseEnter(screen.getByRole("region", { name: "Three" }));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(isActive(dots()[1])).toBe(true);
  });

  it("stops while focus is inside the section", () => {
    renderPersist();
    const region = screen.getByRole("region", { name: "Three" });

    fireEvent.focusIn(region);
    act(() => {
      vi.advanceTimersByTime(25_000);
    });
    expect(isActive(dots()[0])).toBe(true);

    fireEvent.focusOut(region);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(isActive(dots()[1])).toBe(true);
  });

  it("stops while the tab is hidden", () => {
    renderPersist();
    setTabHidden(true);
    act(() => {
      vi.advanceTimersByTime(25_000);
    });
    expect(isActive(dots()[0])).toBe(true);

    setTabHidden(false);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(isActive(dots()[1])).toBe(true);
  });

  it("stops while the section is off screen", () => {
    renderPersist();
    leaveScreen(false);
    act(() => {
      vi.advanceTimersByTime(25_000);
    });
    expect(isActive(dots()[0])).toBe(true);

    leaveScreen(true);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(isActive(dots()[1])).toBe(true);
  });

  it("holds off for eight seconds after a wheel step", () => {
    renderPersist();
    wheel({ deltaX: 50 });
    expect(isActive(dots()[1])).toBe(true);

    // The cadence only restarts once the interaction pause has run out, so the
    // next move is 8s plus the interval away. A carousel that had ignored the
    // wheel step would have moved at 10s, which is the second assertion.
    act(() => {
      vi.advanceTimersByTime(INTERACTION_PAUSE_MS);
    });
    expect(isActive(dots()[1])).toBe(true);

    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    expect(isActive(dots()[1])).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(isActive(dots()[2])).toBe(true);
  });

  it("holds off for eight seconds after a dot tap", () => {
    renderPersist();
    fireEvent.click(dots()[2]);
    expect(isActive(dots()[2])).toBe(true);

    act(() => {
      vi.advanceTimersByTime(INTERACTION_PAUSE_MS);
    });
    expect(isActive(dots()[2])).toBe(true);

    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    expect(isActive(dots()[2])).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(isActive(dots()[0])).toBe(true);
  });

  it("never advances under reduced motion", () => {
    reduceMotion = true;
    renderPersist();
    act(() => {
      vi.advanceTimersByTime(25_000);
    });
    expect(isActive(dots()[0])).toBe(true);
  });
});

// WCAG 2.2.2 asks for a way to stop content that moves on its own for more
// than five seconds. Hovering was that mechanism; "persist" takes it away, so
// the rail carries an explicit control instead.
describe("carousel pause control", () => {
  it("is absent on a carousel that pauses on hover", () => {
    renderThree();
    expect(pauseControl()).toBeNull();
  });

  it("is absent when nothing advances", () => {
    renderPersist({ intervalMs: 0 });
    expect(pauseControl()).toBeNull();
  });

  it("is labelled for what pressing it does, and reports whether it is on", () => {
    renderPersist();
    const control = pauseControl();
    expect(control).not.toBeNull();
    expect(control).toHaveAttribute("aria-label", "Pause the banners");
    expect(control).toHaveAttribute("aria-pressed", "false");
    expect(control!.className).toContain("after:h-11");
    expect(control!.className).toContain("after:w-11");

    fireEvent.click(control!);
    expect(pauseControl()).toHaveAttribute("aria-label", "Play the banners");
    expect(pauseControl()).toHaveAttribute("aria-pressed", "true");
  });

  it("stops the advance and starts it again", () => {
    renderPersist();
    fireEvent.click(pauseControl()!);
    act(() => {
      vi.advanceTimersByTime(25_000);
    });
    expect(isActive(dots()[0])).toBe(true);

    fireEvent.click(pauseControl()!);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(isActive(dots()[1])).toBe(true);
  });

  it("starts paused when the session already holds that choice", () => {
    window.sessionStorage.setItem("ws.carousel.paused", "true");
    renderPersist();
    expect(pauseControl()).toHaveAttribute("aria-pressed", "true");
    act(() => {
      vi.advanceTimersByTime(25_000);
    });
    expect(isActive(dots()[0])).toBe(true);
  });

  it("remembers the choice for the session, so it survives a remount", () => {
    const first = renderPersist();
    fireEvent.click(pauseControl()!);
    first.unmount();

    renderPersist();
    expect(pauseControl()).toHaveAttribute("aria-pressed", "true");
    act(() => {
      vi.advanceTimersByTime(25_000);
    });
    expect(isActive(dots()[0])).toBe(true);
  });
});
