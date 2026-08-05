"use client";

import { useEffect, type RefObject } from "react";

// Every earn form validates on submit and sets field errors via the shared
// Field/TextField/TextAreaField primitives, which mark the input
// aria-invalid="true". On a long form, submitting from below the fold left
// the error rendered off-screen with nothing telling the user why nothing
// happened. This scrolls the first invalid field into view and focuses it
// each time a failed validation produces a new error set.
export function useScrollToFirstError(
  formRef: RefObject<HTMLFormElement | null>,
  errors: Record<string, string | undefined>
) {
  useEffect(() => {
    if (!Object.values(errors).some(Boolean)) return;
    const field = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!field) return;
    // jsdom (and, per spec, any environment without a layout engine) has no
    // scrollIntoView; skip the scroll there rather than throw, focus still works.
    if (typeof field.scrollIntoView === "function") {
      field.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    field.focus({ preventScroll: true });
  }, [errors, formRef]);
}
