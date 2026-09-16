import { describe, expect, it } from "vitest";
import {
  canReloadLichessRound,
  lichessApiMoveForAppend,
  reloadInteractiveLichessRound,
} from "./lichess-round-sync";

function step(ply: number) {
  return { ply, fen: `fen-${ply}` };
}

describe("canReloadLichessRound", () => {
  it("rejects a same-length history shifted beyond the controller ply", () => {
    expect(
      canReloadLichessRound({ ply: 0, data: { steps: [step(0)] } }, { steps: [step(1)] })
    ).toBe(false);
  });

  it("rejects sparse history even when its last ply is current", () => {
    expect(
      canReloadLichessRound(
        { ply: 1, data: { steps: [step(0), step(1)] } },
        { steps: [step(0), step(2)] }
      )
    ).toBe(false);
  });

  it("accepts a complete advanced history", () => {
    expect(
      canReloadLichessRound(
        { ply: 1, data: { steps: [step(0), step(1)] } },
        { steps: [step(0), step(1), step(2)] }
      )
    ).toBe(true);
  });

  it("accepts status-only reloads at the current replay ply", () => {
    expect(
      canReloadLichessRound(
        { ply: 1, data: { steps: [step(0), step(1), step(2)] } },
        { steps: [step(0), step(1), step(2)] }
      )
    ).toBe(true);
  });
});

describe("lichessApiMoveForAppend", () => {
  const current = {
    steps: [{ ply: 4, fen: "before-en-passant" }],
  };

  it("converts one appended move to the native Lichess socket schema", () => {
    expect(
      lichessApiMoveForAppend(current, {
        steps: [
          { ply: 4, fen: "before-en-passant" },
          {
            ply: 5,
            fen: "after-en-passant",
            san: "exd6",
            uci: "e5d6",
            check: false,
          },
        ],
        possibleMoves: { e7: "e6e5" },
        clock: { white: 297, black: 295 },
        game: {
          status: { id: 20, name: "started" },
          winner: undefined,
        },
        player: { color: "white", offeringDraw: false },
        opponent: { color: "black", offeringDraw: true },
      })
    ).toEqual({
      ply: 5,
      fen: "after-en-passant",
      san: "exd6",
      uci: "e5d6",
      check: false,
      dests: { e7: "e6e5" },
      clock: { white: 297, black: 295 },
      status: { id: 20, name: "started" },
      wDraw: false,
      bDraw: true,
    });
  });

  it("rejects a history gap instead of skipping native move events", () => {
    expect(
      lichessApiMoveForAppend(current, {
        steps: [
          { ply: 4, fen: "before-en-passant" },
          { ply: 5, fen: "after-one", san: "exd6", uci: "e5d6" },
          { ply: 6, fen: "after-two", san: "Kf7", uci: "e8f7" },
        ],
      })
    ).toBeNull();
  });

  it("rejects a rewritten history prefix", () => {
    expect(
      lichessApiMoveForAppend(current, {
        steps: [
          { ply: 4, fen: "different-position" },
          { ply: 5, fen: "after", san: "e6", uci: "e7e6" },
        ],
      })
    ).toBeNull();
  });
});

describe("reloadInteractiveLichessRound", () => {
  it("hides the local socket proxy while Lichess configures board hooks", () => {
    const proxy = { send() {} };
    const data = { local: proxy, steps: [step(0)] };
    let localDuringReload: unknown = proxy;

    reloadInteractiveLichessRound(
      {
        reload(incoming) {
          localDuringReload = incoming.local;
        },
      },
      data
    );

    expect(localDuringReload).toBeUndefined();
    expect(data.local).toBe(proxy);
  });

  it("restores the proxy when copied Lichess reload throws", () => {
    const proxy = { send() {} };
    const data = { local: proxy, steps: [step(0)] };

    expect(() =>
      reloadInteractiveLichessRound(
        {
          reload() {
            throw new Error("reload failed");
          },
        },
        data
      )
    ).toThrow("reload failed");
    expect(data.local).toBe(proxy);
  });
});
