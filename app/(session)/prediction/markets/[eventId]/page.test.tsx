import { describe, expect, it, vi } from "vitest";
import Page from "./page";

const redirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (href: string) => redirect(href),
}));

// This route used to pick between the category detail and the sportsbook for
// an event id. Both read the gateway's `prediction` service, which answers 502
// on production, so the page is a redirect there instead: a shared link lands
// somewhere real rather than on a page whose every request fails. The routing
// it used to do is still in git, and comes back with the section.
describe("prediction market event route, with the section not offered", () => {
  it("sends a shared event link to the dashboard", () => {
    Page();
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});
