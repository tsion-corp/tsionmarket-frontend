import {
  storage
} from "./lib.NFSQQWN5.js";
import {
  defined
} from "./lib.GMEH5BEF.js";

// ../lib/src/poolRangeStorage.ts
var makeKey = (username, poolId) => `lobby-pool-range.${username || "anon"}.${poolId}`;
var set = (username, poolId, range) => {
  const key = makeKey(username, poolId);
  if (range) storage.set(key, range);
  else storage.remove(key);
};
var get = (username, poolId) => storage.get(makeKey(username, poolId));
var shiftRangeAfter = (game) => {
  var _a, _b, _c;
  const username = (_a = game.player.user) == null ? void 0 : _a.username, delta = game.player.ratingDiff;
  if (game.game.variant.key === "standard" && username && delta && defined((_b = game.clock) == null ? void 0 : _b.initial) && defined((_c = game.clock) == null ? void 0 : _c.increment)) {
    const poolId = `${game.clock.initial / 60}+${game.clock.increment}`;
    const currRange = get(username, poolId);
    if (!currRange) return;
    const [min, max] = currRange.split("-").map(Number);
    set(username, poolId, `${min + delta}-${max + delta}`);
  }
};

export {
  set,
  get,
  shiftRangeAfter
};
//# sourceMappingURL=lib.OGKZ2C6M.js.map
