import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import type { RwaSpot } from "@/features/discovery/types";
import {
  GoldCard,
  RealEstateCard,
  StocksCard,
  TreasuriesCard,
} from "@/features/discovery/components/real-assets-cards";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}
const renderWithIntl = (ui: ReactNode) => render(<>{ui}</>, { wrapper });
const link = (name: RegExp) => screen.getByRole("link", { name });

const spot = (over: Partial<RwaSpot> = {}): RwaSpot => ({
  id: "ethereum:paxg",
  symbol: "PAXG",
  name: "Paxos Gold",
  issuer: "Paxos",
  category: "commodity",
  price: "$2,412.50",
  change: "+0.26%",
  up: true,
  apy: null,
  logo: null,
  href: "/rwa",
  ...over,
});

describe("Gold card", () => {
  it("features the priced gold token with its figures and a Buy action", () => {
    renderWithIntl(<GoldCard spots={[spot()]} />);
    expect(screen.getByText("PAXG")).toBeInTheDocument();
    expect(screen.getByText("Paxos Gold · by Paxos")).toBeInTheDocument();
    expect(screen.getByText("$2,412.50")).toBeInTheDocument();
    expect(screen.getByText("+0.26%")).toBeInTheDocument();
    expect(link(/Buy PAXG/)).toHaveAttribute("href", "/rwa");
  });

  it("shows its category copy and the desk link with no asset, and invents no figure", () => {
    renderWithIntl(<GoldCard spots={[]} />);
    expect(screen.getByText("Gold, tokenised")).toBeInTheDocument();
    expect(link(/Explore real assets/)).toHaveAttribute("href", "/rwa");
    expect(screen.queryByText(/\$/)).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
  });
});

describe("Treasuries card", () => {
  it("shows the yield in the ring and offers to earn it", () => {
    renderWithIntl(
      <TreasuriesCard
        spots={[spot({ symbol: "USTB", name: "Superstate", issuer: "Superstate", apy: "3.76%" })]}
      />
    );
    expect(screen.getByText("3.76%")).toBeInTheDocument();
    expect(link(/Earn 3\.76%/)).toHaveAttribute("href", "/rwa");
  });

  it("draws an empty ring and the desk link with no asset", () => {
    renderWithIntl(<TreasuriesCard spots={[]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(link(/Explore real assets/)).toBeInTheDocument();
  });
});

describe("Real estate card", () => {
  it("offers a share of the featured property token", () => {
    renderWithIntl(
      <RealEstateCard
        spots={[spot({ symbol: "PRO", name: "Propy", issuer: "Propy", price: "$0.37" })]}
      />
    );
    expect(screen.getByText("PRO")).toBeInTheDocument();
    expect(screen.getByText("$0.37")).toBeInTheDocument();
    expect(link(/Own a share/)).toHaveAttribute("href", "/rwa");
  });
});

describe("Stocks card", () => {
  const stocks = [
    spot({ id: "a", symbol: "TSLAx", name: "Tesla xStock", issuer: "Backed", price: "$250.10" }),
    spot({ id: "b", symbol: "NVDAx", name: "NVIDIA xStock", issuer: "Backed", price: "$120.00" }),
  ];

  it("features the stock at the index it is handed and tapes the rest", () => {
    renderWithIntl(<StocksCard spots={stocks} index={1} />);
    expect(link(/Trade NVDAx/)).toHaveAttribute("href", "/rwa");
    expect(screen.getByText("$120.00")).toBeInTheDocument();
    // The tape names every stock, so TSLAx is on the card too.
    expect(screen.getAllByText("TSLAx").length).toBeGreaterThan(0);
  });

  it("wraps the index rather than running off the end", () => {
    renderWithIntl(<StocksCard spots={stocks} index={3} />);
    expect(link(/Trade NVDAx/)).toBeInTheDocument();
  });
});

describe("card links", () => {
  it("keeps every decoration out of the pointer's way", () => {
    const { container } = renderWithIntl(<GoldCard spots={[spot()]} />);
    const article = container.querySelector("article")!;
    // Every art layer is absolutely positioned; each must let the pointer
    // through to the pill beneath it. The copy blocks sit in the flow above
    // the art and cover nothing clickable.
    const art = Array.from(article.children).filter((child) =>
      /(^|\s)absolute(\s|$)/.test(child.className)
    );
    expect(art.length).toBeGreaterThan(0);
    for (const layer of art) expect(layer.className).toContain("pointer-events-none");
  });
});
