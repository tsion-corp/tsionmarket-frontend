// ../voice/src/switch.ts
var Switch = class {
  constructor(opts) {
    this.selected = false;
    var _a;
    this.items = (opts == null ? void 0 : opts.items) ? opts.items : /* @__PURE__ */ new Map();
    this.ctx = (_a = opts == null ? void 0 : opts.context) != null ? _a : this;
  }
  get key() {
    if (this.selected && !this.items.has(this.selected)) this.selected = false;
    return this.selected;
  }
  get value() {
    const key = this.key;
    return key ? this.items.get(key) : void 0;
  }
  get context() {
    return this.ctx;
  }
  setContext(ctx) {
    var _a, _b, _c, _d;
    if (this.ctx === ctx) return;
    (_b = (_a = this.value) == null ? void 0 : _a.deselect) == null ? void 0 : _b.call(_a, this.ctx);
    this.ctx = ctx;
    (_d = (_c = this.value) == null ? void 0 : _c.select) == null ? void 0 : _d.call(_c, this.ctx);
  }
  set(newKey) {
    var _a, _b, _c, _d;
    if (newKey && !this.items.has(newKey)) return false;
    if (this.selected) {
      if (this.selected === newKey) return true;
      (_b = (_a = this.value) == null ? void 0 : _a.deselect) == null ? void 0 : _b.call(_a, this.ctx);
    }
    this.selected = newKey;
    (_d = (_c = this.value) == null ? void 0 : _c.select) == null ? void 0 : _d.call(_c, this.ctx);
    return true;
  }
  keyOf(val) {
    for (const [k, v] of this.items) if (v === val) return k;
    return false;
  }
  add(key, val) {
    if (this.items.get(key) === val) return;
    const reselect = this.selected === key;
    if (reselect) this.remove(key);
    this.items.set(key, val);
    if (reselect) this.set(key);
  }
  remove(key) {
    this.close(key);
    key ? this.items.delete(key) : this.items.clear();
  }
  close(key) {
    var _a, _b, _c, _d;
    if (key === void 0) {
      for (const k of this.items.keys()) this.close(k);
      return;
    }
    if (key === this.selected) {
      (_b = (_a = this.items.get(key)) == null ? void 0 : _a.deselect) == null ? void 0 : _b.call(_a, this.ctx);
      this.selected = false;
    }
    (_d = (_c = this.items.get(key)) == null ? void 0 : _c.close) == null ? void 0 : _d.call(_c, this.ctx);
  }
};

export {
  Switch
};
//# sourceMappingURL=lib.E2LEIDPC.js.map
