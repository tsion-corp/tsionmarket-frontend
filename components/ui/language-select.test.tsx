import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LanguageSelect } from "./language-select";

const activeLocale = "en";

vi.mock("next-intl", () => ({
  useLocale: () => activeLocale,
}));

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

function openMenu() {
  fireEvent.click(screen.getByRole("button"));
  return screen.getByRole("listbox");
}

describe("LanguageSelect", () => {
  it("renders nothing extra when closed", () => {
    render(<LanguageSelect />);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens the language list on click", () => {
    render(<LanguageSelect />);
    const listbox = openMenu();
    expect(listbox).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(5);
  });

  it("plays an exit animation instead of vanishing instantly on close", async () => {
    // Regression guard: the panel used to sit behind a bare `{open ? (...) :
    // null}`, unmounting with no closing frame. It must now stay in the DOM
    // through AnimatePresence's exit before it is finally removed.
    render(<LanguageSelect />);
    openMenu();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("closes on click outside", async () => {
    render(<LanguageSelect />);
    openMenu();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("closes on Escape", async () => {
    render(<LanguageSelect />);
    openMenu();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("marks the active locale as selected", () => {
    render(<LanguageSelect />);
    openMenu();
    const options = screen.getAllByRole("option");
    const active = options.find((o) => o.getAttribute("aria-selected") === "true");
    expect(active).toBeDefined();
  });
});
