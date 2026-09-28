import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import messages from "@/messages/en.json";

const { chain, ownerWallet, recipientWallet, resolveArkName } = vi.hoisted(() => ({
  chain: { evmSend: vi.fn(async () => `0x${"1".repeat(64)}`), invalidate: vi.fn() },
  ownerWallet: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  recipientWallet: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  resolveArkName: vi.fn(),
}));

vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({ evmAddress: ownerWallet }),
}));
vi.mock("@/hooks/use-evm-send", () => ({ useEvmSend: () => chain.evmSend }));
vi.mock("@/features/portfolio/hooks/use-kash", () => ({
  useInvalidateKash: () => chain.invalidate,
  useKashAccount: () => ({
    data: { balance: "100", wallet: ownerWallet },
    wallet: ownerWallet,
  }),
  useKashStatus: () => ({
    data: { chainMode: "ethers", chain: { chainId: 8453, tokenAddress: recipientWallet } },
  }),
}));
vi.mock("@/lib/bns/api", () => ({ resolveArkName }));
vi.mock("@/lib/bns/ark-id-dialog-store", () => ({ openArkIdDialog: vi.fn() }));
vi.mock("@/components/ui/modal-shell", () => ({
  ModalShell: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
}));
vi.mock("@/components/ui/success-panel", () => ({
  SuccessPanel: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h2>{title}</h2>
      {children}
    </div>
  ),
}));

import { KashSendModal } from "@/features/portfolio/components/kash-send-modal";

function renderModal() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>
        <KashSendModal open onClose={() => {}} />
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
}

describe("Kash Ark ID recipients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveArkName.mockResolvedValue({
      name: "alice.ark",
      address: recipientWallet,
    });
  });

  it("resolves an Ark ID and sends to its attached wallet", async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Recipient Ark ID"), { target: { value: "Alice" } });
    fireEvent.change(screen.getByLabelText("Amount (KASH)"), { target: { value: "1" } });

    expect(await screen.findByText(/alice\.ark resolves to/)).toBeInTheDocument();
    const send = screen.getByRole("button", { name: "Send Kash+" });
    expect(send).toBeEnabled();
    fireEvent.click(send);

    await waitFor(() => expect(chain.evmSend).toHaveBeenCalledTimes(1));
    expect(chain.evmSend).toHaveBeenCalledWith(expect.objectContaining({ chainId: 8453 }));
    expect(screen.getByText(/sent 1 KASH to 0xbbbb…bbbb/)).toBeInTheDocument();
  });

  // An Ark ID and nothing else: Kash goes to a name, so the sender reads back
  // who they are paying instead of a hex string they cannot check.
  it("refuses a pasted wallet address", async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Recipient Ark ID"), {
      target: { value: recipientWallet },
    });
    fireEvent.change(screen.getByLabelText("Amount (KASH)"), { target: { value: "1" } });

    expect(await screen.findByText(/not a wallet address/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send Kash+" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Send Kash+" }));
    expect(chain.evmSend).not.toHaveBeenCalled();
  });

  it("refuses the sender's own address just as it refuses any other", async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Recipient Ark ID"), {
      target: { value: ownerWallet },
    });

    expect(await screen.findByText(/not a wallet address/)).toBeInTheDocument();
    expect(resolveArkName).not.toHaveBeenCalled();
  });

  // The name is what is typed; the address it resolves to is still shown before
  // the send, so the sender can see where the money is actually going.
  it("shows the wallet a name resolves to", async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Recipient Ark ID"), { target: { value: "alice" } });

    expect(await screen.findByText(recipientWallet)).toBeInTheDocument();
  });

  it("does not send an Ark ID without an attached address", async () => {
    resolveArkName.mockResolvedValue({ name: "alice.ark", address: null });
    renderModal();
    fireEvent.change(screen.getByLabelText("Recipient Ark ID"), {
      target: { value: "alice.ark" },
    });
    fireEvent.change(screen.getByLabelText("Amount (KASH)"), { target: { value: "1" } });

    expect(await screen.findByText("alice.ark isn't attached to a wallet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send Kash+" })).toBeDisabled();
    expect(chain.evmSend).not.toHaveBeenCalled();
  });
});
