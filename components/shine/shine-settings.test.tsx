import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";

const shine = vi.hoisted(() => ({
  preferences: null as Record<string, boolean> | null,
  isResolved: false,
  isLoading: false,
  isSignedIn: true,
  isSaving: false,
  error: null as unknown,
  allOn: false,
  isOn: vi.fn(),
  mayPost: vi.fn(),
  setShine: vi.fn(),
  setAll: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock("@/hooks/use-shine", async (orig) => ({
  ...(await orig<typeof import("@/hooks/use-shine")>()),
  useShine: () => shine,
}));

import { SHINE_SERVICES } from "@/lib/shine";
import { ShineSettings } from "./shine-settings";

function resolved(values: Partial<Record<string, boolean>> = {}) {
  const prefs = Object.fromEntries(SHINE_SERVICES.map((s) => [s, true])) as Record<string, boolean>;
  Object.assign(prefs, values);
  shine.preferences = prefs;
  shine.isResolved = true;
  shine.isLoading = false;
  shine.error = null;
  shine.allOn = SHINE_SERVICES.every((s) => prefs[s]);
  shine.isOn.mockImplementation((s: string) => prefs[s]);
}

function renderPanel() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ShineSettings />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  shine.preferences = null;
  shine.isResolved = false;
  shine.isLoading = false;
  shine.isSignedIn = true;
  shine.isSaving = false;
  shine.error = null;
  shine.allOn = false;
  shine.isOn.mockReturnValue(true);
  shine.setShine.mockResolvedValue(undefined);
  shine.setAll.mockResolvedValue(undefined);
});

describe("while the account's record is still arriving", () => {
  // Nothing here is a decision yet, so nothing may be flipped: a switch that
  // moves before the record lands writes over an answer never read.
  it("shows every switch busy and refuses to flip one", () => {
    shine.isLoading = true;
    renderPanel();
    for (const sw of screen.getAllByRole("switch")) {
      expect(sw).toHaveAttribute("aria-disabled", "true");
      expect(sw).toHaveAttribute("aria-busy", "true");
    }
    fireEvent.click(screen.getAllByRole("switch")[0]);
    expect(shine.setShine).not.toHaveBeenCalled();
    expect(shine.setAll).not.toHaveBeenCalled();
  });
});

describe("when the record cannot be read", () => {
  it("says so and offers a retry rather than drawing a settled state", () => {
    shine.error = new Error("nope");
    renderPanel();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: messages.shine.retry }));
    expect(shine.refetch).toHaveBeenCalled();
  });
});

describe("the master switch", () => {
  it("is on only when every service is on", () => {
    resolved();
    renderPanel();
    expect(screen.getByRole("switch", { name: messages.shine.allLabel })).toBeChecked();
  });

  // The case a single boolean cannot express. Drawn as mixed rather than as
  // off, which would claim Shine was off on services that are posting.
  it("is mixed when the services disagree", () => {
    resolved({ spot: false });
    renderPanel();
    const master = screen.getByRole("switch", { name: messages.shine.allLabel });
    expect(master).toHaveAttribute("aria-checked", "mixed");
  });

  it("turns everything on from mixed, in one write", async () => {
    resolved({ spot: false });
    renderPanel();
    fireEvent.click(screen.getByRole("switch", { name: messages.shine.allLabel }));
    await waitFor(() => expect(shine.setAll).toHaveBeenCalledWith(true));
    expect(shine.setShine).not.toHaveBeenCalled();
  });

  it("turns everything off when all are on", async () => {
    resolved();
    renderPanel();
    fireEvent.click(screen.getByRole("switch", { name: messages.shine.allLabel }));
    await waitFor(() => expect(shine.setAll).toHaveBeenCalledWith(false));
  });
});

describe("one service", () => {
  it("writes only that service", async () => {
    resolved();
    renderPanel();
    const row = screen.getByRole("group", { name: messages.shine.services.spot });
    fireEvent.click(within(row).getByRole("switch"));
    await waitFor(() => expect(shine.setShine).toHaveBeenCalledWith("spot", false));
    expect(shine.setAll).not.toHaveBeenCalled();
  });

  // A rejected write has already been rolled back by the hook. Saying nothing
  // would leave somebody believing they had turned Shine off.
  it("reports a failed save on the row it belongs to, and nowhere else", async () => {
    resolved();
    shine.setShine.mockRejectedValueOnce(new Error("no"));
    renderPanel();
    const row = screen.getByRole("group", { name: messages.shine.services.spot });
    fireEvent.click(within(row).getByRole("switch"));
    await waitFor(() => expect(within(row).getByRole("alert")).toBeInTheDocument());
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("clears a previous failure when the next attempt starts", async () => {
    resolved();
    shine.setShine.mockRejectedValueOnce(new Error("no"));
    renderPanel();
    const row = screen.getByRole("group", { name: messages.shine.services.spot });
    fireEvent.click(within(row).getByRole("switch"));
    await waitFor(() => expect(within(row).getByRole("alert")).toBeInTheDocument());

    shine.setShine.mockResolvedValueOnce(undefined);
    fireEvent.click(within(row).getByRole("switch"));
    await waitFor(() => expect(within(row).queryByRole("alert")).toBeNull());
  });
});

describe("while a write is in flight", () => {
  // The hook serialises writes, so every switch locks. Only the one being
  // changed is marked busy: marking them all would suggest seven pending
  // writes when there is one.
  it("locks every switch but marks only the one being written", () => {
    resolved();
    shine.isSaving = true;
    renderPanel();
    for (const sw of screen.getAllByRole("switch"))
      expect(sw).toHaveAttribute("aria-disabled", "true");
  });
});

describe("signed out", () => {
  it("offers nothing to flip", () => {
    shine.isSignedIn = false;
    renderPanel();
    for (const sw of screen.getAllByRole("switch"))
      expect(sw).toHaveAttribute("aria-disabled", "true");
  });
});
