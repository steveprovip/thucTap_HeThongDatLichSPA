---
name: vietqr-security-ratelimit
description: VietQR EMVCo Napas247 dynamic QR code generation, CRC-16 checksums, sliding-window rate limiting, and brute-force protection.
---

# VietQR Payment & API Security Rate-Limit Skill

## 1. VietQR Napas247 Dynamic Standard
- **EMVCo Spec Compliance**:
  * Payload format indicator (`000201`), Point of Initiation (`010212` for dynamic).
  * Merchant Account Information (Tag `38`): GUID `A000000727`, Beneficiary Org ID (Bin 9704xx), Account Number.
  * Transaction Currency (`5303704` for VND), Transaction Amount (`54xx`), Country Code (`5802VN`).
  * Additional Data Field (Tag `62`): Reference / Bill Number (Tag `01` or `08`).
  * CRC-16 (Tag `6304`): CCITT polynomial `0x1021`, initial value `0xFFFF`.
- **Payment Verification Flow**:
  * QR is rendered only AFTER the invoice or booking entity is persisted in PostgreSQL.
  * Avoid static hardcoded strings; dynamically construct QR string and verify checksum in test suites.

## 2. Rate Limiting & Anti-Abuse Protection
- **Booking Rate Limit**: Max 5 booking submissions per IP per hour. Return HTTP `429 Too Many Requests` with `Retry-After: 3600`.
- **Booking Per Phone Limit**: Max 3 pending/uncompleted appointments per customer phone number.
- **Lookup Brute-Force Guard**:
  * Max 10 failed lookup attempts per IP per hour.
  * When threshold exceeded: lock lookup access for 30 minutes (`LOOKUP_LOCKED`).
  * Lookup attempts with valid codes do NOT reset the failure counter if preceding attempts were suspicious.
- **CSV Data Export**:
  * Prepend UTF-8 BOM (`\uFEFF`) to all CSV revenue exports to ensure Microsoft Excel parses Vietnamese accented characters flawlessly.
