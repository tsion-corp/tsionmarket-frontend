import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// No screen reads useUserBalance yet, so it is in nobody's first-load payload
// today and this budget is not currently being spent. The rule is kept anyway,
// because a balance is a header and app-shell thing and the first consumer to
// mount it there would put it in the first-load payload of every route — which
// is exactly what the notification bell did, taking zod and every schema with
// it until CI's budget refused the build (hooks/notifications.first-load.test.ts,
// lib/meme/api.first-load.test.ts). The parser runs when a response comes back,
// never on first paint. This test is what makes that a rule rather than a habit.
const source = readFileSync(resolve(__dirname, "use-user-balance.ts"), "utf8");

const STATIC_SCHEMA = /^import\s+(?!type\b)[^"]*from\s+"@\/lib\/balance\/schema";?$/m;
const STATIC_ZOD = /^import\s+[^"]*from\s+"zod";?$/m;
// The dynamic call, whether it is awaited at the call site or returned as a
// promise. A static import reads "from \"...\"" and cannot match this.
const ON_DEMAND = /import\("@\/lib\/balance\/schema"\)/;

describe("the balance hook's first-load weight", () => {
  it("does not statically import the parser or zod", () => {
    expect(source).not.toMatch(STATIC_SCHEMA);
    expect(source).not.toMatch(STATIC_ZOD);
  });

  it("loads the parser on demand", () => {
    expect(source).toMatch(ON_DEMAND);
  });
});
