"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";

import type { MemeSpot, RwaSpot, TokenSpot } from "@/features/discovery/types";
import { chainNetwork } from "@/features/rwa/lib/presenter";
import { priceLabel } from "@/features/trade/components/meme-bits";
import { coingeckoId } from "@/lib/coingecko";
import { chainSlug } from "@/lib/meme/chain";
import type { MemeToken } from "@/lib/meme/types";
import type { BuyPayload, DetailPayload, RwaTradePayload, StatLine } from "@/lib/modal-types";
import { tokenBg } from "@/lib/trade/assets";

// Turns a discovery card's "buy this" into the app's modal stack.
//
// The cards cannot do this themselves. `features/discovery` may not import
// trade, meme or rwa, and the conversions here need all three: the RWA sheet
// wants an Alchemy network id where the card holds a registry chain, and the
// meme sheet wants a whole token where the card holds a display shape. The
// route is the one place allowed to know both vocabularies, so the translation
// lives here and the cards stay ignorant of what a trade sheet is.
//
// Each intent opens the detail sheet first, chart and figures, with the buy
// sheet behind its primary button. That is the same two-step the portfolio's
// holdings list already uses, not a second pattern.

/**
 * The openers an intent needs. Narrower than the whole `AppModals` on purpose:
 * this module has no business opening funds, withdraw or account, and a small
 * interface is also what makes it testable without the host.
 */
export interface DiscoveryTradeModals {
  openDetail: (detail: DetailPayload) => void;
  openBuy: (buy: BuyPayload) => void;
  openRwaTrade: (trade: RwaTradePayload) => void;
  openMemeBuy: (token: MemeToken) => void;
}

export interface DiscoveryTradeIntents {
  onBuyToken: (spot: TokenSpot) => void;
  onBuyMeme: (spot: MemeSpot) => void;
  onBuyRwa: (spot: RwaSpot) => void;
}

export function useDiscoveryTrade(modals: DiscoveryTradeModals): DiscoveryTradeIntents {
  const t = useTranslations("discovery");
  const tPortfolio = useTranslations("portfolio");
  const tMarkets = useTranslations("markets");
  const tRwa = useTranslations("rwa");

  const { openDetail, openBuy, openRwaTrade, openMemeBuy } = modals;

  const onBuyToken = useCallback(
    (spot: TokenSpot) => {
      const priceUsd = spot.priceUsd;
      // No raw price, no buy button. The sheet prices its estimate from this
      // number, so offering the action without one would open a sheet that
      // cannot quote. The card gates on the same field, so this is the second
      // lock rather than the first.
      const action =
        priceUsd === undefined
          ? {}
          : {
              cta: t("tokenCta", { symbol: spot.symbol }),
              onCta: () =>
                openBuy({
                  symbol: spot.symbol,
                  name: spot.name,
                  priceUsd,
                  logo: spot.logo,
                }),
            };

      openDetail({
        sym: spot.symbol,
        name: spot.name,
        sub: spot.symbol,
        price: spot.price,
        chg: spot.change,
        bg: tokenBg(spot.symbol),
        logo: spot.logo,
        up: spot.up,
        // The feed is CoinGecko's own list, so the id it carried is the chart.
        // The static map is the fallback for a spot built without one.
        coingeckoId: spot.coingeckoId ?? coingeckoId(spot.symbol) ?? undefined,
        stats: [
          { k: tPortfolio("marketPrice"), v: spot.price },
          { k: tMarkets("change24hFull"), v: spot.change, c: spot.up ? "up" : "down" },
        ],
        ...action,
      });
    },
    [openBuy, openDetail, t, tMarkets, tPortfolio]
  );

  const onBuyMeme = useCallback(
    (spot: MemeSpot) => {
      const token = spot.token;
      if (token === undefined) return;

      // A memecoin is almost never in the static id map, so the chart is
      // resolved from the contract instead. An unsupported chain resolves to
      // null and the sheet shows its empty state rather than a borrowed line.
      const slug = chainSlug(token.chainId);
      const chart = slug === null ? {} : { chartChain: slug, chartAddress: token.address };
      const price = priceLabel(token.priceUsd);
      const stats: StatLine[] = [{ k: tPortfolio("marketPrice"), v: price }];
      if (spot.change) {
        stats.push({
          k: tMarkets("change24hFull"),
          v: spot.change,
          c: spot.up ? "up" : "down",
        });
      }

      openDetail({
        sym: spot.symbol,
        name: spot.name,
        sub: spot.symbol,
        price,
        chg: spot.change,
        bg: tokenBg(spot.symbol),
        logo: spot.image,
        up: spot.up,
        stats,
        cta: t("memeBuy", { symbol: spot.symbol }),
        onCta: () => openMemeBuy(token),
        ...chart,
      });
    },
    [openDetail, openMemeBuy, t, tMarkets, tPortfolio]
  );

  const onBuyRwa = useCallback(
    (spot: RwaSpot) => {
      const { chain, address } = spot;
      if (chain === undefined || address === undefined) return;

      const stats: StatLine[] = [{ k: tRwa("issuer"), v: spot.issuer }];
      if (spot.price) stats.push({ k: tPortfolio("marketPrice"), v: spot.price });
      if (spot.change) {
        stats.push({ k: tMarkets("change24hFull"), v: spot.change, c: spot.up ? "up" : "down" });
      }
      // Only the assets that pay one carry an APY, so the row is added rather
      // than shown empty.
      if (spot.apy) stats.push({ k: tRwa("apy"), v: spot.apy });

      openDetail({
        sym: spot.symbol,
        name: spot.name,
        // The issuer is who stands behind the asset, which says more under the
        // name than the ticker repeated.
        sub: spot.issuer,
        price: spot.price ?? "",
        chg: spot.change ?? "",
        bg: tokenBg(spot.symbol),
        logo: spot.logo,
        up: spot.up,
        stats,
        chartChain: chain,
        chartAddress: address,
        cta: t("rwaBuy", { symbol: spot.symbol }),
        onCta: () =>
          openRwaTrade({
            // The registry names chains "base"; the trade sheet wants Alchemy's
            // "base-mainnet". This is the one place that knows both.
            network: chainNetwork(chain),
            address,
            symbol: spot.symbol,
            mode: "buy",
          }),
      });
    },
    [openDetail, openRwaTrade, t, tMarkets, tPortfolio, tRwa]
  );

  return useMemo(() => ({ onBuyToken, onBuyMeme, onBuyRwa }), [onBuyToken, onBuyMeme, onBuyRwa]);
}
