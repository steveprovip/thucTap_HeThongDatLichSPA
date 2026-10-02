---
name: tdd-e2e-regression-suite
description: Test-Driven Development (TDD) protocols, Supertest E2E testing, high-concurrency race condition testing, and reverse verification on PostgreSQL.
---

# TDD & E2E Regression Testing Suite Skill

## 1. Test Architecture & Harness
- **Unit Testing**: Jest / Vitest for isolated service logic, helper functions, date calculations, and shift rules.
- **E2E Testing**: Supertest against real PostgreSQL 16 test instances.
- **Isolation Principle**:
  * Generate dynamic random phone numbers (e.g. `098` + 7 random digits) for each test run to avoid hitting the 3-booking/phone limit during repetitive test execution.
  * Clean up test artifacts or wrap tests in database transaction rollbacks where applicable.

## 2. Concurrency Race Condition Testing
- Spawn 20 parallel requests attempting to book the identical stylist and time slot.
- Expected outcome: Exactly 1 request succeeds (HTTP 201), remaining 19 fail with HTTP 409 (`SLOT_UNAVAILABLE` or `23P01 exclusion violation`) or gracefully reallocate to alternate stylists.
- Zero double bookings allowed in the database.

## 3. Reverse Verification Protocol (Negative Testing)
- Before approving any fix:
  1. Verify the new test fails against the unpatched codebase (HEAD).
  2. Verify the new test passes cleanly against the patched codebase.
  3. Ensure 0 regressions across all existing test suites.
