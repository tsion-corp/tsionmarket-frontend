// @vitest-environment node
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// postcss is a transitive dependency, so it is resolved through the Tailwind
// PostCSS plugin that owns it rather than from the repo root.
const requireFromRoot = createRequire(resolve(process.cwd(), "package.json"));
const requireFromTailwind = createRequire(requireFromRoot.resolve("@tailwindcss/postcss"));

type Declaration = { prop: string; value: string };
type Container = {
  type: string;
  name?: string;
  selector?: string;
  params?: string;
  parent?: Container;
  walkRules: (cb: (rule: Container) => void) => void;
  walkDecls: (cb: (decl: Declaration) => void) => void;
};

const globalsPath = resolve(process.cwd(), "app/globals.css");

let sheet: Container;

async function compileGlobals(): Promise<Container> {
  const postcss = requireFromTailwind("postcss");
  const tailwind = (await import("@tailwindcss/postcss")).default;
  const source = readFileSync(globalsPath, "utf8");
  const result = await postcss([tailwind()]).process(source, { from: globalsPath });
  return result.root as Container;
}

function inLayer(rule: Container): boolean {
  for (let node = rule.parent; node; node = node.parent) {
    if (node.type === "atrule" && node.name === "layer") return true;
  }
  return false;
}

function declarationsOf(rule: Container): Declaration[] {
  const decls: Declaration[] = [];
  rule.walkDecls((decl) => decls.push({ prop: decl.prop, value: decl.value }));
  return decls;
}

function inReducedMotion(rule: Container): boolean {
  for (let node = rule.parent; node; node = node.parent) {
    if (
      node.type === "atrule" &&
      node.name === "media" &&
      node.params?.includes("reduced-motion")
    ) {
      return true;
    }
  }
  return false;
}

// The property list lives in a custom property, so the test has to substitute it
// the way the browser does before it can check what is in the list.
function rootTokens(reducedMotion: boolean): Map<string, string> {
  const tokens = new Map<string, string>();
  sheet.walkRules((rule) => {
    if (rule.selector !== ":root") return;
    if (inReducedMotion(rule) !== reducedMotion) return;
    for (const decl of declarationsOf(rule)) {
      if (decl.prop.startsWith("--ws-")) tokens.set(decl.prop, decl.value);
    }
  });
  return tokens;
}

function expandTokens(value: string, reducedMotion: boolean): string {
  const base = rootTokens(false);
  const overrides = reducedMotion ? rootTokens(true) : new Map<string, string>();
  let expanded = value;
  for (let pass = 0; pass < 5 && expanded.includes("var("); pass += 1) {
    expanded = expanded.replace(/var\((--[\w-]+)\)/g, (whole, name: string) => {
      const replacement = overrides.get(name) ?? base.get(name);
      return replacement ?? whole;
    });
  }
  return expanded;
}

function buttonTransitionProperties(reducedMotion: boolean): Set<string> {
  const resolved = new Set<string>();
  sheet.walkRules((rule) => {
    if (!rule.selector?.includes("button:not([data-no-ripple])") || inLayer(rule)) return;
    for (const decl of declarationsOf(rule)) {
      if (decl.prop !== "transition-property") continue;
      for (const name of expandTokens(decl.value, reducedMotion).split(",")) {
        resolved.add(name.trim());
      }
    }
  });
  return resolved;
}

function rulesMatching(predicate: (rule: Container) => boolean): Container[] {
  const found: Container[] = [];
  sheet.walkRules((rule) => {
    if (predicate(rule)) found.push(rule);
  });
  return found;
}

describe("globals.css button hover transition", () => {
  beforeAll(async () => {
    sheet = await compileGlobals();
  }, 60_000);

  it("gives buttons a transition that outranks a component's own transition utility", () => {
    // The utilities layer beats the base layer, so a rule that lives in @layer
    // base loses transition-property to any transition-colors on the button and
    // the hover lift ends up with no transition at all. The global rule has to
    // sit outside every layer to win.
    const globalRules = rulesMatching(
      (rule) => Boolean(rule.selector?.includes("button:not([data-no-ripple])")) && !inLayer(rule)
    );

    expect(globalRules.length).toBeGreaterThan(0);

    const transitionProperties = globalRules
      .flatMap(declarationsOf)
      .filter((decl) => decl.prop === "transition-property")
      .map((decl) => decl.value);

    expect(transitionProperties.length).toBeGreaterThan(0);
  });

  it("transitions the lift and the colour change from the same declaration", () => {
    // transition-property is not additive: whichever rule wins sets the whole
    // list. The winning list therefore has to name the transform properties the
    // lift uses and the colour properties transition-colors would have named.
    const resolved = buttonTransitionProperties(false);

    for (const property of ["transform", "color", "background-color", "border-color", "opacity"]) {
      expect(resolved).toContain(property);
    }
  });

  it("drops the transform properties under reduced motion but keeps the opacity fallback", () => {
    const resolved = buttonTransitionProperties(true);

    for (const property of ["transform", "translate", "scale", "rotate"]) {
      expect(resolved).not.toContain(property);
    }
    expect(resolved).toContain("opacity");
    expect(resolved).toContain("color");
  });

  it("keeps every hover state free of a box-shadow", () => {
    const hoverShadows: string[] = [];
    sheet.walkRules((rule) => {
      if (!rule.selector?.includes(":hover")) return;
      for (const decl of declarationsOf(rule)) {
        if (decl.prop === "box-shadow" && decl.value !== "none") {
          hoverShadows.push(`${rule.selector} { box-shadow: ${decl.value} }`);
        }
      }
    });

    expect(hoverShadows).toEqual([]);
  });

  it("keeps the focus rings that are drawn with a shadow or an outline", () => {
    const focusShadow = rulesMatching(
      (rule) =>
        Boolean(rule.selector?.includes(":focus-within")) &&
        declarationsOf(rule).some((decl) => decl.prop === "box-shadow" && decl.value !== "none")
    );
    const focusOutline = rulesMatching(
      (rule) =>
        Boolean(rule.selector?.includes(":focus-visible")) &&
        declarationsOf(rule).some((decl) => decl.prop.startsWith("outline"))
    );

    expect(focusShadow.length).toBeGreaterThan(0);
    expect(focusOutline.length).toBeGreaterThan(0);
  });
});
