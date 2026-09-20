import { afterEach, describe, expect, it, vi } from "vitest";
import { safeLocalStorage } from "@/lib/safe-storage";

afterEach(() => vi.unstubAllGlobals());

describe("safeLocalStorage", () => {
  it("hands back the store when the browser allows it", () => {
    const store = new Map<string, string>();
    const storage = {
      setItem: (key: string, value: string) => void store.set(key, value),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => void store.delete(key),
    } as unknown as Storage;
    vi.stubGlobal("window", { localStorage: storage });
    expect(safeLocalStorage()).toBe(storage);
    // The probe cleans up after itself.
    expect(store.size).toBe(0);
  });

  // Chrome and Edge throw a SecurityError on the property itself when the user
  // blocks site data, and reading it during render took the whole app down
  // instead of one cached balance.
  it("returns nothing when reading storage throws", () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("SecurityError: access denied");
      },
    });
    expect(safeLocalStorage()).toBeUndefined();
  });

  it("returns nothing when storage cannot be written to", () => {
    vi.stubGlobal("window", {
      localStorage: {
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
        getItem: () => null,
        removeItem: () => {},
      } as unknown as Storage,
    });
    expect(safeLocalStorage()).toBeUndefined();
  });
});
