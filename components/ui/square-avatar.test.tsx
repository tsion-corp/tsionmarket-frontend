// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { SquareAvatar } from "@/components/ui/square-avatar";
import { artworkForSeed } from "@/lib/square/avatar-seed";

// The three tiers, in the square's own order. The middle one is what makes a
// player who has never opened the square look the same on both surfaces, so
// it is pinned against the shared seeding rather than a literal path.
describe("SquareAvatar", () => {
  const did = "did:privy:cmrv8k0hd00b40cldl4p0d08g";

  it("shows the picture the person uploaded", () => {
    const { container } = render(
      <SquareAvatar src="https://cdn.example/me.png" seed={did} size={32} />
    );

    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://cdn.example/me.png");
  });

  it("falls back to the same seeded artwork the square draws", () => {
    const { container } = render(<SquareAvatar src={null} seed={did} size={32} />);

    expect(container.querySelector("img")?.getAttribute("src")).toBe(artworkForSeed(did));
  });

  it("keeps the seeded artwork stable as the display name changes", () => {
    const first = render(<SquareAvatar src={null} seed={did} name="Emmanuel" size={32} />);
    const second = render(<SquareAvatar src={null} seed={did} name="Renamed" size={32} />);

    expect(first.container.querySelector("img")?.getAttribute("src")).toBe(
      second.container.querySelector("img")?.getAttribute("src")
    );
  });

  it("falls back to the seeded artwork when an upload will not load", () => {
    const { container } = render(
      <SquareAvatar src="https://cdn.example/gone.png" seed={did} size={32} />
    );

    fireEvent.error(container.querySelector("img")!);

    expect(container.querySelector("img")?.getAttribute("src")).toBe(artworkForSeed(did));
  });

  it("draws a neutral mark rather than somebody else's face when nothing identifies the row", () => {
    const { container } = render(<SquareAvatar src={null} seed="" size={32} />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
