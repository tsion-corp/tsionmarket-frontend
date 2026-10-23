import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = resolve(__dirname, "migrate-env.sh");

// Runs the script against a filled env file, with `pnpm` replaced by a stub
// that records its arguments, so nothing reaches Cloudflare.
function run(envFile: string) {
  const dir = mkdtempSync(join(tmpdir(), "migrate-env-"));
  const bin = join(dir, "bin");
  const calls = join(dir, "pnpm-calls");
  spawnSync("mkdir", [bin]);
  writeFileSync(join(bin, "pnpm"), `#!/bin/sh\necho "$@" >> "${calls}"\ncat > /dev/null\n`);
  chmodSync(join(bin, "pnpm"), 0o755);
  const filled = join(dir, "filled.env");
  writeFileSync(filled, envFile);
  const result = spawnSync("bash", [SCRIPT, "staging", filled], {
    cwd: resolve(__dirname, "../.."),
    env: { ...process.env, HOME: dir, PATH: `${bin}:${process.env.PATH}` },
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout,
    pnpmCalls: existsSync(calls) ? readFileSync(calls, "utf8") : "",
  };
}

describe("migrate-env.sh", () => {
  // Vercel CLI writes this placeholder for Sensitive values it will not return.
  it("treats Vercel's [SENSITIVE] placeholder as a missing value and uploads nothing", () => {
    const { status, stdout, pnpmCalls } = run(
      'PRIVY_APP_SECRET="[SENSITIVE]"\nNEXT_PUBLIC_PRIVY_APP_ID="cl-real-id"\n'
    );
    expect(status).toBe(1);
    expect(pnpmCalls).toBe("");
    expect(stdout).toContain("  PRIVY_APP_SECRET");
    expect(stdout).toContain("Nothing was uploaded");
  });

  it("uploads the secrets to the staging Worker when every value is filled", () => {
    const { status, pnpmCalls } = run(
      'PRIVY_APP_SECRET="s3cret"\nNEXT_PUBLIC_PRIVY_APP_ID="cl-id"\n'
    );
    expect(status).toBe(0);
    expect(pnpmCalls).toContain("wrangler secret bulk --env staging");
  });
});
