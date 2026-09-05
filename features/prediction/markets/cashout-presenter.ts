import type { RawPosition } from "@/features/prediction/lib/positions";

function shares(position: RawPosition): number {
  const value = Number(position.size ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function activeCashoutPositions<T extends RawPosition>(positions: T[]): T[] {
  return positions.filter((position) => position.redeemable !== true && shares(position) > 0);
}
