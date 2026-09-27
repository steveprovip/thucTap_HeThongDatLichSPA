# LUXE SALON & SPA - SYSTEM ARCHITECTURE & COWOK CONTEXT

## 1. Project Overview
- **Project Path**: `F:\hoc_tap\thuc_tap\du_an`
- **Frontend Stack**: React 18, TypeScript, Vite, TailwindCSS 3.4, Lucide-React, Recharts.
- **Backend Stack**: NestJS 10, TypeORM, PostgreSQL 15, Nodemailer (Maildev).
- **Design Benchmark**: Fresha.com + GlossGenius (Light Luxury, Teal #0D9488, Slate-900 typography, soft shadows, zero-slop animations).

## 2. Standard Demo Credentials (MUST BE IDENTICAL ACROSS ALL FILES)
- **Admin**: `admin@salon.vn` / `Admin@123`
- **Owner**: `owner@salon.vn` / `Owner@123`
- **Receptionist**: `reception@salon.vn` / `Reception@123`
- **Stylists**: `stylist1@salon.vn` ... `stylist5@salon.vn` / `Stylist@123`
- **Customer**: No account needed (Lookup by Phone or 8-character code `SL-XXXXXX`).

## 3. Strict Development Rules & Bugfix Directives
1. **Offline-Resilient Images**:
   - Never rely solely on external Unsplash URLs without robust fallback.
   - Provide local SVG / CSS gradient placeholders (`src/components/Media.tsx`) for zero broken image boxes.
2. **Customer CRM & Walk-In Logic**:
   - New phone numbers must initialize with 0 previous visits and empty history.
   - Walk-in appointments must immediately append to the global state and trigger live refresh on `DayTimelinePage` and `AppointmentsListPage`.
3. **Service Deletion Guard**:
   - If a service has referenced appointments, HARD DELETION IS FORBIDDEN.
   - Automatically disable the Delete button or convert action to "Ngừng kinh doanh" (Inactive toggle).
4. **New Staff Creation**:
   - When Admin creates a new staff, generate and prominently display the temporary password in a success dialog with a "Sao chép mật khẩu" button.
5. **Navigation Ergonomics**:
   - Ensure every detail page, wizard step, invoice preview, and sub-view includes a clear, accessible "Quay lại" (Back) button.
6. **Build Integrity**:
   - `npm run build --prefix frontend` MUST finish with 0 TypeScript errors and 0 warnings.
