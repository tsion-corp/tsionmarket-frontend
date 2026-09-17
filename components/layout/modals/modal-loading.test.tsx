import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import { ModalLoading } from "@/components/layout/modals/modal-loading";

function wrap(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {node}
    </NextIntlClientProvider>
  );
}

// Every modal in app-modals.tsx is a next/dynamic import with ssr:false, and
// none of them passed a loading fallback. ModalShell paints its backdrop the
// moment `open` turns true, so between the press and the chunk arriving the
// user got a blurred page with nothing on it. On a phone that is seconds, and
// it reads as a broken button: the report was "when I click withdrawal... I
// had to try multiple times".
describe("ModalLoading", () => {
  it("occupies the sheet so the shell is never empty", () => {
    const { container } = wrap(<ModalLoading />);
    expect(container).not.toBeEmptyDOMElement();
  });

  it("announces itself to assistive tech as busy", () => {
    wrap(<ModalLoading />);
    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute("aria-busy", "true");
  });

  it("carries an accessible name so the wait is not silent", () => {
    wrap(<ModalLoading />);
    expect(screen.getByRole("status")).toHaveAccessibleName();
  });

  // The sheet animates in at a height the content will roughly fill. A
  // zero-height placeholder would let the sheet snap open and then jump.
  it("reserves height rather than collapsing", () => {
    wrap(<ModalLoading />);
    const status = screen.getByRole("status");
    expect(status.className).toMatch(/min-h-/);
  });
});
