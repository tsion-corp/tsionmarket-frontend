// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { markPrivate, privateGameIds } from "./visibility";

// What remains of the pre-upgrade workaround: the starter's own record of a
// game they opened privately.
//
// The lobbyGames and canStartPublic cases that used to live here are gone with
// the functions. They enforced "one public game at a time", a rule that only
// existed because privacy was unenforceable: every client had to compute the
// same "lowest id wins" answer for a private game to be hidden from anyone but
// its creator. The v5.1 upgrade puts isPrivate on every row, so that rule was
// hiding genuinely public games for nothing. Its replacement is publicGames in
// lib/vault-game.ts, tested beside the flag it reads.

beforeEach(() => window.localStorage.clear());

describe("the starter's own record", () => {
  it("remembers a game this browser opened privately", () => {
    markPrivate(7);
    expect(privateGameIds()).toContain(7);
  });

  it("starts empty", () => {
    expect(privateGameIds()).toEqual([]);
  });

  it("does not record the same game twice", () => {
    markPrivate(7);
    markPrivate(7);
    expect(privateGameIds().filter((id) => id === 7)).toHaveLength(1);
  });

  it("keeps several", () => {
    markPrivate(1);
    markPrivate(2);
    expect(privateGameIds().sort()).toEqual([1, 2]);
  });

  // Private browsing, blocked storage, or a value somebody else wrote. A
  // reader who cannot remember their own private games still gets a lobby:
  // the service's own isPrivate is the real filter, and this only ever covers
  // the seconds before it catches up.
  it("survives a corrupt stored value", () => {
    window.localStorage.setItem("wsws.last-man.private.v1", "{not json");
    expect(privateGameIds()).toEqual([]);
  });

  it("ignores stored entries that are not game ids", () => {
    window.localStorage.setItem("wsws.last-man.private.v1", '[1,"two",null,3]');
    expect(privateGameIds()).toEqual([1, 3]);
  });
});
