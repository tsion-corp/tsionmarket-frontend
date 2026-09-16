"use client";

import React, { useState } from "react";

export interface ChatAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  file?: File;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface AttachmentStagingProps {
  attachments: ChatAttachment[];
  onRemove: (id: string) => void;
}

export function AttachmentStagingList({ attachments, onRemove }: AttachmentStagingProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 border-t border-white/10 bg-white/[0.02] px-3 py-2">
      {attachments.map((att) => {
        const isImage = att.type.startsWith("image/");
        return (
          <div
            key={att.id}
            className="group relative flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 py-1 pr-2 pl-1.5 text-xs text-white/90 shadow-sm"
          >
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={att.url}
                alt={att.name}
                className="h-7 w-7 rounded border border-white/10 object-cover"
              />
            ) : (
              <div className="grid h-7 w-7 place-items-center rounded bg-white/10 font-mono text-[10px] text-white/70 uppercase">
                {att.name.split(".").pop() || "doc"}
              </div>
            )}
            <div className="flex max-w-[120px] flex-col">
              <span className="truncate text-[11px] leading-tight font-medium">{att.name}</span>
              <span className="text-[9px] text-white/50">{formatFileSize(att.size)}</span>
            </div>
            <button
              type="button"
              onClick={() => onRemove(att.id)}
              className="ml-1 rounded-full p-0.5 text-white/50 transition-colors hover:bg-white/15 hover:text-white"
              aria-label={`Remove ${att.name}`}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}

interface MessageAttachmentsProps {
  attachments: ChatAttachment[];
}

export function MessageAttachments({ attachments }: MessageAttachmentsProps) {
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);

  if (!attachments || attachments.length === 0) return null;

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {attachments.map((att) => {
          const isImage = att.type.startsWith("image/");
          if (isImage) {
            return (
              <button
                key={att.id}
                type="button"
                onClick={() => setZoomUrl(att.url)}
                className="group relative overflow-hidden rounded-xl border border-white/15 bg-black/40 transition-transform hover:scale-[1.02] focus:outline-none"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={att.url}
                  alt={att.name}
                  className="max-h-48 max-w-[240px] rounded-xl object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-colors group-hover:bg-black/20 group-hover:opacity-100">
                  <span className="rounded-full bg-black/70 px-2 py-1 text-[10px] text-white backdrop-blur">
                    Zoom
                  </span>
                </div>
              </button>
            );
          }

          return (
            <a
              key={att.id}
              href={att.url}
              download={att.name}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/90 transition-colors hover:bg-white/10"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-white/60"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <div className="flex flex-col">
                <span className="text-[12px] font-medium">{att.name}</span>
                <span className="text-[10px] text-white/50">{formatFileSize(att.size)}</span>
              </div>
            </a>
          );
        })}
      </div>

      {zoomUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="animate-in fade-in fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
          onClick={() => setZoomUrl(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl border border-white/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoomUrl}
              alt="Zoomed preview"
              className="max-h-[85vh] max-w-[85vw] object-contain"
            />
            <button
              type="button"
              onClick={() => setZoomUrl(null)}
              className="absolute top-3 right-3 rounded-full bg-black/60 p-2 text-white transition-colors hover:bg-black/90"
              aria-label="Close zoomed preview"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
