import {
  chessgroundDests,
  lichessRules,
  parseFen,
  scalachessCharPair,
  setupPosition
} from "./lib.X7H2PLEK.js";
import {
  makeSquare,
  parseUci
} from "./lib.53PYQRAK.js";
import {
  defined,
  memoize
} from "./lib.GMEH5BEF.js";
import {
  __export
} from "./lib.KO2KTNGK.js";

// ../lib/src/tree/ops.ts
var ops_exports = {};
__export(ops_exports, {
  childById: () => childById,
  collect: () => collect,
  contains: () => contains,
  countChildrenAndComments: () => countChildrenAndComments,
  distance: () => distance,
  findInMainline: () => findInMainline,
  hasBranching: () => hasBranching,
  last: () => last,
  mainlineNodeList: () => mainlineNodeList,
  merge: () => merge,
  removeChild: () => removeChild,
  structuredCloneLite: () => structuredCloneLite,
  takePathWhile: () => takePathWhile,
  updateAll: () => updateAll,
  withMainlineChild: () => withMainlineChild
});
function withMainlineChild(node, f) {
  var _a;
  const next = (_a = node.children) == null ? void 0 : _a[0];
  return next ? f(next) : void 0;
}
function findInMainline(fromNode, predicate) {
  const findFrom = (node) => predicate(node) ? node : withMainlineChild(node, findFrom);
  return findFrom(fromNode);
}
function collect(from, pickChild) {
  const nodes = [from];
  let n = from, c;
  while (c = pickChild(n)) {
    nodes.push(c);
    n = c;
  }
  return nodes;
}
var childById = (node, id) => {
  var _a;
  return (_a = node.children) == null ? void 0 : _a.find((child) => child.id === id);
};
var last = (nodeList) => nodeList[nodeList.length - 1];
function takePathWhile(nodeList, predicate) {
  let path = "";
  for (const n of nodeList) {
    if (predicate(n)) path += n.id;
    else break;
  }
  return path;
}
function removeChild(parent, id) {
  var _a;
  parent.children = (_a = parent.children) == null ? void 0 : _a.filter((n) => n.id !== id);
}
function countChildrenAndComments(node) {
  var _a;
  const count = {
    nodes: 1,
    comments: (node.comments || []).length
  };
  (_a = node.children) == null ? void 0 : _a.forEach(function(child) {
    const c = countChildrenAndComments(child);
    count.nodes += c.nodes;
    count.comments += c.comments;
  });
  return count;
}
function merge(n1, n2) {
  var _a, _b;
  if (n2.eval) n1.eval = n2.eval;
  if (n2.glyphs) n1.glyphs = n2.glyphs;
  (_a = n2.comments) == null ? void 0 : _a.forEach((c) => {
    if (!n1.comments) n1.comments = [c];
    else if (!n1.comments.some((d) => d.text === c.text)) n1.comments.push(c);
  });
  (_b = n2.children) == null ? void 0 : _b.forEach((c) => {
    const existing = childById(n1, c.id);
    if (existing) merge(existing, c);
    else n1.children.push(c);
  });
}
var hasBranching = (node, maxDepth) => maxDepth <= 0 || !!node.children[1] || !!node.children[0] && hasBranching(node.children[0], maxDepth - 1);
var mainlineNodeList = (from) => collect(from, (node) => {
  var _a;
  return (_a = node.children) == null ? void 0 : _a[0];
});
function updateAll(root2, f) {
  function update(node) {
    var _a;
    f(node);
    (_a = node.children) == null ? void 0 : _a.forEach(update);
  }
  update(root2);
}
function distance(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i] && a[i + 1] === b[i + 1]) i += 2;
  return (a.length + b.length) / 2 - i;
}
function contains(container, descendant) {
  var _a;
  return container === descendant || !!((_a = container.children) == null ? void 0 : _a.some((child) => contains(child, descendant)));
}
function structuredCloneLite(node) {
  return Object.fromEntries(
    Object.entries(node).filter(([_, v]) => typeof v !== "function").map(([k, v]) => {
      if (k === "children") return [k, v.map(structuredCloneLite)];
      return [k, structuredClone(v)];
    })
  );
}

// ../lib/src/tree/path.ts
var path_exports = {};
__export(path_exports, {
  areComparable: () => areComparable,
  contains: () => contains2,
  fromNodeList: () => fromNodeList,
  head: () => head,
  init: () => init,
  intersection: () => intersection,
  last: () => last2,
  root: () => root,
  size: () => size,
  tail: () => tail
});
var root = "";
var size = (path) => path.length / 2;
var head = (path) => path.slice(0, 2);
var tail = (path) => path.slice(2);
var init = (path) => path.slice(0, -2);
var last2 = (path) => path.slice(-2);
var contains2 = (p1, p2) => p1.startsWith(p2);
var areComparable = (p1, p2) => contains2(p1, p2) || contains2(p2, p1);
var fromNodeList = (nodes) => nodes.map((n) => n.id).join("");
var intersection = (p1, p2) => {
  const head1 = head(p1), head2 = head(p2);
  return head1 !== "" && head1 === head2 ? head1 + intersection(tail(p1), tail(p2)) : "";
};

// ../lib/src/tree/tree.ts
function makeTree(root2) {
  const lastNode = () => findInMainline(root2, (node) => !node.children.length);
  const nodeAtPath = (path) => nodeAtPathFrom(root2, path);
  function nodeAtPathFrom(node, path) {
    if (path === "") return node;
    const child = childById(node, head(path));
    return child ? nodeAtPathFrom(child, tail(path)) : node;
  }
  const nodeAtPathOrNull = (path) => nodeAtPathOrNullFrom(root2, path);
  function nodeAtPathOrNullFrom(node, path) {
    if (path === "") return node;
    const child = childById(node, head(path));
    return child ? nodeAtPathOrNullFrom(child, tail(path)) : void 0;
  }
  function longestValidPathFrom(node, path) {
    const id = head(path);
    const child = childById(node, id);
    return child ? id + longestValidPathFrom(child, tail(path)) : "";
  }
  function getCurrentNodesAfterPly(nodeList, mainline, ply) {
    const nodes = [];
    for (let i = 0; i < nodeList.length; i++) {
      const node = nodeList[i];
      if (node.ply <= ply && mainline[i].id !== node.id) break;
      if (node.ply > ply) nodes.push(node);
    }
    return nodes;
  }
  const pathIsMainline = (path) => pathIsMainlineFrom(root2, path);
  function pathIsMainlineFrom(node, path) {
    if (path === "") return true;
    const child = node.children[0];
    return (child == null ? void 0 : child.id) === head(path) && pathIsMainlineFrom(child, tail(path));
  }
  const pathExists = (path) => !!nodeAtPathOrNull(path);
  const pathIsForcedVariation = (path) => getNodeList(path).some((n) => n.forceVariation);
  function lastMainlineNodeFrom(node, path) {
    if (path === "") return node;
    const pathId = head(path);
    const child = node.children[0];
    if (!child || child.id !== pathId) return node;
    return lastMainlineNodeFrom(child, tail(path));
  }
  const getNodeList = (path) => collect(root2, (node) => {
    const id = head(path);
    if (id === "") return void 0;
    path = tail(path);
    return childById(node, id);
  });
  function updateAt(path, update) {
    const node = nodeAtPathOrNull(path);
    if (node) update(node);
    return node;
  }
  function addNode(node, path) {
    const newPath = path + node.id, existing = nodeAtPathOrNull(newPath);
    if (existing) {
      ["dests", "drops", "clock"].forEach((key) => {
        if (defined(node[key]) && !defined(existing[key])) existing[key] = node[key];
      });
      return newPath;
    }
    return updateAt(path, (n) => {
      n.children.push(node);
    }) ? newPath : void 0;
  }
  function addNodes(nodes, path) {
    const node = nodes[0];
    if (!node) return path;
    const newPath = addNode(node, path);
    return newPath ? addNodes(nodes.slice(1), newPath) : void 0;
  }
  const deleteNodeAt = (path) => removeChild(parentNode(path), last2(path));
  function promoteAt(path, toMainline) {
    const nodes = getNodeList(path);
    for (let i = nodes.length - 2; i >= 0; i--) {
      const node = nodes[i + 1];
      const parent = nodes[i];
      if (parent.children[0].id !== node.id) {
        removeChild(parent, node.id);
        parent.children.unshift(node);
        if (!toMainline) break;
      } else if (node.forceVariation) {
        node.forceVariation = false;
        if (!toMainline) break;
      }
    }
  }
  const setCommentAt = (comment, path) => !comment.text ? deleteCommentAt(comment.id, path) : updateAt(path, (node) => {
    node.comments = node.comments || [];
    const existing = node.comments.find(function(c) {
      return c.id === comment.id;
    });
    if (existing) existing.text = comment.text;
    else node.comments.push(comment);
  });
  const deleteCommentAt = (id, path) => updateAt(path, (node) => {
    const comments = (node.comments || []).filter((c) => c.id !== id);
    node.comments = comments.length ? comments : void 0;
  });
  const setGlyphsAt = (glyphs, path) => updateAt(path, (node) => {
    node.glyphs = glyphs;
  });
  const parentNode = (path) => nodeAtPath(init(path));
  const getParentClock = (node, path) => path ? parentNode(path).clock : node.clock;
  function walkUntilTrue(fn, from = "", branchOnly = false) {
    function traverse(node, isMainline) {
      if (fn(node, isMainline)) return true;
      let i = branchOnly ? 1 : 0;
      branchOnly = false;
      while (i < node.children.length) {
        const c = node.children[i];
        if (traverse(c, isMainline && i === 0 && !c.forceVariation)) return true;
        i++;
      }
      return false;
    }
    const n = nodeAtPathOrNull(from);
    return n ? traverse(n, pathIsMainline(from)) : false;
  }
  return {
    root: root2,
    lastPly: () => {
      var _a;
      return ((_a = lastNode()) == null ? void 0 : _a.ply) || root2.ply;
    },
    nodeAtPath,
    getNodeList,
    longestValidPath: (path) => longestValidPathFrom(root2, path),
    updateAt,
    addNode,
    addNodes,
    setShapes: (shapes, path) => updateAt(path, (node) => {
      node.shapes = shapes.slice();
    }),
    setCommentAt,
    deleteCommentAt,
    setGlyphsAt,
    setClockAt: (clock, path) => updateAt(path, (node) => {
      node.clock = clock;
    }),
    pathIsMainline,
    pathIsForcedVariation,
    lastMainlineNode: (path) => lastMainlineNodeFrom(root2, path),
    pathExists,
    deleteNodeAt,
    promoteAt,
    forceVariationAt: (path, force) => {
      updateAll(root2, (n) => n.forceVariation = false);
      return updateAt(path, (node) => node.forceVariation = force);
    },
    getCurrentNodesAfterPly,
    merge: (tree) => merge(root2, tree),
    removeCeval: () => updateAll(root2, function(n) {
      delete n.ceval;
      delete n.threat;
    }),
    parentNode,
    getParentClock,
    walkUntilTrue
  };
}

// ../lib/src/tree/node.ts
var completeNode = (variant) => (from) => {
  const node = from;
  node.id || (node.id = node.uci ? scalachessCharPair(parseUci(node.uci)) : "");
  node.children || (node.children = []);
  node.pos || (node.pos = memoize(
    () => parseFen(node.fen).chain((setup) => setupPosition(lichessRules(variant), setup))
  ));
  node.dests = memoize(() => computeDests(node.pos(), variant === "chess960"));
  node.drops = memoize(() => computeDrops(variant, node.pos()));
  node.check = memoize(() => computeCheck(node.pos()));
  node.outcome || (node.outcome = memoize(() => computeOutcome(node.pos())));
  node.children.forEach(completeNode(variant));
  return node;
};
var computeDests = (position, chess960) => withPosition(position, /* @__PURE__ */ new Map(), (p) => chessgroundDests(p, { chess960 }));
var computeDrops = (variant, position) => variant === "crazyhouse" ? withPosition(position, void 0, (p) => Array.from(p.dropDests(), makeSquare)) : [];
var computeCheck = (position) => withPosition(position, false, (p) => p.isCheck());
var computeOutcome = (position) => withPosition(position, void 0, (p) => p.outcome());
var withPosition = (position, defaultValue, f) => position.unwrap(f, (err) => {
  console.error(err);
  return defaultValue;
});

export {
  last,
  hasBranching,
  structuredCloneLite,
  ops_exports,
  intersection,
  path_exports,
  makeTree,
  completeNode
};
//# sourceMappingURL=lib.NPW3BL7S.js.map
