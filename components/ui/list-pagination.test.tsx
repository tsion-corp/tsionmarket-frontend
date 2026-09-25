import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { ListPagination } from "@/components/ui/list-pagination";

// The three strings the stalled and paused states need. They are not in
// messages/en.json yet: the locale catalogues are edited as one set, in their
// own change, and the bar has to be provable before that lands. Delete this
// and the plain `messages` import above covers it.
const withPendingCopy = {
  ...messages,
  common: {
    ...messages.common,
    moreStalled: "The list is incomplete",
    moreWaiting: "Paused, continuing shortly",
    moreResume: "Load the rest",
  },
};

// The stepping bar every phone list pages with: Prev, "Page X of Y", Next. It
// carries no numbered buttons, so the page count costs it nothing however high
// it runs, and it says outright when that count is still growing.

function renderBar(props: Partial<Parameters<typeof ListPagination>[0]> = {}) {
  const onPage = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={withPendingCopy}>
      <ListPagination page={1} pages={3} onPage={onPage} {...props} />
    </NextIntlClientProvider>
  );
  return { onPage: (props.onPage as ReturnType<typeof vi.fn>) ?? onPage };
}

describe("ListPagination", () => {
  it("steps between pages and stops at both ends", () => {
    const first = renderBar({ page: 1, pages: 3 });
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prev" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(first.onPage).toHaveBeenCalledWith(2);
  });

  it("hides itself on a single complete page", () => {
    renderBar({ page: 1, pages: 1 });
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });
});

// The catalogue runs past a hundred thousand coins and arrives a server page at
// a time, so a bar built from the rows in hand would read "Page 1 of 3" over a
// list that is 3% loaded. These are the two things it now says instead.
describe("ListPagination over a list that is still filling", () => {
  it("marks the page count as not final and says rows are on their way", () => {
    renderBar({ page: 1, pages: 34, more: true, loadingMore: true });
    expect(screen.getByText("Page 1 of 34")).toBeInTheDocument();
    expect(screen.getByText("…")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Loading more…")).toBeInTheDocument();
  });

  it("keeps the mark, and the line's height, between one batch and the next", () => {
    renderBar({ page: 1, pages: 34, more: true, loadingMore: false });
    expect(screen.getByText("…")).toBeInTheDocument();
    // The line is still drawn, so the bar does not change height and shunt the
    // list under the reader each time a batch lands.
    const line = screen.getByText("More pages");
    expect(line).toHaveClass("h-[13px]");
  });

  it("shows itself on a single loaded page while more are coming", () => {
    renderBar({ page: 1, pages: 1, more: true });
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    expect(screen.getByText("More pages")).toBeInTheDocument();
  });

  it("says nothing about more rows once the list is whole", () => {
    renderBar({ page: 1, pages: 34 });
    expect(screen.queryByText("…")).toBeNull();
    expect(screen.queryByText("More pages")).toBeNull();
    expect(screen.queryByText("Loading more…")).toBeNull();
  });

  // Next steps, it does not fetch: the page after the last loaded one does not
  // exist yet. The rows behind it arrive on their own and the count grows.
  it("keeps Next shut on the last loaded page", () => {
    renderBar({ page: 34, pages: 34, more: true, loadingMore: true });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("grows with the rows rather than staying pinned to a first batch", () => {
    const { onPage } = renderBar({ page: 3, pages: 4, more: true });
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onPage).toHaveBeenCalledWith(4);
  });
});

// A hundred thousand coins ten a row is ten thousand pages. The bar numbers
// none of them, so what it costs at 10,000 is what it costs at 3.
describe("ListPagination at a page count nobody can click through", () => {
  it("draws two buttons and one label, whatever the count", () => {
    renderBar({ page: 5000, pages: 10000 });
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByText("Page 5,000 of 10,000")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Page \d/ })).toBeNull();
  });
});

// The walk behind a long list gives up after a run of refusals and nothing
// restarts it. Before this the bar went quiet and the half-loaded list read as
// a finished one, which is the complaint that started the work: a reader has to
// be told the list is short, and given the way out.
describe("ListPagination over a list whose load has stopped", () => {
  it("says the list is incomplete and offers the way on", () => {
    const onResume = vi.fn();
    renderBar({ page: 1, pages: 34, more: true, stalled: true, onResume });
    expect(screen.getByText("The list is incomplete")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load the rest" }));
    expect(onResume).toHaveBeenCalledOnce();
  });

  // No counts, no "12,500 of 146,242". The rule on this surface is that it
  // never reports how much of the catalogue is held, and being honest about a
  // short list does not need a figure.
  it("reports no figures while it does so", () => {
    renderBar({ page: 1, pages: 34, more: true, stalled: true, onResume: vi.fn() });
    expect(screen.queryByText(/146|of \d+ (rows|coins|items)/)).toBeNull();
  });

  it("keeps the bar up even where the rows in hand fit one page", () => {
    renderBar({ page: 1, pages: 1, stalled: true, onResume: vi.fn() });
    expect(screen.getByRole("button", { name: "Load the rest" })).toBeInTheDocument();
    expect(screen.getByText("…")).toBeInTheDocument();
  });

  it("draws no button where there is nothing to press", () => {
    renderBar({ page: 1, pages: 34, more: true, stalled: true });
    expect(screen.getByText("The list is incomplete")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load the rest" })).toBeNull();
  });

  // The three states that are not stalled. Walking and paused are both going to
  // carry on by themselves, and a complete list has nothing to resume.
  it("stays out of the way while the list is still filling", () => {
    renderBar({ page: 1, pages: 34, more: true, loadingMore: true, onResume: vi.fn() });
    expect(screen.queryByRole("button", { name: "Load the rest" })).toBeNull();
    expect(screen.getByText("Loading more…")).toBeInTheDocument();
  });

  it("stays out of the way while the list is paused", () => {
    renderBar({ page: 1, pages: 34, more: true, waiting: true, onResume: vi.fn() });
    expect(screen.queryByRole("button", { name: "Load the rest" })).toBeNull();
    expect(screen.getByText("Paused, continuing shortly")).toBeInTheDocument();
  });

  it("stays out of the way once the list is whole", () => {
    renderBar({ page: 1, pages: 34, onResume: vi.fn() });
    expect(screen.queryByRole("button", { name: "Load the rest" })).toBeNull();
    expect(screen.queryByText("The list is incomplete")).toBeNull();
  });

  // A pause resumes itself at resumesAt; the line says so instead of letting
  // "More pages" stand in for both a pause and a stop.
  it("tells a pause from a stop", () => {
    renderBar({ page: 1, pages: 34, more: true, waiting: true });
    expect(screen.queryByText("More pages")).toBeNull();
    expect(screen.getByText("Paused, continuing shortly")).toBeInTheDocument();
  });
});
