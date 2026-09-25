import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import messages from "@/messages/en.json";
import { MemeViewSwitch } from "@/features/trade/components/meme-catalog-controls";

// The control every catalogue list shares (desk, grid, phone tab): the
// Curated / All switch over DISCOVERY_POLICY.

function wrap(ui: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("MemeViewSwitch", () => {
  it("names both views and marks the one in force", () => {
    wrap(<MemeViewSwitch value="curated" onChange={vi.fn()} />);
    const group = screen.getByRole("group", { name: "Which memecoins to list" });
    expect(within(group).getByRole("button", { name: "Curated" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(within(group).getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("hands back the view picked", () => {
    const onChange = vi.fn();
    wrap(<MemeViewSwitch value="curated" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onChange).toHaveBeenCalledWith("all");
  });
});
