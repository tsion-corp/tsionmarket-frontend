import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    render(<Probe />);
    act(() => trigger?.([{ isIntersecting: true }]));
    act(() => trigger?.([{ isIntersecting: false }]));
    expect(screen.getByTestId("probe")).toHaveTextContent("idle");
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
