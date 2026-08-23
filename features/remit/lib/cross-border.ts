// Cross-border payout corridors and pure helpers for the remittance flow. A
// user funds from their USDC balance and the recipient is paid in local
// currency through a mobile-money wallet or a bank account (for example a
// Nigerian user paying a Kenyan vendor into M-Pesa). The payout rail is not
// wired to a provider yet, so these types and helpers back the UI only. Every
// function here is pure and unit tested, and all money math is done in integer
// cents so the amounts shown never drift.

import { findCurrency, formatMoney, type Currency } from "@/lib/currencies";

export type PayoutMethodId = "mobile_money" | "bank";

// A mobile-money network within a country (M-Pesa, MTN MoMo, and so on). The
// recipient's number is held by one of these wallets.
export interface MobileNetwork {
  id: string;
  name: string;
}

export interface PayoutCountry {
  // ISO 3166-1 alpha-2, lowercased. Matches flagcdn and CURRENCY_COUNTRY values.
  code: string;
  name: string;
  // Links to a CURRENCIES entry so the recipient amount localizes correctly.
  currency: string;
  // International dialling prefix, shown before a mobile number.
  dialCode: string;
  // Payout rails available in this corridor, in the order to present them.
  methods: PayoutMethodId[];
  // Mobile-money networks for this country. Empty when it has no mobile rail.
  networks: MobileNetwork[];
}

// The corridors we present, African markets first since that is the audience.
// Ordered by how common the corridor is for our users. Every currency here is
// covered by the FX source and the CURRENCIES list.
export const PAYOUT_COUNTRIES: PayoutCountry[] = [
  {
    code: "ke",
    name: "Kenya",
    currency: "KES",
    dialCode: "+254",
    methods: ["mobile_money", "bank"],
    networks: [
      { id: "mpesa", name: "M-Pesa" },
      { id: "airtel", name: "Airtel Money" },
    ],
  },
  {
    code: "ng",
    name: "Nigeria",
    currency: "NGN",
    dialCode: "+234",
    methods: ["bank", "mobile_money"],
    networks: [
      { id: "opay", name: "OPay" },
      { id: "palmpay", name: "PalmPay" },
      { id: "momo", name: "MoMo" },
    ],
  },
  {
    code: "gh",
    name: "Ghana",
    currency: "GHS",
    dialCode: "+233",
    methods: ["mobile_money", "bank"],
    networks: [
      { id: "mtn", name: "MTN MoMo" },
      { id: "telecel", name: "Telecel Cash" },
      { id: "airteltigo", name: "AirtelTigo Money" },
    ],
  },
  {
    code: "ug",
    name: "Uganda",
    currency: "UGX",
    dialCode: "+256",
    methods: ["mobile_money", "bank"],
    networks: [
      { id: "mtn", name: "MTN MoMo" },
      { id: "airtel", name: "Airtel Money" },
    ],
  },
  {
    code: "tz",
    name: "Tanzania",
    currency: "TZS",
    dialCode: "+255",
    methods: ["mobile_money", "bank"],
    networks: [
      { id: "mpesa", name: "M-Pesa" },
      { id: "tigo", name: "Mixx by Yas" },
      { id: "airtel", name: "Airtel Money" },
    ],
  },
  {
    code: "rw",
    name: "Rwanda",
    currency: "RWF",
    dialCode: "+250",
    methods: ["mobile_money", "bank"],
    networks: [
      { id: "mtn", name: "MTN MoMo" },
      { id: "airtel", name: "Airtel Money" },
    ],
  },
  {
    code: "za",
    name: "South Africa",
    currency: "ZAR",
    dialCode: "+27",
    methods: ["bank"],
    networks: [],
  },
  {
    code: "et",
    name: "Ethiopia",
    currency: "ETB",
    dialCode: "+251",
    methods: ["bank"],
    networks: [],
  },
  {
    code: "us",
    name: "United States",
    currency: "USD",
    dialCode: "+1",
    methods: ["bank"],
    networks: [],
  },
  {
    code: "gb",
    name: "United Kingdom",
    currency: "GBP",
    dialCode: "+44",
    methods: ["bank"],
    networks: [],
  },
  {
    code: "de",
    name: "Germany",
    currency: "EUR",
    dialCode: "+49",
    methods: ["bank"],
    networks: [],
  },
  {
    code: "cn",
    name: "China",
    currency: "CNY",
    dialCode: "+86",
    methods: ["bank"],
    networks: [],
  },
  {
    code: "my",
    name: "Malaysia",
    currency: "MYR",
    dialCode: "+60",
    methods: ["bank"],
    networks: [],
  },
];

export const PAYOUT_METHOD_LABEL: Record<PayoutMethodId, string> = {
  mobile_money: "Mobile money",
  bank: "Bank account",
};

export function findPayoutCountry(code: string): PayoutCountry | undefined {
  return PAYOUT_COUNTRIES.find((c) => c.code === code);
}

export function searchPayoutCountries(query: string): PayoutCountry[] {
  const q = query.trim().toLowerCase();
  if (!q) return PAYOUT_COUNTRIES;
  return PAYOUT_COUNTRIES.filter(
    (c) => c.name.toLowerCase().includes(q) || c.currency.toLowerCase().includes(q)
  );
}

// The recipient currency for a country. Falls back to USD only if the currency
// is somehow missing from the list, so a label is never blank.
export function countryCurrency(country: PayoutCountry): Currency {
  return findCurrency(country.currency) ?? findCurrency("USD")!;
}

export function supportsMethod(country: PayoutCountry, method: PayoutMethodId): boolean {
  return country.methods.includes(method);
}

// The first payout method for a country, used as the default selection.
export function defaultMethod(country: PayoutCountry): PayoutMethodId {
  return country.methods[0];
}

// Flat fee in basis points on the send amount. Display only until the payout
// provider returns a real quote. 100 bps = 1%.
export const FEE_BPS = 100;

// Fee in USD, rounded to the cent. Integer-cent math so the value never drifts.
export function feeUsd(amountUsd: number): number {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return 0;
  const cents = Math.round(amountUsd * 100);
  const feeCents = Math.round((cents * FEE_BPS) / 10000);
  return feeCents / 100;
}

// Total debited from the wallet: the send amount plus the fee, to the cent.
export function totalDebitUsd(amountUsd: number): number {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return 0;
  const cents = Math.round(amountUsd * 100);
  const feeCents = Math.round((cents * FEE_BPS) / 10000);
  return (cents + feeCents) / 100;
}

// Localized string of what the recipient receives, for the live preview. A null
// rate (not loaded yet) yields null so the caller can show a placeholder rather
// than a wrong number.
export function recipientReceives(
  amountUsd: number,
  country: PayoutCountry,
  rate: number | null
): string | null {
  if (rate == null || !Number.isFinite(amountUsd) || amountUsd <= 0) return null;
  // Never abbreviated: this is the figure the recipient is actually paid, and
  // "KSh12.9K" does not tell them what lands in their hands.
  return formatMoney(amountUsd, countryCurrency(country), rate, { exact: true });
}

// A name must have at least two letters and contain no digits, so an obviously
// empty or wrong entry is caught before review.
export function isValidName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 2 && /^[\p{L}][\p{L}\s'.-]*$/u.test(trimmed);
}

// A mobile number is 7 to 12 digits once spaces and a leading zero are removed.
// The dial code is stored separately, so only the local part is validated here.
export function isValidMobile(number: string): boolean {
  const digits = number.replace(/\D/g, "").replace(/^0+/, "");
  return digits.length >= 7 && digits.length <= 12;
}

// A bank account number is 6 to 18 digits. Ranges differ by country, so this is
// a permissive shape check, not a country-specific rule.
export function isValidAccount(number: string): boolean {
  const digits = number.replace(/\D/g, "");
  return digits.length >= 6 && digits.length <= 18;
}

// Masks all but the last four digits of an account or mobile number for the
// review summary, so the full number is not shown back in plain text.
export function maskNumber(number: string): string {
  const digits = number.replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  return `••••${digits.slice(-4)}`;
}
