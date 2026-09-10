import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import type { Prediction } from "@/lib/types";
import { ClickRipple } from "@/components/ui/click-ripple";
import { PredictionMobile } from "./prediction-mobile";

const refetch = vi.fn();
const usePredictions = vi.fn();
const format = vi.fn((usd: number) => `NGN ${usd}`);

vi.mock("@/features/prediction/hooks/use-predictions", () => ({
  usePredictions: () => usePredictions(),
}));

// The money layer, stubbed at its own boundary. The real hook reaches for the
// FX feed and the stored currency; what this suite has to prove is that the
// banner hands it a dollar amount and prints what it gets back, rather than
// printing the feed's dollars or doing a conversion of its own.
vi.mock("@/components/ui/currency-select", () => ({
  useMoney: () => ({
    currency: { code: "NGN", name: "Nigerian Naira", symbol: "₦", region: "Africa" },
    setCurrency: vi.fn(),
    ready: true,
    format,
    formatExact: format,
  }),
}));

// Every string this banner draws now resolves from the real English catalog.
const messages = enMessages;

// The clock the countdown is measured against. Fixed so the digits in the
// assertions are the digits the component can produce.
const NOW = Date.UTC(2026, 1, 20, 12, 0, 0);

const rates: Prediction = {
  tag: "Politics",
  vol: "$4.2M vol",
  volumeUsd: 4_200_000,
  q: "Will the US cut rates before Q4 2026?",
  yes: "68¢",
  no: "32¢",
  pct: 68,
  image: "https://polymarket-upload.s3.amazonaws.com/rates.png",
  eventId: "481717",
  tagLabels: ["Politics"],
};

const btc: Prediction = {
  tag: "Crypto",
  vol: "$2.8M vol",
  volumeUsd: 2_800_000,
  q: "Will BTC close above $80k this quarter?",
  yes: "41¢",
  no: "59¢",
  pct: 41,
  image: "https://polymarket-upload.s3.amazonaws.com/btc.png",
  eventId: "481718",
  tagLabels: ["Crypto"],
};

// Two days, three hours, four minutes and five seconds after NOW.
const dated: Prediction = {
  ...rates,
  endsAt: new Date(NOW + ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000).toISOString(),
};

let reducedMotion = false;

function stubMatchMedia() {
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes("prefers-reduced-motion") ? reducedMotion : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia;
}

function mockFeed(result: { data?: Prediction[]; isPending?: boolean; isError?: boolean }): void {
  usePredictions.mockReturnValue({
    data: result.data,
    isPending: result.isPending ?? false,
    isError: result.isError ?? false,
    refetch,
  });
}

function renderBanner() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PredictionMobile />
    </NextIntlClientProvider>
  );
}

function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

// Every tap target the guidelines size at 44px is drawn as a small pill inside
// a larger control, so the class list of the control is what carries the size.
function hasTouchTarget(el: HTMLElement): boolean {
  return el.className.includes("min-h-11") || el.className.includes("size-11");
}

beforeEach(() => {
  reducedMotion = false;
  stubMatchMedia();
  refetch.mockReset();
  format.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PredictionMobile", () => {
  it("draws the market's own question, price, category and artwork", () => {
    mockFeed({ data: [rates] });
    renderBanner();

    expect(screen.getByText(rates.q)).toBeInTheDocument();
    expect(screen.getByText(/68¢/)).toBeInTheDocument();
    expect(screen.getByText("Politics")).toBeInTheDocument();
    // No page of its own on this build: the card opens the prediction desk.
    expect(screen.getByRole("link", { name: rates.q })).toHaveAttribute("href", "/prediction");

    const artwork = document.querySelector(`img[src="${rates.image}"]`);
    expect(artwork).not.toBeNull();
  });

  it("shows the volume in the reader's currency, not the feed's dollars", () => {
    mockFeed({ data: [rates] });
    renderBanner();

    // The dollar amount goes to the money layer; what comes back is what shows.
    expect(format).toHaveBeenCalledWith(4_200_000);
    expect(screen.getByText("NGN 4200000")).toBeInTheDocument();
    expect(screen.queryByText("$4.2M vol")).not.toBeInTheDocument();
  });

  it("shows no volume at all when the feed carries no amount", () => {
    mockFeed({ data: [{ ...rates, vol: "", volumeUsd: undefined }] });
    renderBanner();

    expect(format).not.toHaveBeenCalled();
    expect(screen.queryByText(/NGN/)).not.toBeInTheDocument();
  });

  it("counts down to the market's own close time and ticks", () => {
    mockFeed({ data: [dated] });
    renderBanner();

    expect(screen.getByText("02:03:04:05")).toBeInTheDocument();

    tick(1_000);
    expect(screen.getByText("02:03:04:04")).toBeInTheDocument();
  });

  it("names the countdown for a screen reader rather than reading bare digits", () => {
    mockFeed({ data: [dated] });
    renderBanner();

    expect(screen.getByText("Closes in")).toHaveClass("sr-only");
  });

  it("reads as closed once the deadline has passed", () => {
    mockFeed({ data: [{ ...rates, endsAt: new Date(NOW - 60_000).toISOString() }] });
    renderBanner();

    expect(screen.getByText("Market closed")).toBeInTheDocument();
    expect(screen.queryByText(/^\d\d:\d\d:\d\d:\d\d$/)).not.toBeInTheDocument();
  });

  it("invents no clock for a market the feed gave no close date", () => {
    mockFeed({ data: [rates] });
    renderBanner();

    expect(screen.queryByText(/^\d\d:\d\d:\d\d:\d\d$/)).not.toBeInTheDocument();
    expect(screen.queryByText("Market closed")).not.toBeInTheDocument();
    // The chip falls back to the market's own category, which is real.
    expect(screen.getByText("Politics")).toBeInTheDocument();
  });

  it("opens the market from the Predict Now action", () => {
    mockFeed({ data: [rates] });
    renderBanner();

    // Exact, because the promo card beside it is labelled "… — Predict Now".
    expect(screen.getByRole("link", { name: "Predict Now" })).toHaveAttribute(
      "href",
      "/prediction"
    );
  });

  it("gives every action a 44px touch target", () => {
    mockFeed({ data: [rates, btc] });
    renderBanner();

    expect(hasTouchTarget(screen.getByRole("link", { name: "Predict Now" }))).toBe(true);
    // Predict Now is the banner's only action; there is no second pill.
    expect(screen.queryByRole("link", { name: "See Other Predictions" })).toBeNull();
    expect(hasTouchTarget(screen.getByRole("button", { name: "Pause prediction rotation" }))).toBe(
      true
    );
  });

  it("stretches the market link over the whole card, unclipped", () => {
    mockFeed({ data: [rates] });
    const { container } = renderBanner();

    // The card is opened by a pseudo-element on the question's link, stretched
    // to the card's box. A `line-clamp` anywhere between that link and the box
    // it stretches to sets `overflow: hidden` and clips the pseudo-element back
    // to the text, which leaves most of the card dead to a tap. jsdom does no
    // layout, so the clip cannot be observed; what can be observed is the chain
    // that causes it.
    const link = screen.getByRole("link", { name: rates.q });
    expect(link.className).toContain("after:inset-0");

    const stretchBox = container.querySelector(".snap-x > div > div > div");
    expect(stretchBox).not.toBeNull();

    for (let node = link; node && node !== stretchBox; node = node.parentElement!) {
      expect(node.className).not.toMatch(/line-clamp|overflow-hidden/);
    }
  });

  it("keeps the global click ripple off the stretched card link", () => {
    mockFeed({ data: [rates] });
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ClickRipple />
        <PredictionMobile />
      </NextIntlClientProvider>
    );

    // The ripple makes whatever was pressed a positioning context so it can
    // hang its own layer inside. On a link that stretches a pseudo-element over
    // the whole card that is fatal: the moment the press lands, the link
    // becomes the pseudo-element's containing block, the stretched area
    // collapses to the width of the text, and the release lands on nothing. The
    // link therefore opts out through the attribute the ripple already honours.
    const link = screen.getByRole("link", { name: rates.q });
    // jsdom measures everything as zero and the ripple skips a zero-sized
    // element, so the link is given a real box for the duration of the press.
    link.getBoundingClientRect = () =>
      ({ width: 200, height: 20, left: 0, top: 0, right: 200, bottom: 20, x: 0, y: 0 }) as DOMRect;
    fireEvent.pointerDown(link, { button: 0, clientX: 20, clientY: 20 });

    expect(link.style.position).toBe("");
    expect(link.querySelector(".ws-ripple-layer")).toBeNull();
  });

  it("renders no baked-in artwork text: the 994KB card SVG is gone", () => {
    mockFeed({ data: [rates] });
    const { container } = renderBanner();

    expect(container.querySelector('[data*="card-bg.svg"]')).toBeNull();
    expect(container.querySelector("object")).toBeNull();
    // The question and the figures the old export carried as vector artwork.
    expect(screen.queryByText(/Benny Hinn/)).not.toBeInTheDocument();
    expect(screen.queryByText(/recommend increasing your position/)).not.toBeInTheDocument();
  });

  it("advances to the next market every ten seconds and loops back", () => {
    mockFeed({ data: [rates, btc] });
    renderBanner();

    expect(screen.getByText(rates.q)).toBeInTheDocument();

    tick(9_000);
    expect(screen.getByText(rates.q)).toBeInTheDocument();

    tick(1_000);
    expect(screen.getByText(btc.q)).toBeInTheDocument();
    expect(screen.queryByText(rates.q)).not.toBeInTheDocument();

    tick(10_000);
    expect(screen.getByText(rates.q)).toBeInTheDocument();
  });

  it("holds the rotation while a pointer is over the card, and releases it after", () => {
    mockFeed({ data: [rates, btc] });
    const { container } = renderBanner();
    const slide = container.querySelector("div.snap-start") as HTMLElement;

    fireEvent.pointerEnter(slide);
    tick(30_000);
    expect(screen.getByText(rates.q)).toBeInTheDocument();

    fireEvent.pointerLeave(slide);
    tick(10_000);
    expect(screen.getByText(btc.q)).toBeInTheDocument();
  });

  it("holds the rotation while focus is inside the card", () => {
    mockFeed({ data: [rates, btc] });
    const { container } = renderBanner();
    const slide = container.querySelector("div.snap-start") as HTMLElement;

    fireEvent.focusIn(slide);
    tick(30_000);
    expect(screen.getByText(rates.q)).toBeInTheDocument();
  });

  it("stops and restarts the rotation from the pause control", () => {
    mockFeed({ data: [rates, btc] });
    renderBanner();

    const pause = screen.getByRole("button", { name: "Pause prediction rotation" });
    expect(pause).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(pause);
    tick(30_000);
    expect(screen.getByText(rates.q)).toBeInTheDocument();

    const resume = screen.getByRole("button", { name: "Resume prediction rotation" });
    expect(resume).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(resume);
    tick(10_000);
    expect(screen.getByText(btc.q)).toBeInTheDocument();
  });

  it("never rotates when the reader asked for reduced motion", () => {
    reducedMotion = true;
    stubMatchMedia();
    mockFeed({ data: [rates, btc] });
    renderBanner();

    tick(60_000);
    expect(screen.getByText(rates.q)).toBeInTheDocument();
    // Nothing moves, so there is nothing to offer a pause control for.
    expect(screen.queryByRole("button", { name: /rotation/ })).not.toBeInTheDocument();
  });

  it("shows no pause control for a single market", () => {
    mockFeed({ data: [rates] });
    renderBanner();

    expect(screen.queryByRole("button", { name: /rotation/ })).not.toBeInTheDocument();
  });

  it("shows a loading state instead of a market while the feed is in flight", () => {
    mockFeed({ isPending: true });
    renderBanner();

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText(rates.q)).not.toBeInTheDocument();
  });

  it("invents no market when the feed comes back empty", () => {
    mockFeed({ data: [] });
    renderBanner();

    expect(screen.getByText("No prediction markets are open right now.")).toBeInTheDocument();
    expect(screen.queryByText(/¢/)).not.toBeInTheDocument();
    expect(screen.queryByText(/NGN/)).not.toBeInTheDocument();
    expect(screen.queryByText(rates.q)).not.toBeInTheDocument();
  });

  it("shows the error state and refetches on demand", () => {
    mockFeed({ isError: true });
    renderBanner();

    expect(screen.getByText("Couldn't load prediction markets.")).toBeInTheDocument();
    expect(screen.queryByText(/¢/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
