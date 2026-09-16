# ADR-2026-09-10: Modern Rich-Text Support Chat UI Widget

## Status

Proposed — 2026-09-10. Awaiting human maintainer approval.

## Context

The current user support mechanism on the platform is a static floating button (`components/layout/support-button.tsx`) that redirects users to an external Google Form (`SUPPORT_FORM_URL`). As the user base expands past 30,000 active users and transaction volumes scale across EVM and Solana networks, users require real-time, interactive, in-app support without leaving their active trading or portfolio screens.

Key requirements for the support widget include:

1. **Rich Text Capability**: Support formatting (bold, italics, code blocks, lists, hyperlinks) for both inbound assistant messages and outbound user inquiries (such as transaction hashes or code snippets).
2. **File & Image Attachments**: Allow users to drag-and-drop or upload screenshots, transaction receipts, and log files with image preview and size validation.
3. **Modern Aesthetics**: Native dark-mode glassmorphism (`ws-glass`), Ark monochrome/silver palette, micro-animations, unread counter badges, and responsive elevation.
4. **Mobile Responsiveness**: Adapt dynamically between a floating card on desktop and an ergonomic full-height bottom sheet on mobile viewports that respects tab bars and `safe-area-inset-bottom`.
5. **Architectural Isolation**: Follow strict unidirectional layering (`components/ui/` / `hooks/` -> `components/layout/` / `features/`) without external vendor lock-in, with full localization across `en`, `de`, `es`, `fr`, and `pt`.

## Component Architecture

```
+-------------------------------------------------------------------------+
|                           DashboardShell                                |
|  +-------------------------------------------------------------------+  |
|  |                     SupportChatWidget                             |  |
|  |  +---------------------------+   +-----------------------------+  |  |
|  |  |   Floating Launcher       |   |      Chat Panel Window      |  |  |
|  |  |   (Avatar + Unread Badge) |   |  (Desktop: Card / Mobile:   |  |  |
|  |  |   (/support.png Mascot)   |   |   Slide-up Bottom Sheet)    |  |  |
|  |  +---------------------------+   +-----------------------------+  |  |
|  |                                                 |                 |  |
|  |         +---------------------------------------+                 |  |
|  |         |                                                         |  |
|  |  +------v------------------+  +--------------------------------+  |  |
|  |  |   Chat Header           |  |   Message List                 |  |  |
|  |  |   - Bot/Agent Status    |  |   - Rich-Text Markdown Parser  |  |  |
|  |  |   - Quick Clear / Close |  |   - Attachment Previews/Zoom   |  |  |
|  |  +-------------------------+  |   - Quick-Action FAQ Chips     |  |  |
|  |                               |   - Typing Indicator           |  |  |
|  |                               +--------------------------------+  |  |
|  |                                                 |                 |  |
|  |                               +-----------------v--------------+  |  |
|  |                               |   Message Composer             |  |  |
|  |                               |   - Rich-Text Toolbar (B/I/Code)|  |  |
|  |                               |   - File Attachment Dropzone   |  |  |
|  |                               |   - Auto-resizing Textarea     |  |  |
|  |                               |   - Send Action (Enter/Click)  |  |  |
|  |                               +--------------------------------+  |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+
```

## Decision

1. **Replace Static Link with Interactive Widget**: Upgrade `components/layout/support-button.tsx` into a modular `SupportChatWidget` component in `components/layout/support-chat/` or `components/layout/support-button.tsx`.
2. **Built-in Zero-Dependency Rich Text Renderer**: Implement a lightweight, secure Markdown/Rich-Text parser that sanitizes HTML and renders formatted text (bold, italic, inline code, multiline code blocks with copy action, hyperlinks with safe target/rel attributes, and lists).
3. **Attachment Pipeline with Local Preview**:
   - Provide file drag-and-drop and attachment button picker.
   - Enforce 10MB size limit and allowed MIME types (images, PDFs, text logs).
   - Generate local blob URLs for immediate thumbnail previews and interactive full-image zoom lightbox.
4. **Adaptive Responsive Layout**:
   - **Desktop (>= 768px)**: Floating card anchored at `bottom-6 right-6`, dimensioned at `380px x 560px` with `ws-glass` blur and subtle gradient border.
   - **Mobile (< 768px)**: Smooth slide-up sheet anchored above mobile tab bar with touch-drag dismiss affordance.
5. **Localization Completeness**:
   - Add comprehensive translation keys in all 5 supported locale dictionaries (`en.json`, `de.json`, `es.json`, `fr.json`, `pt.json`).

## Consequences

- Direct in-app support path without redirecting users out of their active sessions.
- Users can supply screenshots and markdown transaction logs immediately when requesting assistance.
- Fully self-contained UI with zero extra heavy third-party bundle overhead.
- Automated test suite covers markdown parsing, attachment validation, keyboard ergonomics, and responsive display logic.
