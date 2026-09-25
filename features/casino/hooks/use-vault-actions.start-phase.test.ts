import { describe, expect, it } from "vitest";

// The start button's phases. They exist because "sending" and "confirming" ran
// as one boolean, and the wait between them is long enough that a button which
// never changes reads as a broken one.
import type { VaultStartPhase } from "./use-vault-actions";

// A compile-time list: adding a phase without giving it a label fails here.
const PHASES: VaultStartPhase[] = ["idle", "sending", "confirming"];

describe("start phase labels", () => {
  it("has a label in every locale for every phase that shows one", async () => {
    const locales = ["en", "de", "es", "fr", "pt"] as const;
    const keyFor: Partial<Record<VaultStartPhase, string>> = {
      sending: "startSending",
      confirming: "startConfirming",
    };

    for (const locale of locales) {
      const messages = (await import(`@/messages/${locale}.json`)).default as Record<
        string,
        Record<string, Record<string, string>>
      >;
      const strings = messages.casino.lastStanding;
      for (const phase of PHASES) {
        const key = keyFor[phase];
        if (!key) continue;
        expect(strings[key], `${locale}.casino.lastStanding.${key}`).toBeTruthy();
      }
    }
  });
});
