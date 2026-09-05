import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, act } from "@testing-library/react";
import { useInView } from "@/hooks/use-in-view";

/** Captures the observer so a test can drive intersection by hand. */
let trigger: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
let observed = 0;
let disconnected = 0;

class FakeIntersectionObserver {
  constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
    trigger = callback;
  }
  observe() {
    observed += 1;
  }
  disconnect() {
    disconnected += 1;
  }
  unobserve() {}
  takeRecords() {
    return [];
  }
}

function Probe() {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="probe">
      {inView ? "polling" : "idle"}
    </div>
  );
}

beforeEach(() => {
  trigger = null;
  observed = 0;
  disconnected = 0;
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useInView", () => {
  it("starts idle, so a section below the fold pays nothing on load", () => {
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("idle");
    expect(observed).toBe(1);
  });

  it("wakes when the section scrolls into view", () => {
    render(<Probe />);
    act(() => trigger?.([{ isIntersecting: true }]));
    expect(screen.getByTestId("probe")).toHaveTextContent("polling");
  });

  it("goes idle again when the section scrolls away", () => {
    // The half that actually saves the traffic: scrolling past the perp desk
    // has to stop its five second poll, not just delay starting it.
    vi.useFakeTimers();
    render(<Probe />);
    act(() => trigger?.([{ isIntersecting: true }]));
    act(() => trigger?.([{ isIntersecting: false }]));
    act(() => {
      vi.advanceTimersByTime(2_500);
    });
    expect(screen.getByTestId("probe")).toHaveTextContent("idle");
    vi.useRealTimers();
  });

  it("does not thrash when a flick-scroll crosses the section twice", () => {
    // Leaving is delayed on purpose. Without it, scrolling past the perp desk
    // tore down and rebuilt its price socket on every pass.
    vi.useFakeTimers();
    render(<Probe />);
    act(() => trigger?.([{ isIntersecting: true }]));
    act(() => trigger?.([{ isIntersecting: false }]));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(() => trigger?.([{ isIntersecting: true }]));
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    // Back in view before the grace expired, so it never went idle.
    expect(screen.getByTestId("probe")).toHaveTextContent("polling");
    vi.useRealTimers();
  });

  it("observes an element that mounts LATER, not just one present on first render", () => {
    // The bug this hook shipped with. The perp chart on a phone lives inside a
    // trade sheet that renders null until opened, so the node did not exist
    // when the old effect ran. With constant deps it never re-ran and the
    // chart never appeared at all.
    function LateMount() {
      const [ref, inView] = useInView<HTMLDivElement>();
      const [mounted, setMounted] = useState(false);
      return (
        <>
          <button onClick={() => setMounted(true)}>show</button>
          {mounted ? (
            <div ref={ref} data-testid="late">
              {inView ? "polling" : "idle"}
            </div>
          ) : null}
        </>
      );
    }
    render(<LateMount />);
    expect(screen.queryByTestId("late")).not.toBeInTheDocument();

    act(() => {
      screen.getByText("show").click();
    });
    // The observer must have attached on mount, so an intersection reaches it.
    act(() => trigger?.([{ isIntersecting: true }]));
    expect(screen.getByTestId("late")).toHaveTextContent("polling");
  });

  it("disconnects the observer on unmount", () => {
    const { unmount } = render(<Probe />);
    unmount();
    expect(disconnected).toBe(1);
  });

  it("never holds a section back where the browser cannot observe", async () => {
    // Losing the section entirely would be worse than the traffic.
    vi.stubGlobal("IntersectionObserver", undefined);
    vi.useFakeTimers();
    render(<Probe />);
    await act(async () => {
      vi.runAllTimers();
    });
    expect(screen.getByTestId("probe")).toHaveTextContent("polling");
    vi.useRealTimers();
  });
});
