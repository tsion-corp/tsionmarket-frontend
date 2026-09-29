import { describe, expect, it } from "vitest";
import {
  TRAFFIC_DELAY_MAX_MS,
  TRAFFIC_DELAY_MEAN_MS,
  TRAFFIC_DELAY_MIN_MS,
  TRAFFIC_FLIGHT_MAX_MS,
  TRAFFIC_FLIGHT_MIN_MS,
  sampleTrafficDelayMs,
  sampleTrafficPass,
} from "@/features/casino/lib/chicken-traffic";

function lcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return (state + 0.5) / 0x1_0000_0000;
  };
}

describe("Chicken ambient traffic", () => {
  it("keeps every independently sampled pass inside the visual bounds", () => {
    const random = lcg(0xdecafbad);

    for (let index = 0; index < 10_000; index += 1) {
      const pass = sampleTrafficPass(7, random);
      expect(pass.delayMs).toBeGreaterThanOrEqual(TRAFFIC_DELAY_MIN_MS);
      expect(pass.delayMs).toBeLessThanOrEqual(TRAFFIC_DELAY_MAX_MS);
      expect(pass.durationMs).toBeGreaterThanOrEqual(TRAFFIC_FLIGHT_MIN_MS);
      expect(pass.durationMs).toBeLessThanOrEqual(TRAFFIC_FLIGHT_MAX_MS);
      expect(pass.textureIndex).toBeGreaterThanOrEqual(0);
      expect(pass.textureIndex).toBeLessThan(7);
    }
  });

  it("uses a non-periodic exponential arrival process", () => {
    const random = lcg(0x12345678);
    const samples = Array.from({ length: 100_000 }, () => sampleTrafficDelayMs(random));
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const lagCorrelation = correlation(samples.slice(0, -1), samples.slice(1));

    // Truncation lowers the configured unbounded mean while retaining the
    // memoryless shape over the visible interval.
    expect(mean).toBeGreaterThan(1_700);
    expect(mean).toBeLessThan(2_100 + TRAFFIC_DELAY_MEAN_MS * 0.05);
    expect(Math.abs(lagCorrelation)).toBeLessThan(0.02);
    expect(new Set(samples.slice(0, 1_000)).size).toBeGreaterThan(700);
  });

  it("does not expose a fixed flight duration or direction", () => {
    const random = lcg(0xabcdef01);
    const passes = Array.from({ length: 2_000 }, () => sampleTrafficPass(7, random));

    expect(new Set(passes.map((pass) => pass.durationMs)).size).toBeGreaterThan(500);
    expect(passes.some((pass) => pass.reverse)).toBe(true);
    expect(passes.some((pass) => !pass.reverse)).toBe(true);
  });
});

function correlation(left: number[], right: number[]): number {
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    covariance += leftDelta * rightDelta;
    leftVariance += leftDelta * leftDelta;
    rightVariance += rightDelta * rightDelta;
  }

  return covariance / Math.sqrt(leftVariance * rightVariance);
}
