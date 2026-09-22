import { describe, expect, it } from "vitest";
import { canStartPublic, lobbyGames } from "@/features/casino/lib/last-standing/visibility";

const g = (gameId: number) => ({ gameId });

describe("lobbyGames", () => {
  it("lists nothing when no game is running", () => {
    expect(lobbyGames([], [])).toEqual([]);
  });

  // The lobby holds one slot. Without this cap a private game would be hidden
  // from its starter and listed for everyone else, which is the opposite of
  // private.
  it("lists one game even when several are running", () => {
    expect(lobbyGames([g(150), g(148), g(149)], [])).toEqual([g(148)]);
  });

  it("gives the slot to the earliest game still running", () => {
    expect(lobbyGames([g(210), g(147), g(300)], [])).toEqual([g(147)]);
  });

  it("hides a game this browser started privately", () => {
    expect(lobbyGames([g(147), g(148)], [147])).toEqual([g(148)]);
  });

  it("lists nothing when every running game is private", () => {
    expect(lobbyGames([g(147), g(148)], [147, 148])).toEqual([]);
  });

  // The event flow: the public game is opened first, so every private game
  // made afterwards has a higher id and never takes the slot.
  it("keeps the public game listed while private games run alongside it", () => {
    expect(lobbyGames([g(100), g(101), g(102), g(103)], [101, 102, 103])).toEqual([g(100)]);
  });
});

describe("canStartPublic", () => {
  it("allows the first public game", () => {
    expect(canStartPublic([], [])).toBe(true);
  });

  it("refuses a second public game while one holds the slot", () => {
    expect(canStartPublic([g(147)], [])).toBe(false);
  });

  // A private game never competes for the slot, so the lobby is still free.
  it("allows a public game while only private games are running", () => {
    expect(canStartPublic([g(147), g(148)], [147, 148])).toBe(true);
  });
});
