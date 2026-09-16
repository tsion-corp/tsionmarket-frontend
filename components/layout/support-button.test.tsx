// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { SupportButton } from "@/components/layout/support-button";

// The bubble used to open a mail client addressed to support. It is the chat
// widget's launcher now: the conversation happens in the app.
describe("SupportButton", () => {
  it("opens the support chat rather than leaving the app", () => {
    render(<SupportButton />);
    const launcher = screen.getByRole("button", { name: /support/i });
    expect(screen.queryByTestId("support-chat-panel")).toBeNull();
    expect(screen.queryByRole("link", { name: /support/i })).toBeNull();

    fireEvent.click(launcher);

    expect(screen.getByTestId("support-chat-panel")).toBeInTheDocument();
  });
});
