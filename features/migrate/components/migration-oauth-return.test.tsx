import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resetMigrationRequest,
  useMigrationRequest,
} from "@/features/migrate/lib/migration-card-store";

const oauth = vi.hoisted(() => ({ returning: false }));

vi.mock("@/features/migrate/lib/oauth-return", () => ({
  get returningFromPrivyOAuth() {
    return oauth.returning;
  },
}));

const { MigrationOAuthReturn } =
  await import("@/features/migrate/components/migration-oauth-return");

function Request() {
  const request = useMigrationRequest();
  return <div data-testid="request">{request ? request.entry : "none"}</div>;
}

afterEach(() => resetMigrationRequest());

describe("MigrationOAuthReturn", () => {
  it("opens nothing on an ordinary page load", () => {
    oauth.returning = false;
    const { getByTestId } = render(
      <>
        <MigrationOAuthReturn />
        <Request />
      </>
    );
    expect(getByTestId("request")).toHaveTextContent("none");
  });

  it("opens the one card when Privy hands the OAuth result back in the URL", () => {
    // Without this the code is never exchanged: the sign-in silently does not
    // happen, the credentials stay in the URL, and the money never moves.
    oauth.returning = true;
    const { getByTestId } = render(
      <>
        <MigrationOAuthReturn />
        <Request />
      </>
    );
    expect(getByTestId("request")).toHaveTextContent("account_modal");
  });
});
