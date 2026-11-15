import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const unlockWithPin = vi.fn();
const setDevicePin = vi.fn(async () => undefined);
const removeDevicePin = vi.fn(async () => undefined);
let pinEnabled = false;

vi.mock("../lib/wallet-flow", async () => {
  const { PinUnlockError } = await import("@/lib/wallet-core/device-unlock");
  return {
    PinUnlockError,
    unlockWithPin: (...args: unknown[]) => unlockWithPin(...args),
    setDevicePin: (...args: unknown[]) => setDevicePin(...(args as [])),
    removeDevicePin: (...args: unknown[]) => removeDevicePin(...(args as [])),
    devicePinEnabled: async () => pinEnabled,
  };
});

import { PinUnlockError } from "@/lib/wallet-core/device-unlock";
import { PinSetup } from "./pin-setup";
import { PinUnlockForm } from "./pin-unlock-form";

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = (node: React.ReactNode) => (
  <QueryClientProvider client={client()}>{node}</QueryClientProvider>
);
const typePin = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  unlockWithPin.mockReset();
  setDevicePin.mockClear();
  removeDevicePin.mockClear();
  pinEnabled = false;
});
afterEach(cleanup);

describe("PinUnlockForm", () => {
  const show = () => {
    const onUnlocked = vi.fn();
    const onUsePassphrase = vi.fn();
    render(
      wrap(
        <PinUnlockForm
          uid="u"
          deps={{} as never}
          onUnlocked={onUnlocked}
          onUsePassphrase={onUsePassphrase}
        />
      )
    );
    return { onUnlocked, onUsePassphrase };
  };

  it("opens with the right PIN and takes digits only", async () => {
    unlockWithPin.mockResolvedValue(undefined);
    const { onUnlocked } = show();
    typePin("PIN", "48a2915");
    expect(screen.getByLabelText("PIN")).toHaveValue("482915");
    fireEvent.click(screen.getByRole("button", { name: /^unlock$/i }));
    await waitFor(() => expect(onUnlocked).toHaveBeenCalled());
    expect(unlockWithPin.mock.calls[0]![2]).toBe("482915");
  });

  it("will not try a PIN that is too short", () => {
    show();
    typePin("PIN", "123");
    expect(screen.getByRole("button", { name: /^unlock$/i })).toBeDisabled();
  });

  it("says how many tries are left once it matters, and when to try again", async () => {
    unlockWithPin.mockRejectedValueOnce(new PinUnlockError("wrong", 0, 3));
    show();
    typePin("PIN", "111111");
    fireEvent.click(screen.getByRole("button", { name: /^unlock$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/3 tries left/);
    unlockWithPin.mockRejectedValueOnce(new PinUnlockError("wait", 45_000));
    typePin("PIN", "111111");
    fireEvent.click(screen.getByRole("button", { name: /^unlock$/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/45 seconds/));
  });

  it("falls back to the passphrase when the PIN has been wiped", async () => {
    unlockWithPin.mockRejectedValueOnce(new PinUnlockError("wiped"));
    const { onUsePassphrase } = show();
    typePin("PIN", "111111");
    fireEvent.click(screen.getByRole("button", { name: /^unlock$/i }));
    await waitFor(() => expect(onUsePassphrase).toHaveBeenCalled());
  });

  it("always offers the passphrase", () => {
    const { onUsePassphrase } = show();
    fireEvent.click(screen.getByRole("button", { name: /use my passphrase/i }));
    expect(onUsePassphrase).toHaveBeenCalled();
  });
});

describe("PinSetup", () => {
  it("saves a PIN only when it is 6 to 12 digits and typed twice the same", async () => {
    render(wrap(<PinSetup uid="u" walletId="w" />));
    fireEvent.click(await screen.findByRole("button", { name: /unlock with a pin/i }));
    typePin("New PIN", "482915");
    typePin("Repeat PIN", "482916");
    expect(screen.getByText(/don.t match/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save pin/i })).toBeDisabled();
    typePin("Repeat PIN", "482915");
    fireEvent.click(screen.getByRole("button", { name: /save pin/i }));
    await waitFor(() => expect(setDevicePin).toHaveBeenCalledWith("u", "w", "482915"));
  });

  it("shows that a PIN is set, and can remove it", async () => {
    pinEnabled = true;
    render(wrap(<PinSetup uid="u" walletId="w" />));
    fireEvent.click(await screen.findByRole("button", { name: /remove the pin/i }));
    await waitFor(() => expect(removeDevicePin).toHaveBeenCalledWith("u"));
  });
});
