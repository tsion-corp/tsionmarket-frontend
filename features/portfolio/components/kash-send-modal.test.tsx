import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { kashTransferData } from "@/features/portfolio/lib/kash-transfer";

const DAVE = "0x7bd263363D4BC844b6627cc63bB3A1a7710D43bA";
const STRANGER = "0x1111111111111111111111111111111111111111";
const HOLDER = "0x2222222222222222222222222222222222222222";
const KSH = "0x3333333333333333333333333333333333333333";

const mocks = vi.hoisted(() => ({ send: vi.fn(), wallet: "" as string }));
vi.mock("@/features/portfolio/hooks/use-kash", () => ({
  useKashStatus: () => ({
    data: { chainMode: "ethers", chain: { chainId: 8453, tokenAddress: KSH } },
  }),
  useKashAccount: () => ({ data: { balance: "500" }, wallet: mocks.wallet }),
  useInvalidateKash: () => vi.fn(),
}));
vi.mock("@/hooks/use-evm-send", () => ({ useEvmSend: () => mocks.send }));

import { KashSendModal } from "@/features/portfolio/components/kash-send-modal";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

function open() {
  render(<KashSendModal open onClose={() => {}} />, { wrapper });
  return {
    recipient: screen.getAllByRole("textbox")[0]!,
    amount: screen.getByPlaceholderText("0"),
    sendButton: () => screen.getByRole("button", { name: "Send Kash+" }),
  };
}

/** The field is debounced by a second, and the lookup resolves on a microtask. */
async function settle() {
  await act(async () => {
    vi.advanceTimersByTime(1100);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mocks.send.mockReset().mockResolvedValue("0xtx");
  mocks.wallet = HOLDER;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("KashSendModal recipients", () => {
  it("resolves an Ark name and sends to the address behind it", async () => {
    const form = open();
    fireEvent.change(form.recipient, { target: { value: "dave" } });
    fireEvent.change(form.amount, { target: { value: "100" } });
    await settle();

    // The name and the address it resolved to are both shown before sending.
    expect(screen.getByText("dave.ark")).toBeInTheDocument();
    expect(screen.getByText(DAVE)).toBeInTheDocument();

    fireEvent.click(form.sendButton());
    await waitFor(() => expect(mocks.send).toHaveBeenCalledOnce());
    expect(mocks.send.mock.calls[0]![0]).toEqual({
      to: KSH,
      data: kashTransferData(DAVE, "100"),
      chainId: 8453,
    });
  });

  it("accepts a name typed with the suffix, in any case", async () => {
    const form = open();
    fireEvent.change(form.recipient, { target: { value: "DAVE.ark" } });
    await settle();
    expect(screen.getByText(DAVE)).toBeInTheDocument();
  });

  it("sends a pasted address straight through, with no name shown", async () => {
    const form = open();
    fireEvent.change(form.recipient, { target: { value: STRANGER } });
    fireEvent.change(form.amount, { target: { value: "5" } });
    await settle();

    expect(screen.queryByText("Looking up…")).not.toBeInTheDocument();
    fireEvent.click(form.sendButton());
    await waitFor(() => expect(mocks.send).toHaveBeenCalledOnce());
    expect(mocks.send.mock.calls[0]![0]!.data).toBe(kashTransferData(STRANGER, "5"));
  });

  it("refuses to send to a name the registry does not know", async () => {
    const form = open();
    fireEvent.change(form.recipient, { target: { value: "nobody" } });
    fireEvent.change(form.amount, { target: { value: "100" } });
    await settle();

    expect(screen.getByText("We couldn't find that name.")).toBeInTheDocument();
    expect(form.sendButton()).toBeDisabled();
    fireEvent.click(form.sendButton());
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("holds the send until the name has resolved", async () => {
    const form = open();
    fireEvent.change(form.recipient, { target: { value: "dave" } });
    fireEvent.change(form.amount, { target: { value: "100" } });

    // Still within the debounce: nothing is known about the recipient yet.
    expect(screen.getByText("Looking up…")).toBeInTheDocument();
    expect(form.sendButton()).toBeDisabled();

    await settle();
    expect(form.sendButton()).toBeEnabled();
  });

  it("blocks a name that resolves to the holder's own wallet", async () => {
    mocks.wallet = DAVE;
    const form = open();
    fireEvent.change(form.recipient, { target: { value: "dave" } });
    fireEvent.change(form.amount, { target: { value: "100" } });
    await settle();

    expect(screen.getByText("That's your own address.")).toBeInTheDocument();
    expect(form.sendButton()).toBeDisabled();
  });

  it("treats half-typed 0x input as a bad address, never as a name", async () => {
    const form = open();
    fireEvent.change(form.recipient, { target: { value: "0x123" } });
    await settle();

    expect(screen.getByText("That doesn't look like a valid address.")).toBeInTheDocument();
    expect(screen.queryByText("We couldn't find that name.")).not.toBeInTheDocument();
  });
});
