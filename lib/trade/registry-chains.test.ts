import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REGISTRY_CHAINS } from "@/lib/trade/registry-chains";
import registryJson from "@/config/alchemy-bso-evm-networks.json";
import { render } from "../../scripts/gen-registry-chains.mjs";

// The JSON's inferred type narrows away fields the entries share only
// optionally; this test reads two of them.
const registry = registryJson as Array<{ chainKey: string | null; chainId?: number }>;

describe("registry chains", () => {
  it("is generated from the current registry (run `pnpm registry:chains` if this fails)", () => {
    const onDisk = readFileSync(join(process.cwd(), "lib/trade/registry-chains.ts"), "utf8");
    expect(onDisk).toBe(render(registry));
  });

  it("names every chain the registry points at", () => {
    for (const entry of registry) {
      if (!entry.chainKey) continue;
      const chain = REGISTRY_CHAINS[entry.chainKey as keyof typeof REGISTRY_CHAINS];
      expect(chain, entry.chainKey).toBeTruthy();
      if (entry.chainId !== undefined) expect(chain.id).toBe(entry.chainId);
    }
  });
});
