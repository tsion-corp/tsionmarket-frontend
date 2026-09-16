---
date: 2026-09-10
feature: Support chat UI widget component
scope: support, chat, layout, desktop and mobile
scenario-impact: none
---

# Support chat UI widget component

## What changed

- **In-App Interactive Support Chat Widget**: Upgraded the static `SupportButton` into an interactive `SupportChatWidget` component (`components/layout/support-chat/`) anchored at the bottom right.
- **Rich Text & Markdown Rendering**: Built-in zero-dependency Markdown parser and renderer (`rich-text-content.tsx`) supporting bold, italics, inline code, multiline fenced code blocks with copy snippet action, bulleted/numbered lists, and sanitized hyperlinks.
- **File & Image Attachments**: Multi-file attachment staging (`attachment-preview.tsx`) with image thumbnails, format/size formatting, drag-and-drop dropzone, max 10MB size limit check, and interactive high-res image zoom lightbox.
- **Adaptive Responsive Layout**:
  - **Desktop (md+)**: Sleek floating glass window (`380px x 580px`) with `ws-glass` blur and dark monochrome palette.
  - **Mobile (<md)**: Clean full-screen sheet overlay with edge-to-edge backdrop blur and safe-area padding (`safe-area-inset-top` and `safe-area-inset-bottom`).
- **Quick FAQ Suggestions & Instant Responses**: Quick starter topic chips (Deposit Issues, Trade / Order, Security, Report a Bug) and automated agent responses.
- **Full 5-Locale Internationalization**: Added complete `supportChat` translation dictionaries across `en`, `de`, `es`, `fr`, and `pt` without hardcoding brand names.

## Tests

- `components/layout/support-chat/rich-text-content.test.tsx` (plain text, bold, italic, inline code, code blocks, lists, hyperlinks).
- `components/layout/support-chat/attachment-preview.test.tsx` (file size formatting, staging list, remove actions, image zoom lightbox).
- `components/layout/support-chat/support-chat-widget.test.tsx` (closed floating button, unread counts, open/close transitions, text sending, toolbar actions, FAQ chips).
- `lib/i18n-catalogs.test.ts` (ensuring zero brand name leaks across all 5 catalogs).
- `./scripts/preflight.sh` passing all 5 quality gates cleanly.
