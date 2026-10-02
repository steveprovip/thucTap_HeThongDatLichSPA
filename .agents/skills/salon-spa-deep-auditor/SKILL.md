---
name: salon-spa-deep-auditor
description: Specialized Fullstack Deep Auditor & Auto-Fix Skill for the Salon & Spa Booking System. Combines Addy Osmani clean architecture, Anthropic agent verification protocols, and token-minimized surgical patch generation.
---

# Salon & Spa Fullstack Deep Auditor & Auto-Fix Skill

## 1. Domain Knowledge & System Architecture
- **Backend Architecture**: NestJS 10 + TypeORM + PostgreSQL 16.
  * Concurrency: `SERIALIZABLE` isolation + `SELECT ... FOR UPDATE` + PostgreSQL `EXCLUDE USING gist` (`appointments_no_overlap`).
  * Concurrency Fallback: When selected stylist is snatched in a race condition, automatically reallocate up to 5 times to the next available stylist with the least appointments.
  * Security: JWT Access (30m) / Refresh (7d), Argon2/Bcrypt, Role Guards (`admin`, `owner`, `receptionist`, `stylist`, `customer`).
  * Rate-Limiting: Sliding window rate limit (5 bookings/IP/hour, 10 failed lookups/IP/hour locking for 30 mins) returning HTTP 429 with `Retry-After`.
  * Timezone: Strictly enforce `Asia/Ho_Chi_Minh` (UTC+7) across all DateTime parsing, slot calculations, and CSV reports.
- **Frontend Architecture**: React 18 + Vite + TypeScript + Tailwind CSS.
  * Design System: Fresha-style Light Luxury UI (warm amber/rose/slate tokens, glassmorphism, Lucide icons).
  * Robustness: Local SVG gradient fallback for every service/stylist image, error boundary on dynamic routes, responsive 360px mobile viewport.

## 2. Standard Error Codes (`ERROR_CODES`)
- `ACCOUNT_LOCKED`: Login blocked after 5 failed attempts (returns `lockedUntil` timestamp + `Retry-After` header).
- `SHIFT_HAS_APPOINTMENTS`: Cannot delete shift containing appointments (returns list of affected appointments with IDs, times, and customer names).
- `SHIFT_OVERLAP`: Shift time overlaps with an existing shift (returns conflicting shift name, date, and time range).
- `SHIFT_OUTSIDE_OPERATING_HOURS`: Shift outside salon operating hours or on salon holiday.
- `MAX_APPOINTMENTS_EXCEEDED`: Max 3 pending appointments per phone number.
- `LOOKUP_LOCKED`: Lookup blocked after 10 failed attempts within 1 hour.
- `EXCEEDS_LONGEST_SHIFT`: Selected services duration exceeds the longest shift in the week.

## 3. Slash Command Workflows
- `/audit`: Scan `backend/src/` and `frontend/src/` against `docs/BACKLOG-MAPPING.md` and QA defect logs.
- `/reproduce [QA-ID]`: Trace exact code execution path and identify defect trigger conditions.
- `/fix [QA-ID]`: Generate single contiguous surgical diffs with zero regression.
- `/verify`: Run `npm run typecheck`, `npm run lint`, and unit/e2e test suites.
- `/ship`: Format commit messages according to Conventional Commits and verify clean tree.

## 4. Strict Quality Gates
- **Zero `any` in TypeScript**: Explicit interfaces for all DTOs, API payloads, and component props.
- **Idempotency**: All migrations, seeders, and batch scripts must run repeatedly without crashing.
- **No Hard Deletions on Referenced Data**: Services, Stylists, and Users with historical appointments must be soft-deactivated.
- **Ascii Credentials Only**: Emails and passwords must adhere to `IsAsciiEmail` and `IsSafePasswordCharset` validators.
