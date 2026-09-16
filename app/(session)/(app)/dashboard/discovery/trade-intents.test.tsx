// @vitest-environment jsdom
import type { ReactNode } from "react";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import type { MemeSpot, RwaSpot, TokenSpot } from "@/features/discovery/types";
import type { MemeToken } from "@/lib/meme/types";
import type { DetailPayload } from "@/lib/modal-types";
import { useDiscoveryTrade, type DiscoveryTradeModals } from "./trade-intents";

// Real messages, not a stub: a key that does not exist should fail here rather
// than reach the UI as fallback text.
function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

function setup() {
  const modals: DiscoveryTradeModals = {
    openDetail: vi.fn(),
    openBuy: vi.fn(),
    openRwaTrade: vi.fn(),
    openMemeBuy: vi.fn(),
  };
  const { result } = renderHook(() => useDiscoveryTrade(modals), { wrapper });
  return { modals, intents: result.current };
}

const detailOf = (modals: DiscoveryTradeModals): DetailPayload =>
  vi.mocked(modals.openDetail).mock.calls[0][0];

const tokenSpot = (over: Partial<TokenSpot> = {}): TokenSpot => ({
  symbol: "HYPE",
  name: "Hyperliquid",
  price: "$42.50",
  priceUsd: 42.5,
  coingeckoId: "hyperliquid",
  change: "+1.80%",
  up: true,
  movePercent: "1.80%",
  logo: null,
  href: "/spot/hype",
  ...over,
});

const memeToken = (over: Partial<MemeToken> = {}): MemeToken =>
  ({
    chainId: 8453,
    address: "0xabc",
    name: "Pepe",
    symbol: "PEPE",
    decimals: 18,
    logoUrl: null,
    priceUsd: "0.0000012",
    priceChange24hPercent: "1000",
    riskLevel: "LOW",
    buyEnabled: true,
    sellEnabled: true,
    warnings: [],
    ...over,
  }) as MemeToken;

const memeSpot = (over: Partial<MemeSpot> = {}): MemeSpot => ({
  symbol: "PEPE",
  name: "Pepe",
  change: "+1000%",
  up: true,
  image: null,
  href: "/meme",
  token: memeToken(),
  ...over,
});

const rwaSpot = (over: Partial<RwaSpot> = {}): RwaSpot => ({
  id: "base:paxg",
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
  chain: "base",
  address: "0xpaxg",
  ...over,
});

describe("useDiscoveryTrade", () => {
  describe("spot", () => {
    it("opens the detail sheet on the feed's own coin id", () => {
      const { modals, intents } = setup();
      intents.onBuyToken(tokenSpot());

      const detail = detailOf(modals);
      expect(detail.sym).toBe("HYPE");
      expect(detail.coingeckoId).toBe("hyperliquid");
      expect(detail.price).toBe("$42.50");
    });

    it("buys at the raw price, not the formatted one", () => {
      const { modals, intents } = setup();
      intents.onBuyToken(tokenSpot());

      detailOf(modals).onCta?.();

      expect(modals.openBuy).toHaveBeenCalledWith({
        symbol: "HYPE",
        name: "Hyperliquid",
        priceUsd: 42.5,
        logo: null,
      });
    });

    // A sheet with no price cannot quote, so the sheet is not offered at all
    // rather than opened onto a dead end.
    it("offers no buy button for a spot with no raw price", () => {
      const { modals, intents } = setup();
      intents.onBuyToken(tokenSpot({ priceUsd: undefined }));

      const detail = detailOf(modals);
      expect(detail.cta).toBeUndefined();
      expect(detail.onCta).toBeUndefined();
    });
  });

  describe("meme", () => {
    it("charts from the contract, since memecoins are not in the id map", () => {
      const { modals, intents } = setup();
      intents.onBuyMeme(memeSpot());

      const detail = detailOf(modals);
      expect(detail.chartChain).toBe("base");
      expect(detail.chartAddress).toBe("0xabc");
      expect(detail.coingeckoId).toBeUndefined();
    });

    it("hands the trade sheet the whole token", () => {
      const { modals, intents } = setup();
      const spot = memeSpot();
      intents.onBuyMeme(spot);

      detailOf(modals).onCta?.();

      expect(modals.openMemeBuy).toHaveBeenCalledWith(spot.token);
    });

    // An unsupported chain has no CoinGecko platform, so no chart is claimed.
    it("claims no chart on a chain CoinGecko cannot be asked about", () => {
      const { modals, intents } = setup();
      intents.onBuyMeme(memeSpot({ token: memeToken({ chainId: 999_999 }) }));

      const detail = detailOf(modals);
      expect(detail.chartChain).toBeUndefined();
      expect(detail.chartAddress).toBeUndefined();
    });

    it("does nothing for a spot with no token behind it", () => {
      const { modals, intents } = setup();
      intents.onBuyMeme(memeSpot({ token: undefined }));

      expect(modals.openDetail).not.toHaveBeenCalled();
    });
  });

  describe("rwa", () => {
    // The registry says "base", the trade sheet wants Alchemy's "base-mainnet".
    // Getting this wrong would open the sheet on the wrong network.
    it("converts the registry chain into the network the sheet expects", () => {
      const { modals, intents } = setup();
      intents.onBuyRwa(rwaSpot());

      detailOf(modals).onCta?.();

      expect(modals.openRwaTrade).toHaveBeenCalledWith({
        network: "base-mainnet",
        address: "0xpaxg",
        symbol: "PAXG",
        mode: "buy",
      });
    });

    it("converts solana too, so the mapping is not a base-only special case", () => {
      const { modals, intents } = setup();
      intents.onBuyRwa(rwaSpot({ chain: "solana" }));

      detailOf(modals).onCta?.();

      expect(vi.mocked(modals.openRwaTrade).mock.calls[0][0].network).toBe("solana-mainnet");
    });

    it("leads with the issuer and adds a yield only when the asset pays one", () => {
      const { modals, intents } = setup();
      intents.onBuyRwa(rwaSpot({ apy: "3.76%" }));

      const detail = detailOf(modals);
      expect(detail.sub).toBe("Paxos");
      expect(detail.stats.map((s) => s.v)).toContain("3.76%");
    });

    it("shows no yield row for an asset that pays none", () => {
      const { modals, intents } = setup();
      intents.onBuyRwa(rwaSpot({ apy: null }));

      expect(detailOf(modals).stats.map((s) => s.k)).not.toContain("APY");
    });

    it("does nothing for a spot the feed sent no contract for", () => {
      const { modals, intents } = setup();
      intents.onBuyRwa(rwaSpot({ chain: undefined, address: undefined }));

      expect(modals.openDetail).not.toHaveBeenCalled();
    });
  });
});
