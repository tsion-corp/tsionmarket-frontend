import { describe, expect, it } from "vitest";
import { walletUpgradeConfig } from "./environment";
import { EMPTY_PROGRESS, deriveSteps, nextStep } from "./steps";

const config = (extra: Record<string, string> = {}) =>
  walletUpgradeConfig({
    deployEnv: "development",
    clerkPublishableKey: "pk_test_x",
    enabled: "true",
    ...extra,
  });

const states = (steps: ReturnType<typeof deriveSteps>) => Object.fromEntries(steps.map((s) => [s.id, s.state]));

describe("deriveSteps", () => {
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
    const steps = deriveSteps(config(), { ...EMPTY_PROGRESS, clerkSignedIn: true, decaneSignedIn: true });
    expect(states(steps).clerk).toBe("done");
    expect(states(steps).decane).toBe("done");
  });

  it("makes linking ready only when both sign-ins are done and the service is on", () => {
    const both = { ...EMPTY_PROGRESS, clerkSignedIn: true, decaneSignedIn: true };
    expect(states(deriveSteps(config(), both)).link).toBe("unavailable");

    const withService = walletUpgradeConfig({
      deployEnv: "development",
      clerkPublishableKey: "pk_test_x",
      enabled: "true",
      linkService: "true",
    });
    expect(states(deriveSteps(withService, both)).link).toBe("ready");
    expect(states(deriveSteps(withService, { ...both, decaneSignedIn: false })).link).toBe("blocked");
  });

  it("explains what a blocked step is waiting on", () => {
    const withService = walletUpgradeConfig({
      deployEnv: "development",
      clerkPublishableKey: "pk_test_x",
      enabled: "true",
      linkService: "true",
    });
    const link = deriveSteps(withService, { ...EMPTY_PROGRESS, clerkSignedIn: true }).find((s) => s.id === "link");
    expect(link?.state).toBe("blocked");
    expect(link?.reason).toMatch(/current account/i);
  });

  it("keeps funds locked behind the recovery secret", () => {
    const all = walletUpgradeConfig({
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

describe("nextStep", () => {
  it("is the first unfinished step, and null at the end", () => {
    const steps = deriveSteps(config(), { ...EMPTY_PROGRESS, clerkSignedIn: true });
    expect(nextStep(steps)?.id).toBe("decane");
    const finished = deriveSteps(config(), {
      clerkSignedIn: true,
      decaneSignedIn: true,
      linked: true,
      walletCreated: true,
      recoveryConfirmed: true,
      fundsMoved: true,
    });
    expect(nextStep(finished)).toBeNull();
  });
});
