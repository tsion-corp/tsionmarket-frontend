import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearUnlocked } from "@/lib/wallet-core";
import { memoryDeviceStore } from "@/lib/wallet-device/store";
import type { WalletApi } from "../lib/wallet-api";
import { CreateWallet } from "./create-wallet";

afterEach(() => {
  cleanup();
  clearUnlocked();
});

const UID = "6f1d2c1e-9c7a-4b7e-8a2f-0d3c4e5f6a7b";

function setup() {
  const create = vi.fn(async () => undefined);
  const api: WalletApi = {
    get: async () => null,
    challenge: async () => "N".repeat(40),
    create,
    commit: async () => undefined,
    enrollDevice: async () => undefined,
    restore: async () => undefined,
  };
  const onCreated = vi.fn();
  render(
    <CreateWallet deps={{ api, devices: memoryDeviceStore() }} uid={UID} onCreated={onCreated} />
  );
  return { create, onCreated };
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("CreateWallet", () => {
  it("won't continue with a weak or mismatched passphrase, and says why", () => {
    setup();
    const button = screen.getByRole("button", { name: /create my wallet/i });
    expect(button).toBeDisabled();
    type("Passphrase", "short");
    expect(screen.getByText(/at least 12 characters/i)).toBeInTheDocument();
    expect(button).toBeDisabled();
    type("Passphrase", "a long enough passphrase");
    type("Repeat passphrase", "something different here");
    expect(screen.getByText(/don.t match/i)).toBeInTheDocument();
    expect(button).toBeDisabled();
    type("Repeat passphrase", "a long enough passphrase");
    expect(button).toBeEnabled();
  });

  it("shows the secret once, asks for three of its groups back, and only then saves", async () => {
    const { create, onCreated } = setup();
    type("Passphrase", "a long enough passphrase");
    type("Repeat passphrase", "a long enough passphrase");
    fireEvent.click(screen.getByRole("button", { name: /create my wallet/i }));

    const grid = await screen.findByTestId("secret-groups", undefined, { timeout: 30_000 });
    const groups = Array.from(grid.querySelectorAll("li")).map(
      (li) => li.querySelector(".font-mono")!.textContent!
    );
    expect(groups).toHaveLength(14);
    // Nothing has been sent yet.
    expect(create).not.toHaveBeenCalled();

    const next = screen.getByRole("button", { name: /^continue$/i });
    expect(next).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(next);

    const save = screen.getByRole("button", { name: /save my wallet/i });
    const boxes = screen.getAllByRole("textbox");
    expect(boxes).toHaveLength(3);
    const position = (box: HTMLElement) =>
      Number(box.closest("label")!.textContent!.match(/Group (\d+)/)![1]) - 1;

    // Wrong groups keep it closed.
    boxes.forEach((box) => fireEvent.change(box, { target: { value: "wrong" } }));
    expect(save).toBeDisabled();
    // The right ones open it, typed any way.
    boxes.forEach((box) => fireEvent.change(box, { target: { value: groups[position(box)]! } }));
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledTimes(1);
  }, 60_000);

  it("keeps the secret and says what went wrong when saving fails", async () => {
    const create = vi.fn(async () => {
      throw Object.assign(new Error("x"), { code: "SERVICE_UNAVAILABLE" });
    });
    const api: WalletApi = {
      get: async () => null,
      challenge: async () => "N".repeat(40),
      create,
      commit: async () => undefined,
      enrollDevice: async () => undefined,
      restore: async () => undefined,
    };
    const onCreated = vi.fn();
    render(
      <CreateWallet deps={{ api, devices: memoryDeviceStore() }} uid={UID} onCreated={onCreated} />
    );
    type("Passphrase", "a long enough passphrase");
    type("Repeat passphrase", "a long enough passphrase");
    fireEvent.click(screen.getByRole("button", { name: /create my wallet/i }));
    const grid = await screen.findByTestId("secret-groups", undefined, { timeout: 30_000 });
    const groups = Array.from(grid.querySelectorAll("li")).map(
      (li) => li.querySelector(".font-mono")!.textContent!
    );
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    for (const box of screen.getAllByRole("textbox")) {
      const n = Number(box.closest("label")!.textContent!.match(/Group (\d+)/)![1]) - 1;
      fireEvent.change(box, { target: { value: groups[n]! } });
    }
    fireEvent.click(screen.getByRole("button", { name: /save my wallet/i }));

    expect(await screen.findByRole("alert", undefined, { timeout: 15_000 })).toHaveTextContent(
      /couldn.t reach the wallet service/i
    );
    expect(onCreated).not.toHaveBeenCalled();
    // Still able to try again without starting over.
    expect(screen.getByRole("button", { name: /save my wallet/i })).toBeEnabled();
  }, 60_000);
});
