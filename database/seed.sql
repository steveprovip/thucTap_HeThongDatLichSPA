-- ============================================================================
--  HỆ THỐNG ĐẶT LỊCH SALON - SPA  |  seed.sql
--  Bộ dữ liệu mẫu cho môi trường staging (S1-10).
--  ĐẶC TÍNH: chạy lại nhiều lần cho kết quả GIỐNG NHAU, KHÔNG nhân đôi bản ghi.
--
--  TÀI KHOẢN MẪU (4 vai trò nội bộ)
--    Admin       : admin@salon.vn      / Admin@123
--    Chủ tiệm    : owner@salon.vn      / Owner@123
--    Lễ tân      : reception@salon.vn  / Reception@123
--    Thợ (5 tk)  : stylist1..5@salon.vn / Stylist@123
-- ============================================================================

SET client_encoding = 'UTF8';
SET TIME ZONE 'Asia/Ho_Chi_Minh';

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. TÀI KHOẢN NGƯỜI DÙNG
-- ---------------------------------------------------------------------------
INSERT INTO users (id, full_name, email, phone, password_hash, role, is_active, must_change_password) VALUES
 ('11111111-1111-4111-8111-000000000001','Quản trị hệ thống','admin@salon.vn','0901000001','$2b$10$4VK1/aOsyRaxTgU8dzYiNuKIfgi1hiqJIQEyaL7z//ZVHUv4aFw0O','admin',TRUE,FALSE),
 ('11111111-1111-4111-8111-000000000002','Nguyễn Hoàng Anh','owner@salon.vn','0901000002','$2b$10$DvZ36dOYRBfmiC4vfwsXqOgRV4MQyqQoMlr9tPuVsROT3rzeAi8W6','owner',TRUE,FALSE),
 ('11111111-1111-4111-8111-000000000003','Đỗ Thanh Mai','reception@salon.vn','0901000003','$2b$10$6xQIx0kWSY7be73XcQIW9OkUv6kvm4jpzl6La9r7hCRF.Xk9oMhX6','receptionist',TRUE,FALSE),
 ('22222222-2222-4222-8222-000000000001','Nguyễn Thu Hà','stylist1@salon.vn','0902000001','$2b$10$dPp/KZphlhhpA5T9TIvcDeFgk2bkhJ/6YNGP63oXh6C23uYSnp.c6','stylist',TRUE,FALSE),
 ('22222222-2222-4222-8222-000000000002','Trần Minh Tuấn','stylist2@salon.vn','0902000002','$2b$10$dPp/KZphlhhpA5T9TIvcDeFgk2bkhJ/6YNGP63oXh6C23uYSnp.c6','stylist',TRUE,FALSE),
 ('22222222-2222-4222-8222-000000000003','Lê Thị Bích Ngọc','stylist3@salon.vn','0902000003','$2b$10$dPp/KZphlhhpA5T9TIvcDeFgk2bkhJ/6YNGP63oXh6C23uYSnp.c6','stylist',TRUE,FALSE),
 ('22222222-2222-4222-8222-000000000004','Phạm Quốc Bảo','stylist4@salon.vn','0902000004','$2b$10$dPp/KZphlhhpA5T9TIvcDeFgk2bkhJ/6YNGP63oXh6C23uYSnp.c6','stylist',TRUE,FALSE),
 ('22222222-2222-4222-8222-000000000005','Võ Kim Chi','stylist5@salon.vn','0902000005','$2b$10$dPp/KZphlhhpA5T9TIvcDeFgk2bkhJ/6YNGP63oXh6C23uYSnp.c6','stylist',TRUE,FALSE)
ON CONFLICT DO NOTHING;

-- Luôn đưa 8 tài khoản mẫu về trạng thái đăng nhập được: đúng mật khẩu trong
-- README, đang hoạt động, không bị khoá, không bắt đổi mật khẩu. Nhờ vậy dù đã
-- thử "đổi mật khẩu" hay nhập sai 5 lần, chạy lại launcher là đăng nhập 1 chạm được ngay.
UPDATE users u SET
  password_hash         = d.password_hash,
  role                  = d.role::user_role,
  is_active             = TRUE,
  must_change_password  = FALSE,
  failed_login_attempts = 0,
  locked_until          = NULL
FROM (VALUES
  ('admin@salon.vn',     'admin',        '$2b$10$4VK1/aOsyRaxTgU8dzYiNuKIfgi1hiqJIQEyaL7z//ZVHUv4aFw0O'),
  ('owner@salon.vn',     'owner',        '$2b$10$DvZ36dOYRBfmiC4vfwsXqOgRV4MQyqQoMlr9tPuVsROT3rzeAi8W6'),
  ('reception@salon.vn', 'receptionist', '$2b$10$6xQIx0kWSY7be73XcQIW9OkUv6kvm4jpzl6La9r7hCRF.Xk9oMhX6'),
  ('stylist1@salon.vn',  'stylist',      '$2b$10$dPp/KZphlhhpA5T9TIvcDeFgk2bkhJ/6YNGP63oXh6C23uYSnp.c6'),
  ('stylist2@salon.vn',  'stylist',      '$2b$10$dPp/KZphlhhpA5T9TIvcDeFgk2bkhJ/6YNGP63oXh6C23uYSnp.c6'),
  ('stylist3@salon.vn',  'stylist',      '$2b$10$dPp/KZphlhhpA5T9TIvcDeFgk2bkhJ/6YNGP63oXh6C23uYSnp.c6'),
  ('stylist4@salon.vn',  'stylist',      '$2b$10$dPp/KZphlhhpA5T9TIvcDeFgk2bkhJ/6YNGP63oXh6C23uYSnp.c6'),
  ('stylist5@salon.vn',  'stylist',      '$2b$10$dPp/KZphlhhpA5T9TIvcDeFgk2bkhJ/6YNGP63oXh6C23uYSnp.c6')
) AS d(email, role, password_hash)
WHERE lower(u.email) = d.email
  AND (u.password_hash IS DISTINCT FROM d.password_hash OR u.role::text <> d.role OR NOT u.is_active
       OR u.must_change_password OR u.failed_login_attempts <> 0 OR u.locked_until IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 2. NHÓM DỊCH VỤ
-- ---------------------------------------------------------------------------
INSERT INTO service_categories (id, name, display_order) VALUES
 ('44444444-4444-4444-8444-000000000001','Tóc', 1),
 ('44444444-4444-4444-8444-000000000002','Gội - Dưỡng', 2),
 ('44444444-4444-4444-8444-000000000003','Chăm sóc da', 3),
 ('44444444-4444-4444-8444-000000000004','Trang điểm & Móng', 4)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. DỊCH VỤ (12 dịch vụ, thời lượng 30 - 120 phút)
-- ---------------------------------------------------------------------------
INSERT INTO services (id, category_id, name, duration_minutes, price, description, is_active) VALUES
 ('55555555-5555-4555-8555-000000000001','44444444-4444-4444-8444-000000000001','Cắt tóc nam',            30,  120000,'Cắt, tạo kiểu và sấy khoẻ cho nam.', TRUE),
 ('55555555-5555-4555-8555-000000000002','44444444-4444-4444-8444-000000000001','Cắt tóc nữ',             45,  180000,'Cắt layer, tỉa mặt và sấy tạo kiểu.', TRUE),
 ('55555555-5555-4555-8555-000000000003','44444444-4444-4444-8444-000000000001','Uốn tóc cao cấp',       120,  850000,'Uốn nhiệt setting, dưỡng phục hồi sau uốn.', TRUE),
 ('55555555-5555-4555-8555-000000000004','44444444-4444-4444-8444-000000000001','Nhuộm tóc thời trang',  120,  950000,'Nhuộm màu thời trang, có tẩy nền nhẹ.', TRUE),
 ('55555555-5555-4555-8555-000000000005','44444444-4444-4444-8444-000000000001','Duỗi tóc Collagen',     120,  900000,'Duỗi phồng chân, ép thẳng tự nhiên.', TRUE),
 ('55555555-5555-4555-8555-000000000006','44444444-4444-4444-8444-000000000002','Gội đầu dưỡng sinh',     45,  150000,'Gội thảo dược, massage đầu thư giãn.', TRUE),
 ('55555555-5555-4555-8555-000000000007','44444444-4444-4444-8444-000000000002','Hấp dầu phục hồi',       60,  320000,'Hấp dầu keratin cho tóc hư tổn.', TRUE),
 ('55555555-5555-4555-8555-000000000008','44444444-4444-4444-8444-000000000002','Gội massage cổ vai gáy', 60,  250000,'Gội kết hợp massage cổ vai gáy 30 phút.', TRUE),
 ('55555555-5555-4555-8555-000000000009','44444444-4444-4444-8444-000000000003','Chăm sóc da cơ bản',     60,  350000,'Làm sạch sâu, tẩy tế bào chết, đắp mặt nạ.', TRUE),
 ('55555555-5555-4555-8555-000000000010','44444444-4444-4444-8444-000000000003','Trị mụn chuyên sâu',     90,  550000,'Lấy nhân mụn chuẩn y khoa, điện di phục hồi.', TRUE),
 ('55555555-5555-4555-8555-000000000011','44444444-4444-4444-8444-000000000003','Massage mặt thư giãn',   45,  280000,'Massage dẫn lưu bạch huyết vùng mặt.', TRUE),
 ('55555555-5555-4555-8555-000000000012','44444444-4444-4444-8444-000000000004','Trang điểm dự tiệc',     60,  450000,'Trang điểm dự tiệc kèm làm tóc nhẹ.', TRUE)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. HỒ SƠ THỢ (5 thợ)
-- ---------------------------------------------------------------------------
INSERT INTO stylists (id, user_id, full_name, phone, bio, avatar_url, is_active) VALUES
 ('33333333-3333-4333-8333-000000000001','22222222-2222-4222-8222-000000000001','Nguyễn Thu Hà','0902000001','8 năm kinh nghiệm tóc nữ, chuyên uốn và nhuộm thời trang.', NULL, TRUE),
 ('33333333-3333-4333-8333-000000000002','22222222-2222-4222-8222-000000000002','Trần Minh Tuấn','0902000002','Chuyên tóc nam, fade và undercut.', NULL, TRUE),
 ('33333333-3333-4333-8333-000000000003','22222222-2222-4222-8222-000000000003','Lê Thị Bích Ngọc','0902000003','Kỹ thuật viên da liễu, chuyên trị mụn.', NULL, TRUE),
 ('33333333-3333-4333-8333-000000000004','22222222-2222-4222-8222-000000000004','Phạm Quốc Bảo','0902000004','Chuyên gội dưỡng sinh và massage cổ vai gáy.', NULL, TRUE),
 ('33333333-3333-4333-8333-000000000005','22222222-2222-4222-8222-000000000005','Võ Kim Chi','0902000005','Chuyên trang điểm dự tiệc và chăm sóc da.', NULL, TRUE)
ON CONFLICT DO NOTHING;

-- Giới tính 5 thợ mẫu (chạy lại được; không ghi đè giới tính chủ tiệm đã chọn)
UPDATE stylists AS s SET gender = v.gender
  FROM (VALUES
    ('33333333-3333-4333-8333-000000000001'::uuid, 'female'),
    ('33333333-3333-4333-8333-000000000002'::uuid, 'male'),
    ('33333333-3333-4333-8333-000000000003'::uuid, 'female'),
    ('33333333-3333-4333-8333-000000000004'::uuid, 'male'),
    ('33333333-3333-4333-8333-000000000005'::uuid, 'female')
  ) AS v(id, gender)
 WHERE s.id = v.id AND s.gender IS NULL;

-- ---------------------------------------------------------------------------
-- 5. KỸ NĂNG CỦA THỢ (nhiều dịch vụ / thợ, nhiều thợ / dịch vụ)
-- ---------------------------------------------------------------------------
INSERT INTO stylist_services (stylist_id, service_id) VALUES
 -- Thu Hà: tóc nữ + hoá chất + gội dưỡng
 ('33333333-3333-4333-8333-000000000001','55555555-5555-4555-8555-000000000002'),
 ('33333333-3333-4333-8333-000000000001','55555555-5555-4555-8555-000000000003'),
 ('33333333-3333-4333-8333-000000000001','55555555-5555-4555-8555-000000000004'),
 ('33333333-3333-4333-8333-000000000001','55555555-5555-4555-8555-000000000005'),
 ('33333333-3333-4333-8333-000000000001','55555555-5555-4555-8555-000000000006'),
 ('33333333-3333-4333-8333-000000000001','55555555-5555-4555-8555-000000000007'),
 -- Minh Tuấn: tóc nam + nữ + gội
 ('33333333-3333-4333-8333-000000000002','55555555-5555-4555-8555-000000000001'),
 ('33333333-3333-4333-8333-000000000002','55555555-5555-4555-8555-000000000002'),
 ('33333333-3333-4333-8333-000000000002','55555555-5555-4555-8555-000000000004'),
 ('33333333-3333-4333-8333-000000000002','55555555-5555-4555-8555-000000000006'),
 ('33333333-3333-4333-8333-000000000002','55555555-5555-4555-8555-000000000008'),
 -- Bích Ngọc: da
 ('33333333-3333-4333-8333-000000000003','55555555-5555-4555-8555-000000000009'),
 ('33333333-3333-4333-8333-000000000003','55555555-5555-4555-8555-000000000010'),
 ('33333333-3333-4333-8333-000000000003','55555555-5555-4555-8555-000000000011'),
 ('33333333-3333-4333-8333-000000000003','55555555-5555-4555-8555-000000000006'),
 -- Quốc Bảo: gội dưỡng + tóc nam
 ('33333333-3333-4333-8333-000000000004','55555555-5555-4555-8555-000000000001'),
 ('33333333-3333-4333-8333-000000000004','55555555-5555-4555-8555-000000000006'),
 ('33333333-3333-4333-8333-000000000004','55555555-5555-4555-8555-000000000007'),
 ('33333333-3333-4333-8333-000000000004','55555555-5555-4555-8555-000000000008'),
 -- Kim Chi: trang điểm + da + tóc nữ
 ('33333333-3333-4333-8333-000000000005','55555555-5555-4555-8555-000000000012'),
 ('33333333-3333-4333-8333-000000000005','55555555-5555-4555-8555-000000000009'),
 ('33333333-3333-4333-8333-000000000005','55555555-5555-4555-8555-000000000011'),
 ('33333333-3333-4333-8333-000000000005','55555555-5555-4555-8555-000000000002')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. GIỜ MỞ CỬA CỦA TIỆM (0 = Chủ nhật … 6 = Thứ bảy)
-- ---------------------------------------------------------------------------
INSERT INTO salon_working_hours (day_of_week, open_time, close_time, is_closed) VALUES
 (1,'08:30','20:00',FALSE),
 (2,'08:30','20:00',FALSE),
 (3,'08:30','20:00',FALSE),
 (4,'08:30','20:00',FALSE),
 (5,'08:30','20:00',FALSE),
 (6,'08:00','21:00',FALSE),
 (0,'08:00','21:00',FALSE)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. MÃ GIẢM GIÁ
-- ---------------------------------------------------------------------------
INSERT INTO vouchers (id, code, description, discount_type, discount_value, start_date, end_date, max_usage, is_active) VALUES
 ('66666666-6666-4666-8666-000000000001','NGAYTHUONG10','Giảm 10% cho lịch hẹn từ thứ 2 đến thứ 6','percent',10, CURRENT_DATE - 90, CURRENT_DATE + 180, NULL, TRUE),
 ('66666666-6666-4666-8666-000000000002','CHAOBAN50K','Giảm 50.000 đ cho khách đến lần đầu','amount',50000, CURRENT_DATE - 90, CURRENT_DATE + 180, 200, TRUE),
 ('66666666-6666-4666-8666-000000000003','HETHAN2024','Mã đã hết hạn dùng để kiểm thử','percent',20, CURRENT_DATE - 365, CURRENT_DATE - 200, NULL, TRUE)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8. HỒ SƠ KHÁCH HÀNG
-- ---------------------------------------------------------------------------
INSERT INTO customers (id, full_name, phone, email, note) VALUES
 ('77777777-7777-4777-8777-000000000001','Trần Bảo Ngân','0911000001','bao.ngan@example.com','Thích màu nâu khói, da đầu nhạy cảm.'),
 ('77777777-7777-4777-8777-000000000002','Lý Gia Huy','0911000002','gia.huy@example.com',NULL),
 ('77777777-7777-4777-8777-000000000003','Phan Thuỳ Linh','0911000003','thuy.linh@example.com','Hay đặt cuối tuần.'),
 ('77777777-7777-4777-8777-000000000004','Ngô Đức Thịnh','0911000004',NULL,NULL),
 ('77777777-7777-4777-8777-000000000005','Bùi Khánh Vy','0911000005','khanh.vy@example.com',NULL),
 ('77777777-7777-4777-8777-000000000006','Đặng Hoài Nam','0911000006',NULL,'Khách quen của anh Tuấn.'),
 ('77777777-7777-4777-8777-000000000007','Hồ Mỹ Duyên','0911000007','my.duyen@example.com',NULL),
 ('77777777-7777-4777-8777-000000000008','Vũ Tiến Đạt','0911000008',NULL,NULL),
 ('77777777-7777-4777-8777-000000000009','Trịnh Ngọc Lan','0911000009','ngoc.lan@example.com',NULL),
 ('77777777-7777-4777-8777-000000000010','Cao Minh Khôi','0911000010',NULL,NULL),
 ('77777777-7777-4777-8777-000000000011','Nguyễn Hải Yến','0911000011','hai.yen@example.com','Từng lỡ hẹn 1 lần.'),
 ('77777777-7777-4777-8777-000000000012','Lâm Tuấn Kiệt','0911000012',NULL,NULL),
 ('77777777-7777-4777-8777-000000000013','Dương Thảo Nhi','0911000013','thao.nhi@example.com',NULL),
 ('77777777-7777-4777-8777-000000000014','Tạ Quang Vinh','0911000014',NULL,NULL),
 ('77777777-7777-4777-8777-000000000015','Kiều Anh Thư','0911000015','anh.thu@example.com',NULL)
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- 9. CA LÀM VIỆC  (từ CURRENT_DATE - 35 đến CURRENT_DATE + 30)
--    Mỗi thợ nghỉ cố định 1 ngày trong tuần. Ca ngày thường 09:00-18:00
--    (nghỉ trưa 12:00-13:00), cuối tuần 08:30-17:30 (nghỉ trưa 12:00-12:45).
-- ---------------------------------------------------------------------------
DO $shifts$
DECLARE
  v_date   DATE;
  v_st     RECORD;
  v_dow    INT;
  v_start  TIME;
  v_end    TIME;
  v_bs     TIME;
  v_be     TIME;
  v_offday INT;
BEGIN
  FOR v_st IN SELECT id, full_name FROM stylists ORDER BY full_name LOOP
    v_offday := CASE
      WHEN v_st.id = '33333333-3333-4333-8333-000000000001' THEN 1
      WHEN v_st.id = '33333333-3333-4333-8333-000000000002' THEN 2
      WHEN v_st.id = '33333333-3333-4333-8333-000000000003' THEN 3
      WHEN v_st.id = '33333333-3333-4333-8333-000000000004' THEN 4
      ELSE 0
    END;

    FOR v_date IN SELECT d::date FROM generate_series(CURRENT_DATE - 35, CURRENT_DATE + 30, INTERVAL '1 day') d LOOP
      v_dow := EXTRACT(DOW FROM v_date)::int;
      CONTINUE WHEN v_dow = v_offday;
      CONTINUE WHEN EXISTS (SELECT 1 FROM salon_working_hours w WHERE w.day_of_week = v_dow AND w.is_closed);
      CONTINUE WHEN EXISTS (SELECT 1 FROM stylist_shifts s WHERE s.stylist_id = v_st.id AND s.work_date = v_date);

      IF v_dow IN (0, 6) THEN
        v_start := TIME '08:30'; v_end := TIME '17:30'; v_bs := TIME '12:00'; v_be := TIME '12:45';
      ELSE
        v_start := TIME '09:00'; v_end := TIME '18:00'; v_bs := TIME '12:00'; v_be := TIME '13:00';
      END IF;

      INSERT INTO stylist_shifts (stylist_id, work_date, start_time, end_time, break_start, break_end, note)
      VALUES (v_st.id, v_date, v_start, v_end, v_bs, v_be, 'Ca chuẩn');

      -- Ca tối thứ 6 cho 2 thợ tóc
      IF v_dow = 5 AND v_st.id IN ('33333333-3333-4333-8333-000000000001','33333333-3333-4333-8333-000000000002') THEN
        INSERT INTO stylist_shifts (stylist_id, work_date, start_time, end_time, note)
        VALUES (v_st.id, v_date, TIME '18:00', TIME '20:00', 'Ca tối cuối tuần');
      END IF;
    END LOOP;
  END LOOP;
END $shifts$;

-- ---------------------------------------------------------------------------
-- 10. NGÀY NGHỈ CỦA TIỆM & NGHỈ RIÊNG CỦA THỢ
-- ---------------------------------------------------------------------------
INSERT INTO salon_holidays (start_date, end_date, reason)
SELECT CURRENT_DATE + 21, CURRENT_DATE + 23, 'Nghỉ bảo trì và đào tạo nội bộ'
WHERE NOT EXISTS (SELECT 1 FROM salon_holidays WHERE reason = 'Nghỉ bảo trì và đào tạo nội bộ')
  -- Không chèn nếu đã có kỳ nghỉ khác trùng khoảng (ràng buộc salon_holidays_no_overlap)
  AND NOT EXISTS (
    SELECT 1 FROM salon_holidays h
    WHERE daterange(h.start_date, h.end_date, '[]') && daterange(CURRENT_DATE + 21, CURRENT_DATE + 23, '[]')
  );

INSERT INTO stylist_time_off (stylist_id, off_date, start_time, end_time, reason)
SELECT '33333333-3333-4333-8333-000000000003', CURRENT_DATE + 3, NULL, NULL, 'Nghỉ phép cá nhân'
WHERE NOT EXISTS (
  SELECT 1 FROM stylist_time_off
  WHERE stylist_id = '33333333-3333-4333-8333-000000000003' AND off_date = CURRENT_DATE + 3
);

INSERT INTO stylist_time_off (stylist_id, off_date, start_time, end_time, reason)
SELECT '33333333-3333-4333-8333-000000000001', CURRENT_DATE + 5, TIME '14:00', TIME '18:00', 'Đi học nâng cao tay nghề'
WHERE NOT EXISTS (
  SELECT 1 FROM stylist_time_off
  WHERE stylist_id = '33333333-3333-4333-8333-000000000001' AND off_date = CURRENT_DATE + 5
);

-- ---------------------------------------------------------------------------
-- 11. LỊCH HẸN, PHIẾU TÍNH TIỀN, ĐÁNH GIÁ
--     Sinh theo hàm băm tất định => chạy lại cho kết quả y hệt.
-- ---------------------------------------------------------------------------
DO $appts$
DECLARE
  v_slots      TIME[] := ARRAY['09:00','11:00','14:00','16:00']::TIME[];
  v_caps       INT[]  := ARRAY[120, 60, 120, 60];
  v_date       DATE;
  v_st         RECORD;
  v_i          INT;
  v_slot       TIME;
  v_seed       TEXT;
  v_rnd        INT;
  v_rnd2       INT;
  v_svc        RECORD;
  v_cus        RECORD;
  v_code       TEXT;
  v_appt_id    UUID;
  v_start      TIMESTAMPTZ;
  v_end        TIMESTAMPTZ;
  v_dur        INT;
  v_total      NUMERIC(12,0);
  v_status     appointment_status;
  v_source     appointment_source;
  v_inv_id     UUID;
  v_inv_code   TEXT;
  v_disc       NUMERIC(12,0);
  v_pay        payment_method;
  v_rating     INT;
  v_reception  UUID := '11111111-1111-4111-8111-000000000003';
BEGIN
  FOR v_date IN SELECT d::date FROM generate_series(CURRENT_DATE - 30, CURRENT_DATE + 7, INTERVAL '1 day') d LOOP
    FOR v_st IN
      SELECT s.id, s.full_name, sh.start_time, sh.end_time
      FROM stylists s
      JOIN stylist_shifts sh
        ON sh.stylist_id = s.id
       AND sh.work_date  = v_date
       AND sh.start_time IN (TIME '09:00', TIME '08:30')
      WHERE s.is_active
      ORDER BY s.full_name
    LOOP
      FOR v_i IN 1..array_length(v_slots, 1) LOOP
        v_slot := v_slots[v_i];
        CONTINUE WHEN v_slot < v_st.start_time OR v_slot >= v_st.end_time;

        v_seed := v_date::text || '|' || v_st.id::text || '|' || v_slot::text;
        v_rnd  := ('x' || substr(md5(v_seed), 1, 7))::bit(28)::int % 100;
        CONTINUE WHEN v_rnd >= 62;                    -- ~62% khung giờ có khách

        v_code := upper(substr(md5(v_seed), 1, 8));
        CONTINUE WHEN EXISTS (SELECT 1 FROM appointments a WHERE a.code = v_code);

        SELECT sv.id, sv.name, sv.price, sv.duration_minutes
          INTO v_svc
        FROM services sv
        JOIN stylist_services ss ON ss.service_id = sv.id AND ss.stylist_id = v_st.id
        WHERE sv.is_active AND sv.duration_minutes <= v_caps[v_i]
        ORDER BY md5(v_seed || sv.id::text)
        LIMIT 1;
        CONTINUE WHEN NOT FOUND;

        SELECT c.id, c.full_name, c.email INTO v_cus
        FROM customers c ORDER BY md5(v_seed || c.id::text) LIMIT 1;

        v_dur   := v_svc.duration_minutes;
        v_total := v_svc.price;
        v_start := (v_date + v_slot) AT TIME ZONE 'Asia/Ho_Chi_Minh';
        v_end   := v_start + make_interval(mins => v_dur);
        v_rnd2  := ('x' || substr(md5(v_seed || 'x'), 1, 7))::bit(28)::int % 100;

        -- Chạy lại vào ngày khác: khung giờ mới có thể đã bị lịch hẹn THẬT (tạo trên web)
        -- chiếm chỗ. Bỏ qua thay vì vi phạm appointments_no_overlap làm hỏng cả lần nạp.
        CONTINUE WHEN EXISTS (
          SELECT 1 FROM appointments a
          WHERE a.stylist_id = v_st.id
            AND a.status IN ('pending','confirmed','arrived','in_progress')
            AND tstzrange(a.start_at, a.end_at, '[)') && tstzrange(v_start, v_end, '[)')
        );

        IF v_date < CURRENT_DATE THEN
          v_status := CASE WHEN v_rnd2 < 82 THEN 'completed'::appointment_status
                           WHEN v_rnd2 < 92 THEN 'no_show'::appointment_status
                           ELSE 'cancelled'::appointment_status END;
        ELSIF v_date = CURRENT_DATE THEN
          v_status := CASE WHEN v_end < now() AND v_rnd2 < 85 THEN 'completed'::appointment_status
                           WHEN v_end < now() THEN 'no_show'::appointment_status
                           WHEN v_start <= now() THEN 'in_progress'::appointment_status
                           WHEN v_rnd2 < 25 THEN 'pending'::appointment_status
                           ELSE 'confirmed'::appointment_status END;
        ELSE
          v_status := CASE WHEN v_rnd2 < 30 THEN 'pending'::appointment_status
                           ELSE 'confirmed'::appointment_status END;
        END IF;

        v_source := CASE WHEN v_rnd2 % 5 = 0 THEN 'walk_in'::appointment_source
                         ELSE 'online'::appointment_source END;

        INSERT INTO appointments (
          code, customer_id, stylist_id, start_at, end_at, total_duration_minutes,
          estimated_total, status, source, customer_note,
          confirmed_at, confirmed_by, arrived_at, checked_in_by,
          started_at, completed_at, actual_duration_minutes,
          cancelled_at, cancelled_by_label, cancel_reason,
          no_show_at, no_show_by, confirmation_sent_at, created_at
        ) VALUES (
          v_code, v_cus.id, v_st.id, v_start, v_end, v_dur,
          v_total, v_status, v_source,
          CASE WHEN v_rnd2 % 7 = 0 THEN 'Cho em xin ghế gần cửa sổ ạ.' ELSE NULL END,
          CASE WHEN v_status <> 'pending' THEN v_start - INTERVAL '1 day' END,
          CASE WHEN v_status <> 'pending' THEN v_reception END,
          CASE WHEN v_status IN ('arrived','in_progress','completed') THEN v_start - INTERVAL '5 minutes' END,
          CASE WHEN v_status IN ('arrived','in_progress','completed') THEN v_reception END,
          CASE WHEN v_status IN ('in_progress','completed') THEN v_start END,
          CASE WHEN v_status = 'completed' THEN v_end END,
          CASE WHEN v_status = 'completed' THEN v_dur + (v_rnd2 % 11) - 5 END,
          CASE WHEN v_status = 'cancelled' THEN v_start - INTERVAL '4 hours' END,
          CASE WHEN v_status = 'cancelled' THEN 'Khách hàng' END,
          CASE WHEN v_status = 'cancelled' THEN 'Khách bận đột xuất' END,
          CASE WHEN v_status = 'no_show' THEN v_start + INTERVAL '30 minutes' END,
          CASE WHEN v_status = 'no_show' THEN v_reception END,
          CASE WHEN v_cus.email IS NOT NULL THEN v_start - INTERVAL '2 days' END,
          v_start - INTERVAL '3 days'
        ) RETURNING id INTO v_appt_id;

        INSERT INTO appointment_services
          (appointment_id, service_id, price_snapshot, duration_snapshot, name_snapshot, position)
        VALUES (v_appt_id, v_svc.id, v_svc.price, v_svc.duration_minutes, v_svc.name, 0);

        -- Phiếu tính tiền cho lượt đã hoàn tất
        IF v_status = 'completed' THEN
          v_inv_code := 'HD' || to_char(v_date, 'YYMMDD') || upper(substr(md5(v_seed), 9, 4));
          v_disc := CASE WHEN v_rnd2 % 9 = 0 THEN round(v_total * 0.1) ELSE 0 END;
          v_pay  := CASE WHEN v_rnd2 % 3 = 0 THEN 'transfer'::payment_method ELSE 'cash'::payment_method END;

          INSERT INTO invoices (
            code, appointment_id, customer_id, stylist_id, subtotal,
            voucher_id, voucher_code, discount_amount, total,
            payment_method, transfer_note, status, created_by, paid_at, closed_at, created_at
          ) VALUES (
            v_inv_code, v_appt_id, v_cus.id, v_st.id, v_total,
            CASE WHEN v_disc > 0 THEN '66666666-6666-4666-8666-000000000001'::uuid END,
            CASE WHEN v_disc > 0 THEN 'NGAYTHUONG10' END,
            v_disc, v_total - v_disc,
            v_pay,
            CASE WHEN v_pay = 'transfer' THEN 'CK ' || v_code END,
            'closed', v_reception,
            v_end + INTERVAL '8 minutes', v_end + INTERVAL '10 minutes', v_end
          ) RETURNING id INTO v_inv_id;

          INSERT INTO invoice_items (invoice_id, service_id, name, unit_price, quantity, line_total)
          VALUES (v_inv_id, v_svc.id, v_svc.name, v_svc.price, 1, v_svc.price);

          -- Ghi chú kỹ thuật của thợ
          IF v_rnd2 % 4 = 0 THEN
            INSERT INTO service_notes (appointment_id, customer_id, stylist_id, content)
            VALUES (v_appt_id, v_cus.id, v_st.id,
                    'Đã dùng sản phẩm số ' || (v_rnd2 % 5 + 1) || ', thời gian ủ ' || (20 + v_rnd2 % 15) || ' phút.');
          END IF;

          -- Đánh giá sau dịch vụ
          v_rating := CASE WHEN v_rnd2 < 60 THEN 5 WHEN v_rnd2 < 85 THEN 4 WHEN v_rnd2 < 95 THEN 3 ELSE 2 END;
          INSERT INTO reviews (appointment_id, stylist_id, customer_id, rating, comment,
                               token, token_expires_at, submitted_at)
          VALUES (
            v_appt_id, v_st.id, v_cus.id,
            CASE WHEN v_rnd2 % 10 < 7 THEN v_rating END,
            CASE WHEN v_rnd2 % 10 < 7 AND v_rating >= 4 THEN 'Thợ làm kỹ, tiệm sạch sẽ.'
                 WHEN v_rnd2 % 10 < 7 THEN 'Chờ hơi lâu so với giờ hẹn.' END,
            md5(v_seed || 'review') || substr(md5(v_seed), 1, 8),
            v_end + INTERVAL '7 days',
            CASE WHEN v_rnd2 % 10 < 7 THEN v_end + INTERVAL '1 day' END
          );
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END $appts$;

-- ---------------------------------------------------------------------------
-- 12. CẬP NHẬT SỐ LIỆU TỔNG HỢP CỦA HỒ SƠ KHÁCH
-- ---------------------------------------------------------------------------
-- Cả 3 chỉ số đều đếm trực tiếp từ bảng appointments (không nhập tay):
--   total_visits       = số lịch trạng thái 'completed'
--   no_show_count      = số lịch trạng thái 'no_show'
--   total_appointments = tổng số lịch đã đặt (mọi trạng thái)
UPDATE customers c SET
  total_visits       = COALESCE(t.visits, 0),
  no_show_count      = COALESCE(t.no_shows, 0),
  total_appointments = COALESCE(t.total, 0)
FROM customers c2
LEFT JOIN (
  SELECT customer_id,
         COUNT(*) FILTER (WHERE status = 'completed') AS visits,
         COUNT(*) FILTER (WHERE status = 'no_show')   AS no_shows,
         COUNT(*)                                      AS total
  FROM appointments GROUP BY customer_id
) t ON t.customer_id = c2.id
WHERE c.id = c2.id;

UPDATE vouchers v SET used_count = COALESCE(u.c, 0)
FROM (SELECT voucher_id, COUNT(*) c FROM invoices WHERE voucher_id IS NOT NULL GROUP BY voucher_id) u
WHERE u.voucher_id = v.id;

-- ---------------------------------------------------------------------------
-- 13. NHẬT KÝ MẪU
-- ---------------------------------------------------------------------------
INSERT INTO audit_logs (actor_id, actor_email, actor_role, action, entity_type, entity_id, summary)
SELECT '11111111-1111-4111-8111-000000000001','admin@salon.vn','admin','create','system','seed',
       'Nạp bộ dữ liệu mẫu staging (5 thợ, 12 dịch vụ, 4 vai trò nội bộ)'
WHERE NOT EXISTS (SELECT 1 FROM audit_logs WHERE entity_type = 'system' AND entity_id = 'seed');

-- ---------------------------------------------------------------------------
-- 14. BÁO CÁO KẾT QUẢ NẠP
-- ---------------------------------------------------------------------------
DO $report$
DECLARE r RECORD;
BEGIN
  SELECT
    (SELECT COUNT(*) FROM users)           AS users,
    (SELECT COUNT(*) FROM stylists)        AS stylists,
    (SELECT COUNT(*) FROM services)        AS services,
    (SELECT COUNT(*) FROM stylist_shifts)  AS shifts,
    (SELECT COUNT(*) FROM customers)       AS customers,
    (SELECT COUNT(*) FROM appointments)    AS appointments,
    (SELECT COUNT(*) FROM invoices)        AS invoices,
    (SELECT COUNT(*) FROM reviews)         AS reviews
  INTO r;
  RAISE NOTICE '--- SEED HOÀN TẤT ---';
  RAISE NOTICE 'users=% stylists=% services=% shifts=% customers=% appointments=% invoices=% reviews=%',
    r.users, r.stylists, r.services, r.shifts, r.customers, r.appointments, r.invoices, r.reviews;
END $report$;
