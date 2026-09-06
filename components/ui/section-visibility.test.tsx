import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { SectionVisibility, useSectionActive } from "@/components/ui/section-visibility";

let trigger: ((entries: { isIntersecting: boolean }[]) => void) | null = null;

class FakeIntersectionObserver {
  constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
    trigger = callback;
  }
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

/** Stands in for a polling hook: reports whether it would be asking for data. */
function Poller() {
  const active = useSectionActive();
  return <span data-testid="poller">{active ? "polling" : "paused"}</span>;
}

beforeEach(() => {
  trigger = null;
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SectionVisibility", () => {
  it("pauses the polls inside it until the section is on screen", () => {
    render(
      <SectionVisibility>
        <Poller />
      </SectionVisibility>
    );
    expect(screen.getByTestId("poller")).toHaveTextContent("paused");
  });

  it("resumes them when the section scrolls into view", () => {
    render(
      <SectionVisibility>
        <Poller />
      </SectionVisibility>
    );
    act(() => trigger?.([{ isIntersecting: true }]));
    expect(screen.getByTestId("poller")).toHaveTextContent("polling");
  });

  it("pauses again on the way past", () => {
    vi.useFakeTimers();
    render(
      <SectionVisibility>
        <Poller />
      </SectionVisibility>
    );
    act(() => trigger?.([{ isIntersecting: true }]));
    act(() => trigger?.([{ isIntersecting: false }]));
    act(() => {
      vi.advanceTimersByTime(2_500);
    });
    expect(screen.getByTestId("poller")).toHaveTextContent("paused");
    vi.useRealTimers();
  });

  it("reaches a hook nested well below the section", () => {
    // The reason this is a context and not a prop: the polls live several
    // components deep and nothing in between should have to carry a flag.
    const Deep = () => (
      <div>
        <div>
          <Poller />
        </div>
      </div>
    );
    render(
      <SectionVisibility>
        <Deep />
      </SectionVisibility>
    );
    act(() => trigger?.([{ isIntersecting: true }]));
    expect(screen.getByTestId("poller")).toHaveTextContent("polling");
  });

  it("leaves anything outside a section polling as it always did", () => {
    // Modals and other routes render these hooks too, and must not go quiet
    // just because nobody wrapped them.
    render(<Poller />);
    expect(screen.getByTestId("poller")).toHaveTextContent("polling");
  });

  it("cannot gate a component that renders the provider itself", () => {
    // The trap that made the real RWA gating dead code. A section calling
    // useSectionActive() in its OWN body sits ABOVE its own returned JSX, so
    // it reads the default and polls forever. The provider has to be hoisted
    // above the section component, which is why app/(app)/dashboard/page.tsx wraps
    // each section rather than each section wrapping itself.
    function SelfWrapping() {
      const active = useSectionActive();
      return (
        <SectionVisibility>
          <span data-testid="self">{active ? "polling" : "paused"}</span>
        </SectionVisibility>
      );
    }
    render(<SelfWrapping />);
    act(() => trigger?.([{ isIntersecting: false }]));
    // Still "polling": proof the pattern does not work, kept so nobody
    // reintroduces it believing it does.
    expect(screen.getByTestId("self")).toHaveTextContent("polling");
  });

  it("keeps rendering its children either way, so no layout depends on this", () => {
    render(
      <SectionVisibility className="section">
        <p>content</p>
      </SectionVisibility>
    );
    expect(screen.getByText("content")).toBeInTheDocument();
  });
});
