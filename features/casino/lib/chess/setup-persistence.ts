const SETUP_FIELDS = [
  "variant",
  "initial_fen",
  "time_control",
  "time_mode",
  "mode",
  "color",
  "rating_range",
  "level",
] as const;

type SetupKind = "hook" | "friend" | "ai";
type StoredSetup = Partial<Record<(typeof SETUP_FIELDS)[number], string>>;

interface SetupStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function setupKind(form: HTMLFormElement): SetupKind | null {
  if (form.matches("[data-lobby-setup]")) return "hook";
  if (form.matches("[data-friend-setup]")) return "friend";
  if (form.matches("[data-computer-setup]")) return "ai";
  return null;
}

function selectedValue(form: HTMLFormElement, name: string): string | null {
  const control = form.elements.namedItem(name);
  if (!control) return null;
  if (control instanceof RadioNodeList) return control.value || null;
  if (control instanceof HTMLInputElement && control.type === "checkbox") {
    return control.checked ? control.value || "on" : "";
  }
  if (
    control instanceof HTMLInputElement ||
    control instanceof HTMLSelectElement ||
    control instanceof HTMLTextAreaElement
  ) {
    return control.value;
  }
  return null;
}

function applyValue(form: HTMLFormElement, name: string, value: string): void {
  const control = form.elements.namedItem(name);
  if (!control) return;
  if (control instanceof RadioNodeList) {
    for (const item of Array.from(control)) {
      if (item instanceof HTMLInputElement && item.type === "radio") {
        item.checked = item.value === value;
      }
    }
    return;
  }
  if (control instanceof HTMLSelectElement) {
    if (Array.from(control.options).some((option) => option.value === value)) control.value = value;
    return;
  }
  if (control instanceof HTMLInputElement) {
    if (control.type === "checkbox") control.checked = value !== "";
    else control.value = value;
  } else if (control instanceof HTMLTextAreaElement) {
    control.value = value;
  }
}

function storageKey(viewer: string, kind: SetupKind): string {
  return `lobby.setup.${viewer || "anon"}.${kind}`;
}

export function installChessSetupPersistence(
  frameDocument: Document,
  viewer: string,
  storage: SetupStorage = window.localStorage
): () => void {
  const cleanups: Array<() => void> = [];
  const forms = frameDocument.querySelectorAll<HTMLFormElement>(
    "form[data-lobby-setup], form[data-friend-setup], form[data-computer-setup]"
  );

  for (const form of forms) {
    const kind = setupKind(form);
    if (!kind) continue;
    const key = storageKey(viewer, kind);
    try {
      const saved = JSON.parse(storage.getItem(key) ?? "null") as StoredSetup | null;
      if (saved && typeof saved === "object") {
        for (const name of SETUP_FIELDS) {
          const value = saved[name];
          if (typeof value === "string") applyValue(form, name, value);
        }
        const variant = selectedValue(form, "variant");
        const variantItem = variant
          ? form.querySelector<HTMLElement>(`[data-variant="${variant}"]`)
          : null;
        variantItem?.click();
      }
    } catch {
      // Storage can be unavailable in hardened browsers. Setup remains usable.
    }

    const save = () => {
      const setup: StoredSetup = {};
      for (const name of SETUP_FIELDS) {
        const value = selectedValue(form, name);
        if (value !== null) setup[name] = value;
      }
      try {
        storage.setItem(key, JSON.stringify(setup));
      } catch {
        // Ignore quota and privacy-mode storage failures.
      }
    };
    form.addEventListener("change", save);
    form.addEventListener("submit", save);
    cleanups.push(() => {
      form.removeEventListener("change", save);
      form.removeEventListener("submit", save);
    });
  }

  return () => cleanups.forEach((cleanup) => cleanup());
}
