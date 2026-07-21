import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

/**
 * Smoke test to verify the Vitest + React Testing Library setup works.
 * Replace/extend with real component tests as features land.
 */
describe("test harness", () => {
  it("renders a component into the DOM", () => {
    render(<h1>WSWS SuperApp</h1>);
    expect(screen.getByRole("heading", { name: /wsws superapp/i })).toBeInTheDocument();
  });
});
