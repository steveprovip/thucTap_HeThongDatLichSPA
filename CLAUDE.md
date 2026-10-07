# CLAUDE.md — Claude Opus 5.5 High Cowork Protocol & Project Context

## 1. Project Overview & Repository Context
- **Project**: Hương Sen Salon & Spa Booking System (`F:\hoc_tap\thuc_tap\du_an`).
- **Stack**: NestJS 10, TypeORM, PostgreSQL 16, React 18, Vite, Tailwind CSS, Lucide Icons.
- **Scope**: 4 Sprints · 39 User Stories · 165 Story Points (`docs/BACKLOG-MAPPING.md`, `docs/requirements/3. Hệ thống đặt lịch Salon Spa.xlsx`).
- **Author**: steveprovip <158487753+steveprovip@users.noreply.github.com>. Zero AI branding/co-author tags allowed.

## 2. Integrated Agent Skills (`.agents/skills/`)
- `claude-opus-cowork-optimizer`: Ultra-compressed communication, surgical diffs, 80% token minimization, strict TypeScript.
- `hoyoplay-desktop-experience`: 1-click launcher, headless background services, zero terminal popups, live GitHub update.
- `customer-journey-ux-auditor`: Customer & Salon Owner persona simulation, UX friction audit, smooth handoff.
- `salon-spa-deep-auditor`: Deep audit & verification protocol against 39 User Stories & 23 QA points.
- `nestjs-postgres-concurrency-guard`: SERIALIZABLE concurrency, FOR UPDATE locks, Postgres EXCLUDE overlapping constraints.
- `fresha-luxury-ui-engine`: Fresha light luxury UI, 4-step booking wizard, high data-density without gaps.
- `vietqr-security-ratelimit`: Dynamic Napas247 VietQR EMVCo CRC-16, sliding-window rate limit (429).
- `tdd-e2e-regression-suite`: 100% test isolation, Supertest E2E on PostgreSQL.

## 3. Essential Commands
```powershell
# Typecheck & Lint
npm --prefix backend run typecheck; npm --prefix backend run lint
npm --prefix frontend run typecheck; npm --prefix frontend run lint

# Tests
npm --prefix backend run test
npm --prefix backend run test:e2e
npm --prefix frontend run test

# 1-Click Launch & Update
./HoYoSalon.bat
node scripts/launcher.mjs update
```
