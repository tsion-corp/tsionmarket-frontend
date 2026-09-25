import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emailIdentifier,
  hashIdentifier,
  lookupLegacyIdentifiers,
  parseLegacyDirectory,
  resetLegacyDirectory,
  xHandleIdentifier,
  xIdentifier,
} from "@/lib/server/legacy-directory";

const EMAIL = "Korex@Example.com";
const HASH = hashIdentifier(emailIdentifier(EMAIL));

beforeEach(() => {
  resetLegacyDirectory();
  vi.unstubAllEnvs();
});
afterEach(() => vi.unstubAllGlobals());

describe("parseLegacyDirectory", () => {
  it("survives a hand-exported sheet", () => {
    const rows = parseLegacyDirectory(
      [
        "sha256_email,evm,solana", // header
        "",
        `  "${HASH}" , "0xabc" , "SoL1" `, // quoted and padded
        "not-a-hash,0xdef,SoL2", // junk row
      ].join("\n")
    );
    expect(rows.size).toBe(1);
    expect(rows.get(HASH)).toEqual({ evm: "0xabc", solana: "SoL1" });
  });

  it("keeps a row that has only one chain", () => {
    expect(parseLegacyDirectory(`${HASH},0xabc,`).get(HASH)).toEqual({
      evm: "0xabc",
      solana: null,
    });
  });
});

describe("lookupLegacyIdentifiers", () => {
  const serve = (csv: string, ok = true) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(csv, { status: ok ? 200 : 500 }))
    );

  it("finds a member, case-insensitively", async () => {
    vi.stubEnv("LEGACY_DIRECTORY_URL", "https://sheet.example/csv");
    serve(`${HASH},0xabc,SoL1`);

    await expect(lookupLegacyIdentifiers([emailIdentifier("korex@example.com")])).resolves.toEqual({
      known: true,
      entry: { evm: "0xabc", solana: "SoL1" },
    });
  });

  it("says no for an address the export does not carry", async () => {
    vi.stubEnv("LEGACY_DIRECTORY_URL", "https://sheet.example/csv");
    serve(`${HASH},0xabc,SoL1`);

    await expect(lookupLegacyIdentifiers([emailIdentifier("someone@else.com")])).resolves.toEqual({
      known: false,
      entry: null,
    });
  });

  // The distinction the whole design rests on: unreadable is not empty.
  it("answers unknown, not no, when the sheet cannot be read", async () => {
    vi.stubEnv("LEGACY_DIRECTORY_URL", "https://sheet.example/csv");
    serve("", false);

    await expect(lookupLegacyIdentifiers([emailIdentifier("korex@example.com")])).resolves.toEqual({
      known: null,
      entry: null,
    });
  });

  it("answers unknown when there is no source at all", async () => {
    // No URL, and no readable bundled file. Mocked rather than assumed absent:
    // a real config/legacy-directory.csv exists on a machine that has run the
    // export, and this must assert the behaviour, not the tester's filesystem.
    vi.doMock("node:fs/promises", () => ({
      readFile: vi.fn(async () => {
        throw new Error("ENOENT");
      }),
    }));
    vi.resetModules();
    const fresh = await import("@/lib/server/legacy-directory");
    fresh.resetLegacyDirectory();

    await expect(
      fresh.lookupLegacyIdentifiers([fresh.emailIdentifier("korex@example.com")])
    ).resolves.toEqual({ known: null, entry: null });

    vi.doUnmock("node:fs/promises");
    vi.resetModules();
  });

  it("reads the sheet once, not once per lookup", async () => {
    vi.stubEnv("LEGACY_DIRECTORY_URL", "https://sheet.example/csv");
    const fetchMock = vi.fn(async () => new Response(`${HASH},0xabc,SoL1`, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await lookupLegacyIdentifiers([emailIdentifier("korex@example.com")]);
    await lookupLegacyIdentifiers([emailIdentifier("another@example.com")]);
    await lookupLegacyIdentifiers([emailIdentifier("third@example.com")]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never sends the address anywhere — only its hash is matched", async () => {
    vi.stubEnv("LEGACY_DIRECTORY_URL", "https://sheet.example/csv");
    const fetchMock = vi.fn(async () => new Response(`${HASH},0xabc,SoL1`, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await lookupLegacyIdentifiers([emailIdentifier(EMAIL)]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect(url).not.toContain("korex");
    expect(JSON.stringify(init ?? {})).not.toContain("korex");
  });
});

describe("refreshing on a one-minute window", () => {
  const csv = (hash: string) => `${hash},0xabc,SoL1`;

  beforeEach(() => vi.stubEnv("LEGACY_DIRECTORY_URL", "https://sheet.example/csv"));
  afterEach(() => vi.useRealTimers());

  it("serves the copy it has while the stale one is refetched", async () => {
    vi.useFakeTimers();
    const other = hashIdentifier("added@later.com");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(csv(HASH), { status: 200 }))
      .mockResolvedValueOnce(new Response(`${csv(HASH)}\n${csv(other)}`, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await lookupLegacyIdentifiers([emailIdentifier(EMAIL)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Inside the window: no second read.
    vi.setSystemTime(Date.now() + 30_000);
    await lookupLegacyIdentifiers([emailIdentifier(EMAIL)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Past it: the answer still comes from the copy in hand — the request does
    // not wait on the sheet — and a refresh is kicked off behind it.
    vi.setSystemTime(Date.now() + 61_000);
    await expect(lookupLegacyIdentifiers([emailIdentifier("added@later.com")])).resolves.toEqual({
      known: false,
      entry: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Once that lands, the new row is there.
    await vi.waitFor(async () => {
      const found = await lookupLegacyIdentifiers([emailIdentifier("added@later.com")]);
      expect(found.known).toBe(true);
    });
  });

  it("keeps the last good copy when a refresh fails", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(csv(HASH), { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await lookupLegacyIdentifiers([emailIdentifier(EMAIL)]);
    vi.setSystemTime(Date.now() + 61_000);
    await lookupLegacyIdentifiers([emailIdentifier(EMAIL)]);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    // A blip must not turn a known member into an unknown.
    await expect(lookupLegacyIdentifiers([emailIdentifier(EMAIL)])).resolves.toEqual({
      known: true,
      entry: { evm: "0xabc", solana: "SoL1" },
    });
  });
});

describe("tuning the window without a deploy", () => {
  beforeEach(() => vi.stubEnv("LEGACY_DIRECTORY_URL", "https://sheet.example/csv"));

  it("re-reads on every search when the window is zero", async () => {
    vi.stubEnv("LEGACY_DIRECTORY_TTL_MS", "0");
    const fetchMock = vi.fn(async () => new Response(`${HASH},0xabc,SoL1`, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await lookupLegacyIdentifiers([emailIdentifier(EMAIL)]);
    await lookupLegacyIdentifiers([emailIdentifier(EMAIL)]);
    await lookupLegacyIdentifiers([emailIdentifier(EMAIL)]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("falls back to the default when the value is nonsense", async () => {
    vi.stubEnv("LEGACY_DIRECTORY_TTL_MS", "not-a-number");
    const fetchMock = vi.fn(async () => new Response(`${HASH},0xabc,SoL1`, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await lookupLegacyIdentifiers([emailIdentifier(EMAIL)]);
    await lookupLegacyIdentifiers([emailIdentifier(EMAIL)]);

    // Reused, not refetched — a typo in an env var must not turn every lookup
    // into a download.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("a source that parses to nothing", () => {
  beforeEach(() => vi.stubEnv("LEGACY_DIRECTORY_URL", "https://sheet.example/csv"));

  // The likeliest misconfiguration: the sheet's /edit link instead of its CSV
  // export. Google answers 200 with a page of HTML, the parser finds no
  // hashes, and an empty directory would be a definite "no" for everyone.
  it("treats a page of HTML as unreadable, not as an empty membership", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<!DOCTYPE html><html>…</html>", { status: 200 }))
    );
    await expect(lookupLegacyIdentifiers([emailIdentifier(EMAIL)])).resolves.toEqual({
      known: null,
      entry: null,
    });
  });

  it("treats an empty file the same way", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("sha256_email,evm,solana\n", { status: 200 }))
    );
    await expect(lookupLegacyIdentifiers([emailIdentifier(EMAIL)])).resolves.toEqual({
      known: null,
      entry: null,
    });
  });
});

describe("a legacy user who never had an email", () => {
  // Privy allowed signing in with Twitter, and those accounts carry a handle
  // and nothing else. An email-only directory answers "no legacy account" for
  // every one of them and strands their money — which is the whole reason
  // Decane grew an X provider.
  const X_ID = "1234567890";
  const X_HASH = hashIdentifier(xIdentifier(X_ID));

  beforeEach(() => vi.stubEnv("LEGACY_DIRECTORY_URL", "https://sheet.example/csv"));

  it("finds them by their X id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(`${X_HASH},0xabc,SoL1`, { status: 200 }))
    );
    await expect(lookupLegacyIdentifiers([xIdentifier(X_ID)])).resolves.toEqual({
      known: true,
      entry: { evm: "0xabc", solana: "SoL1" },
    });
  });

  it("takes the first identifier that hits, whichever it is", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(`${X_HASH},0xabc,SoL1`, { status: 200 }))
    );
    // An email that is not in the directory, and an X id that is.
    await expect(
      lookupLegacyIdentifiers([emailIdentifier("nobody@example.com"), xIdentifier(X_ID)])
    ).resolves.toMatchObject({ known: true });
  });

  it("says no only when none of them match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(`${X_HASH},0xabc,SoL1`, { status: 200 }))
    );
    await expect(
      lookupLegacyIdentifiers([emailIdentifier("nobody@example.com"), xIdentifier("999")])
    ).resolves.toEqual({ known: false, entry: null });
  });

  it("ignores an empty identifier rather than matching on it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(`${X_HASH},0xabc,SoL1`, { status: 200 }))
    );
    await expect(lookupLegacyIdentifiers(["", ""])).resolves.toEqual({
      known: false,
      entry: null,
    });
  });
});

describe("keying an X account on its handle", () => {
  // The Privy export carries handles, not numeric ids, so this is the form
  // that actually matches for an X user today.
  it("normalises the handle it is given", () => {
    const canonical = xHandleIdentifier("korex");
    expect(xHandleIdentifier("@korex")).toBe(canonical);
    expect(xHandleIdentifier("  @KOREX ")).toBe(canonical);
    expect(canonical).toBe("x:@korex");
  });

  // Namespaced apart so a handle and an id can never be taken for each other.
  it("cannot collide with the id form", () => {
    expect(xHandleIdentifier("1234567890")).not.toBe(xIdentifier("1234567890"));
  });
});
