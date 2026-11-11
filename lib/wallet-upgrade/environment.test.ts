import { describe, expect, it } from "vitest";
import { clerkInstanceKind, deployTarget, walletUpgradeConfig } from "./environment";

const DEV_KEY = "pk_test_abc";
const LIVE_KEY = "pk_live_abc";

describe("clerkInstanceKind", () => {
  it("tells the instances apart by key prefix", () => {
    expect(clerkInstanceKind(DEV_KEY)).toBe("development");
    expect(clerkInstanceKind(LIVE_KEY)).toBe("production");
    expect(clerkInstanceKind("nonsense")).toBe("none");
    expect(clerkInstanceKind(undefined)).toBe("none");
  });
});

describe("deployTarget", () => {
  it("prefers the explicit setting", () => {
    expect(deployTarget({ deployEnv: "production", nodeEnv: "development" })).toBe("production");
    expect(deployTarget({ deployEnv: "development", nodeEnv: "production" })).toBe("development");
  });
  it("falls back to the build mode, never defaulting upward", () => {
    expect(deployTarget({ nodeEnv: "production" })).toBe("production");
    expect(deployTarget({ nodeEnv: "development" })).toBe("development");
    expect(deployTarget({})).toBe("development");
  });
});

describe("walletUpgradeConfig", () => {
  it("is off unless it is switched on", () => {
    const config = walletUpgradeConfig({ deployEnv: "development", clerkPublishableKey: DEV_KEY });
    expect(config.enabled).toBe(false);
    expect(config.blockedReason).toBeNull();
  });

  it("is always a rehearsal in development", () => {
    const config = walletUpgradeConfig({
      deployEnv: "development",
      clerkPublishableKey: DEV_KEY,
      enabled: "true",
      dryRun: "false",
    });
    expect(config.enabled).toBe(true);
    expect(config.dryRun).toBe(true);
  });

  it("is real in production unless dry-run is asked for", () => {
    const base = { deployEnv: "production", clerkPublishableKey: LIVE_KEY, enabled: "true" };
    expect(walletUpgradeConfig(base).dryRun).toBe(false);
    expect(walletUpgradeConfig({ ...base, dryRun: "true" }).dryRun).toBe(true);
  });

  it("fails closed when production runs on development keys", () => {
    const config = walletUpgradeConfig({
      deployEnv: "production",
      clerkPublishableKey: DEV_KEY,
      enabled: "true",
      linkService: "true",
      cryptoBackend: "true",
      moveFunds: "true",
    });
    expect(config.enabled).toBe(false);
    expect(config.linkAvailable).toBe(false);
    expect(config.moveFundsAvailable).toBe(false);
    expect(config.blockedReason).toMatch(/development keys/i);
  });

  it("fails closed when development runs on production keys", () => {
    const config = walletUpgradeConfig({
      deployEnv: "development",
      clerkPublishableKey: LIVE_KEY,
      enabled: "true",
    });
    expect(config.enabled).toBe(false);
    expect(config.blockedReason).toMatch(/real users/i);
  });

  it("reports missing Clerk keys when asked to run", () => {
    const config = walletUpgradeConfig({ deployEnv: "development", enabled: "true" });
    expect(config.enabled).toBe(false);
    expect(config.blockedReason).toMatch(/not configured/i);
  });

  it("only offers each service when its own switch is on", () => {
    const config = walletUpgradeConfig({
      deployEnv: "development",
      clerkPublishableKey: DEV_KEY,
      enabled: "true",
      linkService: "true",
    });
    expect(config.linkAvailable).toBe(true);
    expect(config.walletAvailable).toBe(false);
    expect(config.moveFundsAvailable).toBe(false);
  });

  it("needs the wallet backend as well as its own switch to offer moving funds", () => {
    const base = {
      deployEnv: "development",
      clerkPublishableKey: DEV_KEY,
      enabled: "true",
      moveFunds: "true",
    };
    expect(walletUpgradeConfig(base).moveFundsAvailable).toBe(false);
    expect(walletUpgradeConfig({ ...base, cryptoBackend: "true" }).moveFundsAvailable).toBe(true);
  });
});
