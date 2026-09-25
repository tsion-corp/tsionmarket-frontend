// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  linked: false,
  localHistory: false,
  legacyHas: false,
  legacyCertain: true,
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/ui/icons", () => ({ WalletIcon: () => <svg data-testid="icon" /> }));
vi.mock("@/features/migrate/hooks/use-migration-status", () => ({
  useMigrationStatus: () => ({
    data: { linked: state.linked, legacy: null, hasLegacyFunds: false, legacyFundsUsd: 0 },
  }),
}));
vi.mock("@/features/migrate/hooks/use-legacy-wallet-funds", () => ({
  useLegacyWalletFunds: () => ({ data: null }),
}));
vi.mock("@/features/migrate/hooks/use-legacy-account", () => ({
  useLegacyAccount: () => ({
    has: state.legacyHas,
    fundsUsd: null,
    certain: state.legacyCertain,
  }),
}));
vi.mock("@/features/migrate/lib/visibility", () => ({
  useLocalPrivyHistory: () => state.localHistory,
}));

import { MoveOldMoneyButton } from "@/features/migrate/components/move-old-money-entry";

const door = () => screen.queryByText("entry");

describe("the always-open door into the migration", () => {
  beforeEach(() => {
    state.linked = false;
    state.localHistory = false;
    state.legacyHas = false;
    state.legacyCertain = true;
  });

  /*
    The row is a standing invitation to finish something. For somebody who
    signed up on Market 2.0 there is nothing behind it and nothing to finish,
    and telling them otherwise invents unfinished business they never had.
  */
  it("is not offered to an account that never had an old one", () => {
    render(<MoveOldMoneyButton onClick={vi.fn()} className="" />);
    expect(door()).toBeNull();
  });

  // Each of these is a positive reason the person HAD an old account, and any
  // one of them is enough on its own.
  it("is offered once the account is linked", () => {
    state.linked = true;
    render(<MoveOldMoneyButton onClick={vi.fn()} className="" />);
    expect(door()).not.toBeNull();
  });

  it("is offered when this device carries the old app's session keys", () => {
    state.localHistory = true;
    state.legacyCertain = false; // the directory has not ruled it out
    render(<MoveOldMoneyButton onClick={vi.fn()} className="" />);
    expect(door()).not.toBeNull();
  });

  /*
    The `privy:` keys belong to the BROWSER, not the person. Somebody else
    used this machine with the old app; whoever is signed in now is not them,
    and the directory says so definitely. Same precedence offerMigration uses.
  */
  it("is not offered on a shared browser when the directory says definitely not", () => {
    state.localHistory = true;
    state.legacyCertain = true;
    state.legacyHas = false;
    render(<MoveOldMoneyButton onClick={vi.fn()} className="" />);
    expect(door()).toBeNull();
  });

  it("is offered when the directory found a legacy account", () => {
    state.legacyHas = true;
    render(<MoveOldMoneyButton onClick={vi.fn()} className="" />);
    expect(door()).not.toBeNull();
  });

  /*
    While the directory is still answering, a legacy user on a NEW device has
    none of the three signals yet. Staying hidden until one arrives is the
    deliberate choice: a row that appears a moment late for them is better
    than one that appears for every new user and then vanishes.
  */
  it("stays hidden while the directory has not answered yet", () => {
    state.legacyCertain = false;
    render(<MoveOldMoneyButton onClick={vi.fn()} className="" />);
    expect(door()).toBeNull();
  });
});
