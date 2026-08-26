import { describe, expect, it } from "vitest";
import {
  emptyInventory,
  PRIVY_DIALOG_SELECTOR,
  suspendReasonInDom,
  SUSPEND_ATTRIBUTE,
  inventoryLines,
  inventorySensitive,
  sensitivePathReason,
  SUSPEND_LABEL,
} from "./sensitive";

describe("sensitivePathReason", () => {
  it("suspends on anything holding keys or recovery material", () => {
    expect(sensitivePathReason("/settings/seed-phrase")).toBe("keys");
    expect(sensitivePathReason("/wallet/private-key")).toBe("keys");
    expect(sensitivePathReason("/account/export-wallet")).toBe("keys");
    expect(sensitivePathReason("/recovery")).toBe("keys");
    expect(sensitivePathReason("/settings/backup")).toBe("keys");
  });

  it("suspends on two-factor setup", () => {
    expect(sensitivePathReason("/settings/2fa")).toBe("security");
    expect(sensitivePathReason("/settings/authenticator")).toBe("security");
  });

  it("catches key export expressed as a query flag rather than a route", () => {
    expect(sensitivePathReason("/dashboard?export=key")).toBe("keys");
    expect(sensitivePathReason("/dashboard?tab=x&reveal=phrase")).toBe("keys");
  });

  it("matches whole segments, so an innocent route is not paused", () => {
    expect(sensitivePathReason("/portfolio/backup-history")).toBeNull();
    expect(sensitivePathReason("/casino/chess/play?match=m-1")).toBeNull();
    expect(sensitivePathReason("/dashboard")).toBeNull();
    expect(sensitivePathReason("/")).toBeNull();
  });

  it("ignores case, because a route may be linked in any casing", () => {
    expect(sensitivePathReason("/Settings/Seed-Phrase")).toBe("keys");
  });

  it("names every reason it can return", () => {
    expect(SUSPEND_LABEL.keys).toMatch(/sensitive/i);
    expect(SUSPEND_LABEL.security).toMatch(/security/i);
    expect(SUSPEND_LABEL.signing).toMatch(/transaction/i);
  });
});

describe("inventorySensitive", () => {
  function root(html: string): ParentNode {
    const host = document.createElement("div");
    host.innerHTML = html;
    return host;
  }

  it("counts what is on screen by kind", () => {
    const found = inventorySensitive(
      root(`
        <span data-sensitive="balance">1</span>
        <span data-sensitive="balance">2</span>
        <span data-sensitive="position">3</span>
        <span data-sensitive="address">4</span>
        <span data-sensitive>5</span>
      `)
    );
    expect(found).toEqual({ balances: 2, positions: 1, addresses: 1, other: 1 });
  });

  it("counts nothing on a screen with nothing marked", () => {
    expect(inventorySensitive(root("<span>plain</span>"))).toEqual(emptyInventory());
  });

  it("reads as a list a person can scan, and pluralises honestly", () => {
    expect(inventoryLines({ balances: 1, positions: 2, addresses: 1, other: 0 })).toEqual([
      "1 balance",
      "2 positions and PnL",
      "1 wallet address",
    ]);
    expect(inventoryLines(emptyInventory())).toEqual([]);
  });
});

describe("suspendReasonInDom", () => {
  function root(html: string): ParentNode {
    const host = document.createElement("div");
    host.innerHTML = html;
    return host;
  }

  // The case that motivated the whole guard. Privy renders wallet export,
  // recovery phrases and MFA setup in a dialog it portals into document.body,
  // so there is no component of ours to wrap and it is matched by id.
  it("suspends for keys while Privy's dialog is open", () => {
    expect(suspendReasonInDom(root('<div id="privy-dialog">export</div>'))).toBe("keys");
    expect(PRIVY_DIALOG_SELECTOR).toBe("#privy-dialog");
  });

  it("suspends for signing when a flow marks itself", () => {
    expect(suspendReasonInDom(root(`<div ${SUSPEND_ATTRIBUTE}></div>`))).toBe("signing");
  });

  it("treats Privy's dialog as the more serious of the two", () => {
    const both = root(`<div id="privy-dialog"></div><div ${SUSPEND_ATTRIBUTE}></div>`);
    expect(suspendReasonInDom(both)).toBe("keys");
  });

  it("does not suspend an ordinary screen", () => {
    expect(suspendReasonInDom(root('<div id="something-else"></div>'))).toBeNull();
  });
});
