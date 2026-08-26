import { describe, expect, it } from "vitest";
import {
  broadcastDescription,
  broadcastTitle,
  matchDeepLink,
  matchWatchUrl,
  sharedSurfaceLabel,
  shouldWarnOnLeave,
} from "./broadcast";

describe("matchWatchUrl", () => {
  it("builds a spectator link from an origin and a match id", () => {
    expect(matchWatchUrl("https://ark.example", "m-1")).toBe(
      "https://ark.example/casino/chess/watch?match=m-1"
    );
  });

  it("does not double the slash when the origin carries a trailing one", () => {
    expect(matchWatchUrl("https://ark.example/", "m-1")).toBe(
      "https://ark.example/casino/chess/watch?match=m-1"
    );
  });

  it("escapes a match id that would otherwise break the query", () => {
    expect(matchWatchUrl("https://ark.example", "a b&c")).toBe(
      "https://ark.example/casino/chess/watch?match=a%20b%26c"
    );
  });
});

describe("broadcastTitle", () => {
  it("names both players", () => {
    expect(broadcastTitle("Ada", "Bo")).toBe("Chess: Ada vs Bo");
  });

  it("stays inside the 200 character cap the service enforces", () => {
    const title = broadcastTitle("A".repeat(150), "B".repeat(150));
    expect(title.length).toBe(200);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("broadcastDescription", () => {
  it("carries the match link, which is the only route back where deepLink is not supported", () => {
    expect(broadcastDescription("https://ark.example", "m-2")).toContain(
      "https://ark.example/casino/chess/watch?match=m-2"
    );
  });
});

describe("matchDeepLink", () => {
  it("names chess in the ref so Market Square knows which game to open", () => {
    expect(matchDeepLink("m-3")).toEqual({ kind: "game", ref: "chess:m-3" });
  });
});

describe("shouldWarnOnLeave (end-failed)", () => {
  it("does not warn once publishing has stopped, even if the end was not confirmed", () => {
    expect(shouldWarnOnLeave("end-failed")).toBe(false);
  });
});

describe("sharedSurfaceLabel", () => {
  it("names each surface the browser can report", () => {
    expect(sharedSurfaceLabel("browser")).toBe("a browser tab");
    expect(sharedSurfaceLabel("window")).toBe("one window");
    expect(sharedSurfaceLabel("monitor")).toBe("your entire screen");
  });

  it("returns null when the browser reports nothing", () => {
    expect(sharedSurfaceLabel(undefined)).toBeNull();
  });
});

describe("shouldWarnOnLeave", () => {
  it("warns while a broadcast is running or half-running", () => {
    expect(shouldWarnOnLeave("starting")).toBe(true);
    expect(shouldWarnOnLeave("live")).toBe(true);
    expect(shouldWarnOnLeave("share-stopped")).toBe(true);
  });

  it("stays quiet once nothing is being published", () => {
    expect(shouldWarnOnLeave("idle")).toBe(false);
    expect(shouldWarnOnLeave("ended")).toBe(false);
    expect(shouldWarnOnLeave("error")).toBe(false);
    expect(shouldWarnOnLeave("not-creator")).toBe(false);
  });
});
