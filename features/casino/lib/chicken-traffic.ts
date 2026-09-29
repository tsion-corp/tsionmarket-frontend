const UINT32_RANGE = 0x1_0000_0000;

export const TRAFFIC_DELAY_MIN_MS = 100;
export const TRAFFIC_DELAY_MAX_MS = 7_000;
export const TRAFFIC_DELAY_MEAN_MS = 2_100;
export const TRAFFIC_FLIGHT_MIN_MS = 320;
export const TRAFFIC_FLIGHT_MAX_MS = 920;

type RandomUnit = () => number;

export interface ChickenTrafficPass {
  delayMs: number;
  durationMs: number;
  textureIndex: number;
}

export function secureRandomUnit(): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return (value[0] + 0.5) / UINT32_RANGE;
}

export function sampleTrafficDelayMs(random: RandomUnit = secureRandomUnit): number {
  const unit = clampUnit(random());
  const span = TRAFFIC_DELAY_MAX_MS - TRAFFIC_DELAY_MIN_MS;
  const truncatedMass = 1 - Math.exp(-span / TRAFFIC_DELAY_MEAN_MS);
  const delay = TRAFFIC_DELAY_MIN_MS - TRAFFIC_DELAY_MEAN_MS * Math.log1p(-unit * truncatedMass);
  return Math.round(delay);
}

export function sampleTrafficPass(
  textureCount: number,
  random: RandomUnit = secureRandomUnit
): ChickenTrafficPass {
  if (!Number.isSafeInteger(textureCount) || textureCount < 1) {
    throw new RangeError("textureCount must be a positive integer");
  }

  return {
    delayMs: sampleTrafficDelayMs(random),
    durationMs: sampleInteger(TRAFFIC_FLIGHT_MIN_MS, TRAFFIC_FLIGHT_MAX_MS, random),
    textureIndex: sampleInteger(0, textureCount - 1, random),
  };
}

function sampleInteger(minimum: number, maximum: number, random: RandomUnit): number {
  return minimum + Math.floor(clampUnit(random()) * (maximum - minimum + 1));
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError("random source must return a finite number");
  return Math.min(1 - Number.EPSILON, Math.max(0, value));
}
