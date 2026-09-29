import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import messages from "@/messages/en.json";

const { code, copyText, toast } = vi.hoisted(() => ({
  code: { value: "7k4m9x2p" as string | null },
  copyText: vi.fn((url: string) => Promise.resolve(Boolean(url))),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/hooks/use-referral-code", () => ({ useReferralCode: () => code.value }));
vi.mock("@/lib/clipboard", () => ({ copyText }));
vi.mock("@/lib/toast", () => ({ toast }));

import { ShareLinkButton } from "@/components/ui/share-link-button";

const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={messages}>
    {children}
  </NextIntlClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  code.value = "7k4m9x2p";
  window.history.replaceState({}, "", "/prediction/markets/9?tab=all");
});

describe("sharing the page you are on", () => {
  it("copies a link carrying the sharer's code", async () => {
    render(<ShareLinkButton />, { wrapper });
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(copyText).toHaveBeenCalledWith(
        "http://localhost:3000/prediction/markets/9?ref=7k4m9x2p"
      )
    );
  });

  // A share is a link to the thing, not to whatever state the sharer's own
  // session happened to leave in the address bar.
  it("drops the sharer's own query", async () => {
    render(<ShareLinkButton />, { wrapper });
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(copyText).toHaveBeenCalled());
    expect(copyText).not.toHaveBeenCalledWith(expect.stringContaining("tab=all"));
  });

  it("still shares a working link when there is no code", async () => {
    code.value = null;
    render(<ShareLinkButton />, { wrapper });
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(copyText).toHaveBeenCalledWith("http://localhost:3000/prediction/markets/9")
    );
  });

  it("says so when the clipboard refuses", async () => {
    copyText.mockResolvedValueOnce(false);
    render(<ShareLinkButton />, { wrapper });
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });
});
