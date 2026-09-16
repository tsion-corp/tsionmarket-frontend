"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Artboard } from "@/components/ui/artboard";
import { AssetIcon } from "@/components/ui/asset-icon";
import { useRotatingIndex } from "@/hooks/use-rotating-index";
import { tokenBg } from "@/lib/trade/assets";
import { formatUsd } from "@/lib/trade/math";

// Ten seconds a token, the cadence the discovery cards rotate at.
const ROTATE_MS = 10_000;

// How many tokens the carousel cycles through. The caller may hand us more.
const MAX_TOKENS = 5;

// The card artwork (/trade/token-moves/card-bg.svg) has the designer's sample
// figures baked into it as outlined glyph paths: "BTC", "$1,876.67", "+12.8%",
// the recommendation sentence, and "Buy Eth". They cannot be edited out of the
// image from here, so every one of them sits underneath an opaque panel that
// matches the SVG's own rect exactly, and the real figures are DOM text on top.
// Change a panel's geometry and a fabricated number reappears from under it.
//
// Geometry, read straight off the SVG (viewBox 339x168):
//   chip   rect x=71     y=22.0287  w=168.569 h=44.6213 rx=8.68   rotate(-3.07027 71 22.0287)
//   bubble rect x=37     y=69.5861  w=222     h=58      rx=10.12  (not rotated)
//   button rect x=68.678 y=134.264  w=65.088  h=24.408  rx=12.204 (not rotated)
const CHIP = { left: "20.943%", top: "13.112%", width: "49.725%", height: "26.560%" };
const BUBBLE = { left: "10.914%", top: "41.420%", width: "65.487%", height: "34.524%" };
// The comp draws the button 65x24 at 8px type, which reads tiny beside the
// bubble; it is 82x30 at 10px here, kept at the comp's bottom-left anchor.
const BUTTON = { left: "20.259%", top: "77.5%", minWidth: "24.2%", height: "17.9%" };

// A token the insight card can render, as composed by useSpotMarkets: the
// symbol and logo from the buy catalogue, the price from the price feed, the
// 24h change from the market feed. No field is invented here.
export interface InsightToken {
  symbol: string;
  name: string;
  logo: string | null;
  priceUsd: number;
  change24h: number;
}

// The 24h move as the chip prints it: "+12.8%", "-4.2%". Display formatting
// only, so no price arithmetic happens here.
function signedChange(change: number): string {
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
}

// The same figure without its sign, for a sentence that carries the direction
// in its own words.
function changeMagnitude(change: number): string {
  return `${Math.abs(change).toFixed(1)}%`;
}

// Which sentence the bubble reads. A change we did not receive gets its own
// wording rather than being rounded down into a confident "is flat".
function moveKey(
  change: number
): "tokenMoveUnknown" | "tokenMoveFlat" | "tokenMoveUp" | "tokenMoveDown" {
  if (!Number.isFinite(change)) return "tokenMoveUnknown";
  if (change === 0) return "tokenMoveFlat";
  return change > 0 ? "tokenMoveUp" : "tokenMoveDown";
}

// The token-insight card (Figma node 1:4060), 339x168. The artwork supplies the
// gradient and the decoration; the chip, the sentence and the buy pill are DOM.
function TokenInsightCard({ token, onBuy }: { token: InsightToken; onBuy?: () => void }) {
  const t = useTranslations("markets");
  const tSpot = useTranslations("spot");

  const hasChange = Number.isFinite(token.change24h);
  const hasPrice = Number.isFinite(token.priceUsd) && token.priceUsd > 0;
  const up = hasChange && token.change24h >= 0;

  return (
    // The comp's 339x168 artboard, scaled as one piece to the slide it gets, so
    // the chip, the bubble and the button keep the comp's proportions and type
    // size on a wide phone rather than stretching around 8px text.
    <Artboard width={339} height={168} className="rounded-[16.272px]">
      {/* Figma export, used for the gradient and the decoration only. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/trade/token-moves/card-bg.svg" alt="" className="block h-full w-full" />

      <div
        className="absolute flex items-center rounded-[8.68px] bg-white p-[7px] shadow-[0_2px_6px_rgba(120,90,0,0.1)]"
        style={{ ...CHIP, transform: "rotate(-3.07027deg)", transformOrigin: "0 0" }}
      >
        <span className="size-[30px] shrink-0 overflow-hidden rounded-full">
          <AssetIcon
            sym={token.symbol}
            bg={tokenBg(token.symbol)}
            logo={token.logo}
            fallback="gradient"
            size={30}
          />
        </span>
        <span className="ml-[5px] min-w-0 leading-tight">
          <span className="block truncate text-[10px] font-semibold text-black">
            {token.symbol}
          </span>
          <span className="flex items-center gap-[3.7px] text-[10px] font-medium">
            {/* An absent price prints a dash. It never falls back to a number. */}
            <span className="text-[#9b9b9b]">{hasPrice ? formatUsd(token.priceUsd) : "—"}</span>
            {hasChange ? (
              <span className={up ? "text-[#5aad00]" : "text-[#f04438]"}>
                {signedChange(token.change24h)}
              </span>
            ) : null}
          </span>
        </span>
        <span className="ml-auto pl-[4px] text-[13px]">🔥</span>
      </div>

      <div
        className="absolute overflow-hidden rounded-[10.12px] bg-white px-[10px] py-[9px] shadow-[0_2px_8px_rgba(120,90,0,0.08)]"
        style={BUBBLE}
      >
        <p className="text-[10.5px] leading-[1.3] font-medium text-[#656464]">
          {t.rich(moveKey(token.change24h), {
            symbol: token.symbol,
            change: hasChange ? changeMagnitude(token.change24h) : "",
            b: (chunks) => <span className="font-semibold text-[#060606]">{chunks}</span>,
          })}
        </p>
      </div>

      <button
        type="button"
        onClick={onBuy}
        className="absolute z-10 flex w-max cursor-pointer items-center justify-center gap-[2.7px] rounded-[15px] border-[1.4px] border-[#ffd52d] bg-black px-[10px]"
        style={BUTTON}
      >
        <span className="text-[10px] font-semibold whitespace-nowrap text-white">
          {tSpot("ctaBuy", { symbol: token.symbol })}
        </span>
      </button>
    </Artboard>
  );
}

// The crossfade between two tokens. Declared here rather than in globals.css so
// the card carries its own motion, and switched off outright for a reader who
// asked for less of it.
const FADE_CSS = `
.ws-token-move-fade { animation: ws-token-move-fade 320ms ease-out; }
@keyframes ws-token-move-fade { from { opacity: 0 } to { opacity: 1 } }
@media (prefers-reduced-motion: reduce) { .ws-token-move-fade { animation: none } }
`;

// The "Stay Ahead of Token Moves" section (Figma node 1:4053): a header over a
// two-card horizontal scroll. The first card cycles through the five tokens the
// caller hands us, ten seconds each, forever; the second shows the token after
// it, so a swipe is a step through the movers rather than the same coin twice.
export function TokenMoves({
  tokens,
  onBuyToken,
}: {
  tokens: InsightToken[];
  onBuyToken?: (symbol: string) => void;
}) {
  const t = useTranslations("markets");

  // WCAG 2.2.2 (Pause, Stop, Hide): a pointer resting on the card or a keyboard
  // landing inside it holds the rotation still, so nobody loses a sentence
  // half-read. Pointer events rather than mouse events, so a tap holds it too.
  const [held, setHeld] = useState(false);

  const cycle = useMemo(() => tokens.slice(0, MAX_TOKENS), [tokens]);
  const index = useRotatingIndex(cycle.length, { intervalMs: ROTATE_MS, paused: held });
  const current = cycle.length > 0 ? cycle[index] : null;
  const next = cycle.length > 1 ? cycle[(index + 1) % cycle.length] : null;

  return (
    <div>
      <style>{FADE_CSS}</style>

      <Link href="/spot" className="mb-3 inline-flex items-end gap-[3px]">
        <span className="ws-display text-[18px] leading-[1.2] tracking-[-0.36px] text-white">
          {t("tokenMovesTitle")}
        </span>
        <svg viewBox="0 0 20 20" aria-hidden className="mb-[1px] h-5 w-5 shrink-0" fill="none">
          <path
            d="M7.5 4l6 6-6 6"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>

      <div className="ws-no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto">
        {/* No token, no card. An empty or not-yet-loaded feed shows nothing
            rather than the last token or a placeholder figure. */}
        {current ? (
          <section
            aria-label={t("tokenMovesRegion")}
            // Silent while it turns itself, per the APG carousel pattern:
            // announcing a new token every ten seconds talks over the reader.
            // Held still, the card is being read, so changes get announced.
            aria-live={held ? "polite" : "off"}
            aria-atomic="true"
            className="w-[88%] shrink-0 snap-start"
            onPointerEnter={() => setHeld(true)}
            onPointerLeave={() => setHeld(false)}
            onFocus={() => setHeld(true)}
            onBlur={() => setHeld(false)}
          >
            <div key={current.symbol} className="ws-token-move-fade">
              <TokenInsightCard token={current} onBuy={() => onBuyToken?.(current.symbol)} />
            </div>
          </section>
        ) : null}
        {next ? (
          <div className="w-[88%] shrink-0 snap-start">
            <div key={next.symbol} className="ws-token-move-fade">
              <TokenInsightCard token={next} onBuy={() => onBuyToken?.(next.symbol)} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
