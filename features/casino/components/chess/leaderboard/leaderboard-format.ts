import type { ChessLeaderboardPerfKey } from "@/features/casino/lib/api/types";

export const LEADERBOARD_PERFS: ReadonlyArray<{
  value: ChessLeaderboardPerfKey;
  label: string;
}> = [
  { value: "rapid", label: "Rapid" },
  { value: "blitz", label: "Blitz" },
  { value: "bullet", label: "Bullet" },
  { value: "ultraBullet", label: "UltraBullet" },
  { value: "classical", label: "Classical" },
];

export function perfLabel(perf: ChessLeaderboardPerfKey): string {
  return LEADERBOARD_PERFS.find((item) => item.value === perf)?.label ?? perf;
}

export function countryFlag(countryCode: string | null): string {
  const code = countryCode?.trim().toUpperCase();
  if (!code || !/^[A-Z]{2}$/u.test(code)) return "";
  return String.fromCodePoint(...[...code].map((letter) => letter.charCodeAt(0) + 127397));
}

export function countryName(countryCode: string | null): string {
  const code = countryCode?.trim().toUpperCase();
  if (!code || !/^[A-Z]{2}$/u.test(code)) return "Unknown country";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function playerName(displayName: string | null, player: string): string {
  const name = displayName?.trim();
  if (name) return name;
  if (player.length <= 14) return player;
  return `${player.slice(0, 6)}...${player.slice(-4)}`;
}

export function signedNumber(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toLocaleString()}`;
}
