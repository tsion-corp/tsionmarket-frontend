// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { installLichessDocumentState } from "@/features/casino/components/chess-app/lichess-round";

afterEach(() => {
  document.documentElement.className = "";
  document.documentElement.removeAttribute("style");
  document.body.className = "";
  document.body.removeAttribute("style");
  for (const attribute of [...document.body.attributes]) {
    if (attribute.name.startsWith("data-")) document.body.removeAttribute(attribute.name);
  }
});

describe("installLichessDocumentState", () => {
  it("restores the application document after leaving a round", () => {
    document.documentElement.classList.add("app-root");
    document.documentElement.style.setProperty("---white-queen", "url(app-queen.svg)");
    document.body.classList.add("app-body", "dark");
    document.body.dataset.board = "app-board";
    document.body.style.setProperty("---zoom", "100");

    const restore = installLichessDocumentState("0xplayer");

    expect(document.body).toHaveClass("fixed-scroll", "playing", "zenable");
    expect(document.body.dataset.user).toBe("0xplayer");
    expect(document.body.dataset.board).toBe("brown");
    expect(document.body.style.getPropertyValue("---zoom")).toBe("80");

    restore();
    restore();

    expect(document.documentElement.className).toBe("app-root");
    expect(document.documentElement.style.getPropertyValue("---white-queen")).toBe(
      "url(app-queen.svg)"
    );
    expect(document.body.className).toBe("app-body dark");
    expect(document.body.dataset.user).toBeUndefined();
    expect(document.body.dataset.board).toBe("app-board");
    expect(document.body.style.getPropertyValue("---zoom")).toBe("100");
  });
});
