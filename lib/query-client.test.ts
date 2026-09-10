import { describe, expect, it } from "vitest";
import { createQueryClient } from "./query-client";

describe("createQueryClient", () => {
  it("configures sane query defaults to prevent redundant network requests", () => {
    const client = createQueryClient();
    const defaultOptions = client.getDefaultOptions();

    expect(defaultOptions.queries?.staleTime).toBeGreaterThanOrEqual(30 * 1000);
    expect(defaultOptions.queries?.gcTime).toBeGreaterThanOrEqual(5 * 60 * 1000);
    expect(defaultOptions.queries?.refetchOnWindowFocus).toBe(false);
  });
});
