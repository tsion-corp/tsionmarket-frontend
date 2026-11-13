import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { clearUnlocked, createBackup, createWallet } from "@/lib/wallet-core";
import { memoryDeviceStore } from "@/lib/wallet-device/store";
import type { WalletApi } from "../lib/wallet-api";
import { RestoreWallet } from "./restore-wallet";

const UID = "6f1d2c1e-9c7a-4b7e-8a2f-0d3c4e5f6a7b";
const PASSPHRASE = "correct horse battery staple";
let backupText = "";
let recoverySecret = "";

beforeAll(async () => {
  const wallet = await createWallet({
    walletId: "wallet-restore-1",
    accounts: [
      { accountId: "acc-evm", family: "evm", networkIds: ["evm"] },
      { accountId: "acc-sol", family: "solana", networkIds: ["solana-mainnet"] },
    ],
    passphrase: PASSPHRASE,
    params: { memoryKiB: 32_768, iterations: 2, parallelism: 1, hashLength: 32 },
  });
  backupText = createBackup(wallet.package).text;
  recoverySecret = wallet.recoverySecret;
}, 60_000);

afterEach(() => {
  cleanup();
  clearUnlocked();
});

function setup() {
  const restore = vi.fn<(body: unknown) => Promise<void>>(async () => undefined);
  const api: WalletApi = {
    get: async () => null,
    challenge: async () => "N".repeat(40),
    create: async () => undefined,
    restore,
    commit: async () => undefined,
    enrollDevice: async () => undefined,
  };
  const onRestored = vi.fn();
  const onBack = vi.fn();
  render(
    <RestoreWallet
      deps={{ api, devices: memoryDeviceStore() }}
      uid={UID}
      onRestored={onRestored}
      onBack={onBack}
    />
  );
  return { restore, onRestored, onBack };
}

const pick = (content: string, name = "backup.json") =>
  fireEvent.change(screen.getByLabelText("Backup file"), {
    target: { files: [new File([content], name, { type: "application/json" })] },
  });

describe("RestoreWallet", () => {
  it("shows what the file is as soon as it is chosen, and asks for nothing before that", async () => {
    setup();
    expect(screen.queryByLabelText("Passphrase")).toBeNull();
    pick(backupText, "my-wallet.json");
    const preview = await screen.findByTestId("backup-preview");
    expect(preview).toHaveTextContent("my-wallet.json");
    expect(preview).toHaveTextContent(/Ethereum: 0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}/);
    expect(preview).toHaveTextContent(/Solana: /);
    expect(screen.getByLabelText("Passphrase")).toBeInTheDocument();
  });

  it("refuses a file that is not a backup, without asking for a secret", async () => {
    setup();
    pick('{"hello":"world"}');
    expect(await screen.findByRole("alert")).toHaveTextContent(/isn't a wallet backup file/i);
    expect(screen.queryByLabelText("Passphrase")).toBeNull();
  });

  it("restores with the passphrase and hands only the encrypted package to the service", async () => {
    const { restore, onRestored } = setup();
    pick(backupText);
    await screen.findByTestId("backup-preview");
    const button = screen.getByRole("button", { name: /restore my wallet/i });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: PASSPHRASE } });
    fireEvent.click(button);
    await waitFor(() => expect(onRestored).toHaveBeenCalledTimes(1), { timeout: 30_000 });
    const sent = JSON.stringify(restore.mock.calls[0]![0]);
    expect(sent).not.toContain(PASSPHRASE);
    expect(sent.toLowerCase()).not.toContain(recoverySecret.toLowerCase());
  }, 60_000);

  it("says plainly when the passphrase is wrong, and can switch to the recovery secret", async () => {
    const { restore, onRestored } = setup();
    pick(backupText);
    await screen.findByTestId("backup-preview");
    fireEvent.change(screen.getByLabelText("Passphrase"), {
      target: { value: "not the passphrase" },
    });
    fireEvent.click(screen.getByRole("button", { name: /restore my wallet/i }));
    expect(await screen.findByRole("alert", undefined, { timeout: 30_000 })).toHaveTextContent(
      /doesn't match/i
    );
    expect(restore).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("radio", { name: /my recovery secret/i }));
    fireEvent.change(screen.getByLabelText("Recovery secret"), {
      target: { value: recoverySecret.toLowerCase() },
    });
    fireEvent.click(screen.getByRole("button", { name: /restore my wallet/i }));
    await waitFor(() => expect(onRestored).toHaveBeenCalledTimes(1), { timeout: 30_000 });
  }, 90_000);

  it("can go back to making a new wallet", () => {
    const { onBack } = setup();
    fireEvent.click(screen.getByRole("button", { name: /make a new wallet instead/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
