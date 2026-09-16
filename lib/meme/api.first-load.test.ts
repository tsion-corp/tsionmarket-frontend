import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The trade client sits in the first-load payload of /meme and /spot, which
// carry a 1650 kB budget (scripts/first-load-budget.json). Its response
// mappers run the route schemas through zod, and a static import put zod and
// every schema into that payload: /meme went 1648 → 1714 kB and failed CI.
// The mappers are loaded when a trade request runs, never on first paint.
//
// The portfolio client (lib/meme/portfolio.ts) is in the first-load payload of
// /portfolio and /dashboard, and the trade hook imports its query keys, so it
// is held to the same rule: it goes through the trade client's request, which
// loads the mappers on demand, and never imports them itself.
const source = readFileSync(resolve(__dirname, "api.ts"), "utf8");
const portfolioSource = readFileSync(resolve(__dirname, "portfolio.ts"), "utf8");

const STATIC_PARSE = /^import\s+\{[^}]*\}\s+from\s+"@\/lib\/meme\/parse";?$/m;
const STATIC_ZOD = /^import\s+[^"]*from\s+"zod";?$/m;
const STATIC_SCHEMAS = /^import\s+(?!type\b)[^"]*from\s+"@\/lib\/api\/schemas\/trade";?$/m;

describe("lib/meme/api.ts first-load weight", () => {
  it("does not statically import the zod-backed response mappers", () => {
    expect(source).not.toMatch(STATIC_PARSE);
    expect(source).not.toMatch(STATIC_ZOD);
    expect(source).not.toMatch(STATIC_SCHEMAS);
  });

  it("loads the mappers on demand", () => {
    expect(source).toMatch(/await import\("@\/lib\/meme\/parse"\)/);
  });
});

describe("lib/meme/portfolio.ts first-load weight", () => {
  it("does not statically import the mappers, zod or the route schemas", () => {
    expect(portfolioSource).not.toMatch(STATIC_PARSE);
    expect(portfolioSource).not.toMatch(/from\s+"@\/lib\/meme\/parse"/);
    expect(portfolioSource).not.toMatch(STATIC_ZOD);
    expect(portfolioSource).not.toMatch(STATIC_SCHEMAS);
  });

  it("reaches the mappers through the trade client's on-demand request", () => {
    expect(portfolioSource).toMatch(
      /import\s+\{[^}]*\btradeRequest\b[^}]*\}\s+from\s+"@\/lib\/meme\/api"/
    );
  });
});
