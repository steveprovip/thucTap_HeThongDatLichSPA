# 🚀 TÍCH HỢP VIBE TESTING (TESTERARMY E2E) CHO DỰ ÁN SALON - SPA BOOKING

Hệ thống kiểm thử tự động thế hệ mới kết hợp giữa **AI Agent (ngôn ngữ tự nhiên)** và **Deterministic Testing (Playwright & TypeScript)** đã được tích hợp hoàn chỉnh vào dự án Salon - Spa.

---

## ⚡ 1. CÁC FILE CHẠY 1-CLICK (DOUBLE CLICK LÀ CHẠY NGAY)

Tất cả đã sẵn sàng trong thư mục gốc `F:\hoc_tap\thuc_tap\du_an`:

| File 1-Click | Mục đích | Điều kiện |
| :--- | :--- | :--- |
| **`1-Click-Run-E2E-Tests.bat`** | Chạy toàn bộ test suites kiểm thử giao diện & luồng nghiệp vụ Salon Spa | Không cần API key |
| **`1-Click-Run-Headed-UI.bat`** | Mở trình duyệt Chromium thật để bạn tận mắt xem thao tác kiểm thử tự động | Không cần API key |
| **`1-Click-Run-AI-Agent.bat`** | Chạy AI Agent tự hiểu kịch bản ngôn ngữ tự nhiên và thao tác | Cần API key trong `.env` |
| **`1-Click-Interactive-Explore.bat`** | AI tự động dạo quanh các trang của Salon Spa để tìm bug | Cần API key trong `.env` |

---

## 🔑 2. CẤU HÌNH API KEY (CHO CHẾ ĐỘ AI AGENT)

Mở file **`F:\hoc_tap\thuc_tap\du_an\.env`** và điền API Key AI của bạn:

```ini
# Ưu tiên: Google Gemini (Hỗ trợ gemini-2.0-flash siêu nhanh và tiết kiệm)
GEMINI_API_KEY=AIzaSy...

# Hoặc OpenAI
OPENAI_API_KEY=sk-...

# Hoặc Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-...

# Hoặc OpenRouter
OPENROUTER_API_KEY=sk-or-...
```

---

## 📝 3. CÁCH VIẾT THÊM TEST CASE MỚI CHO SALON SPA

Tạo file mới trong thư mục `F:\hoc_tap\thuc_tap\du_an\tests\my_test.e2e.ts`:

```typescript
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('Khách hàng chọn dịch vụ cắt tóc và thanh toán', async ({ app, agent, screen, browser }) => {
  // 1. Mở trang chủ
  await app.open('/');

  // 2. Ra lệnh cho AI Agent
  await agent.act('Nhấp vào Đặt lịch và chọn dịch vụ Cắt tóc nam');
  await agent.act('Chọn thợ và chọn khung giờ đầu tiên khả dụng');

  // 3. Xác thực kết quả
  await agent.assert('Xác nhận đặt lịch thành công hiển thị mã lịch hẹn');
});
```

---

## 📁 4. CÁC TỆP ĐÃ ĐƯỢC TÍCH HỢP

* [e2e.config.ts](file:///F:/hoc_tap/thuc_tap/du_an/e2e.config.ts): Cấu hình runner kết nối tới Frontend Vite `http://127.0.0.1:5173`.
* [tests/01_public_booking_flow.e2e.ts](file:///F:/hoc_tap/thuc_tap/du_an/tests/01_public_booking_flow.e2e.ts): Kiểm thử Trang chủ, Đặt lịch hẹn, Tra cứu.
* [tests/02_auth_and_roles.e2e.ts](file:///F:/hoc_tap/thuc_tap/du_an/tests/02_auth_and_roles.e2e.ts): Kiểm thử Giao diện Đăng nhập & Xác thực.
* [tests/03_vibe_ai_testing.e2e.ts](file:///F:/hoc_tap/thuc_tap/du_an/tests/03_vibe_ai_testing.e2e.ts): Kịch bản AI Agent tự động hóa.
