// ../lib/src/algo.ts
var randomToken = () => {
  try {
    const data = globalThis.crypto.getRandomValues(new Uint8Array(9));
    return btoa(String.fromCharCode(...data)).replace(/[/+]/g, "_");
  } catch (e) {
    return Math.random().toString(36).slice(2, 12);
  }
};
function randomId(len = 8) {
  const charSet32 = "abcdefghkmnpqrstuvwxyz0123456789";
  const buffer = globalThis.crypto.getRandomValues(new Uint8Array(len));
  return Array.from(buffer, (byte) => charSet32[byte % 32]).join("");
}
function clamp(value, bounds) {
  const [min, max] = [validNumber(bounds.min), validNumber(bounds.max)];
  if (validNumber(value) === false) return min !== false ? min : max !== false ? max : NaN;
  if (max !== false) value = Math.min(value, max);
  if (min !== false) value = Math.max(value, min);
  return value;
}
var validNumber = (n) => Number(n) === n && n;
var quantize = (n, factor) => Math.round((n != null ? n : 0) / factor) * factor;
function shuffle(arr) {
  const shuffled = arr.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
function deepFreeze(obj) {
  if (obj !== null && typeof obj === "object")
    Object.values(obj).filter((v) => v !== null && typeof v === "object").forEach((o) => deepFreeze(o));
  return Object.freeze(obj);
}
function zip(arr1, arr2) {
  const length = Math.min(arr1.length, arr2.length);
  const result = [];
  for (let i = 0; i < length; i++) {
    result.push([arr1[i], arr2[i]]);
  }
  return result;
}
function definedMap(arr, fn) {
  return arr.reduce((acc, v) => {
    if (v === void 0) return acc;
    const result = fn(v);
    if (result !== void 0) acc.push(result);
    return acc;
  }, []);
}
function isEquivalent(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a))
    return Array.isArray(b) && a.length === b.length && a.every((x, i) => isEquivalent(x, b[i]));
  if (typeof a !== "object" || a === null || b === null) return false;
  const [aKeys, bKeys] = [Object.keys(a), Object.keys(b)];
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => bKeys.includes(key) && isEquivalent(a[key], b[key]));
}
function isContained(o, sub) {
  if (o === sub || sub === void 0) return true;
  if (typeof o !== typeof sub) return false;
  if (Array.isArray(o))
    return Array.isArray(sub) && o.length === sub.length && o.every((x, i) => isEquivalent(x, sub[i]));
  if (typeof o !== "object" || o === null || sub === null) return false;
  const [aKeys, subKeys] = [Object.keys(o), Object.keys(sub)];
  if (aKeys.length < subKeys.length) return false;
  return subKeys.every((key) => aKeys.includes(key) && isContained(o[key], sub[key]));
}

export {
  randomToken,
  randomId,
  clamp,
  quantize,
  shuffle,
  deepFreeze,
  zip,
  definedMap,
  isEquivalent,
  isContained
};
//# sourceMappingURL=lib.HMFK7OOB.js.map
