import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormFeedback, asError, asNotice } from "@/components/ui/form-feedback";

// Reported from production: "Your transfer was sent but not yet confirmed"
// was rendering in the same red the withdraw screens use for genuine
// failures, while the offramp was working. Both withdraw screens held one
// `error` string, so an outcome that meant "the money is on its way" was
// dressed as "the withdrawal failed". This is the distinction they now share.
function wrap(node: ReactNode) {
  return render(<>{node}</>);
}

describe("FormFeedback", () => {
  it("shows nothing when there is nothing to say", () => {
    const { container } = wrap(<FormFeedback feedback={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a failure in the failure colour, and interrupts", () => {
    wrap(<FormFeedback feedback={asError("Couldn't create the order.")} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Couldn't create the order.");
    expect(alert.className).toMatch(/text-down/);
  });

  // The transfer WAS sent. Painting it red is what made users believe a
  // successful withdrawal had failed and try again.
  it("never renders an unconfirmed result in the failure colour", () => {
    wrap(<FormFeedback feedback={asNotice("Sent but not yet confirmed.")} />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Sent but not yet confirmed.");
    expect(status.className).not.toMatch(/text-down/);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // A failure should be announced at once; an informational outcome waits its
  // turn rather than cutting across whatever the reader is doing.
  it("announces a notice politely and a failure assertively", () => {
    const { unmount } = wrap(<FormFeedback feedback={asNotice("On its way.")} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    unmount();

    wrap(<FormFeedback feedback={asError("Nothing was sent.")} />);
    // role="alert" carries assertive live semantics on its own.
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("keeps the two kinds distinguishable to a caller", () => {
    expect(asError("x").kind).toBe("error");
    expect(asNotice("x").kind).toBe("notice");
  });
});
