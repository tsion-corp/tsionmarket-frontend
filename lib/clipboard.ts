// Copy text to the clipboard across browsers. Prefers the async Clipboard API in
// secure contexts, and falls back to a hidden textarea plus execCommand for the
// mobile in-app browsers and webviews where navigator.clipboard is missing or
// blocked. Returns whether the copy actually succeeded.
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path below.
    }
  }
  return legacyCopy(text);
}

// Legacy path for browsers without a usable Clipboard API. iOS Safari ignores
// textarea.select(), so it needs an explicit Range plus setSelectionRange.
function legacyCopy(text: string): boolean {
  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.padding = "0";
  textarea.style.border = "none";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);

  try {
    if (/ipad|iphone|ipod/i.test(navigator.userAgent)) {
      const range = document.createRange();
      range.selectNodeContents(textarea);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      textarea.setSelectionRange(0, text.length);
    } else {
      textarea.select();
    }
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

// Copy text that does not exist yet — a URL that needs a network round-trip to
// mint. Clipboard writes are only allowed during transient user activation,
// and Safari revokes that at the first await (Chrome after a few seconds), so
// copying after the request finishes silently fails there. The fix the
// Clipboard API provides: hand the clipboard a ClipboardItem wrapping a
// PROMISE, synchronously inside the click, and the write is permitted when the
// promise resolves. Falls back to awaiting the text and copying best-effort
// where ClipboardItem promises are unsupported.
export function copyTextWhenReady(text: Promise<string>): Promise<boolean> {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof ClipboardItem !== "undefined" &&
    "write" in navigator.clipboard
  ) {
    try {
      const item = new ClipboardItem({
        "text/plain": text.then((value) => new Blob([value], { type: "text/plain" })),
      });
      // write() must be invoked now, while the user activation is live.
      return navigator.clipboard.write([item]).then(
        () => true,
        () => text.then(copyText, () => false)
      );
    } catch {
      // Constructing the item can throw on older engines; fall through.
    }
  }
  return text.then(copyText, () => false);
}
