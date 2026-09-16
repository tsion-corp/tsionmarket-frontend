import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoundClockValue } from "@/features/casino/components/chess/round/round-clock";

describe("RoundClockValue", () => {
  it("shows tenths only while the clock is actively running", () => {
    const { rerender } = render(<RoundClockValue mode="real_time" seconds={9.91} live active />);

    expect(screen.getByText("0:10.0")).toBeInTheDocument();

    rerender(<RoundClockValue mode="real_time" seconds={9.91} live active={false} />);

    expect(screen.getByText("00:09")).toBeInTheDocument();
  });

  it("freezes a finished clock at whole seconds", () => {
    render(<RoundClockValue mode="real_time" seconds={0} live={false} active={false} />);

    expect(screen.getByText("00:00")).toBeInTheDocument();
  });
});
