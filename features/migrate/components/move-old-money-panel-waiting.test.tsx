// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/*
  The waiting screens, and only those.

  Discovery reads five venues and can sit on one unchanging line for twenty
  seconds; a run is a signature followed by a wait for it to land. Both used to
  say nothing was happening, which reads as a hang — so both carry a spinner,
  and neither offers a way out mid-flight.

  The panel pulls in Privy, wagmi and the whole venue stack, so this renders
  the two waiting branches through a thin harness rather than mounting it.
*/

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

// The real one, so its attributes are actually under test.
import { Spinner } from "@/features/migrate/components/move-old-money-panel";

function Step({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div>{title}</div>
      <p>{body}</p>
      {children}
    </div>
  );
}

// The two branches as the panel writes them.
function Checking() {
  return (
    <Step title="reviewTitle" body="checking">
      <div className="flex items-center gap-2 text-[12.5px] text-white/45">
        <Spinner />
        checkingNote
      </div>
    </Step>
  );
}

function Running({ done, total }: { done: number; total: number }) {
  return (
    <Step title="runningTitle" body="runningBody">
      <p className="tnum mt-2 flex items-center gap-2 text-[12.5px] text-white/55">
        <Spinner />
        {`${done} of ${total} steps`}
      </p>
    </Step>
  );
}

// The spinner is aria-hidden by design, so it is found by class rather than
// role — which is also how a reader would fail to find it, correctly.
const spinner = () => document.querySelector(".animate-spin") as HTMLElement;

describe("the panel's waiting screens", () => {
  it("says work is happening while discovery runs, and why it takes a moment", () => {
    render(<Checking />);
    expect(spinner()).toBeInTheDocument();
    expect(screen.getByText("checkingNote")).toBeInTheDocument();
  });

  it("marks the spinner decorative, so a reader hears the sentence not an image", () => {
    render(<Checking />);
    expect(spinner()).toHaveAttribute("aria-hidden");
  });

  it("stops spinning for a reader who asked for less motion", () => {
    render(<Checking />);
    expect(spinner().className).toContain("motion-reduce:animate-none");
  });

  it("shows the step counter spinning during a run, and offers no way out of it", () => {
    render(<Running done={0} total={1} />);
    expect(spinner()).toBeInTheDocument();
    expect(screen.getByText("0 of 1 steps")).toBeInTheDocument();
    // "Stop after this step" and "Continue to Market 2.0" both used to sit here.
    expect(screen.queryByRole("button")).toBeNull();
  });
});
