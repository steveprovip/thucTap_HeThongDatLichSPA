---
name: nestjs-postgres-concurrency-guard
description: Concurrency control, PostgreSQL SERIALIZABLE transaction isolation, row locking, and EXCLUDE constraints for NestJS and TypeORM.
---

# NestJS + PostgreSQL Concurrency Guard Skill

## 1. Transaction Isolation & Locking Architecture
- **Isolation Level**: Always execute booking allocations under `SERIALIZABLE` isolation:
  ```typescript
  await queryRunner.startTransaction('SERIALIZABLE');
  ```
- **Pessimistic Locking**: Lock relevant stylist shifts and appointments to prevent race conditions:
  ```typescript
  const shift = await queryRunner.manager
    .createQueryBuilder(Shift, 'shift')
    .setLock('pessimistic_write')
    .where('shift.id = :id', { id })
    .getOne();
  ```
- **PostgreSQL EXCLUDE Constraint**: Enforce non-overlapping appointments at database level:
  ```sql
  CONSTRAINT appointments_no_overlap EXCLUDE USING gist (
    stylist_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  ) WHERE (status NOT IN ('cancelled', 'no_show'))
  ```

## 2. Dynamic Stylist Auto-Reallocation Protocol
- When booking with "Any Stylist" (`stylistId: null`):
  1. Retrieve all active stylists assigned to services requested.
  2. Order by fewest confirmed/pending appointments in the day (`activeAppointmentCount ASC`).
  3. Attempt transaction. If slot collision occurs (HTTP 409 / PostgreSQL code 23P01), retry transaction with next best stylist (up to 5 retries).
  4. Ensure TypeORM QueryBuilder maps `fullName` and `avatarUrl` properly (never use raw SQL `SELECT s.*` casting without entity hydration).

## 3. Idempotent Migrations & Seeders
- Never call `Base.metadata.create_all()` in seeders if migrations manage schema.
- Use `sa.inspect(op.get_bind())` or `IF NOT EXISTS` for table and column creation.
- Keep admin accounts safe: never allow deleting or deactivating the last active administrator (`SELECT COUNT(*) ... FOR UPDATE`).
