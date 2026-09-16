import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SupportChatWidget } from "./support-chat-widget";
import { sendSupportChatMessage } from "@/lib/support-chat/client";

vi.mock("@/lib/support-chat/client", () => ({
  sendSupportChatMessage: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("SupportChatWidget", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(sendSupportChatMessage).mockResolvedValue({
      ok: true,
      reply: "Here is the AI response",
      needsHuman: false,
    });
  });

  it("renders closed floating launcher button by default", () => {
    render(<SupportChatWidget />);
    const launcher = screen.getByRole("button", { name: /support/i });
    expect(launcher).toBeInTheDocument();
    expect(screen.queryByTestId("support-chat-panel")).toBeNull();
  });

  it("opens the chat panel upon clicking the launcher button", () => {
    render(<SupportChatWidget />);
    const launcher = screen.getByRole("button", { name: /support/i });
    fireEvent.click(launcher);
    expect(screen.getByTestId("support-chat-panel")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/placeholder/i)).toBeInTheDocument();
  });

  it("can send a user message via Enter key or Send button and display AI reply", async () => {
    render(<SupportChatWidget defaultOpen />);
    const input = screen.getByPlaceholderText(/placeholder/i);
    fireEvent.change(input, { target: { value: "I need help with my deposit" } });

    const sendButton = screen.getByRole("button", { name: /send/i });
    fireEvent.click(sendButton);

    expect(screen.getByText("I need help with my deposit")).toBeInTheDocument();
    expect((input as HTMLTextAreaElement).value).toBe("");

    await waitFor(() => {
      expect(sendSupportChatMessage).toHaveBeenCalledWith("I need help with my deposit");
      expect(screen.getByText("Here is the AI response")).toBeInTheDocument();
    });
  });

  it("formats text when toolbar actions are clicked", () => {
    render(<SupportChatWidget defaultOpen />);
    const input = screen.getByPlaceholderText(/placeholder/i) as HTMLTextAreaElement;
    input.value = "important";
    input.setSelectionRange(0, 9);

    const boldBtn = screen.getByRole("button", { name: /bold/i });
    fireEvent.click(boldBtn);

    expect(input.value).toBe("**important**");
  });

  it("closes the chat panel when close button is clicked", () => {
    render(<SupportChatWidget defaultOpen />);
    expect(screen.getByTestId("support-chat-panel")).toBeInTheDocument();

    const closeBtn = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeBtn);

    expect(screen.queryByTestId("support-chat-panel")).toBeNull();
  });

  it("triggers quick response when an FAQ chip is clicked", async () => {
    render(<SupportChatWidget defaultOpen />);
    const faqChip = screen.getByRole("button", { name: /faqDeposit/i });
    fireEvent.click(faqChip);

    expect(screen.getByText(/faqDepositPrompt/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(sendSupportChatMessage).toHaveBeenCalledWith("faqDepositPrompt");
    });
  });
});
