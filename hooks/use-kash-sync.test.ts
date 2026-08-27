import { afterEach, describe, expect, it, vi } from "vitest";
import { isKashSyncing, markKashSyncing, resetKashSyncing, subscribe } from "./use-kash-sync";

/**
 * The syncing window says "these numbers are catching up" for exactly as long
 * as that is true. Too short and a successful action still looks like it did
 * nothing; too long and the card reads as a permanently broken spinner.
 */
describe("kash syncing window", () => {
  afterEach(() => {
    resetKashSyncing();
    vi.useRealTimers();
  });

  it("is closed until an action opens it", () => {
    expect(isKashSyncing()).toBe(false);
  });

  it("stays open for the requested window, then closes itself", () => {
    vi.useFakeTimers();
    markKashSyncing(6000);
    expect(isKashSyncing()).toBe(true);

    vi.advanceTimersByTime(5999);
    expect(isKashSyncing()).toBe(true);

    vi.advanceTimersByTime(2);
    // Self-closing: nothing has to remember to end it, so a failed action
    // cannot strand the card in a permanent spinner.
    expect(isKashSyncing()).toBe(false);
  });

  it("extends an in-flight window rather than truncating it", () => {
    vi.useFakeTimers();
    markKashSyncing(6000);
    vi.advanceTimersByTime(1000);

    // A second, shorter action must not cut the first one short — the chain
    // writes it was waiting on have not landed yet.
    markKashSyncing(500);
    vi.advanceTimersByTime(600);
    expect(isKashSyncing()).toBe(true);

    vi.advanceTimersByTime(4500);
    expect(isKashSyncing()).toBe(false);
  });

  it("notifies subscribers when it opens and when it closes", () => {
    vi.useFakeTimers();
    const changes: boolean[] = [];
    const unsubscribe = subscribe(() => changes.push(isKashSyncing()));

    markKashSyncing(1000);
    expect(changes).toEqual([true]);

    vi.advanceTimersByTime(1001);
    expect(changes).toEqual([true, false]);
    unsubscribe();
  });

  it("stops notifying once unsubscribed", () => {
    const changes: boolean[] = [];
    const unsubscribe = subscribe(() => changes.push(true));
    unsubscribe();
    markKashSyncing(100);
    expect(changes).toEqual([]);
  });
});
