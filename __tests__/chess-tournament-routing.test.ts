import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = (path: string) => readFileSync(path, "utf8");

describe("chess tournament routing", () => {
  it("mounts the server-rendered Arena list at the tournament index", () => {
    const source = routeSource("app/(session)/casino/chess/tournaments/page.tsx");

    expect(source).toContain("ChessLobbyFrame");
    expect(source).toContain('source="/api/chess/competition/arenas"');
    expect(source).not.toContain("SwissListSection");
  });

  it("mounts the Arena detail page for a tournament id", () => {
    const source = routeSource("app/(session)/casino/chess/tournaments/[id]/page.tsx");

    expect(source).toContain("ChessLobbyFrame");
    expect(source).toContain("/api/chess/competition/arenas/${encodeURIComponent(id)}");
    expect(source).not.toContain("ArenaDetailSection");
    expect(source).not.toContain("SwissDetailSection");
  });

  it("mounts the Arena creation form", () => {
    const source = routeSource("app/(session)/casino/chess/tournaments/create/page.tsx");

    expect(source).toContain("ChessLobbyFrame");
    expect(source).toContain('source="/api/chess/competition/arenas/new"');
    expect(source).not.toContain("ArenaCreateForm");
    expect(source).not.toContain("SwissCreateForm");
  });
});
