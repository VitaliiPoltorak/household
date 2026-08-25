---
name: surfacing-issues
description: How to handle a bug, design flaw, or other problem found outside the current task's scope — when to file a GitHub issue vs. fix inline, and how to keep the current PR reviewable.
---

## Surfacing problems as issues

When you notice a **potential problem outside the scope of the task you're working on** — a bug, a design flaw, a missing edge case, a stale comment, a place where a past-audit rule was quietly violated — do NOT silently fix it in the current PR (scope creep) and do NOT drop it on the floor.

Instead:
1. Note it briefly in your PR body under a "Follow-up findings" bullet, and
2. Propose creating a GitHub issue for it. Include: the location (`file.ts:LN`), the concrete symptom, the impact (who/what breaks and when), and a suggested fix or acceptance criteria. Cross-link with the PR/issue that surfaced it.

Ask the maintainer before opening the issue unless they've already said "just file it". This keeps the current PR reviewable and stops known-broken behaviour from rotting into the codebase under "we'll get to it later".

Examples of things worth an issue: naive `SUM` across currencies without a currency dimension, an unscoped `findOne(id)` that should be `findOne(id, householdId)`, a Kafka consumer that catch-logs-and-advances, a Redis `GET`-then-`DEL` on a single-use token, a `Number()` sum of decimals from Postgres.
