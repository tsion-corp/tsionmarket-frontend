import {
  defined,
  notNull,
  withEffect
} from "./lib.GMEH5BEF.js";

// ../lib/src/storage.ts
var storage = builder(window.localStorage);
var tempStorage = builder(window.sessionStorage);
function storedProp(key, defaultValue, fromStr, toStr = (v) => {
  if (v !== void 0 && v !== null && typeof v.toString === "function") {
    return v.toString();
  }
  throw new Error(`storedProp: value ${typeof v} has no toString method, provide a custom stringifier`);
}) {
  const compatKey = "analyse." + key;
  let cached;
  return function(replacement) {
    if (defined(replacement) && replacement !== cached) {
      cached = replacement;
      storage.set(key, toStr(replacement));
    } else if (!defined(cached)) {
      const compatValue = storage.get(compatKey);
      if (notNull(compatValue)) {
        storage.set(key, compatValue);
        storage.remove(compatKey);
      }
      const str = storage.get(key);
      cached = str === null ? defaultValue : fromStr(str);
    }
    return cached;
  };
}
var storedStringProp = (k, defaultValue) => storedProp(k, defaultValue, (str) => str);
var storedBooleanProp = (k, defaultValue) => storedProp(k, defaultValue, (str) => str === "true");
var storedStringPropWithEffect = (k, defaultValue, effect) => withEffect(storedStringProp(k, defaultValue), effect);
var storedBooleanPropWithEffect = (k, defaultValue, effect) => withEffect(storedBooleanProp(k, defaultValue), effect);
var storedIntProp = (k, defaultValue) => storedProp(k, defaultValue, Number);
var storedIntPropWithEffect = (k, defaultValue, effect) => withEffect(storedIntProp(k, defaultValue), effect);
var storedJsonProp = (key, defaultValue) => (v) => {
  if (defined(v)) {
    storage.set(key, JSON.stringify(v));
    return v;
  }
  const ret = JSON.parse(storage.get(key));
  return ret !== null ? ret : defaultValue();
};
var storedMap = (propKey, maxSize, defaultValue) => {
  const prop = storedJsonProp(propKey, () => []);
  const map = new Map(prop());
  return (key, v) => {
    if (defined(v)) {
      map.delete(key);
      map.set(key, v);
      prop(Array.from(map.entries()).slice(-maxSize));
    }
    const ret = map.get(key);
    return defined(ret) ? ret : defaultValue();
  };
};
var asProp = (map, key) => (v) => {
  if (defined(v)) {
    map(key, v);
    return v;
  }
  return map(key);
};
var storedMapAsProp = (propKey, key, maxSize, defaultValue) => asProp(storedMap(propKey, maxSize, defaultValue), key);
var storedSet = (propKey, maxSize) => {
  const prop = storedJsonProp(propKey, () => []);
  let set = new Set(prop());
  return (v) => {
    if (defined(v)) {
      set.add(v);
      set = new Set([...set].slice(-maxSize));
      prop([...set]);
    }
    return set;
  };
};
function once(key, every) {
  var _a, _b, _c;
  const now = Date.now();
  const last = Number(storage.get(key)) || 0;
  const seconds = ((_a = every == null ? void 0 : every.seconds) != null ? _a : 0) + ((_b = every == null ? void 0 : every.hours) != null ? _b : 0) * 3600 + ((_c = every == null ? void 0 : every.days) != null ? _c : 0) * 24 * 3600;
  if (last && (!every || now - last < seconds * 1e3)) return false;
  storage.set(key, now.toString());
  return true;
}
function builder(storage2) {
  const api = {
    get: (k) => storage2.getItem(k),
    set: (k, v) => storage2.setItem(k, v),
    fire: (k, v) => storage2.setItem(
      k,
      JSON.stringify({
        sri: site.sri,
        nonce: Math.random(),
        // ensure item changes
        value: v
      })
    ),
    remove: (k) => storage2.removeItem(k),
    make: (k, ttl) => {
      const bdKey = ttl && `${k}--bd`;
      const remove = () => {
        api.remove(k);
        if (bdKey) api.remove(bdKey);
      };
      return {
        get: () => {
          if (!bdKey) return api.get(k);
          const birthday = Number(api.get(bdKey));
          if (!birthday) api.set(bdKey, String(Date.now()));
          else if (Date.now() - birthday > ttl) remove();
          return api.get(k);
        },
        set: (v) => {
          api.set(k, v);
          if (bdKey) api.set(bdKey, String(Date.now()));
        },
        fire: (v) => api.fire(k, v),
        remove,
        listen: (f) => window.addEventListener("storage", (e) => {
          if (e.key !== k || e.storageArea !== storage2 || e.newValue === null) return;
          let parsed;
          try {
            parsed = JSON.parse(e.newValue);
          } catch (_) {
            return;
          }
          if ((parsed == null ? void 0 : parsed.sri) && parsed.sri !== site.sri) f(parsed);
        })
      };
    },
    boolean: (k) => ({
      get: () => api.get(k) === "1",
      getOrDefault: (defaultValue) => {
        const stored = api.get(k);
        return stored === null ? defaultValue : stored === "1";
      },
      set: (v) => api.set(k, v ? "1" : "0"),
      toggle: () => api.set(k, api.get(k) === "1" ? "0" : "1")
    })
  };
  return api;
}

// ../lib/src/async.ts
function throttlePromiseWithResult(wrapped) {
  let current;
  let pending;
  return function(...args) {
    const self = this;
    const runCurrent = () => {
      current = wrapped.apply(self, args).finally(() => {
        current = void 0;
        if (pending) {
          pending.run();
          pending = void 0;
        }
      });
      return current;
    };
    if (!current) return runCurrent();
    pending == null ? void 0 : pending.reject();
    return new Promise((resolve, reject) => {
      pending = {
        run: () => runCurrent().then(
          (res) => {
            resolve(res);
            return res;
          },
          (err) => {
            reject(err);
            throw err;
          }
        ),
        reject: () => reject(new Error("Throttled"))
      };
    });
  };
}
function throttlePromise(wrapped) {
  const throttler = throttlePromiseWithResult(wrapped);
  return async function(...args) {
    return throttler.apply(this, args).catch(() => {
    });
  };
}
function finallyDelay(delay, wrapped) {
  return function(...args) {
    const self = this;
    return new Promise((resolve) => {
      wrapped.apply(self, args).finally(() => setTimeout(resolve, delay.apply(self, args)));
    });
  };
}
function throttlePromiseDelay(delay, wrapped) {
  return throttlePromise(finallyDelay(delay, wrapped));
}
function throttle(delay, wrapped) {
  return throttlePromise(function(...args) {
    wrapped.apply(this, args);
    return new Promise((resolve) => setTimeout(resolve, delay));
  });
}
function sync(promise) {
  const sync2 = {
    promise: promise.then((v) => {
      sync2.sync = v;
      return v;
    })
  };
  return sync2;
}
async function promiseTimeout(asyncPromise, timeLimit) {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error("Async call timeout limit reached")), timeLimit);
  });
  const result = await Promise.race([asyncPromise, timeoutPromise]);
  if (timeoutHandle) clearTimeout(timeoutHandle);
  return result;
}
function debounce(f, wait, immediate = false) {
  let timeout;
  let lastBounce = 0;
  return function(...args) {
    const self = this;
    if (timeout) clearTimeout(timeout);
    timeout = void 0;
    const elapsed = performance.now() - lastBounce;
    lastBounce = performance.now();
    if (immediate && elapsed > wait) f.apply(self, args);
    else
      timeout = setTimeout(() => {
        timeout = void 0;
        f.apply(self, args);
      }, wait);
  };
}
function defer() {
  const deferred = {};
  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });
  return deferred;
}
function throttleWithFlush(interval, wrapped) {
  let timerId;
  let queued;
  const runNext = () => {
    if (!queued) return timerId = void 0;
    const { thisArg, args } = queued;
    queued = void 0;
    wrapped.apply(thisArg, args);
    timerId = setTimeout(runNext, interval);
    return timerId;
  };
  const throttled = function(...args) {
    if (timerId) queued = { thisArg: this, args };
    else {
      wrapped.apply(this, args);
      timerId = setTimeout(runNext, interval);
    }
  };
  throttled.clear = function() {
    clearTimeout(timerId);
    timerId = void 0;
    queued = void 0;
  };
  throttled.flush = function(...args) {
    throttled.clear();
    wrapped.apply(this, args);
  };
  return throttled;
}

// ../lib/src/objectStorage.ts
async function objectStorage(dbInfo) {
  const db = await dbConnect(dbInfo);
  return {
    list: () => promise(() => objectStore("readonly").getAllKeys()),
    has: (key) => promise(() => objectStore("readonly").getKey(key)).then(Boolean).catch(() => false),
    get: (key) => promise(() => objectStore("readonly").get(key)),
    getOpt: (key) => promise(() => objectStore("readonly").get(key)).catch(() => void 0),
    getMany: (keys) => promise(() => objectStore("readonly").getAll(keys)),
    put: (key, value) => promise(() => objectStore("readwrite").put(value, key)),
    count: (key) => promise(() => objectStore("readonly").count(key)),
    remove: (key) => promise(() => objectStore("readwrite").delete(key)),
    clear: () => promise(() => objectStore("readwrite").clear()),
    txn: (mode) => db.transaction(dbInfo.store, mode),
    cursor,
    readCursor: async (opts, it) => {
      for await (const c of cursor("readonly", opts)) await it(c.value);
    },
    writeCursor: async (opts, it) => {
      for await (const c of cursor("readwrite", opts)) {
        await it({
          value: c.value,
          update: (v) => promise(() => c.update(v)),
          delete: () => promise(() => c.delete())
        });
      }
    },
    deleteDb: () => {
      var _a;
      return "deleteDatabase" in window.indexedDB && window.indexedDB.deleteDatabase((_a = dbInfo.db) != null ? _a : dbInfo.store);
    }
  };
  function objectStore(mode) {
    return db.transaction(dbInfo.store, mode).objectStore(dbInfo.store);
  }
  function promise(f) {
    return new Promise((resolve, reject) => {
      const res = f();
      res.onsuccess = (e) => resolve(e.target.result);
      res.onerror = (e) => reject(e.target.result);
    });
  }
  function cursor(mode, { index, query, dir } = {}) {
    const store = objectStore(mode);
    const req = index ? store.index(index).openCursor(query, dir) : store.openCursor(query, dir);
    return (async function* () {
      while (true) {
        const cursor2 = await promise(() => req);
        if (!cursor2) break;
        yield cursor2;
        cursor2.continue();
      }
    })();
  }
}
function range(range2) {
  var _a, _b;
  const lowerOpen = "above" in range2;
  const upperOpen = "below" in range2;
  const lower = (_a = range2.above) != null ? _a : range2.min;
  const upper = (_b = range2.below) != null ? _b : range2.max;
  if (lower !== void 0 && upper !== void 0)
    return IDBKeyRange.bound(lower, upper, lowerOpen, upperOpen);
  if (lower !== void 0) return IDBKeyRange.lowerBound(lower, lowerOpen);
  if (upper !== void 0) return IDBKeyRange.upperBound(upper, upperOpen);
  return void 0;
}
function deleteObjectStorage(info) {
  var _a;
  return "indexedDB" in window && "deleteDatabase" in window.indexedDB ? window.indexedDB.deleteDatabase((_a = info.db) != null ? _a : info.store) : void 0;
}
async function dbConnect(info) {
  var _a;
  const dbName = (_a = info.db) != null ? _a : info.store;
  return new Promise((resolve, reject) => {
    var _a2;
    if (!("indexedDB" in window) || !("open" in window.indexedDB)) reject(new Error("no indexedDB"));
    const result = window.indexedDB.open(dbName, (_a2 = info == null ? void 0 : info.version) != null ? _a2 : 1);
    result.onsuccess = (e) => resolve(e.target.result);
    result.onerror = (e) => {
      var _a3;
      return reject((_a3 = e.target.error) != null ? _a3 : "IndexedDB Unavailable");
    };
    result.onupgradeneeded = (e) => {
      var _a3, _b;
      const db = e.target.result;
      const txn = e.target.transaction;
      const store = db.objectStoreNames.contains(info.store) ? txn.objectStore(info.store) : db.createObjectStore(info.store);
      const existing = new Set(store.indexNames);
      (_a3 = info.indices) == null ? void 0 : _a3.forEach(({ name, keyPath, options }) => {
        if (!existing.has(name)) store.createIndex(name, keyPath, options);
        else {
          const idx = store.index(name);
          if (idx.keyPath !== keyPath || idx.unique !== !!(options == null ? void 0 : options.unique) || idx.multiEntry !== !!(options == null ? void 0 : options.multiEntry)) {
            store.deleteIndex(name);
            store.createIndex(name, keyPath, options);
          }
        }
        existing.delete(name);
      });
      existing.forEach((indexName) => store.deleteIndex(indexName));
      (_b = info.upgrade) == null ? void 0 : _b.call(info, e, store);
    };
  });
}

export {
  storage,
  tempStorage,
  storedProp,
  storedStringProp,
  storedBooleanProp,
  storedStringPropWithEffect,
  storedBooleanPropWithEffect,
  storedIntProp,
  storedIntPropWithEffect,
  storedJsonProp,
  storedMap,
  storedMapAsProp,
  storedSet,
  once,
  finallyDelay,
  throttlePromiseDelay,
  throttle,
  sync,
  promiseTimeout,
  debounce,
  defer,
  throttleWithFlush,
  objectStorage,
  range,
  deleteObjectStorage
};
//# sourceMappingURL=lib.NFSQQWN5.js.map
