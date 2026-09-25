// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MoveOldMoneyFrame } from "@/features/migrate/components/move-old-money-frame";

describe("MoveOldMoneyFrame", () => {
  // Leaving is a deliberate press: a tap beside the card, or Escape, while a
  // sweep is being signed must not put the card away by accident.
  it("closes on the close button only — not Escape, not the backdrop", () => {
    const onClose = vi.fn();
    render(
      <MoveOldMoneyFrame onClose={onClose}>
        <p>body</p>
      </MoveOldMoneyFrame>
    );
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    const buttons = screen.getAllByLabelText("Close");
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // The gate: the only way out is whatever the children offer.
  it("offers no way out when not dismissible", () => {
    const onClose = vi.fn();
    render(
      <MoveOldMoneyFrame onClose={onClose} dismissible={false}>
        <p>body</p>
      </MoveOldMoneyFrame>
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByLabelText("Close")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
