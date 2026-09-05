import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BoardTotalOption } from "../presenter";
import { GoalsLineSelect } from "./goals-line-select";

const options: BoardTotalOption[] = [
  { id: "total-2.5", line: 2.5, over: null, under: null },
  { id: "total-3.5", line: 3.5, over: null, under: null },
];

describe("GoalsLineSelect", () => {
  it("emits the selected totals market", () => {
    const onChange = vi.fn();
    render(
      <GoalsLineSelect
        fixtureName="Arsenal vs Chelsea"
        options={options}
        value="total-2.5"
        onChange={onChange}
      />
    );

    expect(
      screen.getAllByText("2.5").some((element) => element.getAttribute("aria-hidden") === "true")
    ).toBe(true);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "total-3.5" } });

    expect(onChange).toHaveBeenCalledWith("total-3.5");
  });

  it("disables the control when Polymarket supplies one line", () => {
    render(
      <GoalsLineSelect
        fixtureName="Arsenal vs Chelsea"
        options={[options[0]]}
        value="total-2.5"
        onChange={vi.fn()}
      />
    );

    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
