import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The chart's colour is a claim about the market. A coin whose 24h change is
// not published is neither up nor down, so it draws neutral, not green.

const chart = vi.hoisted(() => ({
  addSeries: vi.fn(() => ({ setData: vi.fn() })),
  timeScale: () => ({ fitContent: vi.fn() }),
  applyOptions: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("lightweight-charts", () => ({
  AreaSeries: "area",
  CandlestickSeries: "candles",
  ColorType: { Solid: "solid" },
  createChart: () => chart,
}));

import { PriceChart } from "@/components/ui/price-chart";

class Observer {
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  chart.addSeries.mockClear();
  globalThis.ResizeObserver = Observer as unknown as typeof ResizeObserver;
});

const points = [
  { time: 1, value: 1 },
  { time: 2, value: 2 },
];

function lineColor(): string {
  const options = chart.addSeries.mock.calls[0] as unknown as [string, { lineColor: string }];
  return options[1].lineColor;
}

describe("PriceChart trend colour", () => {
  it("draws green up and red down", () => {
    const { unmount } = render(<PriceChart points={points} up />);
    expect(lineColor()).toBe("#7CE7B0");
    unmount();
    chart.addSeries.mockClear();
    render(<PriceChart points={points} up={false} />);
    expect(lineColor()).toBe("#F6A5A5");
  });

  it("draws neutral when the direction is unknown", () => {
    render(<PriceChart points={points} up={null} />);
    expect(lineColor()).not.toBe("#7CE7B0");
    expect(lineColor()).not.toBe("#F6A5A5");
  });
});
