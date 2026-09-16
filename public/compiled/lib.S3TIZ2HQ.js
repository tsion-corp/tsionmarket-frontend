import {
  h
} from "./lib.LWF5S4ZV.js";
import {
  licon
} from "./lib.5I4BSVKX.js";
import {
  memoize
} from "./lib.GMEH5BEF.js";

// ../lib/src/view/snabbdom.ts
function onInsert(f) {
  return {
    insert: (vnode) => f(vnode.elm)
  };
}
function bind(eventName, f, redraw, passive = true) {
  return onInsert(
    (el) => el.addEventListener(
      eventName,
      (e) => {
        const res = f(e);
        if (res === false && !passive) e.preventDefault();
        redraw == null ? void 0 : redraw();
        return res;
      },
      { passive }
    )
  );
}
var bindNonPassive = (eventName, f, redraw) => bind(eventName, f, redraw, false);
function bindSubmit(f, redraw) {
  return bind(
    "submit",
    (e) => {
      e.preventDefault();
      f(e);
    },
    redraw,
    false
  );
}
var dataIcon = (icon) => ({
  "data-icon": icon
});
var testId = (id) => site.debug ? { "data-testid": id } : {};
var kidFilter = (x) => x && x !== true || x === "" || x === 0;
var filterKids = (children) => {
  const flatKids = [];
  flattenKids(children, flatKids);
  return flatKids.filter(kidFilter);
};
function hl(sel, dataOrKids, kids) {
  if (kids) return h(sel, dataOrKids, filterKids(kids));
  if (!kidFilter(dataOrKids)) return h(sel);
  if (Array.isArray(dataOrKids) || typeof dataOrKids === "object" && "sel" in dataOrKids)
    return h(sel, filterKids(dataOrKids));
  else return h(sel, dataOrKids);
}
var flattenKids = (maybeArray, out) => {
  if (Array.isArray(maybeArray)) for (const el of maybeArray) flattenKids(el, out);
  else out.push(maybeArray);
};
var noTrans = (s) => h("span", { attrs: { lang: "en" } }, s);
var requiresI18n = (catalog, redraw, render) => {
  if (!window.i18n[catalog]) {
    site.asset.loadI18n(catalog).then(redraw);
    return h("span", "...");
  }
  return render(window.i18n[catalog]);
};

// ../lib/src/device.ts
var hookMobileMousedown = (f) => bind("ontouchstart" in window ? "click" : "mousedown", f);
var prefersLightThemeQuery = () => window.matchMedia("(prefers-color-scheme: light)");
var currentTheme = () => {
  const dataTheme = document.body.dataset.theme;
  if (dataTheme === "system") return prefersLightThemeQuery().matches ? "light" : "dark";
  return dataTheme === "light" ? "light" : "dark";
};
var colCache;
window.addEventListener("resize", () => colCache = void 0);
function displayColumns() {
  if (colCache === void 0)
    colCache = Number(window.getComputedStyle(document.body).getPropertyValue("---display-columns"));
  return colCache;
}
var lowerAgent = navigator.userAgent.toLowerCase();
var isTouchDevice = () => !hasMouse();
var isMobile = () => isAndroid() || isIos();
var isAndroid = memoize(() => lowerAgent.includes("android"));
var isIos = memoize(() => /iphone|ipod/.test(lowerAgent) || isIPad());
var isIPad = () => (navigator == null ? void 0 : navigator.maxTouchPoints) > 2 && /ipad|macintosh/.test(lowerAgent);
var isChrome = (constraint) => {
  var _a;
  return isVersionCompatible((_a = lowerAgent.match(/chrome\/(.*)/)) == null ? void 0 : _a[1], constraint);
};
var isFirefox = (constraint) => {
  var _a;
  return isVersionCompatible((_a = lowerAgent.match(/firefox\/(.*)/)) == null ? void 0 : _a[1], constraint);
};
var isSafari = (constraint) => lowerAgent.includes("version/") && isWebkit(constraint);
var isWebkit = (constraint) => isVersionCompatible(webkitVersion(), constraint);
var isApple = memoize(() => /macintosh|iphone|ipad|ipod/.test(lowerAgent));
var isMac = memoize(
  () => lowerAgent.includes("macintosh") && !("ontouchstart" in window)
);
var webkitVersion = memoize(
  () => {
    var _a, _b;
    return lowerAgent.includes("safari") && !lowerAgent.includes("chrome") && !lowerAgent.includes("android") && (((_a = lowerAgent.match(/version\/(.*)/)) == null ? void 0 : _a[1]) || lowerAgent.includes("crios/") && ((_b = lowerAgent.match(/ os ((?:\d+[._]?){1,3})/i)) == null ? void 0 : _b[1])) || false;
  }
);
var shareIcon = () => isApple() ? licon.ShareIos : licon.ShareAndroid;
var hasFeature = (feat) => features().includes(feat);
var features = memoize(() => {
  const features2 = [];
  if (typeof BigInt === "function") features2.push("bigint");
  if (typeof structuredClone !== "undefined") features2.push("structuredClone");
  if (typeof WebAssembly === "object" && typeof WebAssembly.validate === "function" && WebAssembly.validate(Uint8Array.from([0, 97, 115, 109, 1, 0, 0, 0]))) {
    features2.push("wasm");
    const sourceWithSimd = Uint8Array.from([
      0,
      97,
      115,
      109,
      1,
      0,
      0,
      0,
      1,
      12,
      2,
      96,
      2,
      123,
      123,
      1,
      123,
      96,
      1,
      123,
      1,
      123,
      3,
      3,
      2,
      0,
      1,
      7,
      9,
      2,
      1,
      97,
      0,
      0,
      1,
      98,
      0,
      1,
      10,
      19,
      2,
      9,
      0,
      32,
      0,
      32,
      1,
      253,
      186,
      1,
      11,
      7,
      0,
      32,
      0,
      253,
      253,
      1,
      11
    ]);
    if (WebAssembly.validate(sourceWithSimd)) features2.push("simd");
    const sourceWithRelaxedSimd = Uint8Array.from([
      0,
      97,
      115,
      109,
      1,
      0,
      0,
      0,
      1,
      8,
      1,
      96,
      3,
      123,
      123,
      123,
      1,
      123,
      3,
      2,
      1,
      0,
      7,
      5,
      1,
      1,
      99,
      0,
      0,
      10,
      13,
      1,
      11,
      0,
      32,
      0,
      32,
      1,
      32,
      2,
      253,
      147,
      2,
      11
    ]);
    if (WebAssembly.validate(sourceWithRelaxedSimd)) features2.push("relaxedSimd");
    if (sharedMemoryTest()) features2.push("sharedMem");
  }
  try {
    new Worker(
      URL.createObjectURL(
        new Blob(["import('data:text/javascript,export default {}')"], { type: "application/javascript" })
      )
    ).terminate();
    features2.push("dynamicImportFromWorker");
  } catch (e) {
  }
  return Object.freeze(features2);
});
var hasMouse = memoize(() => window.matchMedia("(hover: hover) and (pointer: fine)").matches);
var reducedMotion = memoize(
  () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
);
function sharedMemoryTest() {
  if (lowerAgent.includes("version/26.2")) return false;
  if (typeof Atomics !== "object" || typeof SharedArrayBuffer !== "function") return false;
  let mem;
  try {
    mem = new WebAssembly.Memory({ shared: true, initial: 1, maximum: 2 });
    if (!(mem.buffer instanceof SharedArrayBuffer)) return false;
    window.postMessage(mem.buffer, "*");
    return true;
  } catch (e) {
    return false;
  }
}
function isVersionCompatible(version, vc) {
  if (!version) return false;
  if (!vc) return true;
  const v = split(version);
  if (vc.atLeast && isGreaterThan(split(vc.atLeast), v)) return false;
  return !vc.below || isGreaterThan(split(vc.below), v);
  function split(v2) {
    return v2.split(/[._]/).map((x) => parseInt(x) || 0).concat([0, 0, 0, 0]);
  }
  function isGreaterThan(left, right) {
    for (let i = 0; i < 4; i++) if (left[i] !== right[i]) return left[i] > right[i];
    return false;
  }
}

export {
  onInsert,
  bind,
  bindNonPassive,
  bindSubmit,
  dataIcon,
  testId,
  hl,
  noTrans,
  requiresI18n,
  hookMobileMousedown,
  prefersLightThemeQuery,
  currentTheme,
  displayColumns,
  isTouchDevice,
  isMobile,
  isAndroid,
  isIos,
  isIPad,
  isChrome,
  isFirefox,
  isSafari,
  isWebkit,
  isMac,
  shareIcon,
  hasFeature,
  features
};
//# sourceMappingURL=lib.S3TIZ2HQ.js.map
