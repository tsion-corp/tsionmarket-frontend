import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import messages from "@/messages/en.json";
import { MemeSearchInput } from "@/features/trade/components/meme-search-input";

function Wrap({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("MemeSearchInput", () => {
  it("names what the box searches and clears on demand", () => {
    const onChange = vi.fn();
    render(
      <Wrap>
        <MemeSearchInput value="pep" onChange={onChange} label="Search all memecoins" />
      </Wrap>
    );
    expect(screen.getByLabelText("Search all memecoins")).toHaveAttribute(
      "placeholder",
      messages.meme.searchPlaceholder
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
