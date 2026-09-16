import {
  frag
} from "./lib.GMEH5BEF.js";

// ../bits/src/flairPicker.ts
async function flairPickerLoader(element) {
  var _a;
  const selectEl = element.querySelector("select");
  const pickerEl = element.querySelector(".flair-picker");
  const removeEl = element.querySelector(".emoji-remove");
  const isOpen = () => !pickerEl.classList.contains("none");
  const toggle = () => {
    if (isOpen() && (pickerEl.contains(document.activeElement) || document.activeElement === removeEl))
      selectEl.focus();
    pickerEl.classList.toggle("none");
  };
  const onEmojiSelect = (i) => {
    var _a2, _b;
    (_a2 = element.querySelector(".emoji-popup-button option")) == null ? void 0 : _a2.remove();
    if (i == null ? void 0 : i.id) selectEl.append(frag('<option value="' + i.id + '" selected></option>'));
    element.querySelector(".emoji-popup-button img").src = (_b = i == null ? void 0 : i.src) != null ? _b : "";
    toggle();
  };
  const onClick = async (e) => {
    if (e instanceof KeyboardEvent && e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    toggle();
    selectEl.focus();
  };
  await Promise.all([
    site.asset.loadCssPath("bits.flairPicker"),
    site.asset.loadEsm("bits.flairPicker", {
      init: {
        element: pickerEl,
        onEmojiSelect,
        close: (e) => {
          if (!isOpen() || selectEl.contains(e.target)) return;
          toggle();
        }
      }
    })
  ]);
  ["mousedown", "keydown"].forEach((t) => selectEl.addEventListener(t, onClick));
  removeEl.addEventListener("click", () => onEmojiSelect());
  (_a = element.closest(".dialog-content")) == null ? void 0 : _a.addEventListener("click", (e) => {
    if (!isOpen() || [selectEl, pickerEl].some((el) => el.contains(e.target))) return;
    e.preventDefault();
    toggle();
  });
  if (!CSS.supports("selector(:has(option))")) {
    element.querySelector("img").style.display = "block";
    removeEl.style.display = "block";
  }
}

export {
  flairPickerLoader
};
//# sourceMappingURL=lib.PQMRP22H.js.map
