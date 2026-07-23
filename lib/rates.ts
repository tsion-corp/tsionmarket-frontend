import { NGN_PER_USD } from "@/lib/currency";

export interface NgnRate {
  rate: number;
  updatedAt: string;
}

export const FALLBACK_NGN_RATE: NgnRate = {
  rate: NGN_PER_USD,
  updatedAt: "",
};

function validRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

async function fromErApi(): Promise<NgnRate> {
  const res = await fetch("https://open.er-api.com/v6/latest/USD");
  if (!res.ok) throw new Error(`er-api failed: ${res.status}`);
  const data = await res.json();
  if (!validRate(data?.rates?.NGN)) throw new Error("er-api response missing NGN");
  return { rate: data.rates.NGN, updatedAt: data.time_last_update_utc ?? "" };
}

async function fromCurrencyApi(): Promise<NgnRate> {
  const res = await fetch(
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json"
  );
  if (!res.ok) throw new Error(`currency-api failed: ${res.status}`);
  const data = await res.json();
  if (!validRate(data?.usd?.ngn)) throw new Error("currency-api response missing NGN");
  return { rate: data.usd.ngn, updatedAt: data.date ?? "" };
}

const SOURCES = [fromErApi, fromCurrencyApi];

// Tries each free source in order and returns the first good answer.
export async function fetchNgnRate(): Promise<NgnRate> {
  let lastError: unknown;
  for (const source of SOURCES) {
    try {
      return await source();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("All rate sources failed");
}
