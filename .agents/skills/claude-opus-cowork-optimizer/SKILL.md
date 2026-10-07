---
name: claude-opus-cowork-optimizer
description: Elite instructions and execution protocol for Claude Opus 5.5 High Cowork. Optimizes token usage, enforces surgical diffs, eliminates conversational fluff, and guarantees business invariants.
---

# Claude Opus 5.5 High Cowork Protocol

## 1. Operating Rules
- **Direct Technical Execution**: 0% preamble, 0% conversational filler. Start directly with the required analysis, code diff, or execution step.
- **Surgical Diff First**: Never rewrite entire files when modifying existing logic. Output targeted line edits.
- **Strict TypeScript Typing**: No `any` types allowed. Every DTO, entity, state, and hook parameter must be explicitly typed.
- **Zero Invariant Drift**: Protect all 5 Core Salon Spa Invariants:
  1. Service durations are multiples of 15m (15–240m), price >= 0.
  2. 15-minute slot calculations, block past and <60m slots.
  3. Strict concurrency control: `SERIALIZABLE` + `FOR UPDATE` + Postgres `EXCLUDE` constraint (`appointments_no_overlap`).
  4. Rate limits: 5 bookings/IP/hour, 3 active bookings/phone, 10 lookups/hour.
  5. Soft-delete / reference preservation for historical audit and financial records.
