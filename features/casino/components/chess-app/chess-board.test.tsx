import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChessBoard } from "@/features/casino/components/chess/chess-board";
import { parseFen } from "@/features/casino/lib/chess/engine";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function prepareBoard(element: HTMLDivElement) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 800,
    bottom: 800,
    width: 800,
    height: 800,
    toJSON: () => ({}),
  });
  element.setPointerCapture = vi.fn();
  element.hasPointerCapture = vi.fn(() => true);
  element.releasePointerCapture = vi.fn();
}

describe("ChessBoard interaction", () => {
  it("drops a dragged piece on the board coordinate immediately", () => {
    const onSquareDrop = vi.fn();
    const { container } = render(
      <ChessBoard
        board={parseFen(START_FEN).board}
        onSquareClick={vi.fn()}
        onSquareDrop={onSquareDrop}
      />
    );
    const board = container.firstElementChild as HTMLDivElement;
    prepareBoard(board);

    fireEvent.pointerDown(board, {
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      clientX: 450,
      clientY: 650,
    });
    fireEvent.pointerMove(board, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 450,
      clientY: 450,
    });
    fireEvent.pointerUp(board, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 450,
      clientY: 450,
    });

    expect(onSquareDrop).toHaveBeenCalledWith({ r: 6, c: 4 }, { r: 4, c: 4 });
  });

  it("keeps tap-to-select interaction", () => {
    const onSquareClick = vi.fn();
    const { container } = render(
      <ChessBoard board={parseFen(START_FEN).board} onSquareClick={onSquareClick} />
    );
    const board = container.firstElementChild as HTMLDivElement;
    prepareBoard(board);

    fireEvent.pointerDown(board, {
      pointerId: 2,
      pointerType: "touch",
      clientX: 450,
      clientY: 650,
    });
    fireEvent.pointerUp(board, {
      pointerId: 2,
      pointerType: "touch",
      clientX: 450,
      clientY: 650,
    });

    expect(onSquareClick).toHaveBeenCalledWith(6, 4);
  });
});
