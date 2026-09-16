import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { chessLobbySource } from "@/app/(session)/casino/chess/page";
import { chessInviteSource } from "@/app/(session)/casino/chess/invite/page";
import {
  chessFrameSourceForAppRoute,
  chessLobbyUrlAfterSetupConsumed,
} from "@/features/casino/components/chess-app/chess-lobby-frame";

describe("chessLobbySource", () => {
  it("uses the shared resolver for normal and funded invite codes", () => {
    expect(chessInviteSource("challenge-id")).toBe("/api/chess/challenge/invite/challenge-id");
    expect(chessInviteSource(["funded-match-id"])).toBe(
      "/api/chess/challenge/invite/funded-match-id"
    );
    expect(chessInviteSource()).toBe("/api/chess/play?setup=friend#game-setup");
  });

  it("opens a shared challenge in the authenticated chess frame", () => {
    expect(chessLobbySource({ challenge: "challenge-id" })).toBe(
      "/api/chess/challenge/challenge-id"
    );
  });

  it("keeps the friend setup route", () => {
    expect(chessLobbySource({ setup: "friend" })).toBe("/api/chess/play?setup=friend#game-setup");
  });

  it("keeps the computer and custom-game setup routes", () => {
    expect(chessLobbySource({ setup: "ai" })).toBe("/api/chess/play?setup=ai#game-setup");
    expect(chessLobbySource({ setup: "hook" })).toBe("/api/chess/play?setup=hook#game-setup");
  });

  it("restores the selected lobby tab on a full refresh", () => {
    expect(chessLobbySource({ tab: "lobby" })).toBe("/api/chess/play?tab=lobby");
    expect(chessLobbySource({ tab: "lobby", setup: "hook" })).toBe(
      "/api/chess/play?tab=lobby&setup=hook#game-setup"
    );
  });

  it("consumes setup navigation state after opening the requested modal", () => {
    expect(
      chessLobbyUrlAfterSetupConsumed(
        new URL("http://localhost:3000/casino/chess?setup=friend#game-setup")
      )
    ).toBe("/casino/chess");
    expect(
      chessLobbyUrlAfterSetupConsumed(
        new URL("http://localhost:3000/casino/chess?setup=ai&mode=casual#game-setup")
      )
    ).toBe("/casino/chess?mode=casual");
    expect(
      chessLobbyUrlAfterSetupConsumed(new URL("http://localhost:3000/casino/chess"))
    ).toBeNull();
  });

  it("can close a consumed setup modal without another route transition", () => {
    expect(chessFrameSourceForAppRoute("/casino/chess")).toBe("/api/chess/play");
  });

  it("keeps tournaments above game actions beside the activity boards", () => {
    const css = readFileSync(resolve("public/chess/lichess/css/lobby.css"), "utf8");

    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 300px));");
    expect(css).toContain("grid-template-rows: repeat(8, 1fr);");
    expect(css).toContain(".lobby__rail {");
    expect(css).toContain('grid-template-areas: "app rail" "about about";');
    expect(css).toContain('grid-template-areas: "app app rail" "about about about";');
    expect(css).toMatch(
      /\.lobby-activity:nth-child\(3\)\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*width:\s*min\(300px, calc\(50% - 0\.35rem\)\);[^}]*justify-self:\s*center;/s
    );
    expect(css).toMatch(
      /@media \(max-width: 620px\)[\s\S]*?\.lobby__activities\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s
    );
    expect(css).toMatch(
      /@media \(max-width: 620px\)[\s\S]*?\.lobby-activity:nth-child\(3\)\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*width:\s*calc\(50% - 0\.25rem\);[^}]*justify-self:\s*center;/s
    );
  });
});
