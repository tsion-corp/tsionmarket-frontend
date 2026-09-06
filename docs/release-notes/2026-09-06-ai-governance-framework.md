---
scenario-impact: none
---

# Release Note: AI Development Control & Quality Governance Framework

## Summary

Established the **7-Pillar AI Control & Governance Framework** for `wsws-frontend`. This release adds local preflight scripts, pre-push git hooks, multi-agent instruction rulebooks (`AGENTS.md`, `GEMINI.md`, `QWEN.md`, `CODEX.md`), dual-ADR documentation under `docs/adr/`, and CI governance quality gates.

## Verification

- Preflight script `./scripts/preflight.sh` executed cleanly (Prettier, ESLint, TypeScript, Vitest 2044 unit tests, Next.js production build).
- Release notes check `scripts/check_release_notes.sh` verified.
- Zero lines of application runtime code (`app/`, `features/`, `components/`, `lib/`) were altered.
