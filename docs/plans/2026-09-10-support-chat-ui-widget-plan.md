# Plan: Support Chat UI Widget Component with Rich Text & Attachments

Decision: `docs/adr/ADR-2026-09-10-support-chat-ui-widget.md`.
Companion: `docs/adr/ADR-2026-09-10-support-chat-ui-widget-for-dummies.md`.
Branch: `feat/support-chat-ui`.

## Scope

1. **Rich Text Formatting Engine & UI**:
   - Sanitized markdown parser handling headers, bold, italics, inline code, multiline fenced code blocks with copy button, bullet/numbered lists, and sanitized hyperlinks.
   - Formatting toolbar with quick action buttons (Bold, Italic, Code, Link, List) that wrap current selection.
2. **File & Image Attachments System**:
   - Drag-and-drop zone over chat window + attachment picker button (`image/*,.pdf,.txt,.log,.json`).
   - Staged attachment preview chip strip with thumbnail, filename, file size, and remove button.
   - Image lightbox / zoom modal for attached screenshots.
   - File validation (max 10MB, warning toasts on invalid types/oversized files).
3. **Chat Widget Architecture**:
   - `components/layout/support-chat/`:
     - `support-chat-widget.tsx`: Root floating widget managing open/minimized state, responsive layout (floating window on desktop, bottom sheet on mobile), unread counts, and integration with `DashboardShell`.
     - `chat-header.tsx`: Support online status, mascot avatar, live indicator, minimize and close actions.
     - `chat-message-list.tsx`: Scrollable message stream with timestamps, agent avatar, typing indicator, quick FAQ prompt chips, and rich text bubble renderer.
     - `chat-composer.tsx`: Auto-growing textarea, rich text toolbar, attachment dropzone, drag-and-drop overlay, and submit actions.
     - `rich-text-content.tsx`: Safe markdown / rich-text rendering component with code block syntax styling and copy support.
     - `attachment-preview.tsx`: Inline thumbnail/file previews and lightbox viewer.
4. **Localization**:
   - Translate all new string keys across 5 locales in `messages/{en,de,es,fr,pt}.json` under `"supportChat"` namespace.
5. **Testing**:
   - Vitest unit & integration tests covering rich text parsing, attachment staging/validation, message submission lifecycle, keyboard shortcuts (Enter / Shift+Enter), and responsive rendering.
6. **Preflight Quality Gates**:
   - Execute `./scripts/preflight.sh` covering format, lint, typecheck, tests, and production build.

## Steps

1. **Red Phase (Tests)**:
   - Create `components/layout/support-chat/rich-text-content.test.tsx` and `components/layout/support-chat/support-chat-widget.test.tsx`.
   - Write failing test specs for markdown formatting (bold, italics, code, links), attachment file size validation, message send triggering, and open/close toggles.
2. **Green Phase (Implementation)**:
   - Implement `rich-text-content.tsx` with robust, safe markdown parsing.
   - Implement `attachment-preview.tsx` with image blob URLs and lightbox zoom.
   - Implement `chat-composer.tsx` with textarea auto-resize, rich text actions, drag & drop, and attachment upload handler.
   - Implement `chat-header.tsx` and `chat-message-list.tsx` with simulated typing and quick FAQ response chips.
   - Implement `support-chat-widget.tsx` and integrate it smoothly into `components/layout/support-button.tsx` / `DashboardShell`.
3. **Localization**:
   - Populate `"supportChat"` translation namespaces in `messages/en.json`, `messages/de.json`, `messages/es.json`, `messages/fr.json`, and `messages/pt.json`.
4. **Verification**:
   - Run Vitest suite: `pnpm test`.
   - Run `./scripts/preflight.sh` to ensure all 5 quality gates pass cleanly.
   - Test interactively in desktop and mobile viewports.
