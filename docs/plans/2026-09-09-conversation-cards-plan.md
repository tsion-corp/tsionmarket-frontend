# Plan: four more cards on the conversation band

On `ui/2.0`. Decision: `docs/adr/ADR-2026-09-09-conversation-cards.md`.

| #   | Step                                                                          | Files                                                                               | Check                                                        |
| --- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | Lift the chess card's chrome into a frame; chess renders through it unchanged | `features/discovery/components/conversation-card.tsx` (new), `conversation-row.tsx` | existing row tests still pass; chess card pixel-same on 3001 |
| 2   | Live square rooms hook                                                        | `features/discovery/hooks/use-live-conversations.ts` (new), test                    | idle when hidden or failing; one request per minute          |
| 3   | Four cards, red-green per card: copy, links, live and idle faces              | `features/discovery/components/conversation-cards.tsx` (new) + tests                | jsdom tests                                                  |
| 4   | Row order and heading link; slide count test                                  | `conversation-row.tsx`, test                                                        | five slides, order fixed                                     |
| 5   | Copy in five catalogs                                                         | `messages/*.json`                                                                   | locale parity test                                           |
| 6   | Preflight, then the cards on 3001 at 768, 1280, 1520 px                       |                                                                                     | five gates green                                             |
