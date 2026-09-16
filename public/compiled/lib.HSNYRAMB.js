import {
  fixCrazySan
} from "./lib.LRP46MC3.js";

// ../lib/src/game/nodePGN.ts
var plyPrefix = (node) => `${Math.floor((node.ply + 1) / 2)}${node.ply % 2 === 1 ? ". " : "... "}`;
function renderNodesTxt(node, forcePly, includeVariations = true) {
  const first = node.children[0];
  if (!first || !includeVariations && first.forceVariation) return "";
  let s = "";
  if (forcePly || first.ply % 2 === 1) s += plyPrefix(first);
  s += fixCrazySan(first.san);
  if (includeVariations) {
    for (let i = 1; i < node.children.length; i++) {
      const child = node.children[i];
      s += ` (${plyPrefix(child)}${fixCrazySan(child.san)}`;
      const variation = renderNodesTxt(child, false, includeVariations);
      if (variation) s += " " + variation;
      s += ")";
    }
  }
  const mainline = renderNodesTxt(first, s.endsWith(")"), includeVariations);
  if (mainline) s += " " + mainline;
  return s;
}

export {
  plyPrefix,
  renderNodesTxt
};
//# sourceMappingURL=lib.HSNYRAMB.js.map
