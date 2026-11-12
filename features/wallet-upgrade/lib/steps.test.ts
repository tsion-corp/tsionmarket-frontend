import { describe, expect, it } from "vitest";
import { walletUpgradeConfig } from "@/lib/wallet-upgrade/environment";
import { EMPTY_PROGRESS, deriveSteps, nextStep } from "./steps";

const config = (extra: Record<string, string> = {}) =>
  walletUpgradeConfig({
    deployEnv: "development",
    clerkPublishableKey: "pk_test_x",
    auth: "clerk",
    enabled: "true",
    ...extra,
  });

// The default: Decane is the sign-in, there is one account and nothing to link.
const decaneConfig = (extra: Record<string, string> = {}) =>
  walletUpgradeConfig({ deployEnv: "development", enabled: "true", ...extra });

const states = (steps: ReturnType<typeof deriveSteps>) =>
  Object.fromEntries(steps.map((s) => [s.id, s.state]));

describe("deriveSteps (Clerk mode)", () => {
  it("starts with the two sign-ins ready and nothing after them offered", () => {
    expect(states(deriveSteps(config(), EMPTY_PROGRESS))).toEqual({
      clerk: "ready",
      decane: "ready",
      link: "unavailable",
      wallet: "unavailable",
      recovery: "unavailable",
      funds: "unavailable",
    });
  });

  it("marks signed-in steps done", () => {
    const steps = deriveSteps(config(), {
      ...EMPTY_PROGRESS,
      clerkSignedIn: true,
      decaneSignedIn: true,
    });
    expect(states(steps).clerk).toBe("done");
    expect(states(steps).decane).toBe("done");
  });

  it("makes linking ready only when both sign-ins are done and the service is on", () => {
    const both = { ...EMPTY_PROGRESS, clerkSignedIn: true, decaneSignedIn: true };
    expect(states(deriveSteps(config(), both)).link).toBe("unavailable");

    const withService = walletUpgradeConfig({
      auth: "clerk",
      deployEnv: "development",
      clerkPublishableKey: "pk_test_x",
      enabled: "true",
      linkService: "true",
    });
    expect(states(deriveSteps(withService, both)).link).toBe("ready");
    expect(states(deriveSteps(withService, { ...both, decaneSignedIn: false })).link).toBe(
      "blocked"
    );
  });

  it("explains what a blocked step is waiting on", () => {
    const withService = walletUpgradeConfig({
      auth: "clerk",
      deployEnv: "development",
      clerkPublishableKey: "pk_test_x",
      enabled: "true",
      linkService: "true",
    });
    const link = deriveSteps(withService, { ...EMPTY_PROGRESS, clerkSignedIn: true }).find(
      (s) => s.id === "link"
    );
    expect(link?.state).toBe("blocked");
    expect(link?.reason).toMatch(/current account/i);
  });

  it("keeps funds locked behind the recovery secret", () => {
    const all = walletUpgradeConfig({
      auth: "clerk",
      deployEnv: "development",
      clerkPublishableKey: "pk_test_x",
      enabled: "true",
      linkService: "true",
      cryptoBackend: "true",
      moveFunds: "true",
    });
    const steps = deriveSteps(all, {
      ...EMPTY_PROGRESS,
      clerkSignedIn: true,
      decaneSignedIn: true,
      linked: true,
      walletCreated: true,
    });
    expect(states(steps).recovery).toBe("ready");
    expect(states(steps).funds).toBe("blocked");
  });
});

describe("a person with no old account", () => {
  it("skips signing in to the old account and connecting to it", () => {
    const withService = walletUpgradeConfig({
      auth: "clerk",
      deployEnv: "development",
      clerkPublishableKey: "pk_test_x",
      enabled: "true",
      linkService: "true",
      cryptoBackend: "true",
    });
    const steps = deriveSteps(withService, {
      ...EMPTY_PROGRESS,
      clerkSignedIn: true,
      linked: true,
      noLegacyAccount: true,
    });
    expect(states(steps).decane).toBe("done");
    expect(states(steps).link).toBe("done");
    expect(states(steps).wallet).toBe("ready");
  });
});

describe("nextStep", () => {
  it("is the first unfinished step, and null at the end", () => {
    const steps = deriveSteps(config(), { ...EMPTY_PROGRESS, clerkSignedIn: true });
    expect(nextStep(steps)?.id).toBe("decane");
    const finished = deriveSteps(config(), {
      clerkSignedIn: true,
      decaneSignedIn: true,
      linked: true,
      noLegacyAccount: false,
      walletCreated: true,
      recoveryConfirmed: true,
      fundsMoved: true,
    });
    expect(nextStep(finished)).toBeNull();
  });
});

describe("deriveSteps (Decane mode, the default)", () => {
  it("is four steps: sign in, wallet, recovery phrase, move funds", () => {
    const steps = deriveSteps(decaneConfig(), EMPTY_PROGRESS);
    expect(steps.map((s) => s.id)).toEqual(["decane", "wallet", "recovery", "funds"]);
    expect(steps.map((s) => s.id)).not.toContain("clerk");
    expect(steps.map((s) => s.id)).not.toContain("link");
    expect(steps[0]?.title).toBe("Sign in to your account");
  });

  it("offers the wallet as soon as the person is signed in, with no linking", () => {
    const config = decaneConfig({ cryptoBackend: "true", moveFunds: "true" });
    expect(states(deriveSteps(config, EMPTY_PROGRESS))).toMatchObject({
      decane: "ready",
      wallet: "blocked",
    });
    const signedIn = { ...EMPTY_PROGRESS, decaneSignedIn: true };
    expect(states(deriveSteps(config, signedIn))).toMatchObject({
      decane: "done",
      wallet: "ready",
      recovery: "blocked",
    });
    expect(deriveSteps(config, EMPTY_PROGRESS)[1]?.reason).toBe("Sign in to your account first.");
  });

  it("walks through to the move, then finishes", () => {
    const config = decaneConfig({ cryptoBackend: "true", moveFunds: "true" });
    const walletMade = {
      ...EMPTY_PROGRESS,
      decaneSignedIn: true,
      walletCreated: true,
      recoveryConfirmed: true,
    };
    const steps = deriveSteps(config, walletMade);
    expect(nextStep(steps)?.id).toBe("funds");
    expect(nextStep(deriveSteps(config, { ...walletMade, fundsMoved: true }))).toBeNull();
  });

  it("does not treat a new-user flag from the Clerk path as skipping anything", () => {
    const config = decaneConfig({ cryptoBackend: "true", moveFunds: "true" });
    const steps = deriveSteps(config, { ...EMPTY_PROGRESS, noLegacyAccount: true });
    expect(states(steps)).toMatchObject({ decane: "ready", funds: "blocked" });
  });
});
