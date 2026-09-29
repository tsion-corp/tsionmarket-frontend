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

    expect(await screen.findByText(/alice\.ark is ready to receive/)).toBeInTheDocument();
    const send = screen.getByRole("button", { name: "Send Kash+" });
    expect(send).toBeEnabled();
    fireEvent.click(send);

    await waitFor(() => expect(chain.evmSend).toHaveBeenCalledTimes(1));
    expect(chain.evmSend).toHaveBeenCalledWith(expect.objectContaining({ chainId: 8453 }));
    expect(screen.getByText(/sent 1 KASH to alice\.ark/)).toBeInTheDocument();
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

  // The name is confirmed, not explained. A hex address under the field is
  // something the sender can neither check nor use, and it was the only thing
  // there that looked machine-generated.
  it("confirms the name without showing the wallet behind it", async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Recipient Ark ID"), { target: { value: "alice" } });

    expect(await screen.findByText(/alice\.ark is ready to receive/)).toBeInTheDocument();
    expect(screen.queryByText(recipientWallet)).toBeNull();
  });

  // The receipt names who was paid, not the address it resolved to.
  it("names the recipient on the receipt, and links the transaction", async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Recipient Ark ID"), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText("Amount (KASH)"), { target: { value: "1" } });
    await screen.findByText(/alice\.ark is ready to receive/);
    fireEvent.click(screen.getByRole("button", { name: "Send Kash+" }));

    await waitFor(() => expect(chain.evmSend).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/sent 1 KASH to alice\.ark/)).toBeInTheDocument();
    expect(screen.queryByText(/Basescan/)).toBeNull();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", `https://basescan.org/tx/0x${"1".repeat(64)}`);
    expect(link.textContent).toMatch(/^0x111111…111111$/);
  });

  it("does not send an Ark ID without an attached address", async () => {
    resolveArkName.mockResolvedValue({ name: "alice.ark", address: null });
    renderModal();
    fireEvent.change(screen.getByLabelText("Recipient Ark ID"), {
      target: { value: "alice.ark" },
    });
    fireEvent.change(screen.getByLabelText("Amount (KASH)"), { target: { value: "1" } });

    expect(await screen.findByText("alice.ark isn't owned by anyone.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Buy now" })).toHaveAttribute("href", "/ark-id");
    expect(screen.getByRole("button", { name: "Send Kash+" })).toBeDisabled();
    expect(chain.evmSend).not.toHaveBeenCalled();
  });
});
