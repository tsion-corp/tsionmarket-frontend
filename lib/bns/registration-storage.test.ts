// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPendingArkRegistration,
  getPendingArkRegistration,
  savePendingArkRegistration,
  type PendingArkRegistration,
} from "./registration-storage";

const pending: PendingArkRegistration = {
  label: "alice",
  name: "alice.ark",
  wallet: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  commitment: {
    registration: {
      label: "alice",
      owner: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      duration: "31536000",
      secret: `0x${"1".repeat(64)}`,
      resolver: "0xcccccccccccccccccccccccccccccccccccccccc",
      data: [`0x${"1".repeat(8)}`],
      reverseRecord: 3,
      referrer: `0x${"0".repeat(64)}`,
    },
    commitment: `0x${"2".repeat(64)}`,
    tx: {
      to: "0xdddddddddddddddddddddddddddddddddddddddd",
      data: "0x1234",
      value: "0",
    },
    timing: {
      committedAt: "2026-09-26T00:00:00.000Z",
      readyAt: "2026-09-26T00:01:00.000Z",
      expiresAt: "2026-09-27T00:00:00.000Z",
      minCommitmentAgeSeconds: 60,
      maxCommitmentAgeSeconds: 86400,
    },
  },
  commitTxHash: null,
};

describe("pending Ark registration storage", () => {
  beforeEach(() => localStorage.clear());

  it("persists the reveal tuple per wallet and label", () => {
    savePendingArkRegistration(pending);
    expect(getPendingArkRegistration(pending.wallet, pending.label)).toEqual(pending);
    expect(
      getPendingArkRegistration("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "alice")
    ).toBeNull();
  });

  it("clears a completed registration", () => {
    savePendingArkRegistration(pending);
    clearPendingArkRegistration(pending.wallet, pending.label);
    expect(getPendingArkRegistration(pending.wallet, pending.label)).toBeNull();
  });

  it("discards corrupted local entries", () => {
    localStorage.setItem("wsws:bns:ark:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:alice", "{");
    expect(getPendingArkRegistration(pending.wallet, pending.label)).toBeNull();
    expect(localStorage.length).toBe(0);
  });
});
