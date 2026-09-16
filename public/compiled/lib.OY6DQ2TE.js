import {
  userLink
} from "./lib.BMKV23O2.js";
import {
  numberFormat
} from "./lib.EAANXKAK.js";
import {
  alert,
  cmnToggleProp,
  confirm,
  enter
} from "./lib.MYPIOGN5.js";
import {
  bind,
  dataIcon,
  hl,
  onInsert
} from "./lib.S3TIZ2HQ.js";
import {
  h,
  thunk
} from "./lib.LWF5S4ZV.js";
import {
  pubsub
} from "./lib.QPQZCXK2.js";
import {
  licon
} from "./lib.5I4BSVKX.js";
import {
  form,
  json,
  text
} from "./lib.TT4QSUKQ.js";
import {
  debounce,
  storage,
  tempStorage
} from "./lib.NFSQQWN5.js";
import {
  blurIfEscape,
  blurOnEscape,
  enhance,
  isMoreThanText,
  userPattern
} from "./lib.GMEH5BEF.js";

// ../lib/src/chat/xhr.ts
var userModInfo = (username) => json("/mod/chat-user/" + username);
var flag = (resource, username, text2) => json("/report/flag", {
  method: "post",
  body: form({ username, resource, text: text2 })
});
var getNote = (id) => text(noteUrl(id));
var setNote = (id, text2) => json(noteUrl(id), {
  method: "post",
  body: form({ text: text2 })
});
var noteUrl = (id) => `/${id}/note`;
var timeout = (resourceId, body) => {
  const [chan, roomId] = resourceId.split("/");
  return text(`/mod/public-chat/timeout`, {
    method: "post",
    body: form({
      ...body,
      chan,
      roomId
    })
  });
};

// ../lib/src/chat/moderation.ts
function moderationCtrl(opts) {
  let data;
  let loading = false;
  const open = (line) => {
    const userA = line.querySelector("a.user-link");
    const text2 = line.querySelector("t").innerText;
    const username = userA.href.split("/")[4];
    if (opts.permissions.timeout) {
      loading = true;
      userModInfo(username).then((d) => {
        data = { ...d, text: text2 };
        loading = false;
        opts.redraw();
      });
    } else {
      data = { id: username.toLowerCase(), name: username, text: text2 };
    }
    opts.redraw();
  };
  const close = () => {
    data = void 0;
    loading = false;
    opts.redraw();
  };
  return {
    loading: () => loading,
    data: () => data,
    opts,
    open,
    close,
    async timeout(reason, text2) {
      if (data) {
        const body = { userId: data.id, reason: reason.key, text: text2 };
        if (new URLSearchParams(window.location.search).get("mod") === "true") {
          await timeout(opts.resourceId, body);
          window.location.reload();
        } else pubsub.emit("socket.send", "timeout", body);
      }
      close();
      opts.redraw();
    }
  };
}
function flagReport(ctrl, flag2) {
  const line = flag2.parentNode;
  const text2 = flag2.dataset["text"];
  const userA = line.querySelector("a.user-link");
  if (text2 && userA) reportUserText(ctrl.data.resourceId, userA.href.split("/")[4], text2);
}
async function reportUserText(resourceId, username, text2) {
  if (await confirm(`Report "${text2}" to moderators?`)) flag(resourceId, username, text2);
}
var lineAction = () => h("action.mod", { attrs: dataIcon(licon.Agent) });
function moderationView(ctrl) {
  if (!ctrl) return void 0;
  if (ctrl.loading()) return [h("div.loading")];
  const data = ctrl.data();
  if (!data) return void 0;
  const perms = ctrl.opts.permissions;
  const infos = data.history ? h(
    "div.infos.block",
    [numberFormat(data.games || 0) + " games", data.tos ? "TOS" : void 0].map((t) => t && h("span", t)).concat([
      h(
        "a",
        {
          attrs: {
            href: "/@/" + data.name + "?mod"
          }
        },
        "profile"
      )
    ]).concat(
      perms.shadowban ? [
        h(
          "a",
          {
            attrs: {
              href: "/mod/" + data.name + "/communication"
            }
          },
          "coms"
        )
      ] : []
    )
  ) : void 0;
  const timeout2 = perms.timeout || perms.broadcast ? h("div.timeout.block", [
    h("strong", "Timeout 15 minutes for"),
    ...ctrl.opts.reasons.map(
      (r) => h(
        "a.text",
        {
          attrs: dataIcon(licon.Clock),
          hook: bind("click", () => ctrl.timeout(r, data.text))
        },
        r.name
      )
    )
  ]) : h("div.timeout.block", [
    h("strong", "Moderation"),
    h(
      "a.text",
      {
        attrs: dataIcon(licon.Clock),
        hook: bind("click", () => ctrl.timeout(ctrl.opts.reasons[0], data.text))
      },
      "Timeout 15 minutes"
    ),
    h(
      "a.text",
      {
        attrs: dataIcon(licon.Clock),
        hook: bind("click", async () => {
          await reportUserText(ctrl.opts.resourceId, data.name, data.text);
          ctrl.timeout(ctrl.opts.reasons[0], data.text);
        })
      },
      "Timeout and report to Lichess"
    )
  ]);
  const history = data.history ? h("div.history.block", [
    h("strong", "Timeout history"),
    h(
      "table",
      h(
        "tbody.slist",
        {
          hook: onInsert(() => pubsub.emit("content-loaded"))
        },
        data.history.map(function(e) {
          return h("tr", [
            h("td.reason", e.reason),
            h("td.mod", e.mod),
            h("td", h("time.timeago", { attrs: { datetime: e.date } }))
          ]);
        })
      )
    )
  ]) : void 0;
  return [
    h("div.top", { key: "mod-" + data.id }, [
      h("span.text", { attrs: dataIcon(licon.Agent) }, [userLink(data)]),
      h("a", { attrs: dataIcon(licon.X), hook: bind("click", ctrl.close) })
    ]),
    h("div.mchat__content.moderation", [
      h("i.line-text.block", ['"', data.text, '"']),
      infos,
      timeout2,
      history
    ])
  ];
}

// ../lib/src/chat/preset.ts
var groups = {
  start: ["hi/Hello", "gl/Good luck", "hf/Have fun!", "u2/You too!"].map(splitIt),
  end: ["gg/Good game", "wp/Well played", "ty/Thank you", "gtg/I've got to go", "bye/Bye!"].map(splitIt)
};
function presetCtrl(opts) {
  let group = opts.initialGroup;
  let said = [];
  return {
    group: () => group,
    said: () => said,
    setGroup(p) {
      if (p !== group) {
        group = p;
        if (!p) said = [];
        opts.redraw();
      }
    },
    post(preset) {
      if (!group) return;
      const sets = groups[group];
      if (!sets) return;
      if (said.includes(preset.key)) return;
      if (opts.post(preset.text)) said.push(preset.key);
    }
  };
}
function presetView(ctrl) {
  const group = ctrl.group();
  if (!group) return void 0;
  const sets = groups[group];
  const said = ctrl.said();
  return sets && said.length < 2 ? h(
    "div.mchat__presets",
    { key: group },
    sets.map((p) => {
      const disabled = said.includes(p.key);
      return h(
        "span",
        {
          class: { disabled },
          attrs: { title: p.text, disabled },
          hook: bind("click", () => !disabled && ctrl.post(p))
        },
        p.key
      );
    })
  ) : void 0;
}
function splitIt(s) {
  const parts = s.split("/");
  return {
    key: parts[0],
    text: parts[1]
  };
}

// ../lib/src/chat/spam.ts
var skip = (txt) => (suspLink(txt) || followMe(txt)) && !isKnownSpammer();
var selfReport = (txt) => {
  if (isKnownSpammer()) return;
  const hasSuspLink = suspLink(txt);
  if (hasSuspLink) text(`/jslog/${window.location.href.slice(-12)}?n=spam`, { method: "post" });
  if (hasSuspLink || followMe(txt)) storage.set("chat-spam", "1");
};
var isKnownSpammer = () => storage.get("chat-spam") === "1";
var spamRegex = new RegExp(
  [
    "xcamweb.com",
    "(^|[^i])chess-bot",
    "chess-cheat",
    "coolteenbitch",
    "letcafa.webcam",
    "tinyurl.com/",
    "wooga.info/",
    "bit.ly/",
    "wbt.link/",
    "eb.by/",
    "001.rs/",
    "shr.name/",
    "u.to/",
    ".3-a.net",
    ".ssl443.org",
    ".ns02.us",
    ".myftp.info",
    ".flinkup.com",
    ".serveusers.com",
    "badoogirls.com",
    "hide.su",
    "wyon.de",
    "sexdatingcz.club",
    "qps.ru",
    "tiny.cc/",
    "trasderk.blogspot.com",
    "t.ly/",
    "shorturl.at/",
    "lichess77",
    "77Casino.cfd",
    "Betspin.life"
  ].map((url) => url.replace(/\./g, "\\.").replace(/\//g, "\\/")).join("|")
);
var suspLink = (txt) => !!txt.match(spamRegex);
var followMeRegex = /follow me|join my team/i;
var followMe = (txt) => !!txt.match(followMeRegex);
var teamUrlRegex = /lichess\.org\/team\//i;
var hasTeamUrl = (txt) => !!txt.match(teamUrlRegex);

// ../lib/src/chat/discussion.ts
var whisperRegex = /^\/[wW](?:hisper)?\s/;
var scrollState = { pinToBottom: true, lastScrollTop: 0 };
var resizeObserver = null;
var scrollToBottom = (el, smooth) => {
  if (document.hidden || !smooth) el.scrollTop = el.scrollHeight;
  else if (el.scrollTop + el.clientHeight < el.scrollHeight)
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  scrollState.lastScrollTop = el.scrollTop;
};
function discussion_default(ctrl) {
  if (!ctrl.chatEnabled()) return [];
  const hasMod = !!ctrl.moderation;
  const vnodes = [
    h(
      `ol.mchat__messages.chat-v-${ctrl.vm.domVersion}${hasMod ? ".as-mod" : ""}`,
      {
        attrs: { role: "log", "aria-live": "polite", "aria-atomic": "false" },
        hook: {
          ...onInsert((el) => {
            const $el = $(el).on("click", "a.jump", (e) => {
              const ply = e.target.getAttribute("data-ply");
              if (ply) pubsub.emit("jump", ply);
            });
            $el.on("click", ".reply", (e) => {
              var _a, _b, _c, _d;
              const el2 = e.target;
              const username = (_c = (_b = (_a = el2.parentElement) == null ? void 0 : _a.querySelector(".user-link")) == null ? void 0 : _b.getAttribute("href")) == null ? void 0 : _c.slice(3);
              const input = (_d = el2.closest(".mchat")) == null ? void 0 : _d.querySelector("input.mchat__say");
              if (username && input) prependChatInput(input, `@${username} `);
            });
            if (hasMod)
              $el.on(
                "click",
                ".mod",
                (e) => {
                  var _a;
                  return (_a = ctrl.moderation) == null ? void 0 : _a.open(e.target.parentNode);
                }
              );
            else $el.on("click", ".flag", (e) => flagReport(ctrl, e.target));
            el.addEventListener("scroll", () => {
              if (el.scrollTop < scrollState.lastScrollTop) scrollState.pinToBottom = false;
              else if (el.scrollTop + el.clientHeight > el.scrollHeight - 10) scrollState.pinToBottom = true;
              scrollState.lastScrollTop = el.scrollTop;
            });
            resizeObserver == null ? void 0 : resizeObserver.disconnect();
            resizeObserver = new ResizeObserver(() => {
              if (scrollState.pinToBottom) scrollToBottom(el, false);
            });
            resizeObserver.observe(el);
            requestAnimationFrame(() => scrollToBottom(el, false));
          }),
          postpatch: (_, vnode) => {
            if (scrollState.pinToBottom) scrollToBottom(vnode.elm, true);
          },
          destroy(_) {
            resizeObserver == null ? void 0 : resizeObserver.disconnect();
            resizeObserver = null;
          }
        }
      },
      selectLines(ctrl).map((line) => renderLine(ctrl, line))
    ),
    renderInput(ctrl)
  ];
  const presets = presetView(ctrl.preset);
  if (presets) vnodes.push(presets);
  return vnodes;
}
function renderInput(ctrl) {
  if (!ctrl.vm.writeable) return void 0;
  if (ctrl.data.loginRequired && !ctrl.data.userId || ctrl.data.restricted)
    return h("input.mchat__say", {
      attrs: { placeholder: i18n.site.loginToChat, disabled: true }
    });
  let placeholder;
  if (ctrl.vm.timeout) placeholder = i18n.site.youHaveBeenTimedOut;
  else if (ctrl.opts.blind) placeholder = "Chat";
  else placeholder = i18n.site.talkInChat;
  return h("input.mchat__say", {
    attrs: {
      placeholder,
      autocomplete: "off",
      enterkeyhint: "send",
      maxlength: 140,
      disabled: ctrl.vm.timeout || !ctrl.vm.writeable,
      "aria-label": "Chat input"
    },
    hook: onInsert((el) => setupHooks(ctrl, el))
  });
}
function prependChatInput(chatInput, prefix) {
  if (!chatInput.value.includes(prefix)) chatInput.value = prefix + chatInput.value;
  chatInput.focus();
  chatInput.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
}
var mouchListener;
var setupHooks = (ctrl, chatEl) => {
  const inner = tempStorage.make(`chat.input`);
  const storage2 = {
    get: () => {
      const v = inner.get();
      if (v) {
        try {
          const parsed = JSON.parse(v);
          if (parsed[0] === (ctrl.data.opponentId || "")) {
            return parsed[1];
          }
        } catch (e) {
          console.log(`Could not parse "chat.input" value ${v}`);
        }
      }
      return void 0;
    },
    set: (txt) => {
      inner.set(JSON.stringify([ctrl.data.opponentId || "", txt]));
    },
    inner
  };
  const previousText = storage2.get();
  if (previousText) {
    chatEl.value = previousText;
    chatEl.focus();
    if (!ctrl.opts.public && previousText.match(whisperRegex)) chatEl.classList.add("whisper");
  } else if (ctrl.vm.autofocus) chatEl.focus();
  chatEl.addEventListener("keydown", (e) => {
    blurIfEscape(e);
    enter((target) => {
      setTimeout(() => {
        const el = target, txt = el.value, pub = ctrl.opts.public;
        if (txt === "")
          $(".input-move input").each(function() {
            this.focus();
          });
        else {
          if (!ctrl.opts.kobold) selfReport(txt);
          if (pub && hasTeamUrl(txt)) alert("Please don't advertise teams in the chat.");
          else {
            scrollState.pinToBottom = true;
            ctrl.post(txt);
          }
          el.value = "";
          storage2.inner.remove();
          if (!pub) el.classList.remove("whisper");
        }
      });
    })(e);
  });
  chatEl.addEventListener(
    "input",
    (e) => setTimeout(() => {
      const el = e.target, txt = el.value;
      el.removeAttribute("placeholder");
      if (!ctrl.opts.public) el.classList.toggle("whisper", !!txt.match(whisperRegex));
      storage2.set(txt);
    })
  );
  site.mousetrap.bind(
    "c",
    () => {
      var _a;
      return (_a = document.querySelector("input.mchat__say")) == null ? void 0 : _a.focus();
    },
    void 0,
    false
  );
  const mouchEvents = ["touchstart", "mousedown"];
  if (mouchListener)
    mouchEvents.forEach((event) => document.body.removeEventListener(event, mouchListener, { capture: true }));
  mouchListener = (e) => {
    if (!e.shiftKey && e.buttons !== 2 && e.button !== 2 && e.target !== chatEl) chatEl.blur();
  };
  chatEl.onfocus = () => mouchEvents.forEach(
    (event) => document.body.addEventListener(event, mouchListener, { passive: true, capture: true })
  );
  chatEl.onblur = () => mouchEvents.forEach((event) => document.body.removeEventListener(event, mouchListener, { capture: true }));
};
var sameLines = (l1, l2) => l1.d && l2.d && l1.u === l2.u;
function selectLines(ctrl) {
  const ls = [];
  let prev;
  ctrl.data.lines.forEach((line) => {
    if (!line.d && (!prev || !sameLines(prev, line)) && (!line.r || (line.u || "").toLowerCase() === ctrl.data.userId) && !skip(line.t))
      ls.push(line);
    prev = line;
  });
  return ls;
}
var updateText = (opts) => (oldVnode, vnode) => {
  if (vnode.data.lichessChat !== oldVnode.data.lichessChat)
    vnode.elm.innerHTML = enhance(vnode.data.lichessChat, opts);
};
var profileLinkRegex = /(https:\/\/)?lichess\.org\/@\/([a-zA-Z0-9_-]+)/g;
var processProfileLink = (text2) => text2.replace(profileLinkRegex, "@$2");
function renderText(t, opts) {
  const processedText = processProfileLink(t);
  if (isMoreThanText(processedText)) {
    const hook = updateText(opts);
    return h("t", { lichessChat: processedText, hook: { create: hook, update: hook } });
  }
  return h("t", processedText);
}
var userThunk = (name, title, patronColor, flair) => userLink({ name, title, patronColor, line: !!patronColor, flair, online: !!patronColor });
var actionIcons = (ctrl, line) => {
  if (!ctrl.data.userId || !line.u || ctrl.data.userId === line.u) return [];
  const icons = [];
  if (ctrl.canPostArbitraryText() && !ctrl.data.resourceId.startsWith("game"))
    icons.push(
      h("action.reply", {
        attrs: { "data-icon": licon.Back, title: "Reply" }
      })
    );
  icons.push(
    ctrl.moderation ? lineAction() : h("action.flag", {
      attrs: { "data-icon": licon.CautionTriangle, title: "Report", "data-text": line.t }
    })
  );
  return icons;
};
function renderLine(ctrl, line) {
  var _a, _b, _c;
  const textNode = renderText(line.t, ctrl.opts.enhance);
  if (line.u === "lichess") return h("li.system", textNode);
  if (line.c) return h("li", [h("span.color", "[" + line.c + "]"), textNode]);
  const userNode = thunk("a", line.u, userThunk, [line.u, line.title, line.pc, line.f]);
  const userId = (_a = line.u) == null ? void 0 : _a.toLowerCase();
  const myUserId = ctrl.data.userId;
  const mentioned = !!myUserId && !!((_b = line.t.match(userPattern)) == null ? void 0 : _b.find((mention) => mention.trim().toLowerCase() === `@${ctrl.data.userId}`));
  return h(
    "li",
    {
      class: {
        me: userId === myUserId,
        host: !!(userId && ((_c = ctrl.data.hostIds) == null ? void 0 : _c.includes(userId))),
        mentioned
      }
    },
    [...actionIcons(ctrl, line), userNode, " ", textNode]
  );
}

// ../lib/src/chat/note.ts
function noteCtrl(opts) {
  let text2 = opts.text;
  const doPost = debounce(() => {
    setNote(opts.id, text2 || "");
  }, 1e3);
  return {
    id: opts.id,
    text: () => text2,
    fetch() {
      getNote(opts.id).then((t) => {
        text2 = t || "";
        opts.redraw();
      });
    },
    post(t) {
      text2 = t;
      doPost();
    }
  };
}
function noteView(ctrl, autofocus) {
  const text2 = ctrl.text();
  if (text2 === void 0) return h("div.loading", { hook: { insert: ctrl.fetch } });
  return h("textarea.mchat__note", {
    attrs: { placeholder: i18n.site.typePrivateNotesHere, spellcheck: "false" },
    hook: onInsert((el) => {
      el.value = text2;
      if (autofocus) el.focus();
      blurOnEscape(el);
      $(el).on("change keyup paste", () => ctrl.post(el.value));
    })
  });
}

// ../lib/src/chat/renderChat.ts
function renderChat(ctrl, hook = {}) {
  return hl(
    "section.mchat" + (ctrl.isOptional ? ".mchat-optional" : ""),
    { class: { "mchat-mod": !!ctrl.moderation }, hook },
    moderationView(ctrl.moderation) || normalView(ctrl)
  );
}
function normalView(ctrl) {
  const active = ctrl.getTab();
  return [
    hl("div.mchat__tabs.nb_" + ctrl.visibleTabs.length, { attrs: { role: "tablist" } }, [
      ctrl.visibleTabs.map((t) => renderTab(ctrl, t, active))
    ]),
    hl(
      "div.mchat__content." + active.key,
      active.key === "note" && ctrl.note ? [noteView(ctrl.note, ctrl.vm.autofocus)] : ctrl.plugin && active.key === ctrl.plugin.key ? [ctrl.plugin.view()] : discussion_default(ctrl)
    )
  ];
}
var renderTab = (ctrl, tab, active) => hl(
  "button.mchat__tab." + tab.key,
  {
    attrs: { role: "tab" },
    class: { "mchat__tab-active": tab.key === active.key },
    hook: bind("click", (e) => {
      if (e.target.closest("input,label")) return;
      ctrl.setTab(tab);
      ctrl.redraw();
    })
  },
  tabName(ctrl, tab)
);
function tabName(ctrl, tab) {
  var _a;
  if (tab.key === "discussion") {
    const id = `chat-toggle-${ctrl.data.id}`;
    return [
      hl("span", ctrl.data.name),
      ctrl.isOptional && cmnToggleProp({ id, prop: ctrl.chatEnabled, redraw: ctrl.redraw })
    ];
  }
  if (tab.key === "note") return [hl("span", i18n.site.notes)];
  if (tab.key === ((_a = ctrl.plugin) == null ? void 0 : _a.key)) return [hl("span", ctrl.plugin.name)];
  return [];
}

export {
  moderationCtrl,
  presetCtrl,
  noteCtrl,
  renderChat
};
//# sourceMappingURL=lib.OY6DQ2TE.js.map
