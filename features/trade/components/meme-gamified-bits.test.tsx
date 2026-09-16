import { render, renderHook, screen } from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import messages from "@/messages/en.json";
import {
  ChangeBar,
  HeatBar,
  MomentumTag,
  RankRing,
  TimeframeLabel,
  WhatIfLine,
  formatMetric,
  signedPercent,
  timeframeLabelKey,
} from "@/features/trade/components/meme-gamified-bits";
import { momentumOf } from "@/lib/meme/momentum";

function wrap(ui: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

function screenerT() {
  const { result } = renderHook(() => useTranslations("memeScreener"), {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale="en" messages={messages}>
        {children}
      </NextIntlClientProvider>
    ),
  });
  return result.current;
}

describe("RankRing", () => {
  it("draws the rank with the stronger silver ring for the top three", () => {
    wrap(<RankRing rank={2} />);
    const ring = screen.getByText("#2");
    expect(ring).toHaveClass("ring-[#d8d8dc]/45", "font-bold");
  });

  it("draws a quieter ring past the top three", () => {
    wrap(<RankRing rank={4} />);
    const ring = screen.getByText("#4");
    expect(ring).toHaveClass("ring-[#d8d8dc]/20", "text-white/60");
    expect(ring).not.toHaveClass("ring-[#d8d8dc]/45");
  });
});

describe("MomentumTag", () => {
  it.each([
    ["50", "🚀", "Mooning", "text-up"],
    ["10", "🔥", "Pumping", "text-up"],
    ["-10", "🧊", "Cooling", "text-down"],
    ["-30", "🩸", "Dumping", "text-down"],
  ])("tags a %s%% move with %s %s", (change, emoji, word, tone) => {
    wrap(<MomentumTag momentum={momentumOf(change)} />);
    const tag = screen.getByText(word).closest("span[data-momentum]");
    expect(tag).not.toBeNull();
    expect(tag).toHaveClass(tone);
    const glyph = screen.getByText(emoji);
    expect(glyph).toHaveAttribute("aria-hidden", "true");
  });

  it("draws nothing for a small move or a missing one", () => {
    const { container } = wrap(
      <>
        <MomentumTag momentum={momentumOf("9.99")} />
        <MomentumTag momentum={momentumOf(null)} />
      </>
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("WhatIfLine", () => {
  it("shows what $100 became, exactly, coloured as a gain", () => {
    wrap(<WhatIfLine change="12.340000000000002" timeframe="1h" />);
    const line = screen.getByText("$100 → $112.34");
    expect(line).toHaveClass("text-up");
    expect(line).toHaveAttribute("title", "What $100 bought 1h ago is worth now");
  });

  it("groups a large result and keeps both cents digits", () => {
    wrap(<WhatIfLine change="1234.3" timeframe="24h" />);
    expect(screen.getByText("$100 → $1,334.30")).toBeInTheDocument();
  });

  it("colours a loss down and floors a wipe-out at zero", () => {
    wrap(
      <>
        <WhatIfLine change="-4.5" timeframe="5m" />
        <WhatIfLine change="-100" timeframe="5m" />
      </>
    );
    expect(screen.getByText("$100 → $95.50")).toHaveClass("text-down");
    expect(screen.getByText("$100 → $0.00")).toHaveClass("text-down");
  });

  it("is hidden, not shown as $100, when there is no change", () => {
    const { container } = wrap(<WhatIfLine change={null} timeframe="24h" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("HeatBar", () => {
  function fill(container: HTMLElement): HTMLElement {
    const bar = container.querySelector<HTMLElement>("[data-heat] .rounded-full > .rounded-full");
    if (bar === null) throw new Error("no heat fill rendered");
    return bar;
  }

  it("fills to the coin's share of the busiest volume", () => {
    const { container } = wrap(<HeatBar share={42} />);
    expect(fill(container).style.width).toBe("42%");
    expect(screen.queryByText("No volume data")).toBeNull();
  });

  it("leaves the track empty and says so when the volume is unknown", () => {
    const { container } = wrap(<HeatBar share={null} />);
    expect(fill(container).style.width).toBe("0%");
    expect(screen.getByText("No volume data")).toHaveClass("sr-only");
  });
});

describe("ChangeBar", () => {
  it("fills up for a gain, capped at the full width", () => {
    const { container } = wrap(<ChangeBar change="250.5" />);
    const bar = container.querySelector<HTMLElement>(".bg-up");
    expect(bar?.style.width).toBe("100%");
  });

  it("fills down for a loss by whole points", () => {
    const { container } = wrap(<ChangeBar change="-12.9" />);
    const bar = container.querySelector<HTMLElement>(".bg-down");
    expect(bar?.style.width).toBe("12%");
  });

  it("draws nothing without a change", () => {
    const { container } = wrap(<ChangeBar change={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("timeframe labels", () => {
  it("names the catalogue key for a window", () => {
    expect(timeframeLabelKey("12h")).toBe("timeframe12h");
  });

  it("renders the window's label", () => {
    wrap(<TimeframeLabel timeframe="5m" />);
    expect(screen.getByText("5m")).toBeInTheDocument();
  });
});

describe("signedPercent", () => {
  it("signs and rounds a change half up to two places, exactly", () => {
    expect(signedPercent("12.345")).toBe("+12.35%");
    expect(signedPercent("0")).toBe("+0.00%");
    expect(signedPercent("-4.5")).toBe("-4.50%");
    expect(signedPercent("12.340000000000002")).toBe("+12.34%");
  });

  it("is null for a missing or unreadable change", () => {
    expect(signedPercent(null)).toBeNull();
    expect(signedPercent("n/a")).toBeNull();
  });
});

describe("formatMetric", () => {
  it("formats money compactly and keeps a missing figure as a dash", () => {
    const t = screenerT();
    expect(formatMetric({ kind: "usd", value: "1500000" }, t)).toBe("$1.5M");
    expect(formatMetric({ kind: "usd", value: null }, t)).toBe("—");
  });

  it("groups counts and never turns null into 0", () => {
    const t = screenerT();
    expect(formatMetric({ kind: "count", value: 12345 }, t)).toBe("12,345");
    expect(formatMetric({ kind: "count", value: 0 }, t)).toBe("0");
    expect(formatMetric({ kind: "count", value: null }, t)).toBe("—");
  });

  it("reads age in minutes, then hours, then days", () => {
    const t = screenerT();
    expect(formatMetric({ kind: "age", minutes: 59 }, t)).toBe("59m");
    expect(formatMetric({ kind: "age", minutes: 60 }, t)).toBe("1h");
    expect(formatMetric({ kind: "age", minutes: 1439 }, t)).toBe("23h");
    expect(formatMetric({ kind: "age", minutes: 2880 }, t)).toBe("2d");
    expect(formatMetric({ kind: "age", minutes: null }, t)).toBe("—");
  });
});
