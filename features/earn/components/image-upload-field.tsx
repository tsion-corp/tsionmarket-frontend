"use client";

import { useId, useRef, useState } from "react";
import { useImageUpload } from "@/features/earn/hooks/use-image-upload";
import { ACCEPTED_IMAGE_TYPES, type ImageSource } from "@/features/earn/lib/api/images";
import { friendlyError } from "@/lib/errors";

interface ImageUploadFieldProps {
  label: string;
  // The stored URL, once an upload has completed.
  value: string;
  onChange: (url: string) => void;
  // Which storage prefix the image belongs under. The service validates it on
  // both calls, so it is a property of the field rather than of the file.
  source: ImageSource;
  hint?: string;
  error?: string;
  required?: boolean;
}

// Uploads a file from the user's device and hands back the URL to store. The
// native file input stays in the DOM (hidden, not removed) so it is still
// reachable by keyboard and by assistive tech.
export function ImageUploadField({
  label,
  value,
  onChange,
  source,
  hint,
  error,
  required = false,
}: ImageUploadFieldProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, isUploading } = useImageUpload(source);
  const [failure, setFailure] = useState<string | null>(null);

  const message = error ?? failure;

  async function onPick(file: File | undefined) {
    if (!file) return;
    setFailure(null);
    try {
      onChange(await upload(file));
    } catch (uploadError) {
      setFailure(friendlyError(uploadError, "That image couldn't be uploaded."));
    } finally {
      // Clearing the input lets the same file be picked again after a failure.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-sans text-[12.5px] font-medium text-white/70">
        {label}
        {required ? <span className="text-white/35"> *</span> : null}
      </span>

      <div className="flex items-center gap-3">
        {value ? (
          // An arbitrary remote URL, so a plain img rather than the Next loader.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt=""
            className="size-14 shrink-0 rounded-[12px] border border-white/10 object-cover"
          />
        ) : (
          <div className="ws-inset grid size-14 shrink-0 place-items-center rounded-[12px] font-sans text-[11px] font-normal text-white/30">
            None
          </div>
        )}

        <label
          htmlFor={id}
          className="ws-inset cursor-pointer rounded-full px-4 py-2 font-sans text-[12.5px] font-semibold text-white transition-colors hover:border-white/30"
        >
          {isUploading ? "Uploading…" : value ? "Replace" : "Choose image"}
        </label>
        <input
          id={id}
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          disabled={isUploading}
          aria-invalid={!!message}
          aria-describedby={message ? `${id}-error` : undefined}
          onChange={(event) => void onPick(event.target.files?.[0])}
          className="sr-only"
        />
      </div>

      {hint && !message ? (
        <span className="font-sans text-[11.5px] font-normal text-white/40">{hint}</span>
      ) : null}
      {message ? (
        <span
          id={`${id}-error`}
          role="alert"
          className="text-down font-sans text-[12px] font-normal"
        >
          {message}
        </span>
      ) : null}
    </div>
  );
}
