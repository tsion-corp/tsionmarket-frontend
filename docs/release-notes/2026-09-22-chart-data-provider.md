---
date: 2026-09-22
feature: CoinGecko API key and a chart fallback
scope: fix
scenario-impact: none
---

# Charts stop reading "Chart unavailable"

Every CoinGecko call was made without an API key, so it fell to the legacy
public tier. That tier throttles hard enough that charts and market lists
intermittently failed, which showed on screen as "Chart unavailable" on a token
whose data was fine.

- All five CoinGecko call sites go through one helper, so the key cannot be
  applied to some and forgotten on others: the chart, the contract-to-id
  resolver, the token logo proxy, the Ondo feed and the markets explorer.
- The key travels as a header, never as a query parameter, so it stays out of
  logs and cache keys.
- When CoinGecko refuses a chart or returns no points, DefiLlama answers
  instead. It takes a CoinGecko id, so nothing else had to change.
- Candle charts do not fall back. DefiLlama serves prices, not OHLC, and
  standing in would mean inventing the open, high and low.

`COINGECKO_API_KEY` is set on both Vercel projects across production, preview
and development. Local development needs it in `.env`; see `.env.example`.
