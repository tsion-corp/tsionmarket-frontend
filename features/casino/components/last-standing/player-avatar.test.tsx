import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { PlayerAvatar } from "@/features/casino/components/last-standing/player-avatar";

const SEED = "0x36g3gt1111111111111111111111111111993";

describe("PlayerAvatar", () => {
  it("renders the picture when one is supplied, under the supplied alt text", () => {
    render(<PlayerAvatar src="https://cdn.example/pfp.png" seed={SEED} alt="Player 0x36g3" />);

    const figure = screen.getByLabelText("Player 0x36g3");
    const img = figure.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", "https://cdn.example/pfp.png");
  });

  it("falls back to the seeded mark when there is no picture", () => {
    render(<PlayerAvatar src={null} seed={SEED} alt="Player 0x36g3" />);

    const figure = screen.getByLabelText("Player 0x36g3");
    expect(figure.querySelector("img")).toBeNull();
    // The first two characters of the address, past its 0x prefix.
    expect(figure).toHaveTextContent("36");
  });

  it("falls back to the seeded mark when the picture fails to load", () => {
    render(<PlayerAvatar src="https://cdn.example/gone.png" seed={SEED} alt="Player 0x36g3" />);

    const figure = screen.getByLabelText("Player 0x36g3");
    const img = figure.querySelector("img");
    expect(img).not.toBeNull();

    fireEvent.error(img as HTMLImageElement);

    expect(figure.querySelector("img")).toBeNull();
    expect(figure).toHaveTextContent("36");
  });

  it("keeps the fallback underneath the picture, so a load swaps nothing about the box", () => {
    const { container: withPicture } = render(
      <PlayerAvatar src="https://cdn.example/pfp.png" seed={SEED} alt="Player" />
    );
    const { container: withoutPicture } = render(
      <PlayerAvatar src={null} seed={SEED} alt="Player" />
    );

    const box = (root: HTMLElement) => {
      const el = root.firstElementChild as HTMLElement;
      return `${el.style.width}|${el.style.height}|${el.style.backgroundColor}`;
    };

    expect(box(withPicture)).toBe(box(withoutPicture));
  });

  it("is deterministic: the same seed renders identically twice", () => {
    const { container: first } = render(<PlayerAvatar src={null} seed={SEED} alt="Player" />);
    const firstHtml = first.innerHTML;

    const { container: second } = render(<PlayerAvatar src={null} seed={SEED} alt="Player" />);

    expect(second.innerHTML).toBe(firstHtml);
  });

  it("gives different seeds different colours", () => {
    const seeds = [
      "0x11aa000000000000000000000000000000000001",
      "0x22bb000000000000000000000000000000000002",
      "0x33cc000000000000000000000000000000000003",
      "0x44dd000000000000000000000000000000000004",
      "0x55ee000000000000000000000000000000000005",
      "0x66ff000000000000000000000000000000000006",
    ];

    const colours = seeds.map((seed) => {
      const { container } = render(<PlayerAvatar src={null} seed={seed} alt="Player" />);
      return (container.firstElementChild as HTMLElement).style.backgroundColor;
    });

    expect(new Set(colours).size).toBeGreaterThan(1);
  });

  it("honours the size prop and defaults to the design's 29px", () => {
    const { container: dflt } = render(<PlayerAvatar src={null} seed={SEED} alt="Player" />);
    expect((dflt.firstElementChild as HTMLElement).style.width).toBe("29px");

    const { container: big } = render(
      <PlayerAvatar src={null} seed={SEED} size={40} alt="Player" />
    );
    expect((big.firstElementChild as HTMLElement).style.width).toBe("40px");
    expect((big.firstElementChild as HTMLElement).style.height).toBe("40px");
  });

  it("goes decorative when the caller passes an empty alt", () => {
    const { container } = render(<PlayerAvatar src={null} seed={SEED} alt="" />);

    const figure = container.firstElementChild as HTMLElement;
    expect(figure).toHaveAttribute("aria-hidden", "true");
    expect(figure).not.toHaveAttribute("role", "img");
  });

  it("does not repeat the alt text on the inner image, so it is announced once", () => {
    render(<PlayerAvatar src="https://cdn.example/pfp.png" seed={SEED} alt="Player 0x36g3" />);

    expect(screen.getAllByLabelText("Player 0x36g3")).toHaveLength(1);
    const img = screen.getByLabelText("Player 0x36g3").querySelector("img");
    expect(img).toHaveAttribute("alt", "");
  });
});
