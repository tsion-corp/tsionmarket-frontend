// ../lib/src/pubsub.ts
var Pubsub = class {
  constructor() {
    this.allSubs = /* @__PURE__ */ new Map();
    this.oneTimeEvents = /* @__PURE__ */ new Map();
    this.on = (name, cb) => {
      const subs = this.allSubs.get(name);
      if (subs) subs.add(cb);
      else this.allSubs.set(name, /* @__PURE__ */ new Set([cb]));
    };
    this.off = (name, cb) => {
      var _a;
      (_a = this.allSubs.get(name)) == null ? void 0 : _a.delete(cb);
    };
    this.emit = (name, ...args) => {
      const callbacks = this.allSubs.get(name);
      if (callbacks) {
        for (const cb of callbacks) {
          cb(...args);
        }
      }
    };
  }
  after(event) {
    const found = this.oneTimeEvents.get(event);
    if (found) return found.promise;
    const handler = {};
    handler.promise = new Promise((resolve) => handler.resolve = resolve);
    this.oneTimeEvents.set(event, handler);
    return handler.promise;
  }
  complete(event, value) {
    var _a;
    const found = this.oneTimeEvents.get(event);
    if (found) {
      (_a = found.resolve) == null ? void 0 : _a.call(found, value);
      found.resolve = void 0;
    } else this.oneTimeEvents.set(event, { promise: Promise.resolve(value) });
  }
  past(event) {
    var _a;
    return this.oneTimeEvents.has(event) && !((_a = this.oneTimeEvents.get(event)) == null ? void 0 : _a.resolve);
  }
};
var pubsub = new Pubsub();

export {
  pubsub
};
//# sourceMappingURL=lib.QPQZCXK2.js.map
