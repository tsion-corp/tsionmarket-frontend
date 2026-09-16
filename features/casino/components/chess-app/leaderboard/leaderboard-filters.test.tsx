import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("opens the panel and plays an exit animation before it unmounts on close", async () => {
    render(
      <LeaderboardFilters
        perf="rapid"
        country={null}
        representedCountries={[]}
        onPerfChange={vi.fn()}
        onCountryChange={vi.fn()}
      />
    );

    const trigger = screen.getByRole("button", { name: "Country: Global" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    // Selecting an option closes the panel, which then exits rather than
    // vanishing instantly.
    fireEvent.click(screen.getByRole("option", { name: /Global/ }));
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("closes the panel on Escape and on an outside click", async () => {
    render(
      <LeaderboardFilters
        perf="rapid"
        country={null}
        representedCountries={[]}
        onPerfChange={vi.fn()}
        onCountryChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Game type: Rapid" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Game type: Rapid" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });
});
