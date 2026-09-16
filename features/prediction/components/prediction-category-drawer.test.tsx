import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  PredictionCategoryButton,
  PredictionCategoryDrawer,
} from "@/features/prediction/components/prediction-category-drawer";

describe("PredictionCategoryDrawer", () => {
  it("keeps a closed drawer out of keyboard navigation", () => {
    render(<PredictionCategoryDrawer open={false} onClose={() => {}} activeCategory="sports" />);

    expect(screen.getByRole("dialog", { hidden: true })).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("link", { name: "Sports", hidden: true })).toHaveAttribute(
      "tabindex",
      "-1"
    );
  });

  it("links every supported market category", () => {
    const onClose = vi.fn();
    render(<PredictionCategoryDrawer open onClose={onClose} activeCategory="sports" />);

    const sports = screen.getByRole("link", { name: "Sports" });
    expect(sports).toHaveAttribute("aria-current", "page");
    const politics = screen.getByRole("link", { name: "Politics" });
    expect(politics).toHaveAttribute("href", "/prediction/markets?category=politics");
    expect(screen.getByRole("link", { name: /crypto/i })).toHaveAttribute(
      "href",
      "/prediction/markets?category=crypto"
    );
    politics.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(politics);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("marks Politics active on its market page", () => {
    render(<PredictionCategoryDrawer open onClose={() => {}} activeCategory="politics" />);
    expect(screen.getByRole("link", { name: "Politics" })).toHaveAttribute("aria-current", "page");
  });

  it("reports the trigger's open state", () => {
    render(<PredictionCategoryButton expanded onClick={() => {}} />);
    expect(screen.getByRole("button", { name: /open markets sidebar/i })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });
});
