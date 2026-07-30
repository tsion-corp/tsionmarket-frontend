import { it, expect } from "vitest";
import { PIECE_ART } from "@/components/dashboard/casino/chess/piece-art";

// The pieces are hand-drawn paths, so a typo in a coordinate is easy to make
// and hard to see: it usually shows up as one piece sitting slightly off its
// square rather than as anything obviously broken. These checks pin the shared
// geometry that keeps a rank looking level.

// Walks an SVG path and returns the bounding box of the points it visits.
// Curve control points are included, so the box is a slight over-estimate,
// which is the safe direction for a "stays inside the square" check.
function bbox(d: string) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+/g) ?? [];
  let x = 0;
  let y = 0;
  let cmd = "";
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const see = (px: number, py: number) => {
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
  };
  let i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const t = tokens[i];
    if (/[a-zA-Z]/.test(t)) {
      cmd = t;
      i++;
      if (cmd === "z" || cmd === "Z") continue;
    }
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toLowerCase()) {
      case "m":
      case "l": {
        const dx = num();
        const dy = num();
        x = rel ? x + dx : dx;
        y = rel ? y + dy : dy;
        see(x, y);
        break;
      }
      case "h": {
        const dx = num();
        x = rel ? x + dx : dx;
        see(x, y);
        break;
      }
      case "v": {
        const dy = num();
        y = rel ? y + dy : dy;
        see(x, y);
        break;
      }
      case "c": {
        for (let k = 0; k < 3; k++) {
          const dx = num();
          const dy = num();
          const px = rel ? x + dx : dx;
          const py = rel ? y + dy : dy;
          see(px, py);
          if (k === 2) {
            x = px;
            y = py;
          }
        }
        break;
      }
      case "a": {
        num();
        num();
        num();
        num();
        num();
        const dx = num();
        const dy = num();
        x = rel ? x + dx : dx;
        y = rel ? y + dy : dy;
        see(x, y);
        break;
      }
      default:
        i++;
    }
  }
  return { minX, minY, maxX, maxY };
}

it("every piece is well formed and sits inside the square, standing on the base", () => {
  for (const [type, art] of Object.entries(PIECE_ART)) {
    const paths = [...art.body, ...(art.detail ?? [])];
    const boxes = paths.map(bbox);

    for (const [i, box] of boxes.entries()) {
      expect(Number.isFinite(box.minX), `${type} path ${i} parsed`).toBe(true);
      // A stroke of 1.4 is centred on the edge, so leave room for half of it.
      expect(box.minX, `${type} path ${i} left edge`).toBeGreaterThanOrEqual(1);
      expect(box.maxX, `${type} path ${i} right edge`).toBeLessThanOrEqual(44);
      expect(box.minY, `${type} path ${i} top edge`).toBeGreaterThanOrEqual(1);
      expect(box.maxY, `${type} path ${i} bottom edge`).toBeLessThanOrEqual(44);
    }

    const whole = {
      minX: Math.min(...boxes.map((b) => b.minX)),
      maxX: Math.max(...boxes.map((b) => b.maxX)),
      minY: Math.min(...boxes.map((b) => b.minY)),
      maxY: Math.max(...boxes.map((b) => b.maxY)),
    };
    // Every piece stands on the shared base, so they all bottom out together.
    expect(whole.maxY, `${type} bottom`).toBeCloseTo(38.9, 1);
    // And each is roughly centred on the file.
    expect((whole.minX + whole.maxX) / 2, `${type} centre`).toBeCloseTo(22.5, 0);
  }
});
