import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ChessStyleBoundary,
  removeChessStyles,
} from "@/features/casino/components/chess-app/chess-style-boundary";

describe("ChessStyleBoundary", () => {
  it("owns the Lichess styles and removes them when chess unmounts", () => {
    removeChessStyles();
    const view = render(<ChessStyleBoundary />);

    expect(document.head.querySelector('link[href="/chess/lichess/css/theme.css"]')).not.toBeNull();
    expect(document.head.querySelector('link[href="/chess/lichess/css/site.css"]')).not.toBeNull();

    const round = document.createElement("link");
    round.rel = "stylesheet";
    round.href = "/css/round.test.css";
    round.dataset.lichessRound = "true";
    document.head.append(round);

    view.unmount();

    expect(document.head.querySelector('link[href^="/chess/lichess/css/"]')).toBeNull();
    expect(document.head.querySelector('link[href="/css/round.test.css"]')).toBeNull();
  });
});
