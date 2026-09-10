import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import { SpotSection } from "@/features/trade/components/spot-section";

// The section is a composer: it picks one of two interfaces and gives them a
// container. Both are stubbed, so what is asserted here is the choosing and the
// container, not either interface's own rendering.
vi.mock("@/features/trade/components/spot-simple-view", () => ({
  SpotSimpleView: () => <div data-testid="simple-view" />,
}));

// next/dynamic is held at its loading frame. The pro terminal is fetched on
// demand, and the frame between the flip and the chunk landing is the one thing
// about that import this file owns, so it is the frame the tests see.
vi.mock("next/dynamic", () => ({
  default: (_loader: unknown, options?: { loading?: () => React.ReactNode }) => {
    const Pending = () => (options?.loading ? options.loading() : null);
    return Pending;
  },
}));

const modeState = { mode: "simple" as "simple" | "pro" };

vi.mock("@/features/trade/components/spot-mode", () => ({
  useSpotMode: () => ({ mode: modeState.mode, setMode: vi.fn() }),
  SpotModeSwitch: () => <div data-testid="mode-switch" />,
}));

function renderSection() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SpotSection />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  modeState.mode = "simple";
  vi.clearAllMocks();
});

describe("SpotSection", () => {
  it("shows the simple market list by default", () => {
    renderSection();
    expect(screen.getByTestId("simple-view")).toBeInTheDocument();
  });

  it("puts the pro terminal in the simple list's place once the mode is flipped", () => {
    modeState.mode = "pro";
    renderSection();
    expect(screen.queryByTestId("simple-view")).not.toBeInTheDocument();
  });

  it("announces the wait while the pro terminal's code is still arriving", () => {
    modeState.mode = "pro";
    renderSection();

    // The terminal is loaded on demand, so the first paint after the flip has
    // no interface in it. A blank panel with nothing said is the defect: the
    // reader cannot tell a slow chunk from a broken screen.
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(en.spot.loadingMarkets);
  });

  it("draws no loading frame for the simple list, which is not loaded on demand", () => {
    renderSection();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps the design's 20px phone gutter", () => {
    const { container } = renderSection();
    const section = container.firstElementChild;
    // 402px frame, 362px content column, so 20px each side (Figma 1:7825).
    expect(section?.className).toContain("p-5");
  });
});
