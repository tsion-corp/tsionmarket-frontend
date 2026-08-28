import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExpandableText } from "./expandable-text";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

/** jsdom lays nothing out, so overflow is simulated by pinning the heights. */
function pinHeights({ scroll, client }: { scroll: number; client: number }) {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => scroll,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => client,
  });
}

beforeEach(() => {
  // ResizeObserver does not exist in jsdom; the component must not require it.
  vi.stubGlobal("ResizeObserver", undefined);
});

describe("ExpandableText", () => {
  /**
   * The failure this pattern is famous for: "Show more" under a two-line post.
   * It cannot be decided from character count — wrapping depends on width,
   * font and the words — so it is measured, and this pins the measurement.
   */
  it("shows no control when the text fits", () => {
    pinHeights({ scroll: 40, client: 40 });
    render(<ExpandableText>short</ExpandableText>);
    expect(screen.queryByText("showMore")).toBeNull();
  });

  it("offers Show more only once the text overflows", () => {
    pinHeights({ scroll: 200, client: 80 });
    render(<ExpandableText>a very long caption</ExpandableText>);
    expect(screen.getByText("showMore")).toBeInTheDocument();
  });

  it("expands in place and can be collapsed again", () => {
    pinHeights({ scroll: 200, client: 80 });
    render(<ExpandableText>a very long caption</ExpandableText>);

    const control = screen.getByText("showMore");
    expect(control).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(control);

    // Still the same element — expanding must not navigate or remount.
    const collapse = screen.getByText("showLess");
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(collapse);
    expect(screen.getByText("showMore")).toBeInTheDocument();
  });

  // The card around this is a link; reading more is not opening the post.
  it("does not let the click reach an enclosing link", () => {
    pinHeights({ scroll: 200, client: 80 });
    const onClick = vi.fn();
    render(
      // eslint-disable-next-line jsx-a11y/anchor-is-valid -- stands in for the card link
      <a href="#" onClick={onClick}>
        <ExpandableText>a very long caption</ExpandableText>
      </a>
    );
    fireEvent.click(screen.getByText("showMore"));
    expect(onClick).not.toHaveBeenCalled();
  });
});
