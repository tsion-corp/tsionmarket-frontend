import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The notification bell mounts in the app shell, so these two hooks are in the
// first-load payload of every route. Importing the zod-backed parsers put zod
// and every schema into that payload: /meme went 1660 → 1677 kB and /casino
// 1885 → 1888 kB, and CI's budget refused the build.
//
// The parsers run when a notification request comes back, never on first
// paint, so they are loaded on demand. lib/meme/api.ts is held to the same
// rule for the same reason (lib/meme/api.first-load.test.ts).
const inbox = readFileSync(resolve(__dirname, "use-notification-inbox.ts"), "utf8");
const push = readFileSync(resolve(__dirname, "use-push-subscription.ts"), "utf8");

const STATIC_SCHEMA = /^import\s+(?!type\b)[^"]*from\s+"@\/lib\/notifications\/schema";?$/m;
const STATIC_ZOD = /^import\s+[^"]*from\s+"zod";?$/m;
// The dynamic call, whether it is awaited at the call site or returned as a
// promise. A static import reads "from \"...\"" and cannot match this.
const ON_DEMAND = /import\("@\/lib\/notifications\/schema"\)/;

describe("the notification hooks' first-load weight", () => {
  it.each([
    ["use-notification-inbox.ts", inbox],
    ["use-push-subscription.ts", push],
  ])("%s does not statically import the parsers or zod", (_name, source) => {
    expect(source).not.toMatch(STATIC_SCHEMA);
    expect(source).not.toMatch(STATIC_ZOD);
  });

  it.each([
    ["use-notification-inbox.ts", inbox],
    ["use-push-subscription.ts", push],
  ])("%s loads the parsers on demand", (_name, source) => {
    expect(source).toMatch(ON_DEMAND);
  });
});
