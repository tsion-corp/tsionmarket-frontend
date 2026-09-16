export const POLYMARKET_BET_CODE_LENGTH = 6;
export const AZURO_BET_CODE_LENGTH = 8;

export function normalizeHexBetCodeInput(value: string, length: number): string {
  return value
    .replace(/[^a-f0-9]/giu, "")
    .slice(0, length)
    .toUpperCase();
}

export function isHexBetCode(value: string, length: number): boolean {
  return value.length === length && /^[A-F0-9]+$/u.test(value);
}
