// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SHINE_POSTED_KEY,
  SHINE_POSTED_MAX_ACCOUNTS,
  SHINE_POSTED_MAX_PER_ACCOUNT,
  SHINE_POSTED_TTL_MS,
  claimShinePost,
  hasShinePosted,
  shinePostedRecords,
} from "@/lib/shine/posted-store";

const ALICE = "did:privy:alice";
const BOB = "did:privy:bob";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("claiming a post", () => {
  it("claims once and refuses the same event after that", () => {
    expect(claimShinePost(ALICE, "memecoin", "swap-1")).toBe("claimed");
    expect(claimShinePost(ALICE, "memecoin", "swap-1")).toBe("already-posted");
    expect(hasShinePosted(ALICE, "memecoin", "swap-1")).toBe(true);
  });

  it("survives a reload, because a reload is how a poller re-fires", () => {
    expect(claimShinePost(ALICE, "arcade", "ticket-9")).toBe("claimed");
    // A reload keeps localStorage and loses every module-level variable. Only
    // what was written to storage may answer after this line.
    const raw = window.localStorage.getItem(SHINE_POSTED_KEY);
    window.localStorage.clear();
    window.localStorage.setItem(SHINE_POSTED_KEY, raw ?? "");
    expect(claimShinePost(ALICE, "arcade", "ticket-9")).toBe("already-posted");
  });

  it("keeps one account's record away from another on the same device", () => {
    expect(claimShinePost(ALICE, "spot", "req-1")).toBe("claimed");
    expect(claimShinePost(BOB, "spot", "req-1")).toBe("claimed");
    expect(hasShinePosted(BOB, "spot", "req-2")).toBe(false);
  });

  it("keeps each service's natural ids apart", () => {
    expect(claimShinePost(ALICE, "spot", "1")).toBe("claimed");
    expect(claimShinePost(ALICE, "perps", "1")).toBe("claimed");
  });

  it("ignores a record written by a different, incompatible build", () => {
    window.localStorage.setItem(SHINE_POSTED_KEY, JSON.stringify([{ nonsense: true }, 7, null]));
    expect(claimShinePost(ALICE, "spot", "req-1")).toBe("claimed");
    expect(shinePostedRecords()).toHaveLength(1);
  });

  it("starts clean when the stored value is not JSON at all", () => {
    window.localStorage.setItem(SHINE_POSTED_KEY, "{not json");
    expect(claimShinePost(ALICE, "spot", "req-1")).toBe("claimed");
  });
});

describe("unreadable storage", () => {
  // The storage OBJECT is replaced, not spied on.
  //
  // Which target a spy has to attach to depends on the Node the suite runs
  // under. Node 26 leaves jsdom without a usable localStorage, so
  // vitest.setup.ts installs a plain object with own methods and an instance
  // spy is the one that fires. Node 24 gives jsdom a real Storage, whose
  // methods live on the prototype behind a proxy, and the instance spy is
  // bypassed — which is how these three passed locally and, on CI, let a claim
  // through that should have been refused. That is the wrong direction for the
  // one guard deciding whether a post this browser cannot remember making is
  // published. Defining the property covers both, because it is what the
  // module reads either way.
  const original = Object.getOwnPropertyDescriptor(window, "localStorage");

  afterEach(() => {
    if (original) Object.defineProperty(window, "localStorage", original);
  });

  function installStorage(throwing: { read: boolean; write: boolean }): void {
    const store = new Map<string, string>();
    const insecure = () => {
      throw new Error("SecurityError: the operation is insecure");
    };
    const storage: Storage = {
      get length() {
        return store.size;
      },
      key: (index) => [...store.keys()][index] ?? null,
      getItem: throwing.read ? insecure : (key) => store.get(key) ?? null,
      setItem: throwing.write
        ? () => {
            throw new Error("QuotaExceededError");
          }
        : (key, value) => void store.set(key, String(value)),
      removeItem: (key) => void store.delete(key),
      clear: () => store.clear(),
    };
    Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
  }

  // Safari in private mode throws on both, which is the case this covers.
  function breakStorage(): void {
    installStorage({ read: true, write: true });
  }

  it("refuses to claim, so nothing is posted it cannot remember posting", () => {
    breakStorage();
    expect(claimShinePost(ALICE, "memecoin", "swap-1")).toBe("storage-unavailable");
  });

  it("answers 'already posted' to a read, so no caller treats it as fresh", () => {
    breakStorage();
    expect(hasShinePosted(ALICE, "memecoin", "swap-1")).toBe(true);
  });

  it("refuses when the read works but the write is rejected", () => {
    installStorage({ read: false, write: true });
    expect(claimShinePost(ALICE, "memecoin", "swap-1")).toBe("storage-unavailable");
  });
});

describe("pruning", () => {
  it("drops a record older than the window a poller can re-serve in", () => {
    const now = Date.UTC(2026, 8, 24);
    claimShinePost(ALICE, "arcade", "old", now - SHINE_POSTED_TTL_MS - 1);
    claimShinePost(ALICE, "arcade", "recent", now);
    expect(shinePostedRecords().map((r) => r.id)).toEqual(["recent"]);
  });

  it("bounds one account without evicting another", () => {
    const now = Date.UTC(2026, 8, 24);
    for (let i = 0; i < SHINE_POSTED_MAX_PER_ACCOUNT + 5; i += 1) {
      claimShinePost(ALICE, "memecoin", `swap-${i}`, now + i);
    }
    claimShinePost(BOB, "memecoin", "bobs-only", now);
    const records = shinePostedRecords();
    expect(records.filter((r) => r.did === ALICE)).toHaveLength(SHINE_POSTED_MAX_PER_ACCOUNT);
    expect(hasShinePosted(ALICE, "memecoin", "swap-0")).toBe(false);
    expect(hasShinePosted(ALICE, "memecoin", `swap-${SHINE_POSTED_MAX_PER_ACCOUNT + 4}`)).toBe(
      true
    );
    expect(hasShinePosted(BOB, "memecoin", "bobs-only")).toBe(true);
  });

  it("forgets the least recently active account rather than growing forever", () => {
    const now = Date.UTC(2026, 8, 24);
    for (let i = 0; i <= SHINE_POSTED_MAX_ACCOUNTS; i += 1) {
      claimShinePost(`did:privy:user-${i}`, "spot", "req-1", now + i);
    }
    const dids = new Set(shinePostedRecords().map((r) => r.did));
    expect(dids.size).toBe(SHINE_POSTED_MAX_ACCOUNTS);
    expect(dids.has("did:privy:user-0")).toBe(false);
  });

  it("never evicts the account being written", () => {
    const now = Date.UTC(2026, 8, 24);
    for (let i = 0; i < SHINE_POSTED_MAX_ACCOUNTS; i += 1) {
      claimShinePost(`did:privy:user-${i}`, "spot", "req-1", now + 1000 + i);
    }
    // Oldest possible timestamp, and still the account this write belongs to.
    claimShinePost("did:privy:latecomer", "spot", "req-1", now);
    expect(hasShinePosted("did:privy:latecomer", "spot", "req-1")).toBe(true);
  });
});
