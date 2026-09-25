// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { RecoveryShareFile } from "decane-connect-kit";
import {
  collectRotatedRecoveryPassword,
  completeRecoveryRequest,
  deliverRecoveryFile,
  promptForRecoveryFile,
  useRecoveryRequest,
} from "@/lib/decane-recovery";

const ADDRESSES = { evmAddress: "0xE", solanaAddress: "So1" };

describe("recovery bridge", () => {
  it("hands the rotation prompt to the host and resolves with its answer", async () => {
    const { result } = renderHook(() => useRecoveryRequest());

    let promise!: Promise<{ password: string; passwordHint?: string }>;
    act(() => {
      promise = collectRotatedRecoveryPassword(ADDRESSES);
    });

    const request = result.current;
    if (request?.kind !== "rotated") throw new Error("expected a rotation request");
    expect(request.addresses).toEqual(ADDRESSES);

    act(() => {
      request.resolve({ password: "correct horse", passwordHint: "xkcd" });
      completeRecoveryRequest(request);
    });

    await expect(promise).resolves.toEqual({ password: "correct horse", passwordHint: "xkcd" });
    expect(result.current).toBeNull();
  });

  it("blocks file delivery until the host confirms the save", async () => {
    const { result } = renderHook(() => useRecoveryRequest());
    const file = { type: "decane-recovery-share" } as unknown as RecoveryShareFile;

    let done = false;
    act(() => {
      void deliverRecoveryFile(file, "recovery.json").then(() => {
        done = true;
      });
    });
    expect(done).toBe(false);

    const request = result.current;
    if (request?.kind !== "file") throw new Error("expected a file request");
    expect(request.filename).toBe("recovery.json");

    await act(async () => {
      request.resolve();
      completeRecoveryRequest(request);
    });
    expect(done).toBe(true);
    expect(result.current).toBeNull();
  });

  it("hands the restore prompt to the host and returns the supplied file, or null on cancel", async () => {
    const { result } = renderHook(() => useRecoveryRequest());

    let supplied!: Promise<{ value: unknown } | null>;
    act(() => {
      supplied = promptForRecoveryFile();
    });
    const request = result.current;
    if (request?.kind !== "restore") throw new Error("expected a restore request");

    act(() => {
      request.resolve({ value: { type: "decane-recovery-share" }, getPassword: async () => "pw" });
      completeRecoveryRequest(request);
    });
    await expect(supplied).resolves.toMatchObject({ value: { type: "decane-recovery-share" } });

    let cancelled!: Promise<unknown>;
    act(() => {
      cancelled = promptForRecoveryFile();
    });
    const second = result.current;
    if (second?.kind !== "restore") throw new Error("expected a restore request");
    act(() => {
      second.resolve(null);
      completeRecoveryRequest(second);
    });
    await expect(cancelled).resolves.toBeNull();
    expect(result.current).toBeNull();
  });

  it("serves queued requests one at a time, in order", () => {
    const { result } = renderHook(() => useRecoveryRequest());

    act(() => {
      void collectRotatedRecoveryPassword(ADDRESSES);
      void deliverRecoveryFile({} as RecoveryShareFile, "second.json");
    });

    expect(result.current?.kind).toBe("rotated");
    const first = result.current;
    act(() => {
      if (first?.kind === "rotated") first.resolve({ password: "12345678" });
      if (first) completeRecoveryRequest(first);
    });
    expect(result.current?.kind).toBe("file");
    const second = result.current;
    act(() => {
      if (second?.kind === "file") second.resolve();
      if (second) completeRecoveryRequest(second);
    });
    expect(result.current).toBeNull();
  });
});
