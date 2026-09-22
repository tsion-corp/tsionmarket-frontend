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
// larger than the code and the code is centred inside it.
const PANEL = 620;
const CODE = 500;

const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export interface ShareImageCopy {
  /** "Arkade · Winner takes all" */
  eyebrow: string;
  /** "The Last Man" */
  title: string;
  /** "Game #153" */
  game: string;
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
 * Everything is laid out from the canvas centre so the card stays balanced
 * whatever the strings turn out to be in a given language.
 */
export function drawShareImage(
  ctx: CanvasRenderingContext2D,
  code: CanvasImageSource,
  copy: ShareImageCopy
): void {
  const S = SHARE_IMAGE_SIZE;
  const mid = S / 2;

  // Ground, with a warm lamp behind the title so the card is not a flat
  // rectangle of black.
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

  ctx.fillStyle = WHITE;
  ctx.font = `600 44px ${SANS}`;
  ctx.fillText(copy.game, mid, 292);

  // The code, on white, with its quiet zone intact.
  const panelX = mid - PANEL / 2;
  const panelY = 340;
  ctx.fillStyle = WHITE;
  roundRect(ctx, panelX, panelY, PANEL, PANEL, 36);
  ctx.fill();
  ctx.drawImage(code, mid - CODE / 2, panelY + (PANEL - CODE) / 2, CODE, CODE);

  let y = panelY + PANEL + 74;

  if (copy.stake) {
    ctx.fillStyle = WHITE;
    ctx.font = `700 46px ${SANS}`;
    ctx.fillText(copy.stake, mid, y);
    y += 52;
  }

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `400 30px ${SANS}`;
  ctx.fillText(copy.scan, mid, y);
}
