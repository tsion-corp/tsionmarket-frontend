// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { AccountAvatar } from "@/components/ui/account-avatar";
import { artworkForSeed } from "@/lib/avatar/avatar-seed";

describe("AccountAvatar", () => {
  const did = "did:privy:cmrv8k0hd00b40cldl4p0d08g";

  it("draws the seeded artwork for the account", () => {
    const { container } = render(<AccountAvatar seed={did} size={32} />);

    expect(container.querySelector("img")?.getAttribute("src")).toBe(artworkForSeed(did));
  });

  it("keeps the seeded artwork stable as the display name changes", () => {
    const first = render(<AccountAvatar seed={did} name="Emmanuel" size={32} />);
    const second = render(<AccountAvatar seed={did} name="Renamed" size={32} />);

    expect(first.container.querySelector("img")?.getAttribute("src")).toBe(
      second.container.querySelector("img")?.getAttribute("src")
    );
  });

  it("draws a neutral mark rather than somebody else's face when nothing identifies the row", () => {
    const { container } = render(<AccountAvatar seed="" size={32} />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
