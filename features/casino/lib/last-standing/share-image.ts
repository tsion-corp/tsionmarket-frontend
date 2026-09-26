// The downloadable share card: a square image built around the game's QR.
//
// A bare code is fine on a phone held up for two seconds and useless
// everywhere else — printed, on a slide, or in a group chat, nobody can tell
// what they are pointing at. The card carries the name, the game, the stake
// and the instruction, so the image explains itself wherever it ends up.

export const SHARE_IMAGE_SIZE = 1200;

const INK = "#0b0a08";
const GOLD = "#ffe178";
const WHITE = "#ffffff";

// The code's white panel. A QR needs its quiet zone, so the panel is drawn
// larger than the code and the code is centred inside it. The panel shrinks
// to make room for a game that carries a name and a description, down to
// PANEL_MIN; the code keeps its share of whatever the panel ends up.
const PANEL = 620;
const PANEL_MIN = 460;
const CODE_SHARE = 500 / 620;

// The scan line sits here whatever is above it, so every card has the same
// footer however much the middle carried.
const SCAN_BASELINE = 1136;
const PANEL_TO_TEXT = 74;
const STAKE_HEIGHT = 52;
const SIDE_MARGIN = 96;

const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export interface ShareImageCopy {
  /** "Arkade · Winner takes all" */
  eyebrow: string;
  /** "The Last Man" */
  title: string;
  /**
   * The line naming this game: the starter's own name for it, or "Game #153"
   * when they did not give it one.
   */
  game: string;
  /** The starter's description, when the game has one. */
  description?: string;
  /** "$0.38 to join", or empty when the stake is not known yet. */
  stake: string;
  /** "Scan to play" */
  scan: string;
}

// Canvas has no letter-spacing in every engine we target, so the eyebrow is
// drawn a character at a time. Returns the width so it can be centred.
function spacedWidth(ctx: CanvasRenderingContext2D, text: string, spacing: number): number {
  let width = 0;
  for (const char of text) width += ctx.measureText(char).width + spacing;
  return width - spacing;
}

function drawSpaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  spacing: number
): void {
  let x = centerX - spacedWidth(ctx, text, spacing) / 2;
  for (const char of text) {
    ctx.fillText(char, x, y);
    x += ctx.measureText(char).width + spacing;
  }
}

/** A text measurer. Narrowed so the helpers below are testable off a canvas. */
export interface TextMetricsSource {
  measureText(text: string): { width: number };
  font: string;
}

/**
 * The largest size at or under `startPx` that fits `text` in `maxWidth`, down
 * to `minPx`. A long name shrinks rather than running off the card.
 */
export function fitFontSize(
  ctx: TextMetricsSource,
  text: string,
  maxWidth: number,
  startPx: number,
  minPx: number,
  weight = 700
): number {
  for (let px = startPx; px > minPx; px -= 2) {
    ctx.font = `${weight} ${px}px ${SANS}`;
    if (ctx.measureText(text).width <= maxWidth) return px;
  }
  return minPx;
}

/**
 * `text` broken into at most `maxLines` lines that fit `maxWidth`, the last
 * one ellipsised if there is more. The font must already be set.
 *
 * A word longer than the line is left to overflow rather than broken: it is
 * one pathological token, and hyphenating it mid-word reads worse than a
 * slightly wide line.
 */
export function wrapLines(
  ctx: TextMetricsSource,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = "";
  for (const wordRaw of words) {
    const word = wordRaw;
    const next = line === "" ? word : `${line} ${word}`;
    if (ctx.measureText(next).width <= maxWidth || line === "") {
      line = next;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line !== "") lines.push(line);

  const used = lines.join(" ").split(/\s+/).filter(Boolean).length;
  if (used < words.length && lines.length > 0) {
    let last = lines[lines.length - 1];
    while (last.length > 1 && ctx.measureText(`${last}\u2026`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[lines.length - 1] = `${last.trimEnd()}\u2026`;
  }
  return lines;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  // Not every engine ships roundRect; the manual path works everywhere and is
  // the same shape.
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Paints the card. `code` is the rendered QR, already loaded.
 *
 * The panel gives ground to whatever the middle has to carry, so a game with a
 * long name and a description still lands its scan line where every other card
 * lands it.
 */
export function drawShareImage(
  ctx: CanvasRenderingContext2D,
  code: CanvasImageSource,
  copy: ShareImageCopy
): void {
  const S = SHARE_IMAGE_SIZE;
  const mid = S / 2;
  const maxWidth = S - SIDE_MARGIN * 2;

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, S, S);
  const lamp = ctx.createRadialGradient(mid, 210, 40, mid, 210, 620);
  lamp.addColorStop(0, "rgba(255,225,120,0.20)");
  lamp.addColorStop(1, "rgba(255,225,120,0)");
  ctx.fillStyle = lamp;
  ctx.fillRect(0, 0, S, S);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "rgba(255,225,120,0.75)";
  ctx.font = `600 26px ${SANS}`;
  ctx.textAlign = "left";
  drawSpaced(ctx, copy.eyebrow.toUpperCase(), mid, 132, 5);
  ctx.textAlign = "center";

  ctx.fillStyle = GOLD;
  ctx.font = `700 82px ${SANS}`;
  ctx.fillText(copy.title, mid, 226);

  // The game's own name. Shrinks before it would run off the card, and wraps
  // to a second line before it would shrink past reading size.
  const gamePx = fitFontSize(ctx, copy.game, maxWidth, 44, 34);
  ctx.font = `600 ${gamePx}px ${SANS}`;
  const gameLines = wrapLines(ctx, copy.game, maxWidth, 2);
  ctx.fillStyle = WHITE;
  let y = 292;
  for (const line of gameLines) {
    ctx.fillText(line, mid, y);
    y += gamePx + 10;
  }

  ctx.font = `400 30px ${SANS}`;
  const descriptionLines = copy.description ? wrapLines(ctx, copy.description, maxWidth, 2) : [];
  if (descriptionLines.length > 0) {
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    y += 6;
    for (const line of descriptionLines) {
      ctx.fillText(line, mid, y);
      y += 40;
    }
  }

  // What is left between the copy and the footer, which is fixed.
  const panelTop = y + 24;
  const footer = PANEL_TO_TEXT + (copy.stake ? STAKE_HEIGHT : 0);
  const panel = Math.max(PANEL_MIN, Math.min(PANEL, SCAN_BASELINE - panelTop - footer));
  const codeSize = panel * CODE_SHARE;

  ctx.fillStyle = WHITE;
  roundRect(ctx, mid - panel / 2, panelTop, panel, panel, 36);
  ctx.fill();
  ctx.drawImage(code, mid - codeSize / 2, panelTop + (panel - codeSize) / 2, codeSize, codeSize);

  let footerY = panelTop + panel + PANEL_TO_TEXT;
  if (copy.stake) {
    ctx.fillStyle = WHITE;
    ctx.font = `700 46px ${SANS}`;
    ctx.fillText(copy.stake, mid, footerY);
    footerY += STAKE_HEIGHT;
  }

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `400 30px ${SANS}`;
  ctx.fillText(copy.scan, mid, footerY);
}
