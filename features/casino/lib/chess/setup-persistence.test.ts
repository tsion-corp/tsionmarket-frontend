// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { installChessSetupPersistence } from "@/features/casino/lib/chess/setup-persistence";

function setupDocument(): Document {
  return new DOMParser().parseFromString(
    `<form data-lobby-setup>
      <input name="variant" value="standard">
      <select name="time_control"><option value="60+0">1+0</option><option value="300+3">5+3</option></select>
      <input type="radio" name="mode" value="casual" checked>
      <input type="radio" name="mode" value="rated">
      <input name="stake_usdc" value="25">
    </form>`,
    "text/html"
  );
}

describe("installChessSetupPersistence", () => {
  it("restores setup fields without persisting stake amounts", () => {
    const values = new Map<string, string>([
      ["lobby.setup.0xabc.hook", JSON.stringify({ time_control: "300+3", mode: "rated" })],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const document = setupDocument();
    const cleanup = installChessSetupPersistence(document, "0xabc", storage);
    const form = document.querySelector<HTMLFormElement>("form")!;

    expect((form.elements.namedItem("time_control") as HTMLSelectElement).value).toBe("300+3");
    expect((form.elements.namedItem("mode") as RadioNodeList).value).toBe("rated");
    expect((form.elements.namedItem("stake_usdc") as HTMLInputElement).value).toBe("25");

    form.dispatchEvent(new Event("change", { bubbles: true }));
    expect(JSON.parse(values.get("lobby.setup.0xabc.hook")!)).toEqual({
      variant: "standard",
      time_control: "300+3",
      mode: "rated",
    });
    cleanup();
  });

  it("keeps friend and computer settings in separate stores", () => {
    const document = new DOMParser().parseFromString(
      `<form data-friend-setup><select name="time_control"><option value="180+2">3+2</option></select></form>
       <form data-computer-setup><input type="radio" name="level" value="1"><input type="radio" name="level" value="8" checked></form>`,
      "text/html"
    );
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    installChessSetupPersistence(document, "alice", storage);
    for (const form of document.querySelectorAll("form")) {
      form.dispatchEvent(new Event("change", { bubbles: true }));
    }

    expect(values.has("lobby.setup.alice.friend")).toBe(true);
    expect(values.has("lobby.setup.alice.ai")).toBe(true);
  });
});
