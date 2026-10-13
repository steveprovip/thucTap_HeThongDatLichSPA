/**
 * Ghi chú test 13/10 "Tạo đủ dữ liệu mẫu để test đủ các backlog trong đề": kiểm tra CSDL hiện tại có ĐỦ tình huống để
 * tester chạy hết 39 user story (Excel "3. Hệ thống đặt lịch Salon Spa.xlsx") hay chưa — mỗi dòng là một tình huống cụ thể
 * (vd. "lịch chờ xác nhận quá 12 giờ", "thợ nghỉ ngày mai còn lịch cần chuyển"), kèm số lượng và chỗ mở trên giao diện.
 *
 *   npm run seed:check        (in bảng ✓ / ✗, mã thoát 1 nếu còn tình huống thiếu)
 */
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { describeDb, resolveDbConnection } from '../config/db-connection';
import { connectWithRetry } from './db-tools';

export interface CoverageRow { story: string; need: string; where: string; sql: string; min: number }

/** Mỗi tình huống: câu SQL trả về MỘT số (count). `min` = số tối thiểu để test được. */
export const COVERAGE: CoverageRow[] = [
  // EP-01 Tài khoản và phân quyền
  { story: 'S1-01/S1-03', need: 'Đủ 4 vai trò nhân sự đang hoạt động', where: 'Đăng nhập', min: 4,
    sql: `SELECT COUNT(DISTINCT role) FROM users WHERE is_active` },
  { story: 'S1-02', need: 'Tài khoản đã ngưng hoạt động (thử chặn đăng nhập)', where: 'Quản lý → Tài khoản nhân sự', min: 1,
    sql: `SELECT COUNT(*) FROM users WHERE NOT is_active` },
  { story: 'S1-02', need: 'Nhiều tài khoản thợ (≥ 5) để lọc / phân trang', where: 'Tài khoản nhân sự', min: 5,
    sql: `SELECT COUNT(*) FROM users WHERE role = 'stylist'` },
  { story: 'S1-09', need: 'Nhật ký hoạt động có dữ liệu nhiều ngày / nhiều tài khoản', where: 'Nhật ký hoạt động', min: 20,
    sql: `SELECT COUNT(*) FROM audit_logs` },
  // EP-02 Dịch vụ, thợ, lịch làm việc
  { story: 'S1-05', need: 'Dịch vụ đã có lịch hẹn (không xoá được)', where: 'Dịch vụ & bảng giá', min: 1,
    sql: `SELECT COUNT(DISTINCT service_id) FROM appointment_services` },
  { story: 'S1-05', need: 'Dịch vụ ngưng kinh doanh (ẩn khỏi trang khách)', where: 'Dịch vụ & bảng giá', min: 1,
    sql: `SELECT COUNT(*) FROM services WHERE NOT is_active` },
  { story: 'S1-07', need: 'Dịch vụ đang bán CHƯA có thợ (cảnh báo)', where: 'Hồ sơ thợ / Dịch vụ', min: 1,
    sql: `SELECT COUNT(*) FROM services s WHERE s.is_active AND NOT EXISTS (
            SELECT 1 FROM stylist_services ss JOIN stylists t ON t.id = ss.stylist_id AND t.is_active WHERE ss.service_id = s.id)` },
  { story: 'S1-06', need: 'Nhóm dịch vụ trống (xoá được) bên cạnh nhóm còn dịch vụ (chặn xoá)', where: 'Dịch vụ → Nhóm', min: 1,
    sql: `SELECT COUNT(*) FROM service_categories c WHERE NOT EXISTS (SELECT 1 FROM services s WHERE s.category_id = c.id)` },
  { story: 'S1-07', need: 'Thợ có ảnh đại diện + nhiều kỹ năng', where: 'Hồ sơ thợ', min: 5,
    sql: `SELECT COUNT(*) FROM stylists t WHERE t.is_active AND t.avatar_url IS NOT NULL
            AND (SELECT COUNT(*) FROM stylist_services ss WHERE ss.stylist_id = t.id) >= 3` },
  { story: 'S1-08', need: 'Giờ mở cửa đủ 7 ngày', where: 'Giờ mở cửa & ngày nghỉ', min: 7,
    sql: `SELECT COUNT(*) FROM salon_working_hours` },
  { story: 'S2-01', need: 'Ca tuần này + tuần sau (sao chép tuần), có nghỉ giữa ca', where: 'Bảng ca làm', min: 20,
    sql: `SELECT COUNT(*) FROM stylist_shifts WHERE work_date BETWEEN current_date AND current_date + 13 AND break_start IS NOT NULL` },
  { story: 'S2-01', need: 'Thợ có 2 ca trong 1 ngày', where: 'Bảng ca làm', min: 1,
    sql: `SELECT COUNT(*) FROM (SELECT stylist_id, work_date FROM stylist_shifts WHERE work_date >= current_date
            GROUP BY 1, 2 HAVING COUNT(*) >= 2) x` },
  { story: 'S2-02', need: 'Ngày nghỉ toàn tiệm sắp tới', where: 'Giờ mở cửa & ngày nghỉ', min: 1,
    sql: `SELECT COUNT(*) FROM salon_holidays WHERE end_date >= current_date` },
  { story: 'S2-02', need: 'Thợ xin nghỉ riêng sắp tới', where: 'Bảng ca làm', min: 2,
    sql: `SELECT COUNT(*) FROM stylist_time_off WHERE off_date >= current_date` },
  { story: 'S2-01', need: 'Thợ đăng ký ca / xin nghỉ chờ duyệt', where: 'Bảng ca làm → Yêu cầu', min: 2,
    sql: `SELECT COUNT(*) FROM shift_requests WHERE status = 'pending'` },
  // EP-03 Đặt lịch công khai
  { story: 'S2-03', need: 'Danh mục công khai: dịch vụ đang bán có thợ', where: 'Trang khách', min: 20,
    sql: `SELECT COUNT(*) FROM services s WHERE s.is_active AND EXISTS (SELECT 1 FROM stylist_services ss WHERE ss.service_id = s.id)` },
  { story: 'S2-07', need: 'Khách đã có đủ 3 lịch đang mở (thử chặn lịch thứ 4)', where: 'Đặt lịch bằng SĐT đó', min: 1,
    sql: `SELECT COUNT(*) FROM (SELECT customer_id FROM appointments WHERE status IN ('pending','confirmed')
            AND start_at > now() GROUP BY 1 HAVING COUNT(*) >= 3) x` },
  { story: 'S2-09/S3-05', need: 'Lịch tương lai (tra cứu, khách tự huỷ ≥ 120′)', where: 'Tra cứu lịch', min: 20,
    sql: `SELECT COUNT(*) FROM appointments WHERE status IN ('pending','confirmed') AND start_at > now() + interval '2 hours'` },
  // EP-04 Vận hành
  { story: 'S3-01/S4-08', need: 'Lịch hôm nay trên nhiều thợ', where: 'Lịch ngày / Tổng quan', min: 20,
    sql: `SELECT COUNT(*) FROM appointments WHERE (start_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date` },
  { story: 'S3-02', need: 'Lịch online chờ xác nhận', where: 'Chờ xác nhận', min: 3,
    sql: `SELECT COUNT(*) FROM appointments WHERE status = 'pending' AND start_at > now()` },
  { story: 'S3-02', need: 'Lịch chờ QUÁ HẠN 12 giờ (đánh dấu đỏ)', where: 'Chờ xác nhận', min: 1,
    sql: `SELECT COUNT(*) FROM appointments WHERE status = 'pending' AND start_at > now() AND created_at < now() - interval '12 hours'` },
  { story: 'S3-03', need: 'Lịch hôm nay sắp tới giờ (check-in được ±60′)', where: 'Lịch ngày', min: 1,
    sql: `SELECT COUNT(*) FROM appointments WHERE status = 'confirmed' AND start_at BETWEEN now() - interval '60 minutes' AND now() + interval '60 minutes'` },
  { story: 'S3-06', need: 'Lịch hôm nay đã quá giờ 30′ mà khách chưa đến (đánh dấu không đến)', where: 'Lịch ngày', min: 1,
    sql: `SELECT COUNT(*) FROM appointments WHERE status = 'confirmed' AND start_at < now() - interval '30 minutes'
            AND (start_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date` },
  { story: 'S3-04', need: 'Lịch đã từng đổi thợ / dời giờ (lịch sử thay đổi)', where: 'Chi tiết lịch hẹn', min: 3,
    sql: `SELECT COUNT(*) FROM appointment_changes` },
  { story: 'S3-07', need: 'Khách vãng lai hôm nay', where: 'Khách vãng lai', min: 1,
    sql: `SELECT COUNT(*) FROM appointments WHERE source = 'walk_in'
            AND (start_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date` },
  { story: 'S3-08', need: 'Tài khoản thợ mẫu (stylist1@salon.vn) có lịch hôm nay', where: 'Đăng nhập thợ → Lịch của tôi', min: 1,
    sql: `SELECT COUNT(*) FROM appointments a JOIN stylists t ON t.id = a.stylist_id JOIN users u ON u.id = t.user_id
            WHERE u.email = 'stylist1@salon.vn' AND a.status <> 'cancelled'
            AND (a.start_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date` },
  { story: 'S3-08', need: 'Lịch đang làm (theo dõi vượt 20′)', where: 'Lịch ngày / Lịch của tôi', min: 1,
    sql: `SELECT COUNT(*) FROM appointments WHERE status IN ('in_progress', 'arrived')` },
  { story: 'S3-09', need: 'Thợ nghỉ NGÀY MAI nhưng vẫn còn lịch (chuyển hàng loạt)', where: 'Chuyển lịch hàng loạt', min: 1,
    sql: `SELECT COUNT(*) FROM stylist_time_off o WHERE o.off_date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 1
            AND EXISTS (SELECT 1 FROM appointments a WHERE a.stylist_id = o.stylist_id AND a.status IN ('pending','confirmed')
              AND (a.start_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = o.off_date)` },
  // EP-05 Thanh toán & hồ sơ khách
  { story: 'S3-10', need: 'Khách quen nhiều lượt (≥ 10) để xem lịch sử', where: 'Hồ sơ khách', min: 5,
    sql: `SELECT COUNT(*) FROM (SELECT customer_id FROM appointments WHERE status = 'completed' GROUP BY 1 HAVING COUNT(*) >= 10) x` },
  { story: 'S4-01', need: 'Lịch hoàn tất CHƯA lập phiếu (thu tiền)', where: 'Phiếu tính tiền', min: 1,
    sql: `SELECT COUNT(*) FROM appointments a WHERE a.status = 'completed' AND a.start_at > now() - interval '3 days'
            AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.appointment_id = a.id)` },
  { story: 'S4-01', need: 'Phiếu đã đóng (tiền mặt + chuyển khoản)', where: 'Phiếu tính tiền', min: 50,
    sql: `SELECT COUNT(*) FROM invoices WHERE status = 'closed'` },
  { story: 'S4-01', need: 'Phiếu điều chỉnh', where: 'Phiếu tính tiền', min: 1,
    sql: `SELECT COUNT(*) FROM invoices WHERE adjusts_invoice_id IS NOT NULL` },
  { story: 'S4-02', need: 'Mã giảm giá đang chạy (%, số tiền) + mã hết hạn / có đơn tối thiểu', where: 'Mã giảm giá', min: 3,
    sql: `SELECT COUNT(*) FROM vouchers` },
  { story: 'S4-03', need: 'Ghi chú kỹ thuật của thợ', where: 'Hồ sơ khách / Lịch của tôi', min: 10,
    sql: `SELECT COUNT(*) FROM service_notes` },
  { story: 'S4-04', need: 'Thợ có ≥ 5 đánh giá (hiện điểm trung bình)', where: 'Doanh thu → Đánh giá', min: 3,
    sql: `SELECT COUNT(*) FROM (SELECT stylist_id FROM reviews WHERE submitted_at IS NOT NULL GROUP BY 1 HAVING COUNT(*) >= 5) x` },
  { story: 'S4-04', need: 'Liên kết đánh giá CHƯA dùng, còn hạn (khách bấm thử)', where: 'Mailbox / trang đánh giá', min: 1,
    sql: `SELECT COUNT(*) FROM reviews WHERE submitted_at IS NULL AND token_expires_at > now()` },
  // EP-06 Thông báo & báo cáo
  { story: 'S4-05', need: 'Email đã gửi + email nhắc lịch đang chờ', where: 'MailDev / Gmail', min: 2,
    sql: `SELECT (SELECT COUNT(*) FROM email_queue WHERE status = 'sent') + (SELECT COUNT(*) FROM email_queue WHERE status = 'pending')` },
  { story: 'S4-06', need: 'Thông báo trong ứng dụng chưa đọc', where: 'Chuông thông báo', min: 3,
    sql: `SELECT COUNT(*) FROM notifications WHERE read_at IS NULL` },
  { story: 'S4-07', need: 'Doanh thu trải ≥ 90 ngày', where: 'Doanh thu', min: 90,
    sql: `SELECT COUNT(DISTINCT (closed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) FROM invoices WHERE status = 'closed'` },
  { story: 'S4-09', need: 'Không đến + huỷ trong 30 ngày (tỉ lệ)', where: 'Khung giờ & no-show', min: 5,
    sql: `SELECT COUNT(*) FROM appointments WHERE status IN ('no_show','cancelled') AND start_at > now() - interval '30 days'` },
  // Ghi chú test 13/10 — dữ liệu không được "đứng hình" theo thời gian
  { story: 'Dữ liệu', need: 'KHÔNG còn lịch quá khứ kẹt ở trạng thái đang mở', where: 'Lịch ngày (hôm qua)', min: 0,
    sql: `SELECT -COUNT(*) FROM appointments WHERE status IN ('pending','confirmed','arrived','in_progress')
            AND end_at < date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'` },
];

export async function checkCoverage(client: Client): Promise<{ row: CoverageRow; value: number; ok: boolean }[]> {
  const out: { row: CoverageRow; value: number; ok: boolean }[] = [];
  for (const row of COVERAGE) {
    let value = Number.NaN;
    try { value = Number(Object.values((await client.query(row.sql)).rows[0] ?? {})[0] ?? 0); } catch { /* bảng / cột chưa có */ }
    out.push({ row, value, ok: Number.isFinite(value) && value >= row.min });
  }
  return out;
}

async function main(): Promise<void> {
  loadEnv();
  const conn = resolveDbConnection();
  const client = await connectWithRetry(conn);
  try {
    const res = await checkCoverage(client);
    console.log(`\nĐộ phủ dữ liệu mẫu theo backlog — ${describeDb(conn)}\n`);
    for (const r of res) {
      const v = Number.isFinite(r.value) ? Math.abs(r.value) : 'lỗi';
      console.log(`${r.ok ? '✓' : '✗'} ${r.row.story.padEnd(12)} ${r.row.need} — ${v}${r.row.min ? ` (cần ≥ ${r.row.min})` : ''} · ${r.row.where}`);
    }
    const miss = res.filter((r) => !r.ok).length;
    console.log(`\n${res.length - miss}/${res.length} tình huống đủ dữ liệu${miss ? ` — thiếu ${miss}: chạy "npm run seed:realistic" rồi kiểm tra lại` : ''}.`);
    process.exitCode = miss ? 1 : 0;
  } finally {
    await client.end();
  }
}

if (require.main === module) void main();
