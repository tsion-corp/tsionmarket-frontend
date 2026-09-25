// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  clearMigrationComplete,
  hasMovedFunds,
  isAccountLinked,
  markAccountLinked,
  markFundsMoved,
  markMigrationComplete,
  maskBalance,
  offerMigration,
  shouldOfferMigration,
} from "@/features/migrate/lib/visibility";
import { EMPTY_MIGRATION_STATUS } from "@/features/migrate/lib/api";

const EVM = "0xAbC0000000000000000000000000000000000001";
const OTHER = "0xDeF0000000000000000000000000000000000002";

afterEach(() => {
  window.localStorage.clear();
});

describe("shouldOfferMigration", () => {
  it("stays hidden for a browser with no Privy history", () => {
    expect(shouldOfferMigration(EVM)).toBe(false);
  });

  it("offers when a Privy session key exists", () => {
    window.localStorage.setItem("privy:token", "jwt");
    expect(shouldOfferMigration(EVM)).toBe(true);
  });

  it("offers for a lapsed session that still holds any auth key", () => {
    window.localStorage.setItem("privy:connections", "[]");
    expect(shouldOfferMigration(EVM)).toBe(true);
  });

  it("retires after the migration completed", () => {
    window.localStorage.setItem("privy:token", "jwt");
    markMigrationComplete(EVM);
    expect(shouldOfferMigration(EVM)).toBe(false);
  });
});

describe("offerMigration", () => {
  const status = (overrides: Partial<typeof EMPTY_MIGRATION_STATUS>) => ({
    ...EMPTY_MIGRATION_STATUS,
    ...overrides,
  });

  // The device flag is per browser, not per account, and can be written by a
  // sweep whose link never landed. So it only fills the gap the service
  // leaves; a real "not linked" from the service outranks it.
  it("offers when the service says not linked, even if this device says done", () => {
    expect(
      offerMigration({
        complete: true,
        localHistory: true,
        status: status({ linked: false }),
      })
    ).toBe(true);
  });

  it("offers a NEW account on a device another account finished on", () => {
    expect(
      offerMigration({
        complete: true,
        localHistory: false,
        status: status({ linked: false }),
        legacyAccount: true,
      })
    ).toBe(true);
  });

  it("keeps the device flag when the service could not say", () => {
    // EMPTY_MIGRATION_STATUS carries linked: null — "no answer", not "no" —
    // and nothing known on the old side, so the device's memory stands.
    expect(
      offerMigration({
        complete: true,
        localHistory: true,
        status: status({ hasLegacyFunds: false }),
      })
    ).toBe(false);
  });

  it("keeps the device flag before the status has loaded", () => {
    expect(offerMigration({ complete: true, localHistory: true, status: undefined })).toBe(false);
  });

  it("never offers once linked with nothing left on the old side, whatever the device says", () => {
    expect(
      offerMigration({
        complete: false,
        localHistory: true,
        status: status({ linked: true, hasLegacyFunds: false }),
        legacyAccount: true,
      })
    ).toBe(false);
  });

  // Linking moves the identity, not the tokens. Seen live: a linked account
  // with $1 still on the old wallet, sweep failed, and the button gone.
  // Linked ends the offer — unless a chain read has SEEN money still on the
  // old wallet. That, and only that, brings it back.
  it("re-opens for a linked account once money is proven on the old wallet", () => {
    expect(
      offerMigration({
        complete: true,
        localHistory: false,
        status: status({ linked: true, hasLegacyFunds: true }),
        walletFunds: true,
      })
    ).toBe(true);
  });

  // The flash this fix removes: linked, the service says funds, but the chain
  // read has not returned yet. The offer waits for the read instead of opening
  // on the service's optimistic flag and then closing.
  it("shows nothing for a linked account while the old wallet read is still in flight", () => {
    expect(
      offerMigration({
        complete: true,
        localHistory: true,
        status: status({ linked: true, hasLegacyFunds: true }),
        walletFunds: undefined,
      })
    ).toBe(false);
  });

  // The device's memory is not authority. A live "not linked" from the
  // service — an admin remap, say — outranks a stale remembered link, the same
  // way it outranks the device's "complete" flag.
  it("lets a live not-linked answer outrank a remembered link", () => {
    expect(
      offerMigration({
        complete: false,
        localHistory: true,
        status: status({ linked: false }),
        linked: true,
      })
    ).toBe(true);
  });

  // "Could not say" (linked: null) is the gap the memory exists to fill.
  it("keeps a remembered link when the service could not say", () => {
    expect(
      offerMigration({
        complete: false,
        localHistory: true,
        status: status({ linked: null, hasLegacyFunds: false }),
        linked: true,
        walletFunds: false,
      })
    ).toBe(false);
  });

  // The device's memory of a link answers before /status does; the old wallet
  // is still probed, and only proven money re-opens the offer.
  it("treats a remembered link like a linked status: proven money and nothing less", () => {
    expect(
      offerMigration({ complete: false, localHistory: true, status: undefined, linked: true })
    ).toBe(false);
    expect(
      offerMigration({
        complete: false,
        localHistory: true,
        status: undefined,
        linked: true,
        walletFunds: true,
      })
    ).toBe(true);
    expect(
      offerMigration({
        complete: false,
        localHistory: true,
        status: undefined,
        linked: true,
        walletFunds: null,
      })
    ).toBe(false);
  });

  it("keeps offering an UNLINKED account while a deposit is still landing on the old wallet", () => {
    expect(
      offerMigration({
        complete: true,
        localHistory: false,
        status: status({ linked: false, pendingOnramps: ["onramp-1"] }),
      })
    ).toBe(true);
  });

  it("does not re-open for a linked account on a pending deposit", () => {
    expect(
      offerMigration({
        complete: true,
        localHistory: false,
        status: status({ linked: true, pendingOnramps: ["onramp-1"] }),
      })
    ).toBe(false);
  });

  it("offers on local history once the status has loaded and says not linked", () => {
    expect(
      offerMigration({ complete: false, localHistory: true, status: status({ linked: false }) })
    ).toBe(true);
  });

  // While the status is still loading we can't tell a migrated account from a
  // legacy one, so the UI waits rather than flashing on and off.
  it("shows nothing on local history while the status is still loading", () => {
    expect(offerMigration({ complete: false, localHistory: true, status: undefined })).toBe(false);
  });

  it("offers on a fresh device when the server sees money or a deposit in flight", () => {
    expect(offerMigration({ complete: false, localHistory: false, status: status({}) })).toBe(
      false
    );
    expect(
      offerMigration({
        complete: false,
        localHistory: false,
        status: status({ hasLegacyFunds: true }),
      })
    ).toBe(true);
    expect(
      offerMigration({
        complete: false,
        localHistory: false,
        status: status({ pendingOnramps: ["ord_1"] }),
      })
    ).toBe(true);
  });

  it("stays hidden before the status has loaded on a fresh device", () => {
    expect(offerMigration({ complete: false, localHistory: false, status: undefined })).toBe(false);
  });
});

describe("clearMigrationComplete", () => {
  it("re-opens the door", () => {
    window.localStorage.setItem("privy:token", "jwt");
    markMigrationComplete(EVM);
    expect(shouldOfferMigration(EVM)).toBe(false);
    clearMigrationComplete(EVM);
    expect(shouldOfferMigration(EVM)).toBe(true);
  });
});

describe("maskBalance", () => {
  it("hides the figure only while the old account still holds everything", () => {
    expect(maskBalance({ offer: true, moved: false })).toBe(true);
  });

  it("shows the figure as soon as a run moved something, even unfinished", () => {
    expect(maskBalance({ offer: true, moved: true })).toBe(false);
  });

  it("never hides it once there is nothing left to offer", () => {
    expect(maskBalance({ offer: false, moved: false })).toBe(false);
  });
});

describe("markFundsMoved", () => {
  it("records that money landed, independently of completion", () => {
    window.localStorage.setItem("privy:token", "jwt");
    expect(hasMovedFunds(EVM)).toBe(false);
    markFundsMoved(EVM);
    expect(hasMovedFunds(EVM)).toBe(true);
    // The migration is still on offer: more may be left behind.
    expect(shouldOfferMigration(EVM)).toBe(true);
  });
});

describe("offerMigration on a device with no Privy history", () => {
  // The case nothing else reaches: a migrated user on a new phone. No `privy:`
  // keys to find, and /status answers nothing until a mapping exists — so they
  // sign in, see 0.00, and are offered no way to explain it. `status` is the
  // loaded empty answer, not `undefined`: undefined means "still loading", when
  // we deliberately show nothing.
  const base = { complete: false, localHistory: false, status: EMPTY_MIGRATION_STATUS };

  it("offers the sweep when the signed-in address had a Privy wallet", () => {
    expect(offerMigration({ ...base, legacyAccount: true })).toBe(true);
  });

  it("offers nothing when it did not", () => {
    expect(offerMigration({ ...base, legacyAccount: false })).toBe(false);
  });

  // The lookup answers false for an outage too, so it must never be able to
  // take the offer away from a signal that already earned it.
  it("cannot suppress the device's own Privy history", () => {
    expect(offerMigration({ ...base, localHistory: true, legacyAccount: false })).toBe(true);
  });

  it("cannot suppress the server's legacy-funds report", () => {
    const status = { hasLegacyFunds: true, pendingOnramps: [] } as never;
    expect(offerMigration({ ...base, status, legacyAccount: false })).toBe(true);
  });

  it("stays silent once the migration completed here", () => {
    expect(offerMigration({ ...base, complete: true, legacyAccount: true })).toBe(false);
  });
});

describe("offerMigration once the account is linked", () => {
  const base = { complete: false, localHistory: true, status: undefined };

  // Linking is what the offer is FOR, so a linked account has nothing left to
  // ask for — the ledgers re-key themselves from the mapping.
  it("stops offering once the mapping exists", () => {
    const status = { linked: true, hasLegacyFunds: false, pendingOnramps: [] } as never;
    expect(offerMigration({ ...base, status })).toBe(false);
  });

  // The case this rewrite exists for. An empty wallet used to retire the
  // offer, which silenced it for exactly the users with the most to lose: the
  // re-key carries a profile, followers, posts and ledgers that no balance can
  // see.
  it("still offers to an unlinked user whose wallet is empty", () => {
    const status = { linked: false, hasLegacyFunds: false, pendingOnramps: [] } as never;
    expect(offerMigration({ ...base, status, legacyAccount: true })).toBe(true);
  });

  it("offers on the directory alone, once the status has loaded with no mapping", () => {
    expect(
      offerMigration({
        complete: false,
        localHistory: false,
        status: EMPTY_MIGRATION_STATUS,
        legacyAccount: true,
      })
    ).toBe(true);
  });

  it("stays silent when nothing says this user is legacy", () => {
    expect(
      offerMigration({
        complete: false,
        localHistory: false,
        status: undefined,
        legacyAccount: false,
      })
    ).toBe(false);
  });

  // Linked outranks every "still legacy" signal: privy keys outlive a link.
  it("lets linked outrank stale device history", () => {
    const status = { linked: true, hasLegacyFunds: false, pendingOnramps: [] } as never;
    expect(offerMigration({ ...base, status, legacyAccount: true })).toBe(false);
  });
});

describe("offerMigration — the frontend's read of the old wallet", () => {
  const status = (overrides: Partial<typeof EMPTY_MIGRATION_STATUS>) => ({
    ...EMPTY_MIGRATION_STATUS,
    ...overrides,
  });

  // Seen live: 0 ETH / 0 USDC / 0 KSH on chain, four re-keys pending, and the
  // service's flag alone kept the migration — and the gate — open.
  it("does not offer a linked account whose old wallet is empty on chain, whatever the service says", () => {
    expect(
      offerMigration({
        complete: true,
        localHistory: true,
        status: status({ linked: true, hasLegacyFunds: true }),
        legacyAccount: true,
        walletFunds: false,
      })
    ).toBe(false);
  });

  it("re-opens on proven money even when the service says the old wallet is empty", () => {
    expect(
      offerMigration({
        complete: true,
        localHistory: false,
        status: status({ linked: true, hasLegacyFunds: false }),
        walletFunds: true,
      })
    ).toBe(true);
  });

  // Seen live: linked, the service says funds (a pending re-key), and the chain
  // read came back partial. That used to fall back to the service flag and
  // open the gate on nothing verified. A partial read proves nothing, and for a
  // linked account the service flag gets no say.
  it("never falls back to the service flag for a linked account, partial read or not", () => {
    const base = {
      complete: true,
      localHistory: false,
      status: status({ linked: true, hasLegacyFunds: true }),
    };
    expect(offerMigration({ ...base, walletFunds: null })).toBe(false);
    expect(offerMigration({ ...base, walletFunds: undefined })).toBe(false);
  });
});

describe("flags are per account", () => {
  it("one account finishing does not retire the offer for another on the same device", () => {
    window.localStorage.setItem("privy:token", "jwt");
    markMigrationComplete(EVM);
    expect(shouldOfferMigration(EVM)).toBe(false);
    expect(shouldOfferMigration(OTHER)).toBe(true);
  });

  it("funds moved for one account says nothing about another", () => {
    markFundsMoved(EVM);
    expect(hasMovedFunds(EVM)).toBe(true);
    expect(hasMovedFunds(OTHER)).toBe(false);
  });

  it("is case-insensitive on the address", () => {
    markMigrationComplete(EVM.toLowerCase());
    expect(shouldOfferMigration(EVM.toUpperCase().replace("0X", "0x"))).toBe(false);
  });

  it("writes nothing and reads false with no account to key on", () => {
    markMigrationComplete(null);
    expect(window.localStorage.length).toBe(0);
    expect(hasMovedFunds(null)).toBe(false);
  });
});

describe("remembered link", () => {
  it("is found by either the email or the address it was written under", () => {
    markAccountLinked({ email: "Someone@Example.com ", evmAddress: EVM });
    expect(isAccountLinked({ email: "someone@example.com" })).toBe(true);
    expect(isAccountLinked({ evmAddress: EVM.toLowerCase() })).toBe(true);
    expect(isAccountLinked({ email: "other@example.com" })).toBe(false);
    expect(isAccountLinked({ evmAddress: OTHER })).toBe(false);
  });

  // An X-only or passkey account has no email; the address alone must be
  // enough to remember it, or it re-runs the directory lookup every load.
  it("remembers an account with no email by its address", () => {
    markAccountLinked({ email: "", evmAddress: EVM });
    expect(isAccountLinked({ email: "", evmAddress: EVM })).toBe(true);
  });

  it("does nothing with no identifier at all", () => {
    markAccountLinked({ email: "", evmAddress: null });
    expect(window.localStorage.length).toBe(0);
    expect(isAccountLinked({})).toBe(false);
  });
});

// The question asked last: a brand-new user, not in the directory, signs in.
// They must never see "Move to Market 2.0" — including on a browser that
// someone else used with the old app and left `privy:` keys in.
describe("a brand-new user is never offered the migration", () => {
  const notLinked = { ...EMPTY_MIGRATION_STATUS, linked: false };

  it("on their own device: no signal at all", () => {
    expect(
      offerMigration({
        complete: false,
        localHistory: false,
        status: notLinked,
        legacyAccount: false,
        legacyKnownAbsent: true,
      })
    ).toBe(false);
  });

  it("on a shared browser with someone else's old-app keys: the directory's definite no wins", () => {
    expect(
      offerMigration({
        complete: false,
        localHistory: true,
        status: notLinked,
        legacyAccount: false,
        legacyKnownAbsent: true,
      })
    ).toBe(false);
  });

  // The lookup answers false for an outage too. An UNCERTAIN no must not take
  // the offer away from a real legacy user whose browser has the keys.
  it("but an uncertain no still defers to the device's own history", () => {
    expect(
      offerMigration({
        complete: false,
        localHistory: true,
        status: notLinked,
        legacyAccount: false,
        legacyKnownAbsent: false,
      })
    ).toBe(true);
  });
});
