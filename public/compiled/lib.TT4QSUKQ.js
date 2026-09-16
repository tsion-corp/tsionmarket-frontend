import {
  defined,
  notNull
} from "./lib.GMEH5BEF.js";

// ../lib/src/xhr.ts
var ValidationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
};
var jsonHeader = {
  Accept: "application/web.lichess+json"
};
var defaultInit = {
  cache: "no-cache",
  credentials: "same-origin"
  // required for safari < 12
};
var xhrHeader = {
  "X-Requested-With": "XMLHttpRequest"
  // so lila knows it's XHR
};
var ensureOk = async (res) => {
  if (res.ok) return res;
  if (res.status === 413) throw new Error("The uploaded file is too large");
  if (res.status === 422) {
    const body = await res.json().catch(() => null);
    throw new ValidationError((body == null ? void 0 : body.error) || "Unprocessable entity");
  }
  if (res.status === 429) throw new Error("Too many requests");
  throw new Error(`Error ${res.status} ${res.statusText} ${await res.text()}`);
};
var jsonSimple = (url2, init = {}) => fetch(url2, {
  headers: {
    ...jsonHeader
  },
  ...init
}).then((res) => ensureOk(res).then((r) => r.json()));
var json = (url2, init = {}) => jsonAnyResponse(url2, init).then((res) => ensureOk(res).then((r) => r.json()));
var jsonAnyResponse = (url2, init = {}) => fetch(url2, {
  ...defaultInit,
  headers: {
    ...jsonHeader,
    ...xhrHeader
  },
  ...init
});
var text = (url2, init = {}) => textRaw(url2, init).then((res) => ensureOk(res).then((r) => r.text()));
var textRaw = (url2, init = {}) => fetch(url2, {
  ...defaultInit,
  headers: { ...xhrHeader },
  ...init
});
var script = (src) => new Promise((resolve, reject) => {
  const nonce = document.body.getAttribute("data-nonce");
  const el = document.createElement("script");
  if (nonce) el.setAttribute("nonce", nonce);
  el.onload = () => resolve();
  el.onerror = reject;
  el.src = src;
  document.head.append(el);
});
var form = (data) => {
  const formData = new FormData();
  for (const k of Object.keys(data)) if (notNull(data[k])) formData.append(k, data[k].toString());
  return formData;
};
var url = (path, params) => {
  const searchParams = new URLSearchParams();
  for (const k of Object.keys(params)) if (defined(params[k])) searchParams.append(k, params[k].toString());
  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
};
var formToXhr = (el, submitter) => {
  const action = el.getAttribute("action");
  const body = new FormData(el);
  if ((submitter == null ? void 0 : submitter.name) && (submitter == null ? void 0 : submitter.value)) body.set(submitter.name, submitter.value);
  return action ? text(action, {
    method: el.method,
    body
  }) : Promise.reject(new Error(`Form has no action: ${el}`));
};
var readNdJson = async (response, processLine) => {
  if (!response.ok) throw new Error(`Status ${response.status}`);
  const stream = response.body.getReader();
  const matcher = /\r?\n/;
  const decoder = new TextDecoder();
  let buf = "";
  let done, value;
  do {
    ({ done, value } = await stream.read());
    buf += decoder.decode(value || new Uint8Array(), { stream: !done });
    const parts = buf.split(matcher);
    if (!done) buf = parts.pop();
    for (const part of parts) if (part) processLine(JSON.parse(part));
  } while (!done);
};
async function writeTextClipboard(url2, callbackOnSuccess) {
  if (typeof ClipboardItem === "undefined") {
    const t = await text(url2);
    return navigator.clipboard.writeText(t).then(callbackOnSuccess);
  } else {
    const clipboardItem = new ClipboardItem({
      "text/plain": text(url2).then((t) => new Blob([t], { type: "text/plain" }))
    });
    return navigator.clipboard.write([clipboardItem]).then(callbackOnSuccess);
  }
}

export {
  ValidationError,
  jsonHeader,
  defaultInit,
  xhrHeader,
  ensureOk,
  jsonSimple,
  json,
  jsonAnyResponse,
  text,
  textRaw,
  script,
  form,
  url,
  formToXhr,
  readNdJson,
  writeTextClipboard
};
//# sourceMappingURL=lib.TT4QSUKQ.js.map
