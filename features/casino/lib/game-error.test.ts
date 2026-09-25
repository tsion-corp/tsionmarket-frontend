import { describe, expect, it } from "vitest";
import { gameActionError } from "./game-error";

function apiError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

describe("gameActionError", () => {
  it("names Arkjet for its generic insufficient-balance response", () => {
    expect(
      gameActionError(
        apiError("CONFLICT", "insufficient available balance for this bet"),
        "Arkjet",
        "Ticket failed."
      )
    ).toBe("Your Arkjet balance is too low for that ticket. Add funds or choose a smaller amount.");
  });

  it("names Chicken Cross for its generic insufficient-balance response", () => {
    expect(
      gameActionError(
        apiError("CONFLICT", "insufficient available balance for this session"),
        "Chicken Cross",
        "Ticket failed."
      )
    ).toBe(
      "Your Chicken Cross balance is too low for that ticket. Add funds or choose a smaller amount."
    );
  });

  it("supports a dedicated balance error code", () => {
    expect(
      gameActionError(
        apiError("PLAYER_BALANCE_INSUFFICIENT", "balance is low"),
        "Arkjet",
        "Ticket failed."
      )
    ).toMatch(/Arkjet balance/i);
  });

  it("uses normal sanitization for unrelated failures", () => {
    expect(gameActionError(new Error("Failed to fetch"), "Arkjet", "Ticket failed.")).toMatch(
      /connection/i
    );
  });
});
