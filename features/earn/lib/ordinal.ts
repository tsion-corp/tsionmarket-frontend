// Winner positions read as "1st", "2nd", "3rd". Shared by the listing's reward
// breakdown and the entrant's own result, so the two never disagree.

const SUFFIX: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };

export function ordinal(n: number): string {
  // 11th, 12th and 13th break the last-digit rule.
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  return `${n}${SUFFIX[n % 10] ?? "th"}`;
}
