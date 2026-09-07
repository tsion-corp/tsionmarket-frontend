import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

const identity = vi.hoisted(() => ({ identityToken: null as string | null }));
vi.mock("@privy-io/react-auth", () => ({
  useIdentityToken: () => ({ identityToken: identity.identityToken }),
}));

import { IdentityTokenBridge } from "@/components/providers/identity-token-bridge";
import { peekHeldIdentityToken, setHeldIdentityToken } from "@/lib/privy-identity-store";

afterEach(() => {
  cleanup();
  setHeldIdentityToken(null);
});

describe("IdentityTokenBridge", () => {
  it("mirrors the token the SDK holds into the store the resolver reads", () => {
    identity.identityToken = "id-1";
    const view = render(<IdentityTokenBridge />);
    expect(peekHeldIdentityToken()).toBe("id-1");

    identity.identityToken = "id-2";
    view.rerender(<IdentityTokenBridge />);
    expect(peekHeldIdentityToken()).toBe("id-2");
  });

  it("clears the store on sign-out and unmount", () => {
    identity.identityToken = "id-1";
    const view = render(<IdentityTokenBridge />);
    identity.identityToken = null;
    view.rerender(<IdentityTokenBridge />);
    expect(peekHeldIdentityToken()).toBeNull();

    identity.identityToken = "id-3";
    view.rerender(<IdentityTokenBridge />);
    expect(peekHeldIdentityToken()).toBe("id-3");
    view.unmount();
    expect(peekHeldIdentityToken()).toBeNull();
  });
});
