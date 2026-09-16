import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ConfirmDialog } from "./confirm-dialog";

// jsdom has no matchMedia, and useReducedMotion (motion/react) reads it on
// mount. Stub it so the dialog's spring/opacity branch can be exercised
// without the reduced-motion path always winning.
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

const baseProps = {
  title: "Confirm cashout",
  rows: [{ label: "Outcome", value: "Yes" }],
  warning: "Review before continuing.",
  cancelLabel: "Keep bet",
  continueLabel: "Cash out",
};

describe("ConfirmDialog", () => {
  it("portals outside its parent stacking context while open", async () => {
    const view = render(
      <div data-testid="stacking-context" style={{ transform: "translateZ(0)" }}>
        <ConfirmDialog {...baseProps} open onCancel={vi.fn()} onContinue={vi.fn()} />
      </div>
    );

    const dialog = await screen.findByRole("dialog", { name: "Confirm cashout" });
    expect(view.getByTestId("stacking-context")).not.toContainElement(dialog);
    expect(dialog.parentElement).toBe(document.body);
  });

  it("renders nothing when closed, and stays mountable for a later open", async () => {
    const { rerender } = render(
      <ConfirmDialog {...baseProps} open={false} onCancel={vi.fn()} onContinue={vi.fn()} />
    );

    expect(screen.queryByRole("dialog", { name: "Confirm cashout" })).not.toBeInTheDocument();

    rerender(<ConfirmDialog {...baseProps} open onCancel={vi.fn()} onContinue={vi.fn()} />);
    expect(await screen.findByRole("dialog", { name: "Confirm cashout" })).toBeInTheDocument();
  });

  it("calls onCancel exactly once, and no onContinue, when the cancel button is clicked", async () => {
    const onCancel = vi.fn();
    const onContinue = vi.fn();
    render(<ConfirmDialog {...baseProps} open onCancel={onCancel} onContinue={onContinue} />);

    await screen.findByRole("dialog", { name: "Confirm cashout" });
    // "Keep bet" is the accessible name of both the backdrop button and the
    // in-panel cancel button (same action, same label by design). The panel
    // button is the last match in DOM order.
    const cancelButtons = screen.getAllByRole("button", { name: "Keep bet" });
    fireEvent.click(cancelButtons[cancelButtons.length - 1]);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("calls onContinue exactly once, and no onCancel, when the continue button is clicked", async () => {
    const onCancel = vi.fn();
    const onContinue = vi.fn();
    render(<ConfirmDialog {...baseProps} open onCancel={onCancel} onContinue={onContinue} />);

    fireEvent.click(await screen.findByRole("button", { name: "Cash out" }));

    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancels on backdrop click", async () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...baseProps} open onCancel={onCancel} onContinue={vi.fn()} />);

    await screen.findByRole("dialog", { name: "Confirm cashout" });
    // The backdrop button is the first "Keep bet" match in DOM order, ahead
    // of the in-panel cancel button.
    const [backdropButton] = screen.getAllByRole("button", { name: "Keep bet" });
    fireEvent.click(backdropButton);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("cancels on Escape while open, and does nothing on Escape while closed", async () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <ConfirmDialog {...baseProps} open={false} onCancel={onCancel} onContinue={vi.fn()} />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();

    rerender(<ConfirmDialog {...baseProps} open onCancel={onCancel} onContinue={vi.fn()} />);
    await screen.findByRole("dialog", { name: "Confirm cashout" });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("removes the dialog from the DOM after closing", async () => {
    const { rerender } = render(
      <ConfirmDialog {...baseProps} open onCancel={vi.fn()} onContinue={vi.fn()} />
    );
    await screen.findByRole("dialog", { name: "Confirm cashout" });

    rerender(<ConfirmDialog {...baseProps} open={false} onCancel={vi.fn()} onContinue={vi.fn()} />);

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Confirm cashout" })).not.toBeInTheDocument()
    );
  });
});
