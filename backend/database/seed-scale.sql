-- =============================================================================
-- DỮ LIỆU TẢI x10 (Part 4) — CHỈ cho máy phát triển / đo hiệu năng. KHÔNG chạy trên CSDL tiệm thật.
--   npm run seed:scale            -> nạp (chạy lại được: đã có thì bỏ qua)
--   npm run seed:scale -- --reset -> xoá riêng dữ liệu tải (đánh dấu [scale-seed]) rồi nạp lại
--
-- Quy mô: 100 dịch vụ · 50 thợ · 10.000 khách · ~54.000 lịch hẹn (150 ngày trước → 30 ngày tới), đủ 7 trạng thái:
-- quá khứ hoàn tất / không đến / huỷ, đang diễn ra = đang làm, trong 60 phút tới = đã đến, tương lai = chờ / đã xác nhận.
-- Viết hoàn toàn theo tập hợp (generate_series + INSERT ... SELECT), không vòng lặp từng dòng → nạp < 30 giây.
-- Tôn trọng mọi bất biến: thời lượng bội số 15 (15–60′), giá ≤ 20.000.000, mỗi thợ chỉ nhận dịch vụ mình có
-- kỹ năng, lịch nằm trong ca và trên lưới 15 phút, KHÔNG chồng lấn (EXCLUDE appointments_no_overlap vẫn bật).
-- Nhận diện dữ liệu tải: danh mục "[scale-seed] …", thợ / dịch vụ có tiền tố "Tải thử", khách note='[scale-seed]',
-- mã lịch 'Z' + 7 chữ số (bộ sinh mã thật không dùng mẫu này).
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM service_categories WHERE name = '[scale-seed] Gói tải thử') THEN
    RAISE NOTICE 'Dữ liệu tải đã có — bỏ qua (chạy với --reset để nạp lại).';
    RETURN;
  END IF;

  -- 1. Danh mục + 100 dịch vụ (15–60 phút để mỗi khung 1 giờ chứa trọn một lịch, giá 80k–2,06tr)
  INSERT INTO service_categories (name, display_order) VALUES ('[scale-seed] Gói tải thử', 99);

  INSERT INTO services (category_id, name, duration_minutes, price, description)
  SELECT c.id,
         format('Tải thử DV %s', lpad(i::text, 3, '0')),
         15 * (1 + (i % 4)),
         80000 + (i * 20000),
         'Dịch vụ sinh tự động để đo hiệu năng'
    FROM generate_series(1, 100) AS i
    CROSS JOIN (SELECT id FROM service_categories WHERE name = '[scale-seed] Gói tải thử') c;

  -- 2. 50 thợ, mỗi thợ có kỹ năng ~80/100 dịch vụ (bỏ những dịch vụ (i + s) chia hết cho 5)
  INSERT INTO stylists (full_name, phone, gender, bio)
  SELECT format('Tải thử Thợ %s', lpad(s::text, 2, '0')),
         '038' || lpad((1000000 + s)::text, 7, '0'),
         CASE WHEN s % 2 = 0 THEN 'male' ELSE 'female' END,
         '[scale-seed]'
    FROM generate_series(1, 50) AS s;

  INSERT INTO stylist_services (stylist_id, service_id)
  SELECT st.id, sv.id
    FROM (SELECT id, substring(full_name FROM '(\d+)$')::int AS s FROM stylists WHERE full_name LIKE 'Tải thử Thợ %') st
    JOIN (SELECT id, substring(name FROM '(\d+)$')::int AS i FROM services WHERE name LIKE 'Tải thử DV %') sv
      ON (sv.i + st.s) % 5 <> 0;

  -- 3. 10.000 khách (SĐT 079xxxxxxx), 30% có email
  INSERT INTO customers (full_name, phone, email, note)
  SELECT (ARRAY['Nguyễn','Trần','Lê','Phạm','Hoàng','Huỳnh','Phan','Vũ','Võ','Đặng','Bùi','Đỗ'])[1 + i % 12] || ' ' ||
         (ARRAY['Thị','Văn','Ngọc','Minh','Thu','Gia','Hoài','Đức'])[1 + (i / 12) % 8] || ' ' ||
         (ARRAY['An','Bình','Chi','Dũng','Giang','Hà','Khánh','Lan','Mai','Nam','Oanh','Phúc','Quân','Trang','Uyên','Vy','Yến','Ánh'])[1 + (i / 96) % 18],
         '079' || lpad(i::text, 7, '0'),
         CASE WHEN i % 10 < 3 THEN format('khach%s@scale.test', i) END,
         '[scale-seed]'
    FROM generate_series(1, 10000) AS i
  ON CONFLICT (phone) DO NOTHING;

  -- 4. Ca làm: 150 ngày trước → 30 ngày tới, 08:30–20:00 nghỉ 12:00–13:00, mỗi thợ nghỉ 1 thứ cố định/tuần
  INSERT INTO stylist_shifts (stylist_id, work_date, start_time, end_time, break_start, break_end, note)
  SELECT st.id, d::date, '08:30', '20:00', '12:00', '13:00', '[scale-seed]'
    FROM (SELECT id, substring(full_name FROM '(\d+)$')::int AS s FROM stylists WHERE full_name LIKE 'Tải thử Thợ %') st
    CROSS JOIN generate_series(current_date - 150, current_date + 30, interval '1 day') AS d
   WHERE extract(dow FROM d)::int <> st.s % 7
  ON CONFLICT DO NOTHING;
END $$;

-- Thống kê mới cho bảng vừa nạp — thiếu bước này planner chọn nested loop và bước 5 chạy hàng phút.
ANALYZE services; ANALYZE stylists; ANALYZE stylist_services; ANALYZE customers; ANALYZE stylist_shifts; ANALYZE appointments;

-- 5. Lịch hẹn: mỗi ca có 10 khung 1 giờ (09–11h, 13–19h), lấp ~70% theo băm cố định → không chồng lấn.
--    Dịch vụ chọn trong kỹ năng của thợ; quá khứ: 85% hoàn tất / 5% không đến / 10% huỷ; tương lai: chờ / đã xác nhận.
WITH st AS (
  SELECT id, substring(full_name FROM '(\d+)$')::int AS s FROM stylists WHERE full_name LIKE 'Tải thử Thợ %'
), skills AS (
  SELECT ss.stylist_id, sv.id AS service_id, sv.name, sv.duration_minutes, sv.price,
         row_number() OVER (PARTITION BY ss.stylist_id ORDER BY sv.name) - 1 AS k,
         count(*)     OVER (PARTITION BY ss.stylist_id) AS n
    FROM stylist_services ss JOIN services sv ON sv.id = ss.service_id
   WHERE sv.name LIKE 'Tải thử DV %'
), slots AS (
  SELECT st.id AS stylist_id, sh.work_date, h,
         abs(hashtext(st.id::text || sh.work_date::text || h::text)) AS hv
    FROM st
    JOIN stylist_shifts sh ON sh.stylist_id = st.id AND sh.note = '[scale-seed]'
    CROSS JOIN unnest(ARRAY[9, 10, 11, 13, 14, 15, 16, 17, 18, 19]) AS h
), picked AS (
  SELECT sl.*, row_number() OVER (ORDER BY sl.work_date, sl.stylist_id, sl.h) AS rn,
         ((sl.work_date + make_interval(hours => sl.h)) AT TIME ZONE 'Asia/Ho_Chi_Minh') AS start_at
    FROM slots sl
   WHERE sl.hv % 100 < 70
     AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.code LIKE 'Z%' AND a.stylist_id = sl.stylist_id)
), rows AS (
  SELECT p.*, sk.service_id, sk.name AS service_name, sk.duration_minutes, sk.price, cu.id AS customer_id
    FROM picked p
    JOIN skills sk ON sk.stylist_id = p.stylist_id AND sk.k = p.hv % sk.n
    JOIN customers cu ON cu.phone = '079' || lpad((1 + (p.hv / 100) % 10000)::text, 7, '0')
), ins AS (
  INSERT INTO appointments (code, customer_id, stylist_id, start_at, end_at, total_duration_minutes, estimated_total,
                            status, source, confirmed_at, arrived_at, started_at, completed_at, cancelled_at,
                            cancelled_by_label, cancel_reason, no_show_at, created_at)
  SELECT 'Z' || lpad(r.rn::text, 7, '0'), r.customer_id, r.stylist_id, r.start_at,
         r.start_at + make_interval(mins => r.duration_minutes), r.duration_minutes, r.price,
         x.status::appointment_status,
         CASE WHEN r.hv % 3 = 0 THEN 'walk_in' ELSE 'online' END::appointment_source,
         CASE WHEN x.status <> 'pending' THEN r.start_at - interval '1 day' END,
         CASE WHEN x.status IN ('completed', 'in_progress', 'arrived') THEN LEAST(now(), r.start_at - interval '5 minutes') END,
         CASE WHEN x.status IN ('completed', 'in_progress') THEN r.start_at END,
         CASE WHEN x.status = 'completed' THEN r.start_at + make_interval(mins => r.duration_minutes) END,
         CASE WHEN x.status = 'cancelled' THEN r.start_at - interval '3 hours' END,
         CASE WHEN x.status = 'cancelled' THEN 'Khách hàng' END,
         CASE WHEN x.status = 'cancelled' THEN '[scale-seed] khách bận' END,
         CASE WHEN x.status = 'no_show' THEN r.start_at + interval '30 minutes' END,
         r.start_at - interval '2 days'
    FROM rows r
    CROSS JOIN LATERAL (SELECT CASE
             WHEN r.start_at + make_interval(mins => r.duration_minutes) <= now() THEN
               CASE WHEN r.hv % 20 = 0 THEN 'no_show' WHEN r.hv % 10 = 1 THEN 'cancelled' ELSE 'completed' END
             WHEN r.start_at <= now() THEN 'in_progress'    -- khung đang diễn ra: thợ đang làm
             WHEN r.start_at <= now() + interval '60 minutes' THEN 'arrived' -- trong cửa sổ check-in: khách đã đến
             ELSE CASE WHEN r.hv % 4 = 0 THEN 'pending' ELSE 'confirmed' END
           END AS status) x
  ON CONFLICT (code) DO NOTHING
  RETURNING id, code
)
INSERT INTO appointment_services (appointment_id, service_id, price_snapshot, duration_snapshot, name_snapshot, position)
SELECT ins.id, r.service_id, r.price, r.duration_minutes, r.service_name, 0
  FROM ins JOIN rows r ON 'Z' || lpad(r.rn::text, 7, '0') = ins.code;

-- 6. Bộ đếm trên hồ sơ khách (ứng dụng tự cập nhật khi chạy thật; ở đây tính một lần theo tập hợp)
UPDATE customers c
   SET total_visits = s.done, no_show_count = s.ns, total_appointments = s.total
  FROM (SELECT customer_id,
               count(*) FILTER (WHERE status = 'completed') AS done,
               count(*) FILTER (WHERE status = 'no_show')   AS ns,
               count(*) AS total
          FROM appointments GROUP BY customer_id) s
 WHERE s.customer_id = c.id AND c.note = '[scale-seed]';

ANALYZE services; ANALYZE stylists; ANALYZE stylist_services; ANALYZE customers;
ANALYZE stylist_shifts; ANALYZE appointments; ANALYZE appointment_services;
