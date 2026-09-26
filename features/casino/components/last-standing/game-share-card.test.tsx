import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import messages from "@/messages/en.json";

const { drawShareImage } = vi.hoisted(() => ({ drawShareImage: vi.fn() }));
vi.mock("@/features/casino/lib/last-standing/share-image", () => ({
  SHARE_IMAGE_SIZE: 1200,
  drawShareImage,
}));

import { GameShareCard } from "@/features/casino/components/last-standing/game-share-card";

const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={messages}>
    {children}
  </NextIntlClientProvider>
);

function renderCard(over: { title?: string; description?: string } = {}) {
  render(
    <GameShareCard
      gameId={274}
      url="https://tsionark.com/casino/last-standing/274"
      stakeLabel="$0.38 to join"
      isPrivate={false}
      onOpen={() => {}}
      {...over}
    />,
    { wrapper }
  );
}

// The download paints the QR onto a canvas through an Image load, which jsdom
// does not run. The copy handed to the painter is what this file checks, so
// the layout is exercised where it is decided.
function paintedCopy(): Record<string, string> | null {
  const call = drawShareImage.mock.calls[0];
  return call ? (call[2] as Record<string, string>) : null;
}

function download() {
  fireEvent.click(screen.getByRole("button", { name: messages.casino.lastStanding.shareDownload }));
  const image = imageInstances[imageInstances.length - 1];
  image?.onload?.();
}

// A stand-in Image whose load is fired by hand.
let imageInstances: { onload?: () => void; onerror?: () => void; src?: string }[] = [];

beforeEach(() => {
  drawShareImage.mockReset();
  imageInstances = [];
  vi.stubGlobal(
    "Image",
    class {
      onload?: () => void;
      onerror?: () => void;
      set src(_value: string) {}
      constructor() {
        imageInstances.push(this);
      }
    }
  );
  URL.createObjectURL = vi.fn(() => "blob:qr");
  URL.revokeObjectURL = vi.fn();
  // The painter is mocked, so the context only has to be non-null.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    {} as unknown as CanvasRenderingContext2D
  );
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,");
});

describe("the card a starter hands over", () => {
  it("heads the card with the starter's name for the game", () => {
    renderCard({ title: "Friday night pot", description: "Winner takes the lot" });
    expect(screen.getByText("Friday night pot")).toBeInTheDocument();
    expect(screen.getByText("Winner takes the lot")).toBeInTheDocument();
  });

  it("falls back to the game number when the starter named nothing", () => {
    renderCard();
    expect(screen.getByText("Game #274")).toBeInTheDocument();
  });
});

describe("the image that is downloaded", () => {
  it("carries the game's name and description", () => {
    renderCard({ title: "Friday night pot", description: "Winner takes the lot" });
    download();

    expect(paintedCopy()).toMatchObject({
      game: "Friday night pot",
      description: "Winner takes the lot",
      stake: "$0.38 to join",
    });
  });

  it("carries the name alone when there is no description", () => {
    renderCard({ title: "Friday night pot" });
    download();

    expect(paintedCopy()?.game).toBe("Friday night pot");
    expect(paintedCopy()?.description).toBeUndefined();
  });

  it("names the game by number when the starter named nothing", () => {
    renderCard();
    download();

    expect(paintedCopy()?.game).toBe("Game #274");
    expect(paintedCopy()?.description).toBeUndefined();
  });

  // Whitespace is not a name, and a card headed by a blank line is worse than
  // one headed by the number.
  it("treats a blank name as no name", () => {
    renderCard({ title: "   ", description: "   " });
    download();

    expect(paintedCopy()?.game).toBe("Game #274");
    expect(paintedCopy()?.description).toBeUndefined();
  });
});
