import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusChip, type StatusTone } from "@/components/ui/status-chip";

const TONES: StatusTone[] = ["win", "loss", "live", "pending", "done", "neutral"];

describe("StatusChip", () => {
  it("renders the label it is handed, verbatim", () => {
    render(<StatusChip tone="win" label="Won" />);
    expect(screen.getByText("Won")).toBeInTheDocument();
  });

  it("renders a label it knows nothing about, because it holds no message keys", () => {
    // The Activity screen's eight statuses are mapped to tones at the call
    // site. If the chip ever grew its own lookup this string would not appear.
    render(<StatusChip tone="pending" label="Awaiting Results" />);
    expect(screen.getByText("Awaiting Results")).toBeInTheDocument();
  });

  it("colours a win with the up token and a loss with the down token", () => {
    const { container } = render(
      <>
        <StatusChip tone="win" label="Won" />
        <StatusChip tone="loss" label="Lost" />
      </>
    );
    const [win, loss] = Array.from(container.querySelectorAll("span"));
    expect(win.className).toContain("text-up");
    expect(loss.className).toContain("text-down");
  });

  it("gives every tone its own palette, so no two statuses read alike", () => {
    // With one intended exception: `live` and `win` share the signal green,
    // because the Activity frames draw Live and Won in the same colour and the
    // pulsing dot is what separates them (asserted below). Every other pair
    // must still differ, or a reader cannot tell two outcomes apart.
    const palettes = TONES.filter((tone) => tone !== "live").map((tone) => {
      const { container } = render(<StatusChip tone={tone} label={tone} />);
      const chip = container.firstElementChild;
      expect(chip).not.toBeNull();
      return chip?.className ?? "";
    });
    expect(new Set(palettes).size).toBe(TONES.length - 1);
  });

  it("keeps the same geometry across tones, so a column of chips lines up", () => {
    const geometry = TONES.map((tone) => {
      const { container } = render(<StatusChip tone={tone} label={tone} />);
      const classes = (container.firstElementChild?.className ?? "").split(" ");
      return classes.filter((c) => c.startsWith("px-") || c.startsWith("py-")).join(" ");
    });
    expect(new Set(geometry).size).toBe(1);
  });

  it("draws a pulsing dot on live, and only on live", () => {
    const { container: live } = render(<StatusChip tone="live" label="Live" />);
    const dot = live.querySelector(".animate-pulse");
    expect(dot).not.toBeNull();
    // Decorative: the word "Live" already says it, so a screen reader must not
    // hear the dot as a second thing.
    expect(dot).toHaveAttribute("aria-hidden");

    for (const tone of TONES.filter((t) => t !== "live")) {
      const { container } = render(<StatusChip tone={tone} label={tone} />);
      expect(container.querySelector(".animate-pulse")).toBeNull();
    }
  });

  it("announces nothing but its label", () => {
    render(<StatusChip tone="live" label="Live" />);
    expect(screen.getByText("Live")).toHaveTextContent(/^Live$/);
  });

  it("takes an extra class, so a row can control its own layout", () => {
    const { container } = render(<StatusChip tone="done" label="Completed" className="shrink-0" />);
    expect(container.querySelector(".shrink-0")).not.toBeNull();
  });
});

describe("StatusChip live palette", () => {
  it("draws live in the same green as a gain, which is what the Activity frames specify", () => {
    // Figma gives Live #00b147 on All Activity, the same signal green as Won.
    // The accent (silver) the chip started with reads as a disabled state next
    // to it. The pulsing dot, not the hue, is what separates live from won.
    const { container } = render(<StatusChip tone="live" label="Live" />);
    const chip = container.firstElementChild;
    expect(chip).toHaveClass("text-up");
    expect(chip).not.toHaveClass("text-accent");
  });
});
