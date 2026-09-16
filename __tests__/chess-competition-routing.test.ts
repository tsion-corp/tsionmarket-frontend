import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("features/casino/components/chess-app/chess-lobby-frame.tsx", "utf8");
const swissList = readFileSync(
  "features/casino/components/chess-app/swiss/list-section.tsx",
  "utf8"
);

describe("chess competition navigation", () => {
  it("promotes copied Lichess Arena and Swiss links out of the lobby iframe", () => {
    expect(source).toContain('path === "/tournament/new"');
    expect(source).toContain('path === "/swiss/new"');
    expect(source).toContain('path === "/competition/arenas"');
    expect(source).toContain('path.startsWith("/competition/arenas/")');
    expect(source).toContain('path.startsWith("/competition/swiss/")');
  });

  it("opens Swiss creation as its own page", () => {
    expect(swissList).toContain('href="/casino/chess/swiss/create"');
    expect(swissList).not.toContain("showCreate");
  });
});
