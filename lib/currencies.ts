export interface Currency {
  code: string;
  name: string;
  symbol: string;
  region: "Africa" | "Global";
}

// Major African currencies first, since that is the primary audience, then a
// few globals for reference. All are covered by the FX source.
export const CURRENCIES: Currency[] = [
  { code: "USD", name: "US Dollar", symbol: "$", region: "Global" },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦", region: "Africa" },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh", region: "Africa" },
  { code: "GHS", name: "Ghanaian Cedi", symbol: "₵", region: "Africa" },
  { code: "ZAR", name: "South African Rand", symbol: "R", region: "Africa" },
  { code: "EGP", name: "Egyptian Pound", symbol: "E£", region: "Africa" },
  { code: "UGX", name: "Ugandan Shilling", symbol: "USh", region: "Africa" },
  { code: "TZS", name: "Tanzanian Shilling", symbol: "TSh", region: "Africa" },
  { code: "MAD", name: "Moroccan Dirham", symbol: "DH", region: "Africa" },
  { code: "RWF", name: "Rwandan Franc", symbol: "FRw", region: "Africa" },
  { code: "ETB", name: "Ethiopian Birr", symbol: "Br", region: "Africa" },
  { code: "ZMW", name: "Zambian Kwacha", symbol: "ZK", region: "Africa" },
  { code: "BWP", name: "Botswana Pula", symbol: "P", region: "Africa" },
  { code: "MUR", name: "Mauritian Rupee", symbol: "₨", region: "Africa" },
  { code: "EUR", name: "Euro", symbol: "€", region: "Global" },
  { code: "GBP", name: "British Pound", symbol: "£", region: "Global" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", region: "Global" },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM", region: "Global" },
];

export const DEFAULT_CURRENCY = "USD";

// ISO 3166 country code per currency, for real flag icons. The CFA francs span
// several countries, so they fall back to their currency symbol.
export const CURRENCY_COUNTRY: Record<string, string> = {
  USD: "us",
  NGN: "ng",
  KES: "ke",
  GHS: "gh",
  ZAR: "za",
  EGP: "eg",
  UGX: "ug",
  TZS: "tz",
  MAD: "ma",
  RWF: "rw",
  ETB: "et",
  ZMW: "zm",
  BWP: "bw",
  MUR: "mu",
  EUR: "eu",
  GBP: "gb",
  CNY: "cn",
  MYR: "my",
  AUD: "au",
  NZD: "nz",
};

export function findCurrency(code: string): Currency | undefined {
  return CURRENCIES.find((c) => c.code === code);
}

export function searchCurrencies(query: string): Currency[] {
  const q = query.trim().toLowerCase();
  if (!q) return CURRENCIES;
  return CURRENCIES.filter(
    (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
  );
}

// Zero-decimal currencies where cents are not shown.
const NO_DECIMALS = new Set(["NGN", "UGX", "TZS", "XOF", "XAF", "RWF"]);

export function formatMoney(amountUsd: number, currency: Currency, rate: number): string {
  const value = amountUsd * rate;
  const noDecimals = NO_DECIMALS.has(currency.code);
  // Every caller shows an amount of money, never a unit price, so a non-zero
  // dust balance rounds up to the smallest displayed unit with a "<" marker
  // instead of spilling into sub-cent digits. Unit prices that need those
  // digits use subscriptZeros directly.
  if (value > 0 && value < (noDecimals ? 1 : 0.01)) {
    return `<${currency.symbol}${noDecimals ? "1" : "0.01"}`;
  }
  const fractionDigits = noDecimals ? 0 : 2;
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return `${currency.symbol}${formatted}`;
}
