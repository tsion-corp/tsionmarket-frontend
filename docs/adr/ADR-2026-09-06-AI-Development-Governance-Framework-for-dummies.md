# ADR-2026-09-06: AI Development Control & Governance Framework (Plain English Guide / ADR for Dummies)

## Status

Accepted — 2026-09-06

---

## What Is This Document?

This document is the simplified, accessible companion to the formal technical ADR [`ADR-2026-09-06-AI-Development-Governance-Framework.md`](ADR-2026-09-06-AI-Development-Governance-Framework.md). It explains what the AI Development Control & Governance Framework does and why it exists in simple terms for non-technical stakeholders, product managers, and human reviewers.

---

## The Core Problem

When AI coding assistants write code quickly, they can accidentally:

1. Break codebase architecture and conventions.
2. Ship untested code or hide bugs using silent `try/catch` blocks.
3. Push changes directly to production without testing.
4. Approve their own plans without human oversight.

---

## The 7-Pillar Solution in Plain English

1. **AI Agents Must Use Isolated Worktrees, Not `main`**: AI agents are forbidden from committing or pushing directly to `main`. Every task must happen on its own clean branch/worktree (`git worktree add`).
2. **Humans Decide, AI Proposes (Dual ADR Requirement)**: AI agents cannot approve their own big architectural ideas. They must write two ADRs—a technical ADR and this plain-English "ADR for Dummies"—and wait for explicit human approval before touching code.
3. **Write a Failing Test First (Red-Green TDD)**: When fixing a bug, the AI agent must write a test that fails _before_ fixing the bug, proving the bug existed and is now actually fixed.
4. **No Hiding Errors**: AI agents are strictly forbidden from hiding bugs behind silent `try/catch` blocks, using `@ts-ignore`, commenting out failing tests, or returning fake fallback data.
5. **Preflight Auto-Check**: Before any code is pushed to GitHub, an automated preflight script (`./scripts/preflight.sh`) runs formatting, linting, typechecking, tests, and build checks to guarantee zero errors.
6. **Feature Flags for New Stuff**: New features default to disabled ("off") so experimental code never breaks live user experience.
7. **Release Notes & Verification Proof**: Every Pull Request must include release notes explaining what changed, how it was tested, and its user scenario impact.
