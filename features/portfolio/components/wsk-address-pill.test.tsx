import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ADDRESS = "wsk1q9dunpfcdfj89hq2w9ra3q4qqgrpwmxmvu00z67f";
const account = { address: ADDRESS as string | null, hasWallet: true, unlocked: true };
const unlock = vi.fn();

vi.mock("@/hooks/use-intertrain-account", () => ({ useIntertrainAccount: () => account }));
vi.mock("@/lib/signer/unlock-request", () => ({ requestWalletUnlock: () => unlock() }));
vi.mock("@/components/ui/copy-button", () => ({
  CopyButton: ({ value }: { value: string }) => <button aria-label="Copy" data-value={value} />,
}));

import { WskAddressPill } from "./wsk-address-pill";

beforeEach(() => {
  account.address = ADDRESS;
  account.hasWallet = true;
  unlock.mockClear();
});
afterEach(cleanup);

describe("WskAddressPill", () => {
  it("shows a short address and copies the whole one", () => {
    render(<WskAddressPill />);
    expect(screen.getByTestId("wsk-address")).toHaveTextContent(
      "wsk1q9dunp…z67f".replace("z67f", "00z67f")
    );
    expect(screen.getByLabelText("Copy")).toHaveAttribute("data-value", ADDRESS);
  });

  it("asks to unlock when the address is not known on this device yet", () => {
    account.address = null;
    render(<WskAddressPill />);
    fireEvent.click(screen.getByRole("button", { name: /unlock your wallet/i }));
    expect(unlock).toHaveBeenCalled();
  });

  it("shows nothing for an account with no new wallet", () => {
    account.hasWallet = false;
    const { container } = render(<WskAddressPill />);
    expect(container).toBeEmptyDOMElement();
  });
});
