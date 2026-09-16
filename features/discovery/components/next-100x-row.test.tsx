import type { ReactNode } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import type { MemeSpot } from "@/features/discovery/types";
import type { MemeToken } from "@/lib/meme/api";
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

const memeToken = (symbol: string, over: Partial<MemeToken> = {}): MemeToken => ({
  chainId: 8453,
  address: "0x1",
  name: symbol,
  symbol,
  decimals: 18,
  logoUrl: null,
  priceUsd: "0.01",
  liquidityUsd: "1000",
  volume24hUsd: "1000",
  priceChange24hPercent: "40.85",
  marketCapUsd: null,
  fdvUsd: null,
  pairAddress: null,
  dexName: null,
  riskLevel: "LOW",
  buyEnabled: true,
  sellEnabled: true,
  warnings: [],
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

  describe("the Buy pill", () => {
    it("opens in place on the black card when a callback and a token are given", () => {
      const onBuy = vi.fn();
      const basecat = coin("BASECAT", { token: memeToken("BASECAT") });
      render(<Next100xRow memecoins={[basecat]} onBuy={onBuy} />, { wrapper });

      const buttons = screen.getAllByRole("button", { name: "Buy BASECAT" });
      expect(buttons.length).toBeGreaterThan(0);
      expect(screen.queryAllByRole("link", { name: "Buy BASECAT" })).toHaveLength(0);

      fireEvent.click(buttons[0]);
      expect(onBuy).toHaveBeenCalledTimes(1);
      expect(onBuy).toHaveBeenCalledWith(basecat);
    });

    it("keeps navigating on the black card without a callback", () => {
      const basecat = coin("BASECAT", { token: memeToken("BASECAT") });
      render(<Next100xRow memecoins={[basecat]} />, { wrapper });

      expect(screen.getAllByRole("link", { name: "Buy BASECAT" }).length).toBeGreaterThan(0);
      expect(screen.queryAllByRole("button", { name: "Buy BASECAT" })).toHaveLength(0);
    });

    it("opens in place on the orange card when a callback and a token are given", () => {
      const onBuy = vi.fn();
      const basecat = coin("BASECAT", { token: memeToken("BASECAT") });
      const degen = coin("DEGEN", { token: memeToken("DEGEN") });
      render(<Next100xRow memecoins={[basecat, degen]} onBuy={onBuy} />, { wrapper });

      const buttons = screen.getAllByRole("button", { name: enMessages.discovery.shibaCta });
      expect(buttons.length).toBeGreaterThan(0);
      expect(screen.queryAllByRole("link", { name: enMessages.discovery.shibaCta })).toHaveLength(
        0
      );

      fireEvent.click(buttons[0]);
      expect(onBuy).toHaveBeenCalledTimes(1);
      expect(onBuy).toHaveBeenCalledWith(degen);
    });

    it("keeps navigating on the orange card without a callback", () => {
      const basecat = coin("BASECAT", { token: memeToken("BASECAT") });
      const degen = coin("DEGEN", { token: memeToken("DEGEN") });
      render(<Next100xRow memecoins={[basecat, degen]} />, { wrapper });

      expect(
        screen.getAllByRole("link", { name: enMessages.discovery.shibaCta }).length
      ).toBeGreaterThan(0);
      expect(screen.queryAllByRole("button", { name: enMessages.discovery.shibaCta })).toHaveLength(
        0
      );
    });

    it("keeps the placeholder cards navigating even when a callback is supplied", () => {
      const onBuy = vi.fn();
      render(<Next100xRow onBuy={onBuy} />, { wrapper });

      expect(
        screen.getAllByRole("link", { name: enMessages.discovery.pepeCta }).length
      ).toBeGreaterThan(0);
      expect(screen.queryAllByRole("button", { name: enMessages.discovery.pepeCta })).toHaveLength(
        0
      );
      expect(
        screen.getAllByRole("link", { name: enMessages.discovery.shibaCta }).length
      ).toBeGreaterThan(0);
      expect(screen.queryAllByRole("button", { name: enMessages.discovery.shibaCta })).toHaveLength(
        0
      );
      expect(onBuy).not.toHaveBeenCalled();
    });

    it("keeps navigating for a live coin the feed never attached a token to", () => {
      const onBuy = vi.fn();
      const basecat = coin("BASECAT");
      render(<Next100xRow memecoins={[basecat]} onBuy={onBuy} />, { wrapper });

      expect(screen.getAllByRole("link", { name: "Buy BASECAT" }).length).toBeGreaterThan(0);
      expect(screen.queryAllByRole("button", { name: "Buy BASECAT" })).toHaveLength(0);
    });
  });
});
