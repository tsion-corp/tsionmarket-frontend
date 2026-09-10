import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import type { Prediction } from "@/lib/types";
import { PredictionSlider } from "./prediction-slider";

// Embla asks the browser for the breakpoints in its options, watches which
// slides are on screen, and watches its own frame for resizes before it lays
// anything out. jsdom ships none of the three, so matchMedia is stubbed as "no
// query matches", which is the single-breakpoint carousel this slider
// configures anyway, and both observers as ones that never report. None of it
// affects which markup the slides render.
beforeAll(() => {
  if (typeof globalThis.IntersectionObserver !== "function") {
    globalThis.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    } as unknown as typeof IntersectionObserver;
  }
  if (typeof globalThis.ResizeObserver !== "function") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
});

const mapped: Prediction = {
  tag: "Politics",
  vol: "$4.2M vol",
  q: "Will the US cut rates before Q4 2026?",
  yes: "68¢",
  no: "32¢",
  pct: 68,
  eventId: "481717",
  tagLabels: ["Politics", "Global Elections"],
};

// Same feed, tags this app has no category for.
const unmapped: Prediction = {
  ...mapped,
  tag: "Weather",
  q: "Highest temperature in London on September 8?",
  eventId: "973992",
  tagLabels: ["Weather", "Daily Temperature"],
};

function renderSlider(predictions: Prediction[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <PredictionSlider predictions={predictions} onBuy={vi.fn()} />
    </NextIntlClientProvider>
  );
}

describe("prediction slider", () => {
  it("draws every card unlinked, since no market has a page of its own here", () => {
    renderSlider([mapped]);

    expect(screen.queryByRole("link", { name: mapped.q })).toBeNull();
    expect(screen.getByText(mapped.q)).toBeInTheDocument();
  });

  it("leaves a market this app has no category for as an unlinked card", () => {
    renderSlider([unmapped]);

    expect(screen.queryByRole("link", { name: unmapped.q })).not.toBeInTheDocument();
    expect(screen.getByText(unmapped.q)).toBeInTheDocument();
  });
});
