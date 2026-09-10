import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useFitText } from "./use-fit-text";

function Line({ text, box, natural }: { text: string; box: number; natural: number }) {
  const { ref, scale } = useFitText(text);
  return (
    <span
      ref={(el) => {
        // jsdom lays nothing out, so the box and the text's width are stubbed
        // on the element the hook measures.
        if (el) {
          Object.defineProperty(el, "clientWidth", { value: box, configurable: true });
          Object.defineProperty(el, "scrollWidth", {
            get: () => natural * scale,
            configurable: true,
          });
        }
        ref.current = el;
      }}
      data-testid="line"
      data-scale={scale.toFixed(3)}
    >
      {text}
    </span>
  );
}

describe("useFitText", () => {
  it("scales a line down to the box it overflows", async () => {
    render(<Line text="Set The Stake" box={90} natural={120} />);
    await act(async () => {});
    expect(screen.getByTestId("line").dataset.scale).toBe("0.750");
  });

  it("leaves a line that fits at its design size", async () => {
    render(<Line text="Set The Stake" box={200} natural={120} />);
    await act(async () => {});
    expect(screen.getByTestId("line").dataset.scale).toBe("1.000");
  });
});
