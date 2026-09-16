(() => {
  const form = document.querySelector("form[data-computer-setup]");
  if (!(form instanceof HTMLFormElement)) return;

  const variantInput = form.querySelector("#computer-variant");
  const picker = form.querySelector(".mselect");
  const toggle = form.querySelector(".mselect__toggle");
  const label = form.querySelector(".mselect__label");
  const fenFields = form.querySelector(".from-position-fields");
  const fenInput = form.querySelector("#computer-initial-fen");
  const submit = form.querySelector('button[type="submit"]');
  const submitLabel = form.querySelector(".submit-label");

  if (
    !(variantInput instanceof HTMLInputElement) ||
    !(picker instanceof HTMLElement) ||
    !(toggle instanceof HTMLInputElement) ||
    !(label instanceof HTMLLabelElement)
  ) {
    return;
  }

  const selectVariant = (item) => {
    const key = item.dataset.variant;
    const name = item.querySelector(".name")?.textContent?.trim();
    const description = item.querySelector(".desc")?.textContent?.trim();
    const icon = item.dataset.icon;
    if (!key || !name || !description) return;

    variantInput.value = key;
    picker.querySelectorAll(".mselect__item").forEach((row) => {
      row.classList.toggle("current", row === item);
      row.setAttribute("aria-selected", row === item ? "true" : "false");
    });
    label.querySelector(".name").textContent = name;
    label.querySelector(".desc").textContent = description;
    if (icon) label.querySelector(".icon")?.setAttribute("data-icon", icon);
    toggle.checked = false;

    const fromPosition = key === "fromPosition";
    if (fenFields instanceof HTMLElement) fenFields.hidden = !fromPosition;
    if (fenInput instanceof HTMLInputElement) {
      fenInput.required = fromPosition;
      if (fromPosition) requestAnimationFrame(() => fenInput.focus());
    }
  };

  picker.querySelectorAll(".mselect__item").forEach((item) => {
    item.addEventListener("click", () => selectVariant(item));
    item.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      selectVariant(item);
    });
  });

  form.addEventListener("submit", () => {
    if (!(submit instanceof HTMLButtonElement)) return;
    submit.disabled = true;
    submit.classList.add("is-loading");
    if (submitLabel instanceof HTMLElement) submitLabel.textContent = "Starting game...";
  });
})();
