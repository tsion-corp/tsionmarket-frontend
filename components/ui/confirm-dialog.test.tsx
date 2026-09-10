import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./confirm-dialog";

describe("ConfirmDialog", () => {
  it("portals outside its parent stacking context", async () => {
    const view = render(
      <div data-testid="stacking-context" style={{ transform: "translateZ(0)" }}>
        <ConfirmDialog
          title="Confirm cashout"
          rows={[{ label: "Outcome", value: "Yes" }]}
          warning="Review before continuing."
          cancelLabel="Keep bet"
          continueLabel="Cash out"
          onCancel={vi.fn()}
          onContinue={vi.fn()}
        />
      </div>
    );

    const dialog = await screen.findByRole("dialog", { name: "Confirm cashout" });
    expect(view.getByTestId("stacking-context")).not.toContainElement(dialog);
    expect(dialog.parentElement).toBe(document.body);
  });
});
