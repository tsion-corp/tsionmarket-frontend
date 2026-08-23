import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LeaderboardFilters } from "./leaderboard-filters";

describe("LeaderboardFilters", () => {
  it("searches the full country list and selects Nigeria with its flag", () => {
    const selectCountry = vi.fn();

    render(
      <LeaderboardFilters
        perf="rapid"
        country={null}
        representedCountries={[]}
        onPerfChange={vi.fn()}
        onCountryChange={selectCountry}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Country: Global" }));
    fireEvent.change(screen.getByPlaceholderText("Search country"), {
      target: { value: "Nigeria" },
    });

    const nigeria = screen.getByRole("option", { name: /Nigeria/u });
    expect(nigeria).toHaveTextContent("🇳🇬");
    fireEvent.click(nigeria);
    expect(selectCountry).toHaveBeenCalledWith("NG");
  });
});
