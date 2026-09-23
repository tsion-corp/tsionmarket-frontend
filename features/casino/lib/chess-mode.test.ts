import { describe, expect, it } from "vitest";
import { chessModeForRoute } from "@/features/casino/lib/chess-mode";

describe("chessModeForRoute", () => {
  it("names the modes that are a page of their own", () => {
    expect(chessModeForRoute("/casino/chess/puzzles", "")).toBe("puzzles");
    expect(chessModeForRoute("/casino/chess/learn", "")).toBe("learn");
    expect(chessModeForRoute("/casino/chess/watch", "")).toBe("watch");
    // A page inside a mode is still that mode.
    expect(chessModeForRoute("/casino/chess/learn/practice", "")).toBe("learn");
  });

  it("reads the three lobby setups the vendored lobby uses", () => {
    expect(chessModeForRoute("/casino/chess", "?setup=friend")).toBe("challenge_friend");
    expect(chessModeForRoute("/casino/chess", "?setup=ai")).toBe("vs_computer");
    expect(chessModeForRoute("/casino/chess", "?setup=hook")).toBe("play_online");
  });

  it("reports nothing for the lobby with no mode chosen yet", () => {
    expect(chessModeForRoute("/casino/chess", "")).toBeNull();
    expect(chessModeForRoute("/casino/chess", "?tab=lobby")).toBeNull();
    // A setup the lobby does not use is not a mode either.
    expect(chessModeForRoute("/casino/chess", "?setup=nonsense")).toBeNull();
  });

  it("reports nothing for a page that is not a way in", () => {
    // A game in progress, the history and the leaderboards are not a choice
    // of mode, and counting them as one would invent picks nobody made.
    expect(chessModeForRoute("/casino/chess/play", "")).toBeNull();
    expect(chessModeForRoute("/casino/chess/history", "")).toBeNull();
    expect(chessModeForRoute("/casino/chess/leaderboard", "")).toBeNull();
    // `setup` only means something on the lobby itself.
    expect(chessModeForRoute("/casino/chess/play", "?setup=ai")).toBeNull();
  });

  it("ignores a trailing slash", () => {
    expect(chessModeForRoute("/casino/chess/puzzles/", "")).toBe("puzzles");
  });
});
