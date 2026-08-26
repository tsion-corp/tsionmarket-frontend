import { describe, expect, it } from "vitest";
import { describeFindings, findUnmarkedSensitive, selectorPath } from "./unmarked-money";

function root(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}

describe("findUnmarkedSensitive", () => {
  it("reports money that nobody marked", () => {
    const found = findUnmarkedSensitive(root("<span>$1,240.50</span>"));
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("money");
  });

  it("reports an amount written with its token", () => {
    expect(findUnmarkedSensitive(root("<span>500 USDC</span>"))[0].kind).toBe("money");
    expect(findUnmarkedSensitive(root("<span>1.25 ETH</span>"))[0].kind).toBe("money");
  });

  it("reports a wallet address, full or truncated", () => {
    expect(findUnmarkedSensitive(root("<span>0xab12cd34ef56</span>"))[0].kind).toBe("address");
    expect(findUnmarkedSensitive(root("<span>0xab12…cd34</span>"))[0].kind).toBe("address");
  });

  it("stays quiet about anything already inside a marked subtree", () => {
    const marked = root('<div data-sensitive="balance"><span>$1,240.50</span></div>');
    expect(findUnmarkedSensitive(marked)).toEqual([]);
  });

  it("stays quiet when the marker is on the element itself", () => {
    expect(findUnmarkedSensitive(root("<span data-sensitive>$99</span>"))).toEqual([]);
  });

  it("ignores a bare number, which is far too common to be a useful signal", () => {
    expect(findUnmarkedSensitive(root("<span>1240</span>"))).toEqual([]);
    expect(findUnmarkedSensitive(root("<span>12 moves</span>"))).toEqual([]);
  });

  it("reports each element once rather than once per row", () => {
    const many = root(
      Array.from({ length: 5 }, () => '<div class="row"><span class="v">$10</span></div>').join("")
    );
    // Same selector path for every row, so it collapses to one line.
    expect(findUnmarkedSensitive(many)).toHaveLength(1);
  });

  it("caps how much it reports, so a bad page cannot flood the console", () => {
    const wide = root(
      Array.from({ length: 40 }, (_, i) => `<span class="c${i}">$${i + 1}.00</span>`).join("")
    );
    expect(findUnmarkedSensitive(wide, 5)).toHaveLength(5);
  });

  it("skips script and style content", () => {
    expect(findUnmarkedSensitive(root('<script>var a = "$100"</script>'))).toEqual([]);
  });
});

describe("selectorPath", () => {
  it("names the element well enough to find it in the source", () => {
    const host = root('<div class="ws-card p-5"><span class="tnum">$10</span></div>');
    const span = host.querySelector("span") as Element;
    expect(selectorPath(span)).toContain("span.tnum");
    expect(selectorPath(span)).toContain("div.ws-card");
  });
});

describe("describeFindings", () => {
  it("says nothing when there is nothing to say", () => {
    expect(describeFindings([])).toBeNull();
  });

  it("names the count, the fix and the false-positive caveat", () => {
    const message = describeFindings([{ kind: "money", text: "$10", selector: "span" }]) as string;
    expect(message).toContain("[broadcast guard]");
    expect(message).toContain("data-sensitive");
    expect(message).toMatch(/false positive/i);
  });
});
