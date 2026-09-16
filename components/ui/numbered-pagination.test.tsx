import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { NumberedPagination, pageWindow } from "@/components/ui/numbered-pagination";

// The numbered bar a long list pages with: every page a button, the ends and
// the pages around the current one always in reach, and a trailing "…" while
// the list holds more than has been loaded.

function renderBar(props: Partial<Parameters<typeof NumberedPagination>[0]> = {}) {
  const onPage = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <NumberedPagination page={1} pages={5} onPage={onPage} {...props} />
    </NextIntlClientProvider>
  );
  return { onPage: (props.onPage as ReturnType<typeof vi.fn>) ?? onPage };
}

describe("pageWindow", () => {
  it("lists every page when seven or fewer fit", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("keeps the first pages together near the start", () => {
    expect(pageWindow(1, 40)).toEqual([1, 2, 3, 4, "gap", 40]);
    expect(pageWindow(3, 40)).toEqual([1, 2, 3, 4, "gap", 40]);
  });

  it("keeps the last pages together near the end", () => {
    expect(pageWindow(40, 40)).toEqual([1, "gap", 37, 38, 39, 40]);
    expect(pageWindow(38, 40)).toEqual([1, "gap", 37, 38, 39, 40]);
  });

  it("shows the neighbours of a page in the middle, between two gaps", () => {
    expect(pageWindow(20, 40)).toEqual([1, "gap", 19, 20, 21, "gap", 40]);
  });

  it("never offers a page outside the list", () => {
    for (let page = 1; page <= 12; page++) {
      for (const item of pageWindow(page, 12)) {
        if (item !== "gap") {
          expect(item).toBeGreaterThanOrEqual(1);
          expect(item).toBeLessThanOrEqual(12);
        }
      }
    }
  });
});

describe("NumberedPagination", () => {
  it("draws a button per page and marks the one showing", () => {
    renderBar({ page: 2, pages: 5 });
    for (const page of [1, 2, 3, 4, 5]) {
      expect(screen.getByRole("button", { name: `Page ${page}` })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Page 3" })).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Page 2 of 5")).toBeInTheDocument();
  });

  it("jumps straight to a page, and steps with Prev and Next", () => {
    const { onPage } = renderBar({ page: 2, pages: 5 });
    fireEvent.click(screen.getByRole("button", { name: "Page 4" }));
    expect(onPage).toHaveBeenLastCalledWith(4);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onPage).toHaveBeenLastCalledWith(3);
    fireEvent.click(screen.getByRole("button", { name: "Prev" }));
    expect(onPage).toHaveBeenLastCalledWith(1);
  });

  it("stops at both ends of a list with nothing more to load", () => {
    renderBar({ page: 1, pages: 3 });
    expect(screen.getByRole("button", { name: "Prev" })).toBeDisabled();
    expect(screen.queryByText("More pages")).toBeNull();
  });

  it("disables Next on the last page when the list is complete", () => {
    renderBar({ page: 3, pages: 3 });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("keeps Next open on the last loaded page while more exist, and says so", () => {
    const { onPage } = renderBar({ page: 3, pages: 3, more: true });
    expect(screen.getByText("More pages")).toBeInTheDocument();
    const next = screen.getByRole("button", { name: "Next" });
    expect(next).toBeEnabled();
    fireEvent.click(next);
    expect(onPage).toHaveBeenCalledWith(4);
  });

  it("holds Next while the page it would open is still loading", () => {
    renderBar({ page: 3, pages: 3, more: true, loadingMore: true });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("lets Next through on an earlier page while more load behind it", () => {
    renderBar({ page: 1, pages: 3, more: true, loadingMore: true });
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("hides itself on a single page with nothing more to come", () => {
    renderBar({ page: 1, pages: 1 });
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });

  it("stays on a single page when more are on the way", () => {
    renderBar({ page: 1, pages: 1, more: true });
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });
});
