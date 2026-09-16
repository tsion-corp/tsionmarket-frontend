import { formatUsd } from "@/lib/trade/math";
import type { HlClosedPositionView } from "@/features/trade/lib/hyperliquid-types";

// The shareable PnL card for a closed position: a pure model (numbers and
// labels, testable) plus a canvas painter (drawing only, no data logic).
// Everything is computed from the closed position row alone, so the card can
// be produced for any history entry, not just a trade closed this session.

export const PNL_CARD_WIDTH = 1200;
export const PNL_CARD_HEIGHT = 675;

// Matches --color-up/--color-down/--color-accent in app/globals.css. Kept as
// literals because canvas cannot read CSS custom properties from a detached
// context, and the card must render identically wherever it is generated.
const UP = "#7ce7b0";
const DOWN = "#f6a5a5";
const SILVER = "#d4d4d8";
const BG = "#0a0a0a";

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

export interface PnlCardModel {
  symbol: string;
  sideLabel: "LONG" | "SHORT";
  isWin: boolean;
  leverageLabel: string;
  roiLabel: string;
  pnlLabel: string;
  entryLabel: string;
  closeLabel: string;
  heldLabel: string;
  closedAtLabel: string;
}

// Coarse duration, same spirit as the history row: "how long", not a stopwatch.
function heldLabel(openedAt: string, closedAt: string): string {
  const ms = new Date(closedAt).getTime() - new Date(openedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function pnlCardModel(position: HlClosedPositionView): PnlCardModel {
  const pnl = Number(position.realizedPnlUsdc);
  const isWin = pnl >= 0;

  // ROI is against the margin actually committed (notional / leverage) — the
  // number a trader means when they say "up 30%". Display-only math: the
  // authoritative PnL itself comes from the backend as a decimal string.
  const notional = Math.abs(Number(position.entryPrice) * Number(position.size));
  const leverage = position.leverage > 0 ? position.leverage : 1;
  const margin = notional / leverage;
  const roiPct = margin > 0 ? (pnl / margin) * 100 : 0;

  return {
    symbol: position.symbol,
    sideLabel: position.side === "long" ? "LONG" : "SHORT",
    isWin,
    leverageLabel: `${position.leverage}x ${position.marginMode}`,
    roiLabel: `${isWin ? "+" : ""}${roiPct.toFixed(2)}%`,
    pnlLabel: `${isWin ? "+" : ""}${formatUsd(pnl)}`,
    entryLabel: position.entryPrice,
    closeLabel: position.closePrice,
    heldLabel: heldLabel(position.openedAt, position.closedAt),
    closedAtLabel: new Date(position.closedAt).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function drawPnlCard(ctx: CanvasRenderingContext2D, model: PnlCardModel): void {
  const W = PNL_CARD_WIDTH;
  const H = PNL_CARD_HEIGHT;
  const tone = model.isWin ? UP : DOWN;

  // Background: near-black with a soft result-colored glow bleeding in from
  // the top right — monochrome brand, semantic color only where it means
  // something.
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.85, H * 0.1, 0, W * 0.85, H * 0.1, W * 0.75);
  glow.addColorStop(0, `${tone}26`);
  glow.addColorStop(1, `${tone}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Hairline inner border, matching the app's card edges.
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;
  roundedRect(ctx, 1, 1, W - 2, H - 2, 28);
  ctx.stroke();

  // Brand row.
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = SILVER;
  ctx.font = `700 30px ${FONT}`;
  const brand = "MARKET";
  ctx.save();
  // Letter-spaced wordmark, drawn manually — canvas has no letter-spacing.
  let x = 64;
  for (const ch of brand) {
    ctx.fillText(ch, x, 88);
    x += ctx.measureText(ch).width + 6;
  }
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.40)";
  ctx.font = `600 26px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText("PERPS", W - 64, 88);
  ctx.textAlign = "left";

  // Position row: symbol, side pill, leverage.
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `700 52px ${FONT}`;
  ctx.fillText(model.symbol, 64, 192);
  const symbolWidth = ctx.measureText(model.symbol).width;

  const pillX = 64 + symbolWidth + 24;
  ctx.font = `700 26px ${FONT}`;
  const pillTextWidth = ctx.measureText(model.sideLabel).width;
  ctx.fillStyle = `${tone}29`;
  roundedRect(ctx, pillX, 156, pillTextWidth + 36, 44, 10);
  ctx.fill();
  ctx.fillStyle = tone;
  ctx.fillText(model.sideLabel, pillX + 18, 188);

  ctx.fillStyle = "rgba(255,255,255,0.40)";
  ctx.font = `500 28px ${FONT}`;
  ctx.fillText(model.leverageLabel, pillX + pillTextWidth + 36 + 20, 188);

  // The number that IS the card.
  ctx.fillStyle = tone;
  ctx.font = `800 170px ${FONT}`;
  ctx.fillText(model.roiLabel, 58, 400);

  ctx.font = `600 44px ${FONT}`;
  ctx.globalAlpha = 0.85;
  ctx.fillText(model.pnlLabel, 64, 470);
  ctx.globalAlpha = 1;

  // Stat columns: entry / close / held.
  const stats: Array<[string, string]> = [
    ["Entry", model.entryLabel],
    ["Close", model.closeLabel],
    ["Held", model.heldLabel],
  ];
  let colX = 64;
  for (const [label, value] of stats) {
    ctx.fillStyle = "rgba(255,255,255,0.40)";
    ctx.font = `500 24px ${FONT}`;
    ctx.fillText(label, colX, 566);
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = `600 32px ${FONT}`;
    ctx.fillText(value, colX, 606);
    const width = Math.max(ctx.measureText(value).width, ctx.measureText(label).width);
    colX += width + 72;
  }

  // Close timestamp, bottom right.
  ctx.fillStyle = "rgba(255,255,255,0.30)";
  ctx.font = `500 24px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(model.closedAtLabel, W - 64, 606);
  ctx.textAlign = "left";
}

// File name for the exported image, e.g. "market-BTC-pnl.png".
export function pnlCardFileName(model: PnlCardModel): string {
  return `market-${model.symbol.replace(/[^a-zA-Z0-9]/g, "")}-pnl.png`;
}
