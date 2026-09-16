import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RichTextContent } from "./rich-text-content";

describe("RichTextContent", () => {
  it("renders plain text without changes", () => {
    render(<RichTextContent content="Hello support team" />);
    expect(screen.getByText("Hello support team")).toBeInTheDocument();
  });

  it("renders bold text correctly", () => {
    const { container } = render(<RichTextContent content="This is **urgent** issue" />);
    const strong = container.querySelector("strong");
    expect(strong).toBeInTheDocument();
    expect(strong?.textContent).toBe("urgent");
  });

  it("renders italic text correctly", () => {
    const { container } = render(<RichTextContent content="Please check *this* out" />);
    const em = container.querySelector("em");
    expect(em).toBeInTheDocument();
    expect(em?.textContent).toBe("this");
  });

  it("renders inline code elements", () => {
    const { container } = render(<RichTextContent content="Here is the tx: `0x123abc`" />);
    const code = container.querySelector("code");
    expect(code).toBeInTheDocument();
    expect(code?.textContent).toBe("0x123abc");
  });

  it("renders fenced multi-line code blocks", () => {
    const markdown = '```json\n{\n  "status": "error"\n}\n```';
    const { container } = render(<RichTextContent content={markdown} />);
    const pre = container.querySelector("pre");
    expect(pre).toBeInTheDocument();
    expect(pre?.textContent).toContain('"status": "error"');
  });

  it("renders bullet lists properly", () => {
    const markdown = "- First issue\n- Second issue\n- Third issue";
    const { container } = render(<RichTextContent content={markdown} />);
    const listItems = container.querySelectorAll("li");
    expect(listItems.length).toBe(3);
    expect(listItems[0].textContent).toBe("First issue");
    expect(listItems[1].textContent).toBe("Second issue");
    expect(listItems[2].textContent).toBe("Third issue");
  });

  it("renders sanitized clickable hyperlinks with secure rel attributes", () => {
    const markdown = "See [Explorer Docs](https://basescan.org/tx/123)";
    const { container } = render(<RichTextContent content={markdown} />);
    const anchor = container.querySelector("a");
    expect(anchor).toBeInTheDocument();
    expect(anchor?.textContent).toBe("Explorer Docs");
    expect(anchor?.getAttribute("href")).toBe("https://basescan.org/tx/123");
    expect(anchor?.getAttribute("target")).toBe("_blank");
    expect(anchor?.getAttribute("rel")).toBe("noopener noreferrer");
  });
});
