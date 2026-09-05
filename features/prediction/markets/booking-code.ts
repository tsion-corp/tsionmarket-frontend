export const BOOKING_CODE_LENGTH = 6;

const BOOKING_CODE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const BOOKING_CODE_PATTERN = /^[A-Z0-9]{6}$/u;
const FNV_OFFSET_BASIS = 14_695_981_039_346_656_037n;
const FNV_PRIME = 1_099_511_628_211n;

export function normalizeBookingCodeInput(value: string): string {
  return value
    .replace(/[^a-z0-9]/giu, "")
    .slice(0, BOOKING_CODE_LENGTH)
    .toUpperCase();
}

export function isBookingCode(value: string): boolean {
  return BOOKING_CODE_PATTERN.test(value);
}

export function bookingCodeFromSeed(seed: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (const byte of new TextEncoder().encode(seed)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * FNV_PRIME);
  }

  let code = "";
  for (let index = 0; index < BOOKING_CODE_LENGTH; index += 1) {
    code = BOOKING_CODE_ALPHABET[Number(hash % 36n)] + code;
    hash /= 36n;
  }
  return code;
}
