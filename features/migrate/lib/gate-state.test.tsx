// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  offer: true,
  deciding: false,
  evm: "0xAbC0000000000000000000000000000000000001" as string | null,
}));

vi.mock("@/features/migrate/hooks/use-offer-migration", () => ({
  useOfferMigration: () => state.offer,
  useOfferMigrationState: () => ({ offer: state.offer, deciding: state.deciding }),
}));
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({ evmAddress: state.evm }),
}));

import {
  useMigrationGateActive,
  writeGateDone,
  writeGateSnooze,
  gateDoneKey,
  gateSnoozeKey,
  readGateSnoozed,
} from "@/features/migrate/lib/gate-state";

beforeEach(() => {
  state.offer = true;
  state.deciding = false;
  state.evm = "0xAbC0000000000000000000000000000000000001";
  window.localStorage.clear();
});
afterEach(() => window.localStorage.clear());

/*
  The tour waits on this. The offer's two answers arrive after the page has
  painted, and a tour that started in that gap ran on top of the gate that
  opened a beat later. Deciding counts as active.
*/
it("is active while the offer is still being decided", () => {
  state.offer = false;
  state.deciding = true;
  const { result } = renderHook(() => useMigrationGateActive());
  expect(result.current).toBe(true);
});

describe("useMigrationGateActive", () => {
  it("is active while offered and not finished", () => {
    const { result } = renderHook(() => useMigrationGateActive());
    expect(result.current).toBe(true);
  });

  it("flips to inactive the moment the gate is finished, without a reload", () => {
    const { result } = renderHook(() => useMigrationGateActive());
    expect(result.current).toBe(true);
    act(() => writeGateDone(gateDoneKey(state.evm)));
    expect(result.current).toBe(false);
  });

  it("is inactive when the migration is not offered", () => {
    state.offer = false;
    const { result } = renderHook(() => useMigrationGateActive());
    expect(result.current).toBe(false);
  });

  // The done flag is per account: finishing on one account does not clear the
  // gate for another signed in on the same device.
  it("stays active for a different account than the one that finished", () => {
    writeGateDone(gateDoneKey("0xAbC0000000000000000000000000000000000001"));
    state.evm = "0xDeF0000000000000000000000000000000000002";
    const { result } = renderHook(() => useMigrationGateActive());
    expect(result.current).toBe(true);
  });
});

describe("snooze", () => {
  const EVM = "0xAbC0000000000000000000000000000000000001";

  it("puts the gate away until the window lapses, without marking it done", () => {
    const { result } = renderHook(() => useMigrationGateActive());
    expect(result.current).toBe(true);
    act(() => writeGateSnooze(gateSnoozeKey(EVM), Date.now() + 60_000));
    expect(result.current).toBe(false);
    expect(window.localStorage.getItem(gateDoneKey(EVM)!)).toBeNull();
  });

  it("comes back once the window has lapsed", () => {
    const key = gateSnoozeKey(EVM);
    writeGateSnooze(key, Date.now() - 1);
    expect(readGateSnoozed(key)).toBe(false);
    const { result } = renderHook(() => useMigrationGateActive());
    expect(result.current).toBe(true);
  });

  it("treats a malformed value as not snoozed", () => {
    const key = gateSnoozeKey(EVM)!;
    window.localStorage.setItem(key, "soon");
    expect(readGateSnoozed(key)).toBe(false);
  });

  it("is per account", () => {
    writeGateSnooze(gateSnoozeKey(EVM), Date.now() + 60_000);
    state.evm = "0xDeF0000000000000000000000000000000000002";
    const { result } = renderHook(() => useMigrationGateActive());
    expect(result.current).toBe(true);
  });
});
