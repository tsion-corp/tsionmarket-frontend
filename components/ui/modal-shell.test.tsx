// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModalShell, useModalScreen } from "@/components/ui/modal-shell";

function Screen(props: { back?: () => void; fullScreen?: boolean; fits?: boolean }) {
  useModalScreen(props);
  return <p>content</p>;
}

function content(): HTMLElement {
  return screen.getByText("content").parentElement as HTMLElement;
}

function panel(): HTMLElement {
  return screen.getByText("content").closest("[class*='bg-sheet']") as HTMLElement;
}

describe("ModalShell", () => {
  it("is a bottom sheet that scrolls, until a screen asks for more", () => {
    render(
      <ModalShell open onClose={vi.fn()}>
        <Screen />
      </ModalShell>
    );
    expect(panel().className).toContain("overflow-y-auto");
    expect(panel().className).not.toContain("h-[100dvh]");
    expect(screen.queryByLabelText("Back")).toBeNull();
  });

  // A step of the funding flow is a task, not a peek: it takes the phone.
  it("gives the whole phone to a screen that asks for it", () => {
    render(
      <ModalShell open onClose={vi.fn()}>
        <Screen fullScreen />
      </ModalShell>
    );
    expect(panel().className).toContain("h-[100dvh]");
    expect(panel().className).toContain("rounded-none");
  });

  // The deposit address must be reachable without scrolling past a QR code.
  it("does not scroll a screen that says it fits", () => {
    render(
      <ModalShell open onClose={vi.fn()}>
        <Screen fullScreen fits />
      </ModalShell>
    );
    expect(panel().className).toContain("overflow-hidden");
    expect(panel().className).not.toContain("overflow-y-auto");
  });

  // A short step on a tall phone left its content at the top with dead space
  // under it. The content sits in the middle of what is left; Back and close
  // stay at the top, where they belong.
  it("centres a full-screen step's content, with the header still on top", () => {
    render(
      <ModalShell open onClose={vi.fn()}>
        <Screen fullScreen back={vi.fn()} />
      </ModalShell>
    );
    expect(content().className).toContain("justify-content:safe_center");
    // Still above the content, not centred with it.
    expect(panel().firstElementChild).toContainElement(screen.getByLabelText("Close"));
  });

  it("leaves a bottom sheet's content where it is", () => {
    render(
      <ModalShell open onClose={vi.fn()}>
        <Screen />
      </ModalShell>
    );
    expect(content().className).not.toContain("justify-content:safe_center");
  });

  // Every step used to draw its own Back wherever its markup started, which is
  // why one sat above the close button instead of beside it.
  it("draws Back beside the close button and calls the screen's handler", () => {
    const back = vi.fn();
    render(
      <ModalShell open onClose={vi.fn()}>
        <Screen back={back} />
      </ModalShell>
    );
    const backButton = screen.getByLabelText("Back");
    const row = backButton.parentElement as HTMLElement;
    expect(row).toContainElement(screen.getByLabelText("Close"));

    fireEvent.click(backButton);
    expect(back).toHaveBeenCalledTimes(1);
  });

  // The handler changes identity on every render of the screen; the click must
  // still reach the current one rather than the first.
  it("calls the handler the screen has now, not the one it opened with", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <ModalShell open onClose={vi.fn()}>
        <Screen back={first} />
      </ModalShell>
    );
    rerender(
      <ModalShell open onClose={vi.fn()}>
        <Screen back={second} />
      </ModalShell>
    );
    fireEvent.click(screen.getByLabelText("Back"));
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
