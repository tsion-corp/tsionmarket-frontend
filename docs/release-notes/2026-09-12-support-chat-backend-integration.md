---
date: 2026-09-12
feature: Support chat backend integration with FastAPI AI Bot and Chatwoot
scope: support-chat, api, proxy, websocket, layout
scenario-impact: updated
---

# Support chat backend integration with FastAPI AI Bot and Chatwoot

## What changed

- **Live AI Support Proxy Route (`app/api/support-chat/route.ts`)**:
  - Implemented Next.js proxy route handler with Zod request (`{ message: string }`) and response validation.
  - Forwarded queries to the FastAPI AI agent (`https://support.tsionark.com/api/demo-chat`) with a 45-second abort controller timeout.
  - Enforced strict domain mapping and error boundary recovery to prevent CORS issues.
- **Client Service & UI Integration (`lib/support-chat/` & `components/layout/support-chat/`)**:
  - Connected `SupportChatWidget` to the same-origin `/api/support-chat` proxy and ActionCable WebSocket stream.
  - Added multi-turn message history persistence in `localStorage`.
  - Added support for live AI answers synthesized from the World Street knowledge base.
- **Environment Configuration**:
  - Added `SUPPORT_CHAT_API_URL` to `.env` and `.env.example`.

## Tests

- `app/api/support-chat/route.test.ts` (Zod validation, proxying, error handling, timeout recovery).
- `lib/support-chat/client.test.ts` (API client query dispatch).
- `lib/support-chat/chatwoot-client.test.ts` (session initiation and message serialization).
- `components/layout/support-chat/support-chat-widget.test.tsx` (real message flow, AI response rendering, FAQ chips).
- `./scripts/preflight.sh` passing all 5 quality gates cleanly.
