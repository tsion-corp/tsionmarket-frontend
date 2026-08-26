// The ordering rule this file exists to enforce: the creator gate is read
// BEFORE the browser is asked for screen capture. Failing after a permission
// prompt — user grants capture, picks a tab, then learns their account was
// never allowed to broadcast — is the worst possible sequence.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const session = vi.hoisted(() => ({
  captureScreen: vi.fn(async () => []),
  goLiveWith: vi.fn(async () => {}),
  setBlurSensitive: vi.fn(),
}));

vi.mock("@/components/broadcast/broadcast-session", () => ({
  useBroadcastSession: () => session,
}));

const client = vi.hoisted(() => ({
  fetchMarketSquareProfile: vi.fn(),
  applyForCreator: vi.fn(async () => {}),
}));

vi.mock("@/lib/api/market-square", () => ({
  ...client,
  canBroadcast: (role: string) => role === "creator" || role === "worldstreet",
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { ShareFlow } = await import("./share-flow");

const target = {
  title: "Live on Ark — Portfolio",
  watchPath: "/dashboard",
  descriptionLead: "Live from Ark. Follow along:",
  content: "motion" as const,
  deepLink: null,
  creatorApplicationNote: "note",
};

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ShareFlow target={target} onClose={() => {}} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("the creator gate", () => {
  it("never opens the picker for an account that cannot broadcast", async () => {
    client.fetchMarketSquareProfile.mockResolvedValue({ id: "u-1", role: "citizen" });
    mount();

    await screen.findByText(/cannot broadcast yet/i);
    // The three-step flow is not offered at all, so capture is never requested.
    expect(screen.queryByText(/What do you want to broadcast/i)).toBeNull();
    expect(session.captureScreen).not.toHaveBeenCalled();
    expect(session.goLiveWith).not.toHaveBeenCalled();
  });

  it("offers the creator application instead of a dead end", async () => {
    client.fetchMarketSquareProfile.mockResolvedValue({ id: "u-1", role: "citizen" });
    mount();

    fireEvent.click(await screen.findByRole("button", { name: /apply to be a creator/i }));
    await waitFor(() => expect(client.applyForCreator).toHaveBeenCalledWith("note"));
  });

  it("says a citizen can still join someone else's broadcast", async () => {
    client.fetchMarketSquareProfile.mockResolvedValue({ id: "u-1", role: "citizen" });
    mount();
    expect(
      await screen.findByText(/can still join a broadcast someone else started/i)
    ).toBeVisible();
  });

  it("offers a retry rather than a dead end when the role cannot be read", async () => {
    client.fetchMarketSquareProfile.mockRejectedValue(new Error("down"));
    mount();

    // The query retries once before it gives up, so this is deliberately
    // patient rather than racing the retry.
    expect(await screen.findByText(/did not answer/i, {}, { timeout: 4000 })).toBeVisible();
    expect(screen.getByRole("button", { name: /try again/i })).toBeVisible();
    expect(session.captureScreen).not.toHaveBeenCalled();
  });

  it("lets a creator through to the three steps", async () => {
    client.fetchMarketSquareProfile.mockResolvedValue({ id: "u-1", role: "creator" });
    mount();
    expect(await screen.findByText(/What do you want to broadcast/i)).toBeVisible();
  });
});

describe("the share steps", () => {
  beforeEach(() => {
    client.fetchMarketSquareProfile.mockResolvedValue({ id: "u-1", role: "creator" });
  });

  it("puts the interstitial in front of the picker on the Screen path only", async () => {
    mount();
    fireEvent.click(await screen.findByText("Screen"));

    expect(screen.getByText(/Before you share your screen/i)).toBeVisible();
    // Still nothing captured: the interstitial has to be acknowledged first.
    expect(session.captureScreen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /I understand/i }));
    await waitFor(() => expect(session.captureScreen).toHaveBeenCalledWith("motion", "screen"));
  });

  it("captures the Ark tab directly for the recommended path", async () => {
    mount();
    fireEvent.click(await screen.findByText("This view (Ark only)"));

    await waitFor(() => expect(session.captureScreen).toHaveBeenCalledWith("motion", "ark-view"));
    expect(screen.queryByText(/Before you share your screen/i)).toBeNull();
  });

  it("lists what Ark can see on screen rather than warning in the abstract", async () => {
    document.body.innerHTML = `
      <span data-sensitive="balance">1</span>
      <span data-sensitive="balance">2</span>
      <span data-sensitive="address">3</span>
    `;
    mount();
    fireEvent.click(await screen.findByText("Screen"));

    expect(screen.getByText("2 balances")).toBeVisible();
    expect(screen.getByText("1 wallet address")).toBeVisible();
  });

  it("says plainly what it cannot detect", async () => {
    mount();
    fireEvent.click(await screen.findByText("Screen"));
    expect(screen.getByText(/seed phrase or private key/i)).toBeVisible();
    expect(screen.getByText(/will only let you choose a tab or a window/i)).toBeVisible();
  });

  it("does not go live when the picker is dismissed", async () => {
    session.captureScreen.mockRejectedValueOnce(new DOMException("no", "NotAllowedError"));
    mount();
    fireEvent.click(await screen.findByText("Screen"));
    fireEvent.click(screen.getByRole("button", { name: /I understand/i }));

    await waitFor(() => expect(session.captureScreen).toHaveBeenCalled());
    expect(session.goLiveWith).not.toHaveBeenCalled();
  });
});
