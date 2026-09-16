import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { DateField } from "@/features/funds/components/kyc/date-field";

// jsdom implements no layout, so it ships no scrollIntoView. The panel calls
// it on open to bring itself into view below the fold; a stub keeps that
// call from throwing without asserting anything about real scroll behavior.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// The calendar's grid always opens on January 2000 when no date is picked
// yet (see DateField's `view` seed), so every day in it is safely in the
// past regardless of when the suite runs.
function renderField(value = "") {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DateField label="Date of birth" required value={value} error={null} onChange={onChange} />
    </NextIntlClientProvider>
  );
  return { onChange };
}

describe("DateField", () => {
  it("opens the calendar on click and closes it on a second click, past its exit animation", async () => {
    renderField();
    const trigger = screen.getByRole("button", { name: "Select date" });
    expect(screen.queryByRole("button", { name: "Previous month" })).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Previous month" })).toBeInTheDocument();

    fireEvent.click(trigger);
    // The panel plays an exit animation before it unmounts rather than
    // vanishing on the same tick.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Previous month" })).not.toBeInTheDocument()
    );
  });

  it("closes on Escape and on an outside click", async () => {
    renderField();
    fireEvent.click(screen.getByRole("button", { name: "Select date" }));
    expect(screen.getByRole("button", { name: "Previous month" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Previous month" })).not.toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: "Select date" }));
    expect(screen.getByRole("button", { name: "Previous month" })).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Previous month" })).not.toBeInTheDocument()
    );
  });

  it("picks a date, reports it, and auto-closes past its exit animation", async () => {
    const { onChange } = renderField();
    fireEvent.click(screen.getByRole("button", { name: "Select date" }));

    fireEvent.click(screen.getByRole("button", { name: "1" }));
    expect(onChange).toHaveBeenCalledWith("2000-01-01");

    // Selecting a day auto-closes the calendar; that timing is unchanged by
    // the transition, only the unmount is now deferred to the exit animation.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Previous month" })).not.toBeInTheDocument()
    );
  });

  it("navigates months with the chevrons without disturbing the picked day", () => {
    renderField();
    fireEvent.click(screen.getByRole("button", { name: "Select date" }));

    const monthSelect = screen.getByDisplayValue("January");
    expect(monthSelect).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByDisplayValue("February")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByDisplayValue("January")).toBeInTheDocument();
  });

  it("shows the formatted value on the trigger when a date is already set", () => {
    renderField("2000-06-15");
    expect(screen.getByRole("button", { name: /15 Jun 2000/ })).toBeInTheDocument();
  });
});
