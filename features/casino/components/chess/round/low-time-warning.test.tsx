import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LowTimeWarning } from "@/features/casino/components/chess/round/low-time-warning";
import { playLowTimeWarning } from "@/features/casino/lib/chess/sound";

vi.mock("@/features/casino/lib/chess/sound", () => ({
  playLowTimeWarning: vi.fn(),
}));

describe("LowTimeWarning", () => {
  beforeEach(() => {
    vi.mocked(playLowTimeWarning).mockClear();
  });

  it("plays once on entry to the final ten seconds and rearms above the threshold", () => {
    const view = render(<LowTimeWarning secondsLeft={11} live />);

    view.rerender(<LowTimeWarning secondsLeft={9.8} live />);
    expect(playLowTimeWarning).toHaveBeenCalledTimes(1);

    view.rerender(<LowTimeWarning secondsLeft={8.2} live />);
    expect(playLowTimeWarning).toHaveBeenCalledTimes(1);

    view.rerender(<LowTimeWarning secondsLeft={12} live />);
    view.rerender(<LowTimeWarning secondsLeft={9.9} live />);
    expect(playLowTimeWarning).toHaveBeenCalledTimes(2);
  });

  it("stays silent while the clock is inactive", () => {
    render(<LowTimeWarning secondsLeft={5} live={false} />);
    expect(playLowTimeWarning).not.toHaveBeenCalled();
  });
});
