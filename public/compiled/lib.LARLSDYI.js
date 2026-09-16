import {
  moderationCtrl,
  noteCtrl,
  presetCtrl
} from "./lib.OY6DQ2TE.js";
import {
  alert
} from "./lib.MYPIOGN5.js";
import {
  isContained
} from "./lib.HMFK7OOB.js";
import {
  isMobile
} from "./lib.S3TIZ2HQ.js";
import {
  pubsub
} from "./lib.QPQZCXK2.js";
import {
  storedBooleanProp,
  storedStringProp
} from "./lib.NFSQQWN5.js";
import {
  prop
} from "./lib.GMEH5BEF.js";

// ../lib/src/chat/chatCtrl.ts
var ChatCtrl = class {
  constructor(opts, redraw) {
    this.opts = opts;
    this.redraw = redraw;
    this.maxLines = 200;
    this.maxLinesDrop = 50;
    this.allTabs = [];
    this.canPostArbitraryText = () => this.vm.writeable && !this.vm.timeout && (!this.data.loginRequired || !!this.data.userId) && !this.data.restricted;
    this.post = (text) => {
      text = text.trim();
      if (!text) return false;
      if (text === "You too!" && !this.data.lines.some((l) => l.u !== this.data.userId)) return false;
      if (text.length > 140) {
        alert("Max length: 140 chars. " + text.length + " chars used.");
        return false;
      }
      pubsub.emit("socket.send", "talk", text);
      return true;
    };
    this.listenToIncoming = (cb) => pubsub.on("socket.in.message", cb);
    this.onTimeout = (userId) => {
      let change = false;
      this.data.lines.forEach((l) => {
        var _a;
        if (((_a = l.u) == null ? void 0 : _a.toLowerCase()) === userId) {
          l.d = true;
          change = true;
        }
      });
      if (userId === this.data.userId) this.vm.timeout = change = true;
      if (change) {
        this.vm.domVersion++;
        this.redraw();
      }
    };
    this.onReinstate = (userId) => {
      if (userId === this.data.userId) {
        this.vm.timeout = false;
        this.redraw();
      }
    };
    this.onMessage = (line) => {
      this.data.lines.push(line);
      const nb = this.data.lines.length;
      if (nb > this.maxLines) {
        this.data.lines.splice(0, nb - this.maxLines + this.maxLinesDrop);
        this.vm.domVersion++;
      }
      this.redraw();
    };
    this.onWriteable = (v) => {
      this.vm.writeable = v;
    };
    this.onPermissions = (perms) => {
      if (isContained(this.opts.permissions, perms)) return;
      Object.assign(this.opts.permissions, perms);
      this.instanciateModeration();
    };
    this.instanciateModeration = () => {
      if (this.opts.permissions.timeout || this.opts.permissions.broadcast || this.opts.permissions.local) {
        this.maxLines = 1e3;
        this.maxLinesDrop = 500;
        this.moderation = moderationCtrl({
          reasons: this.opts.timeoutReasons || [{ key: "other", name: "Inappropriate behavior" }],
          permissions: this.opts.permissions,
          resourceId: this.data.resourceId,
          redraw: this.redraw
        });
        site.asset.loadCssPath("lib.chat.mod");
      }
    };
    this.setTab = (tab = this.getTab()) => {
      this.vm.autofocus = !isMobile();
      this.storedTabKey(tab.key);
      return tab;
    };
    var _a, _b;
    this.data = opts.data;
    this.chatEnabled = this.data ? storedBooleanProp(`chat.${this.data.resourceType}.enabled`, true) : prop(false);
    this.storedTabKey = storedStringProp(`chat.${opts.plugin ? opts.plugin.key + "." : ""}tab`, "discussion");
    if (!opts.kidMode) this.allTabs.push({ key: "discussion" });
    if (opts.noteId) this.allTabs.push({ key: "note" });
    if (opts.plugin && (opts.plugin.kidSafe || !opts.kidMode)) {
      opts.plugin.redraw = redraw;
      this.allTabs.push(opts.plugin);
    }
    this.vm = {
      loading: false,
      autofocus: false,
      timeout: (_a = opts.timeout) != null ? _a : false,
      writeable: (_b = opts.writeable) != null ? _b : false,
      domVersion: 1
      // increment to force redraw
    };
    this.note = opts.noteId ? noteCtrl({
      id: opts.noteId,
      text: opts.noteText,
      redraw: this.redraw
    }) : void 0;
    this.preset = presetCtrl({
      initialGroup: opts.preset,
      post: this.post,
      redraw: this.redraw
    });
    if (opts.kidMode) return;
    this.instanciateModeration();
    const subs = [
      ["socket.in.message", this.onMessage],
      ["socket.in.chat_timeout", this.onTimeout],
      ["socket.in.chat_reinstate", this.onReinstate],
      ["chat.writeable", this.onWriteable],
      ["chat.permissions", this.onPermissions]
    ];
    subs.forEach(([eventName, callback]) => pubsub.on(eventName, callback));
  }
  get isOptional() {
    const tabs = this.visibleTabs;
    return tabs.length === 1 && tabs[0].key === "discussion";
  }
  get visibleTabs() {
    return this.allTabs.filter((x) => {
      var _a;
      return !((_a = x.isDisabled) == null ? void 0 : _a.call(x));
    });
  }
  get plugin() {
    return this.opts.plugin;
  }
  getTab() {
    var _a;
    const tabs = this.visibleTabs;
    return this.chatEnabled() ? (_a = tabs.find((t) => t.key === this.storedTabKey())) != null ? _a : tabs[0] : tabs[tabs.length - 1];
  }
};

export {
  ChatCtrl
};
//# sourceMappingURL=lib.LARLSDYI.js.map
