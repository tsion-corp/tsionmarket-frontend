import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ destination: "document" }));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => (name === "sec-fetch-dest" ? request.destination : null),
  }),
}));

vi.mock("@/features/casino/components/chess-app/chess-route-shell", () => ({
  ChessRouteShell: ({ children }: { children: ReactNode }) => (
    <div data-testid="chess-route-shell">{children}</div>
  ),
}));

import ChessLayout from "@/app/(session)/casino/chess/layout";

describe("Chess layout", () => {
  beforeEach(() => {
    request.destination = "document";
  });

  it("delegates normal Chess pages to the route-aware shell", async () => {
    render(await ChessLayout({ children: <div data-testid="chess-page" /> }));

    expect(screen.getByTestId("chess-route-shell")).toContainElement(
      screen.getByTestId("chess-page")
    );
  });

  it("keeps the embed route bare inside its parent iframe", async () => {
    request.destination = "iframe";

    render(await ChessLayout({ children: <div data-testid="chess-page" /> }));

    expect(screen.queryByTestId("chess-route-shell")).not.toBeInTheDocument();
    expect(screen.getByTestId("chess-page")).toBeInTheDocument();
  });
});
