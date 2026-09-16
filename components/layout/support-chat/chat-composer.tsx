"use client";

import React, { useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { AttachmentStagingList, type ChatAttachment } from "./attachment-preview";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

interface ChatComposerProps {
  onSend: (text: string, attachments: ChatAttachment[]) => void;
  disabled?: boolean;
}

export function ChatComposer({ onSend, disabled = false }: ChatComposerProps) {
  const t = useTranslations("supportChat");
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const adjustTextareaHeight = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    adjustTextareaHeight();
  };

  const processFiles = (files: FileList | File[]) => {
    setErrorNotice(null);
    const validAttachments: ChatAttachment[] = [];

    Array.from(files).forEach((file) => {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setErrorNotice(t("fileTooLarge", { max: "10MB" }));
        return;
      }

      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const url = URL.createObjectURL(file);

      validAttachments.push({
        id,
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        url,
        file,
      });
    });

    if (validAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...validAttachments]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      e.target.value = "";
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.url) {
        URL.revokeObjectURL(target.url);
      }
      return prev.filter((a) => a.id !== id);
    });
  };

  const applyFormatting = (prefix: string, suffix = prefix, placeholder = "text") => {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const currentText = el.value;
    const selectedText = currentText.substring(start, end) || placeholder;

    const nextText =
      currentText.substring(0, start) + prefix + selectedText + suffix + currentText.substring(end);

    setText(nextText);

    setTimeout(() => {
      el.focus();
      const newCursorPos = start + prefix.length + selectedText.length;
      el.setSelectionRange(start + prefix.length, newCursorPos);
      adjustTextareaHeight();
    }, 0);
  };

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || disabled) return;

    onSend(trimmed, attachments);
    setText("");
    setAttachments([]);
    setErrorNotice(null);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, attachments, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !disabled;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative border-t border-white/10 bg-black/40 transition-colors ${
        isDragging ? "bg-white/[0.08] ring-2 ring-white/30 ring-inset" : ""
      }`}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.txt,.log,.json"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Staged attachments list */}
      <AttachmentStagingList attachments={attachments} onRemove={handleRemoveAttachment} />

      {/* Error notice if file was too large */}
      {errorNotice && (
        <div className="flex items-center justify-between border-t border-red-500/20 bg-red-500/15 px-3 py-1.5 text-[11px] text-red-300">
          <span>{errorNotice}</span>
          <button
            type="button"
            onClick={() => setErrorNotice(null)}
            className="text-red-300/80 hover:text-red-200"
          >
            ×
          </button>
        </div>
      )}

      {/* Formatting toolbar */}
      <div className="flex items-center justify-between px-3 pt-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => applyFormatting("**")}
            aria-label={t("formatBold")}
            title={t("formatBold")}
            className="grid size-6 place-items-center rounded text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <strong className="text-[12px] font-bold">B</strong>
          </button>
          <button
            type="button"
            onClick={() => applyFormatting("*")}
            aria-label={t("formatItalic")}
            title={t("formatItalic")}
            className="grid size-6 place-items-center rounded text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <em className="text-[12px] italic">I</em>
          </button>
        </div>

        {/* Attach File Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label={t("attachFile")}
          title={t("attachFile")}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
          <span>{t("attach")}</span>
        </button>
      </div>

      {/* Input area & send action */}
      <div className="flex items-end gap-2 p-3">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={t("placeholder")}
          rows={1}
          disabled={disabled}
          className="ws-no-scrollbar max-h-[120px] min-h-[38px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] text-white placeholder-white/40 focus:outline-none"
        />

        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          aria-label={t("send")}
          className={`grid size-9 place-items-center rounded-xl transition-all ${
            canSend
              ? "bg-white text-black shadow-[0_2px_12px_rgba(255,255,255,0.2)] hover:scale-105 active:scale-95"
              : "cursor-not-allowed bg-white/10 text-white/30"
          }`}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
