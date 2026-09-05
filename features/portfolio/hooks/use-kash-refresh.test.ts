import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every action that changes a balance must refresh the reads.
 *
 * This is asserted structurally rather than by rendering, because the failure
 * it guards is a silent one: a new action lands, nobody wires invalidation,
 * and the card shows a stale balance until the next poll. That reads as "the
 * app is broken" and is invisible in a component test that only checks the
 * request went out.
 */
const HOOKS = readFileSync(join(process.cwd(), "features/portfolio/hooks/use-kash.ts"), "utf8");
const SEND = readFileSync(
  join(process.cwd(), "features/portfolio/components/kash-send-modal.tsx"),
  "utf8"
);

describe("balance-changing actions refresh on success", () => {
  it.each(["useKashPurchase", "useKashConversion", "useKashSubscribe", "useKashClaim"])(
    "%s invalidates when it resolves",
    (hook) => {
      const body = HOOKS.slice(HOOKS.indexOf(`export function ${hook}(`));
      const end = body.indexOf("\nexport function ");
      expect(end === -1 ? body : body.slice(0, end)).toContain("onSuccess: invalidate");
    }
  );

  it("the KSH send refreshes too, though it is not a mutation", () => {
    // A send is a raw on-chain transfer, so nothing invalidates on its behalf
    // and the card kept showing the pre-send balance.
    expect(SEND).toContain("invalidateKash()");
  });
});

describe("refresh survives chain propagation", () => {
  it("re-checks after the write, not only at the moment it resolves", () => {
    // A mint confirms while the RPC replica the engine reads is still a block
    // behind, so a single immediate refetch returns the pre-transaction
    // balance and a successful claim looks like it did nothing.
    expect(HOOKS).toContain("CHAIN_SETTLE_RETRIES_MS");
    const delays = HOOKS.match(/CHAIN_SETTLE_RETRIES_MS = \[([^\]]+)\]/)?.[1] ?? "";
    expect(delays.split(",").length).toBeGreaterThanOrEqual(2);
  });

  // The poll rate, the background pause and the catch-up on return are
  // asserted behaviourally in use-kash-poll.test.tsx. They used to be grepped
  // out of this file's source text, which could not tell 10s from 10 minutes.
});
