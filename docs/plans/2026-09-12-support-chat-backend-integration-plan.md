# Plan: Support Chat Backend Integration with AI Assistant & Chatwoot API

Decision: `docs/adr/ADR-2026-09-12-support-chat-backend-integration.md`.
Companion: `docs/adr/ADR-2026-09-12-support-chat-backend-integration-for-dummies.md`.
Branch: `feat/support-chat-ui`.

---

## Scope

1. **Proxy Route Handler (`app/api/support-chat/route.ts`)**:
   - Accepts POST requests with `{ message: string }`.
   - Zod validation for request body.
   - Forwards request to `https://support.tsionark.com/api/demo-chat`.
   - Validates response payload structure using Zod.
   - Returns `{ ok: true, reply: string, needsHuman: boolean }`.
   - Includes timeout and error handling.

2. **Integration into `SupportChatWidget` (`components/layout/support-chat/support-chat-widget.tsx`)**:
   - Replace the mock timer simulation (`simulateAgentResponse`) with live API calls to `/api/support-chat`.
   - Handle loading / typing state while awaiting AI response.
   - Fallback error notification if network fails.
   - Preserve rich markdown formatting and attachment display in the chat stream.

3. **Unit & Integration Testing (TDD - Red/Green)**:
   - `app/api/support-chat/route.test.ts`: Test Zod validation, successful bot response mapping, error handling, and timeout behavior.
   - `components/layout/support-chat/support-chat-widget.test.tsx`: Update widget tests to verify live message sending, API response rendering, and error recovery.

4. **Preflight Quality Gates**:
   - Run `./scripts/preflight.sh` to ensure formatting, linting, typechecking, Vitest tests, and Next.js build pass cleanly.

---

## Implementation Steps

1. **Red Phase (Tests)**:
   - Write unit tests for `app/api/support-chat/route.test.ts` asserting proxy behavior and Zod validation.
   - Update `support-chat-widget.test.tsx` to assert real API call integration.
2. **Green Phase (Implementation)**:
   - Implement `app/api/support-chat/route.ts`.
   - Update `support-chat-widget.tsx` to call the route handler.
3. **Verification**:
   - Run Vitest suite: `pnpm test`.
   - Run `./scripts/preflight.sh`.
