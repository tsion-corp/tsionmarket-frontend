import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import type { KashStatus } from "@/features/portfolio/lib/kash";

const kashHooks = vi.hoisted(() => ({ useKashStatus: vi.fn() }));
vi.mock("@/features/portfolio/hooks/use-kash", () => kashHooks);

const toastMock = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/toast", () => toastMock);

import { AddToMetaMaskButton } from "@/features/portfolio/components/add-to-metamask-button";

// Only the two fields the button reads. The hook is mocked, so the rest of
// KashStatus never has to be invented here.
type StatusStub = Pick<KashStatus, "chainMode" | "chain">;

const onBase: StatusStub = {
  chainMode: "ethers",
  chain: {
    chainId: 8453,
    tokenAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    controllerAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
  },
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  kashHooks.useKashStatus.mockReturnValue({ data: onBase });
});

describe("AddToMetaMaskButton", () => {
  it("stays out of the card until the token has an on-chain address", () => {
    kashHooks.useKashStatus.mockReturnValue({ data: { chainMode: "mock" } as StatusStub });
    const { container } = render(<AddToMetaMaskButton />, { wrapper });
    expect(container).toBeEmptyDOMElement();
  });

  it("carries an accessible name and is a plain button, not a form submit", () => {
    render(<AddToMetaMaskButton />, { wrapper });
    const button = screen.getByRole("button", { name: messages.kash.addToMetaMask });
    expect(button).toHaveProperty("type", "button");
  });

  // The defect: the mark beside "History" was a hand-drawn approximation of
  // the fox rather than the brand mark the design draws. It must come from
  // the exported asset, so nothing here is authored by hand.
  it("draws the MetaMask mark from the exported brand asset", () => {
    const { container } = render(<AddToMetaMaskButton />, { wrapper });
    const mark = container.querySelector("img");
    expect(mark).not.toBeNull();
    expect(mark?.getAttribute("src")).toBe("/market/kash-icon-metamask.svg");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("keeps the mark's aspect ratio by sizing one axis only", () => {
    // The export is 28.416 x 27.5372, not square, and Figma ships it with
    // preserveAspectRatio="none". Pinning both axes would squash it, so only
    // the height is set and the width follows the intrinsic ratio.
    const { container } = render(<AddToMetaMaskButton />, { wrapper });
    const mark = container.querySelector("img");
    expect(mark?.style.height).toBe("27.54px");
    expect(mark?.style.width).toBe("");
    expect(mark?.className).toContain("w-auto");
  });

  it("scales the bare mobile mark to the requested height, still on one axis", () => {
    const { container } = render(<AddToMetaMaskButton bare iconSize={22} />, { wrapper });
    const mark = container.querySelector("img");
    expect(mark?.style.height).toBe("22px");
    expect(mark?.style.width).toBe("");
  });

  it("tells the user to install MetaMask when no wallet is injected", async () => {
    render(<AddToMetaMaskButton />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: messages.kash.addToMetaMask }));
    await waitFor(() =>
      expect(toastMock.toast.error).toHaveBeenCalledWith(messages.kash.addToMetaMaskUnavailable)
    );
    expect(toastMock.toast.success).not.toHaveBeenCalled();
  });
});
