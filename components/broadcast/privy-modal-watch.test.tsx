// Privy's dialog is where key export, recovery phrases and MFA live, so this
// bridge is the guard's most important input. It is tested for two things: it
// reports the modal, and it complains loudly in development if Privy's own two
// signals ever stop agreeing with each other.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

const modal = vi.hoisted(() => ({ isOpen: false }));
const session = vi.hoisted(() => ({ setPrivyModalOpen: vi.fn() }));

vi.mock("@privy-io/react-auth", () => ({ useModalStatus: () => modal }));
vi.mock("@/components/broadcast/broadcast-session", () => ({
  useBroadcastSession: () => session,
}));

const { PrivyModalWatch } = await import("./privy-modal-watch");

beforeEach(() => {
  vi.clearAllMocks();
  modal.isOpen = false;
  document.body.innerHTML = "";
});

describe("PrivyModalWatch", () => {
  it("reports the modal opening to the session", async () => {
    modal.isOpen = true;
    document.body.innerHTML = '<div id="privy-dialog"></div>';
    render(<PrivyModalWatch />);

    await waitFor(() => expect(session.setPrivyModalOpen).toHaveBeenCalledWith(true));
  });

  it("reports it closed when Privy says so", async () => {
    render(<PrivyModalWatch />);
    await waitFor(() => expect(session.setPrivyModalOpen).toHaveBeenCalledWith(false));
  });

  it("renders nothing of its own", () => {
    const { container } = render(<PrivyModalWatch />);
    expect(container.innerHTML).toBe("");
  });

  // The tripwire. A Privy upgrade that changes what `isOpen` means would
  // otherwise leave this guard looking correct while protecting nothing.
  it("warns when Privy's hook and Privy's own dialog markup disagree", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    modal.isOpen = true;
    // The hook says open, but no dialog is in the DOM.
    render(<PrivyModalWatch />);

    await waitFor(
      () => expect(warn).toHaveBeenCalledWith(expect.stringContaining("[broadcast guard]")),
      { timeout: 2000 }
    );
    expect(warn.mock.calls[0][0]).toMatch(/re-test/i);
    warn.mockRestore();
  });

  it("stays quiet when the two signals agree", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    modal.isOpen = false;
    render(<PrivyModalWatch />);

    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
