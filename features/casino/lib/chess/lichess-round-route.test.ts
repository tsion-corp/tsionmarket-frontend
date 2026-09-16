import { describe, expect, it } from "vitest";
import { lichessRoundReviewRoute } from "./lichess-round-route";

describe("lichessRoundReviewRoute", () => {
  const matchId = "cce4f585-284e-464e-ac89-81074b6e1914";

  it("maps copied Lichess analysis links to the Ark review route at the selected ply", () => {
    expect(lichessRoundReviewRoute(`/${matchId}/white#18`, matchId, 7)).toBe(
      `/casino/chess/review?match=${matchId}#7`
    );
    expect(lichessRoundReviewRoute(`/${matchId}/black/analysis#18`, matchId, 0)).toBe(
      `/casino/chess/review?match=${matchId}#0`
    );
  });

  it("does not rewrite unrelated round links", () => {
    expect(lichessRoundReviewRoute(`/@/player`, matchId, 7)).toBeNull();
    expect(lichessRoundReviewRoute(`/different-match/white#18`, matchId, 7)).toBeNull();
  });
});
