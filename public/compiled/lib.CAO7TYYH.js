// ../lib/src/data.ts
var makeKey = (key) => `lichess-${key}`;
var get = (owner, key) => owner[makeKey(key)];
var set = (owner, key, value) => owner[makeKey(key)] = value;

export {
  get,
  set
};
//# sourceMappingURL=lib.CAO7TYYH.js.map
