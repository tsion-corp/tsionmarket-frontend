// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { KeepWatchingDialog } from "@/features/casino/components/last-standing/keep-watching-dialog";

// Only "Yes" leaves. A round's clock resets on anyone's wager, so a stray
// Escape must never be the thing that walks a player out of one.
function setup() {
  const onKeep = vi.fn();
  const onStay = vi.fn();
  render(<KeepWatchingDialog open onKeep={onKeep} onStay={onStay} />);
  return { onKeep, onStay };
}

describe("KeepWatchingDialog", () => {
  it("renders nothing while closed", () => {
    const onKeep = vi.fn();
    const onStay = vi.fn();
    render(<KeepWatchingDialog open={false} onKeep={onKeep} onStay={onStay} />);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("leaves only on yes", () => {
    const { onKeep, onStay } = setup();
    fireEvent.click(screen.getByText("keepWatchingYes"));
    expect(onKeep).toHaveBeenCalledTimes(1);
    expect(onStay).not.toHaveBeenCalled();
  });

  it("stays on no", () => {
    const { onKeep, onStay } = setup();
    fireEvent.click(screen.getByText("keepWatchingNo"));
    expect(onStay).toHaveBeenCalledTimes(1);
    expect(onKeep).not.toHaveBeenCalled();
  });

  it("stays on escape", () => {
    const { onKeep, onStay } = setup();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onStay).toHaveBeenCalledTimes(1);
    expect(onKeep).not.toHaveBeenCalled();
  });

  it("stays when the backdrop is pressed", () => {
    const { onKeep, onStay } = setup();
    // The backdrop is the button labelled for the same action as No.
    const backdrop = screen.getAllByLabelText("keepWatchingNo")[0];
    fireEvent.click(backdrop);
    expect(onStay).toHaveBeenCalled();
    expect(onKeep).not.toHaveBeenCalled();
  });

  it("is an alert dialog, so it is announced as one", () => {
    setup();
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });
});
