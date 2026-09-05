"use client";

import { useSyncExternalStore } from "react";
import { isBookingCode } from "./booking-code";
import type { SinglesBetReceipt, SinglesReceiptOrder } from "./singles-receipt";

const STORAGE_KEY = "wsws.prediction.pending-receipt.v1";
const STORAGE_EVENT = "wsws:prediction-receipt";
const EMPTY_SNAPSHOT = "null";
let memorySnapshot = EMPTY_SNAPSHOT;
let cachedRaw = EMPTY_SNAPSHOT;
let cachedReceipt: StoredReceipt | null = null;

interface StoredReceipt {
  userId: string;
  receipt: SinglesBetReceipt;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length <= 1_000);
}

function isOrder(value: unknown): value is SinglesReceiptOrder {
  if (!value || typeof value !== "object") return false;
  const order = value as Partial<SinglesReceiptOrder>;
  return (
    typeof order.selectionId === "string" &&
    (order.source === "sports" || order.source === "discovery") &&
    typeof order.eventId === "string" &&
    typeof order.eventTitle === "string" &&
    typeof order.marketId === "string" &&
    typeof order.conditionId === "string" &&
    typeof order.tokenId === "string" &&
    typeof order.marketLabel === "string" &&
    typeof order.outcome === "string" &&
    (order.status === "filled" || order.status === "pending" || order.status === "failed") &&
    isNullableString(order.orderId) &&
    isNullableString(order.transactionHash) &&
    isNullableString(order.error)
  );
}

export function parseStoredReceipt(raw: string | null): StoredReceipt | null {
  if (!raw || raw.length > 150_000) return null;
  try {
    const stored = JSON.parse(raw) as Partial<StoredReceipt>;
    const receipt = stored.receipt as Partial<SinglesBetReceipt> | undefined;
    if (
      typeof stored.userId !== "string" ||
      !receipt ||
      typeof receipt.bookingCode !== "string" ||
      !isBookingCode(receipt.bookingCode) ||
      !["filled", "partial", "pending", "failed"].includes(receipt.status ?? "") ||
      !["saving", "saved", "unsaved"].includes(receipt.persistence ?? "") ||
      !isNullableString(receipt.saveError) ||
      typeof receipt.requestedStakeE6 !== "string" ||
      typeof receipt.spentE6 !== "string" ||
      typeof receipt.referenceReturnE6 !== "string" ||
      typeof receipt.requestedStake !== "string" ||
      typeof receipt.spent !== "string" ||
      typeof receipt.referenceReturn !== "string" ||
      typeof receipt.filledCount !== "number" ||
      typeof receipt.acceptedCount !== "number" ||
      !Array.isArray(receipt.orders) ||
      receipt.orders.length < 1 ||
      receipt.orders.length > 15 ||
      !receipt.orders.every(isOrder) ||
      typeof receipt.placedAt !== "number"
    ) {
      return null;
    }
    return stored as StoredReceipt;
  } catch {
    return null;
  }
}

function cachedStoredReceipt(raw: string): StoredReceipt | null {
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedReceipt = parseStoredReceipt(raw);
  }
  return cachedReceipt;
}

function readSnapshot(): string {
  if (typeof window === "undefined") return EMPTY_SNAPSHOT;
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? memorySnapshot;
  } catch {
    return memorySnapshot;
  }
}

function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      memorySnapshot = event.newValue ?? EMPTY_SNAPSHOT;
      notify();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(STORAGE_EVENT, notify);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(STORAGE_EVENT, notify);
  };
}

export function writeStoredReceipt(userId: string, receipt: SinglesBetReceipt) {
  memorySnapshot = JSON.stringify({ userId, receipt });
  try {
    window.localStorage.setItem(STORAGE_KEY, memorySnapshot);
  } catch {
    // Receipt still remains durable on the backend when browser storage is unavailable.
  }
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

export function updateStoredReceipt(
  userId: string,
  updater: (receipt: SinglesBetReceipt) => SinglesBetReceipt
) {
  const stored = parseStoredReceipt(readSnapshot());
  if (!stored || stored.userId !== userId) return;
  writeStoredReceipt(userId, updater(stored.receipt));
}

export function clearStoredReceipt(userId: string) {
  const stored = parseStoredReceipt(readSnapshot());
  if (stored && stored.userId !== userId) return;
  memorySnapshot = EMPTY_SNAPSHOT;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing else to clear when storage is unavailable.
  }
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

export function useStoredReceipt(userId: string | null): SinglesBetReceipt | null {
  const raw = useSyncExternalStore(subscribe, readSnapshot, () => EMPTY_SNAPSHOT);
  const stored = cachedStoredReceipt(raw);
  return userId && stored?.userId === userId ? stored.receipt : null;
}
