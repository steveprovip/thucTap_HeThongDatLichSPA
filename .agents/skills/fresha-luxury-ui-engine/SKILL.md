---
name: fresha-luxury-ui-engine
description: Fresha-style luxury UI system, responsive 4-step booking wizard, Lucide icons, offline SVG fallback media, and strict client validation.
---

# Fresha Luxury UI Engine & Frontend Standards

## 1. Design Aesthetics & Visual Tokens
- **Design Philosophy**: Fresha Light Luxury Salon aesthetic. Clean, airy, warm amber/rose/slate palette, soft shadows, rounded-2xl cards.
- **Iconography**: Use `lucide-react` icons exclusively. Standardize icon sizing (16px, 20px, 24px) and avoid tiny unclickable hitboxes (< 28px).
- **Responsive Layout**: Pixel-perfect on both mobile (360px) and desktop (1440px). Sticky summary footers on mobile booking wizards.

## 2. 4-Step Booking Wizard Workflow
1. **Step 1: Services Selection**:
   - Limit selection to max 5 services.
   - Calculate total duration and price dynamically.
   - Warn immediately if total duration exceeds the salon's longest shift in the week (`longestShiftInWeek`).
2. **Step 2: Date & Time Grid (15-min Slots)**:
   - Calendar / DateNav showing next 14 available days.
   - 15-minute slot grid grouped by Morning (08:00-12:00), Afternoon (12:00-17:00), Evening (17:00-21:00).
   - Past times and slots < 60 minutes from now are disabled.
3. **Step 3: Stylist Selection**:
   - Option: "Thợ bất kỳ" (Auto-assign) or specific stylist card.
   - Stylist card displays avatar, name, specialization, and rating.
   - Graceful offline fallback with initials and unique deterministic color hash if `avatarUrl` fails.
4. **Step 4: Customer Details & Confirmation**:
   - Vietnamese phone regex: `/^0[35789]\d{8}$/`.
   - Name and notes sanitization (prevent script injection).
   - Display dynamic VietQR Napas247 code upon booking confirmation.

## 3. Media & Upload Security
- Image size limit: <= 2MB. Allowed MIME: `image/jpeg`, `image/png`.
- Magic byte validation on backend (`\xFF\xD8\xFF` for JPEG, `\x89PNG\r\n\x1a\n` for PNG).
- SVG fallback generation: Render elegant gradient cards with capitalized initials when images are missing or broken.
