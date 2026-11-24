// Checks for the customer KYC Paycrest requires on an onramp order. Paycrest
// validates these itself; checking first saves the user a failed round trip.

/** True when an ISO date of birth (YYYY-MM-DD) is at least 18 years before `today`. */
export function isAdult(birthDate: string, today = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const eighteenth = new Date(year + 18, month - 1, day);
  return eighteenth.getTime() <= today.getTime();
}
