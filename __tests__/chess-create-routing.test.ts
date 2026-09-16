import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock("next/navigation", () => navigation);

import ChessCreatePage from "@/app/(session)/casino/chess/create/page";

describe("legacy chess create route", () => {
  it("opens the existing friend setup modal instead of rendering another page", () => {
    ChessCreatePage();

    expect(navigation.redirect).toHaveBeenCalledWith("/casino/chess?setup=friend#game-setup");
  });
});
