import { describe, expect, it } from "vitest";
import { CASINO_GAMES } from "@/features/casino/lib/games";
import en from "@/messages/en.json";
import de from "@/messages/de.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";
import pt from "@/messages/pt.json";

const CATALOGUES = { en, de, es, fr, pt } as const;

// Arkjet and Pilot Chicken reached staging showing "casino.hub.games.arkjet.name"
// on the tile: the games were registered and the copy never was, and the hub
// renders the key when the catalogue has no entry. This is the check that a
// game cannot ship half-registered again.
describe("every hub game has copy", () => {
  for (const [locale, messages] of Object.entries(CATALOGUES)) {
    it(`names every game in ${locale}`, () => {
      const games = (messages as { casino: { hub: { games: Record<string, unknown> } } }).casino.hub
        .games;
      const missing = CASINO_GAMES.filter((g) => {
        const entry = games[g.id] as { name?: string } | undefined;
        return !entry?.name;
      }).map((g) => g.id);
      expect(missing).toEqual([]);
    });
  }
});
