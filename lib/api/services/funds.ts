"use client";

import { apiFetch } from "@/lib/api";
import { createServiceClient, type QueryParams } from "@/lib/api/service";

export const pouchClient = createServiceClient(
  "/api/pouch",
  "Pouch service unavailable right now."
);
export const paymentClient = createServiceClient(
  "/api/payment",
  "Payment service unavailable right now."
);
export const rampingClient = createServiceClient(
  "/api/ramping",
  "Ramping service unavailable right now."
);

export async function fetchPouchRate(type?: "BUY" | "SELL"): Promise<{ rate: number }> {
  const query: QueryParams = type ? { type } : {};
  return pouchClient.get<{ rate: number }>("/rate", query);
}

export async function pouchPostWithAuth<T>(
  path: string,
  body: unknown,
  token?: string
): Promise<T> {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await apiFetch(`/api/pouch${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = "Request failed";
    try {
      const data = await res.json();
      if (data && typeof data.error === "string") message = data.error;
    } catch {
      // Keep fallback
    }
    throw new Error(message);
  }

  return res.json();
}

export async function pouchGetWithAuth<T>(
  path: string,
  params: QueryParams = {},
  token?: string
): Promise<T> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  const url = `/api/pouch${path}${qs ? `?${qs}` : ""}`;

  const headers: HeadersInit = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await apiFetch(url, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    let message = "Request failed";
    try {
      const data = await res.json();
      if (data && typeof data.error === "string") message = data.error;
    } catch {
      // Keep fallback
    }
    throw new Error(message);
  }

  return res.json();
}
