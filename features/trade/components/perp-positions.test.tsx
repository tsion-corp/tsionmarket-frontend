import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { PerpPositions } from "@/features/trade/components/perp-positions";
import messages from "@/messages/en.json";
import type { ComponentProps } from "react";

type Props = ComponentProps<typeof PerpPositions>;

function renderCard(overrides: Partial<Props>) {
  const props: Props = {
    positions: [],
    loading: false,
    errored: false,
    pairByIndex: new Map(),
    priceOf: () => null,
    onClose: vi.fn(),
    onUpdateTpSl: vi.fn(),
    onUpdateMargin: vi.fn(),
    busy: false,
    ...overrides,
  } as Props;
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PerpPositions {...props} />
    </NextIntlClientProvider>
  );
}

describe("PerpPositions visibility", () => {
  it("renders nothing when the trader holds no positions", () => {
    const { container } = renderCard({});
    expect(container).toBeEmptyDOMElement();
  });

  // Hiding a failed load would tell someone with open positions they have none,
  // which is the one wrong answer this card can give.
  it("still shows the failure when positions could not be loaded", () => {
    renderCard({ errored: true });
    expect(screen.getByText(/Couldn't load your positions/)).toBeInTheDocument();
  });

  // Held during loading so the card does not appear from nowhere for a trader
  // who does hold positions.
  it("still shows the placeholder while loading", () => {
    renderCard({ loading: true });
    expect(screen.getByText("Your positions")).toBeInTheDocument();
  });
});
