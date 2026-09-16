import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("chess deployment assets", () => {
  it("keeps development fast and verifies copied Lichess assets for production", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts["chess:assets:verify"]).toBe("node scripts/verify-chess-assets.mjs");
    expect(pkg.scripts.dev).toBe("next dev");
    expect(pkg.scripts.build).toMatch(/^pnpm chess:assets:verify &&/u);
  });
});
