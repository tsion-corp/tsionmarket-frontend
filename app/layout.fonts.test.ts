import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Google Fonts is a network call in the middle of `next build`, and Turbopack
// falls over when the answer comes back in a shape it does not expect
// (vercel/next.js#99114): the same commit built green on its PR and red on
// main. Every face the app uses is a file in the repo, so the build is
// hermetic and the fonts are the ones we shipped.
describe("app fonts", () => {
  const layout = readFileSync(join(__dirname, "layout.tsx"), "utf8");

  it("loads no font from Google at build time", () => {
    expect(layout).not.toContain("next/font/google");
  });

  it("points every local face at a file in app/fonts", () => {
    const files = [...layout.matchAll(/src:\s*"\.\/fonts\/([^"]+)"/g)].map((m) => m[1]);
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const file of files) {
      expect(existsSync(join(__dirname, "fonts", file)), file).toBe(true);
    }
  });
});
