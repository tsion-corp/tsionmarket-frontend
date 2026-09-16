import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SearchField } from "@/components/ui/search-field";

/** Stands in for a caller that owns the query state, which is where it belongs. */
function ControlledHarness({ label = "Search markets" }: { label?: string }) {
  const [value, setValue] = useState("");
  return (
    <>
      <SearchField value={value} onChange={setValue} label={label} placeholder="Search" />
      <span data-testid="query">{value}</span>
    </>
  );
}

describe("SearchField", () => {
  it("renders a real search input", () => {
    render(<SearchField value="" onChange={() => {}} label="Search markets" />);
    const input = screen.getByRole("searchbox");
    expect(input).toHaveAttribute("type", "search");
  });

  it("resolves its accessible name from the label, not the placeholder", () => {
    render(
      <SearchField value="" onChange={() => {}} label="Search markets" placeholder="Search" />
    );
    // getByRole matches on the accessible name, so this passes only when the
    // label wins. A placeholder-only field would be named "Search" instead.
    expect(screen.getByRole("searchbox", { name: "Search markets" })).toBeInTheDocument();
  });

  it("calls onChange with the new value as the user types", () => {
    const onChange = vi.fn();
    render(<SearchField value="" onChange={onChange} label="Search markets" />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "sol" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("sol");
  });

  it("shows what the caller passes back down, keystroke by keystroke", () => {
    render(<ControlledHarness />);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "b" } });
    fireEvent.change(input, { target: { value: "bt" } });
    fireEvent.change(input, { target: { value: "btc" } });
    expect(input).toHaveValue("btc");
    expect(screen.getByTestId("query")).toHaveTextContent("btc");
  });

  it("renders the value it is given and nothing else", () => {
    render(<SearchField value="eth" onChange={() => {}} label="Search markets" />);
    expect(screen.getByRole("searchbox")).toHaveValue("eth");
  });

  it("blocks input when disabled", () => {
    const onChange = vi.fn();
    render(<SearchField value="" onChange={onChange} label="Search markets" disabled />);
    const input = screen.getByRole("searchbox");
    expect(input).toBeDisabled();
    // A disabled control cannot take focus, so no keystroke can ever reach it.
    input.focus();
    expect(input).not.toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("is enabled by default", () => {
    render(<SearchField value="" onChange={() => {}} label="Search markets" />);
    expect(screen.getByRole("searchbox")).toBeEnabled();
  });

  it("gives each field its own label association", () => {
    render(
      <>
        <SearchField value="" onChange={() => {}} label="Search markets" />
        <SearchField value="" onChange={() => {}} label="Search memecoins" />
      </>
    );
    // Two of these sit on one screen in the design, so the generated ids must
    // not collide or one label would point at the other's input.
    const first = screen.getByRole("searchbox", { name: "Search markets" });
    const second = screen.getByRole("searchbox", { name: "Search memecoins" });
    expect(first.id).not.toBe(second.id);
  });

  it("keeps the magnifier decorative, so it is never announced", () => {
    const { container } = render(
      <SearchField value="" onChange={() => {}} label="Search markets" />
    );
    const glyph = container.querySelector("svg");
    expect(glyph).not.toBeNull();
    expect(glyph).toHaveAttribute("aria-hidden");
    // It also has to inherit its colour, or the field cannot tint it from a
    // token. A baked stroke is what ruled out the older icons.tsx SearchIcon,
    // and what SearchBoldIcon exists to avoid.
    expect(glyph?.querySelector("path")).toHaveAttribute("stroke", "currentColor");
  });

  it("does not draw a clear button, which the design has no affordance for", () => {
    render(<SearchField value="btc" onChange={() => {}} label="Search markets" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("takes an extra class on the field, so a caller can set the design width", () => {
    const { container } = render(
      <SearchField value="" onChange={() => {}} label="Search markets" className="w-[394px]" />
    );
    expect(container.querySelector(".w-\\[394px\\]")).not.toBeNull();
  });
});
