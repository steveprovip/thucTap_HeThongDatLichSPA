# Quy ước thời gian, tiền tệ và định dạng — một trang

Đây là tài liệu bắt buộc theo phương án ứng phó rủi ro số 5 trong kế hoạch sprint
("thực tập sinh chưa từng làm với múi giờ, dễ lệch giờ giữa frontend, backend và CSDL").

## 1. Nguyên tắc gốc

> **Mốc tuyệt đối lưu UTC trong cơ sở dữ liệu, quy đổi sang `Asia/Ho_Chi_Minh`
> ở tầng hiển thị. Không bao giờ lưu chuỗi giờ địa phương cho một sự kiện.**

| Loại dữ liệu | Kiểu cột | Ví dụ | Lý do |
|---|---|---|---|
| Thời điểm xảy ra một sự kiện | `TIMESTAMPTZ` | `appointments.start_at` | Có múi giờ, không mơ hồ |
| Giờ trong tuần / giờ ca làm | `TIME` | `stylist_shifts.start_time` | Là "9 giờ sáng theo giờ tiệm", không gắn ngày |
| Ngày làm việc, ngày nghỉ | `DATE` | `stylist_shifts.work_date` | Không có thành phần giờ |

Cột `TIME` + `DATE` luôn được hiểu theo giờ tiệm. Việc ghép chúng thành mốc tuyệt đối
chỉ làm ở **một chỗ duy nhất**: `combine()` trong `backend/src/common/utils/time.util.ts`.

## 2. Cấu hình ba tầng

| Tầng | Thiết lập |
|---|---|
| PostgreSQL | `timezone=Asia/Ho_Chi_Minh` trong `docker-compose.yml` và trong chuỗi kết nối TypeORM |
| Node.js | `process.env.TZ = 'Asia/Ho_Chi_Minh'` đặt ở dòng đầu `main.ts` |
| Trình duyệt | Không phụ thuộc máy khách — mọi định dạng đi qua `Intl` với `timeZone: 'Asia/Ho_Chi_Minh'` |

Nhờ vậy một máy tính đặt sai múi giờ **vẫn hiển thị đúng giờ tiệm**.

## 3. Hàm dùng chung

Backend — `src/common/utils/time.util.ts`

| Hàm | Công dụng |
|---|---|
| `combine(date, time)` | `'2026-09-22' + '14:30'` → mốc tuyệt đối theo giờ tiệm |
| `toSalon(date)` | Mốc tuyệt đối → `DateTime` theo giờ tiệm |
| `dayOfWeek(date)` | 0 = Chủ nhật … 6 = Thứ bảy, khớp cột `day_of_week` |
| `startOfDay` / `endOfDay` | Ranh giới ngày theo giờ tiệm, dùng để truy vấn `TIMESTAMPTZ` |
| `formatDateTimeVN` | `14:30, Thứ ba 22/09/2026` |

Frontend — `src/utils/format.ts` có bộ hàm tương đương dựa trên `Intl.DateTimeFormat`.

## 4. Định dạng hiển thị

| Loại | Quy ước | Ví dụ | Hàm |
|---|---|---|---|
| Tiền | Dấu chấm ngăn nghìn, hậu tố ` đ` | `250.000 đ` | `formatVnd` |
| Tiền trên trục biểu đồ | Rút gọn | `6,5 tr` · `450 k` | `formatVndShort` |
| Giờ | 24 giờ, hai chữ số | `14:30` | `formatTime` |
| Ngày | Ngày/tháng/năm | `22/09/2026` | `formatDate` |
| Ngày có thứ | Thứ tiếng Việt | `Thứ ba 22/09/2026` | `formatWeekdayDate` |
| Thời lượng | Giờ + phút | `2 giờ 30 phút` | `formatDuration` |

## 5. Bốn lỗi hay gặp và cách tránh

1. **Dùng `new Date('2026-09-22')`** — JavaScript hiểu đây là UTC nửa đêm, lệch 7 giờ.
   Luôn dùng `combine()` hoặc `DateTime.fromISO(date, { zone: SALON_TZ })`.
2. **So sánh `TIMESTAMPTZ` với chuỗi ngày trần** trong SQL. Luôn bọc bằng
   `startOfDay()` / `endOfDay()`.
3. **Cộng 24 giờ để sang ngày hôm sau** — sai khi có thay đổi múi giờ. Dùng `addDays()`.
4. **Định dạng bằng `toLocaleString()` không truyền `timeZone`** — kết quả phụ thuộc máy
   người dùng. Mọi hàm trong `format.ts` đều truyền `timeZone` tường minh.

## 6. Cách kiểm chứng

```bash
curl http://localhost:3000/health
# "timezone":"Asia/Ho_Chi_Minh"
```

Đổi múi giờ máy tính sang UTC hoặc Tokyo rồi mở lại giao diện: giờ hiển thị **không đổi**.
