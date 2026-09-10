import type { ReactNode } from "react";
import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import type { MemeSpot } from "@/features/discovery/types";
import { Next100xRow } from "@/features/discovery/components/next-100x-row";

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

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

const coin = (symbol: string, over: Partial<MemeSpot> = {}): MemeSpot => ({
  symbol,
  name: symbol,
  change: "+40.85%",
  up: true,
  image: null,
  href: "/meme",
  ...over,
});

const shown = (text: string | RegExp) => screen.queryAllByText(text);

describe("next 100X row", () => {
  it("deals a different coin to each card, the featured one first", () => {
    render(
      <Next100xRow memecoins={[coin("BASECAT"), coin("DEGEN"), coin("TOSHI"), coin("BRETT")]} />,
      {
        wrapper,
      }
    );
    expect(shown("BASECAT is Booming").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Buy BASECAT/ }).length).toBeGreaterThan(0);
    expect(shown("DEGEN is up").length).toBeGreaterThan(0);
    expect(shown("TOSHI is Booming").length).toBeGreaterThan(0);
    expect(shown(/BRETT/)).toHaveLength(0);
    // The chips carry the coin's own move, not the design's confetti.
    expect(shown("+1000%")).toHaveLength(0);
    expect(shown("+40.85%").length).toBeGreaterThan(0);
  });

  it("names a coin by its ticker, never by the listing's name", () => {
    render(<Next100xRow memecoins={[coin("PEPE", { name: "github.com/some/repo" })]} />, {
      wrapper,
    });
    expect(shown(/github\.com/)).toHaveLength(0);
    expect(shown("PEPE is Booming").length).toBeGreaterThan(0);
  });

  it("calls a falling coin cooling, in red", () => {
    render(<Next100xRow memecoins={[coin("DEGEN", { change: "-12.00%", up: false })]} />, {
      wrapper,
    });
    expect(shown("DEGEN is Cooling").length).toBeGreaterThan(0);
    expect(shown("+1000%")).toHaveLength(0);
  });

  it("shows the design's Pepe and Shiba when there is nothing to feature", () => {
    render(<Next100xRow />, { wrapper });
    expect(shown(enMessages.discovery.pepeTitle).length).toBeGreaterThan(0);
    expect(shown(enMessages.discovery.shibaTitle).length).toBeGreaterThan(0);
  });
});
