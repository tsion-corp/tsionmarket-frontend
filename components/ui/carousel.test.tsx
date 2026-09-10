import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import { Carousel } from "@/components/ui/carousel";

beforeAll(() => {
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
  if (typeof globalThis.ResizeObserver !== "function") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

function renderThree() {
  return render(
    <Carousel label="Three">
      <a href="/a">Open A</a>
      <a href="/b">Open B</a>
      <a href="/c">Open C</a>
    </Carousel>,
    { wrapper }
  );
}

// The slides as the track lays them out, left to right, with whether each is
// switched off. The track is the element carrying the width rule.
function track(): { label: string; inert: boolean }[] {
  const slides = Array.from(
    document.querySelectorAll<HTMLElement>("[data-ws-carousel] > [role='group']")
  );
  return slides.map((slide) => ({
    label: slide.textContent ?? "",
    inert: slide.hasAttribute("inert"),
  }));
}

describe("carousel", () => {
  it("keeps the copies that fill the last frame live, so their links can be clicked", () => {
    renderThree();
    const next = screen.getByRole("button", { name: /next/i });

    // Two steps forward from a three-slide, two-up loop lands on the last
    // real slide, and the frame beside it is filled by a copy of the first.
    for (let step = 0; step < 2; step += 1) {
      fireEvent.click(next);
      act(() => {
        vi.advanceTimersByTime(500);
      });
    }

    const slides = track();
    const last = slides.findIndex((slide, i) => slide.label === "Open C" && !slide.inert && i > 0);
    expect(last).toBeGreaterThan(0);
    // The copy of A in the frame beside C, and the peek of B after it, are
    // live: a reader can click what they can see.
    expect(slides[last + 1]).toEqual({ label: "Open A", inert: false });
    expect(slides[last + 2]).toEqual({ label: "Open B", inert: false });
    // The copies behind the frame stay off, so nothing is read or tabbed twice.
    expect(slides[0].inert).toBe(true);
  });
});
