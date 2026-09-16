// ../lib/src/common.ts
var defined = (value) => value !== void 0;
var notNull = (value) => value !== null && value !== void 0;
var isEmpty = (a) => !a || a.length === 0;
var notEmpty = (a) => !isEmpty(a);
var elemAt = (arr, idx) => arr[idx];
var prop = (initialValue) => {
  let value = initialValue;
  return (v) => {
    if (defined(v)) value = v;
    return value;
  };
};
var propWithEffect = (initialValue, effect) => {
  let value = initialValue;
  return (v) => {
    if (defined(v)) {
      value = v;
      effect(v);
    }
    return value;
  };
};
var withEffect = (prop2, effect) => (v) => {
  let returnValue;
  if (defined(v)) {
    returnValue = prop2(v);
    effect(v);
  } else returnValue = prop2();
  return returnValue;
};
var toggle = (initialValue, effect = () => {
}) => {
  const prop2 = propWithEffect(initialValue, effect);
  prop2.toggle = () => prop2(!prop2());
  return prop2;
};
var memoize = (compute) => {
  let computed;
  return () => {
    if (computed === void 0) computed = compute();
    return computed;
  };
};
var scrollToInnerSelector = (el, selector, horiz = false, behavior = "instant") => scrollTo(el, el.querySelector(selector), horiz, behavior);
var scrollTo = (el, target, horiz = false, behavior = "instant") => {
  if (!target) return;
  el.scrollTo(
    horiz ? { behavior, left: target.offsetLeft - el.offsetWidth / 2 + target.offsetWidth / 2 } : { behavior, top: target.offsetTop - el.offsetHeight / 2 + target.offsetHeight / 2 }
  );
};
var onClickAway = (f) => (el) => {
  const listen = () => $(document).one("click", (e) => {
    if (!document.contains(el)) return;
    if (el.contains(e.target)) listen();
    else f();
  });
  setTimeout(listen, 300);
};
var hyphenToCamel = (str) => str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
var requestIdleCallbackSafe = (f, timeout) => {
  if (window.requestIdleCallback) window.requestIdleCallback(f, timeout ? { timeout } : void 0);
  else requestAnimationFrame(f);
};
function escapeHtml(str) {
  return /[&<>"']/.test(str) ? str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;").replace(/"/g, "&quot;") : str;
}
function frag(html) {
  const fragment = document.createRange().createContextualFragment(html);
  return fragment.childElementCount === 1 ? fragment.firstElementChild : fragment;
}
function scopedQuery(scope) {
  return (sel) => scope.querySelector(sel);
}
var myUserId = () => document.body.dataset.user;
var myUsername = () => document.body.dataset.username;
function repeater(f, additionalStopCond) {
  let timeout = void 0;
  const delay = (function* () {
    yield 500;
    for (let d = 350; ; ) yield Math.max(100, d *= 14 / 15);
  })();
  const repeat = () => {
    f();
    timeout = setTimeout(repeat, delay.next().value);
    if (additionalStopCond == null ? void 0 : additionalStopCond()) clearTimeout(timeout);
  };
  repeat();
  document.addEventListener("pointerup", () => clearTimeout(timeout), { once: true });
}
function blurIfPrimaryClick(e) {
  if (!(e instanceof MouseEvent)) return;
  const target = document.activeElement;
  if (target instanceof HTMLElement && e.button === 0 && (e.clientX || e.clientY))
    requestAnimationFrame(() => target.blur());
}
function blurIfEscape(e) {
  if (e.target instanceof HTMLElement && e.key === "Escape") {
    e.stopPropagation();
    e.target.blur();
  }
}
function blurOnEscape(el) {
  el.addEventListener("keydown", blurIfEscape);
}

// ../lib/src/richText.ts
var linkRegex = /(^|[\s\n\(]|<[A-Za-z]*\/?>)((?:(?:https?|ftp):\/\/|lichess\.org)[\-A-Z0-9+\u0026\u2019@#\/%?=()~_|!:,.;*$']*[\-A-Z0-9+\u0026@#\/%=~()_|][\-A-Z0-9+\u0026@#\/%=~(_|])/gi;
var newLineRegex = /\n/g;
var userPattern = /(^|[^\w@#/])@([a-z0-9_-]{2,30})/gi;
var movePattern = /\b(\d+)\s*(\.+)\s*(?:[o0-]+[o0]|[NBRQK\u2654\u2655\u2656\u2657\u2658]?[a-h]?[1-8]?[x@]?[a-h][1-8](?:=[NBRQK\u2654\u2655\u2656\u2657\u2658\u2659])?)\+?#?[!\?=]{0,5}/gi;
var isMoreThanText = (str) => /(\n|(@|#|\.)\w{2,}|(board|game) \d)/i.test(str);
var linkHtml = (href, content, expandable = true) => `<a${expandable ? "" : ' class="text"'} target="_blank" rel="nofollow noreferrer" href="${href}">${content}</a>`;
function toLink(url) {
  if (!url.match(/^[A-Za-z]+:\/\//)) url = "https://" + url;
  return linkHtml(url, url.replace(/https?:\/\//, ""));
}
var autolink = (str, callback) => str.replace(linkRegex, (_, space, url) => space + callback(url));
var innerHTML = (a, toHtml) => ({
  insert(vnode) {
    vnode.elm.innerHTML = toHtml(a);
    vnode.data.cachedA = a;
  },
  postpatch(old, vnode) {
    if (old.data.cachedA !== a) vnode.elm.innerHTML = toHtml(a);
    vnode.data.cachedA = a;
  }
});
function linkReplace(href, body, expandable = true) {
  if (href.includes("&quot;")) return href;
  return linkHtml(
    href.startsWith("/") || href.includes("://") ? href : "//" + href,
    body ? body : href,
    expandable
  );
}
var userLinkReplace = (_, prefix, user) => prefix + linkReplace("/@/" + user, "@" + user);
var expandMentions = (html) => html.replace(userPattern, userLinkReplace);
function enrichText(text, allowNewlines = true) {
  let html = autolink(escapeHtml(text), toLink);
  if (allowNewlines) html = html.replace(newLineRegex, "<br>");
  return html;
}
function richHTML(text, newLines = true) {
  return innerHTML(text, (t) => enrichText(t, newLines));
}
var linkPattern = /\b\b(?:https?:\/\/)?(lichess\.org\/[-–—\w+&'@#\/%?=()~|!:,.;*$]+[\w+&@#\/%=~|])/gi;
var pawnDropPattern = /^[a-h][2-7]$/;
var boardPattern = /\b(?:board|game)\s(\d+)/gi;
function moveReplacer(match, turn, dots) {
  if (turn < 1 || turn > 200) return match;
  const ply = turn * 2 - (dots.length > 1 ? 0 : 1);
  return '<a class="jump" data-ply="' + ply + '">' + match + "</a>";
}
function boardReplacer(match, board) {
  if (board < 1 || board > 100) return match;
  return '<a data-board="' + board + '">' + match + "</a>";
}
var addPlies = (html) => html.replace(movePattern, moveReplacer);
var addBoards = (html) => html.replace(boardPattern, boardReplacer);
var userLinkReplacePawn = (orig, prefix, user) => user.match(pawnDropPattern) ? orig : userLinkReplace(orig, prefix, user);
function enhance(text, opts) {
  const escaped = escapeHtml(text);
  const linked = escaped.replace(userPattern, userLinkReplacePawn).replace(linkPattern, linkReplace);
  const plied = (opts == null ? void 0 : opts.plies) && linked === escaped ? addPlies(linked) : linked;
  return (opts == null ? void 0 : opts.boards) && linked === escaped ? addBoards(plied) : linked;
}

export {
  defined,
  notNull,
  isEmpty,
  notEmpty,
  elemAt,
  prop,
  propWithEffect,
  withEffect,
  toggle,
  memoize,
  scrollToInnerSelector,
  scrollTo,
  onClickAway,
  hyphenToCamel,
  requestIdleCallbackSafe,
  escapeHtml,
  frag,
  scopedQuery,
  myUserId,
  myUsername,
  repeater,
  blurIfPrimaryClick,
  blurIfEscape,
  blurOnEscape,
  linkRegex,
  newLineRegex,
  userPattern,
  isMoreThanText,
  innerHTML,
  linkReplace,
  expandMentions,
  enrichText,
  richHTML,
  enhance
};
//# sourceMappingURL=lib.GMEH5BEF.js.map
