-- ============================================================================
--  HỆ THỐNG ĐẶT LỊCH SALON - SPA
--  schema.sql  |  PostgreSQL 15
--  Quy ước: MỌI thời điểm tuyệt đối lưu bằng TIMESTAMPTZ (UTC trong DB),
--           quy đổi sang Asia/Ho_Chi_Minh ở tầng hiển thị.
--           Giờ trong tuần / ca làm lưu bằng TIME (giờ địa phương của tiệm).
-- ============================================================================

SET client_encoding = 'UTF8';

-- ---------------------------------------------------------------------------
-- 0. EXTENSIONS
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "btree_gist";  -- EXCLUDE (uuid WITH =, range WITH &&)
CREATE EXTENSION IF NOT EXISTS "unaccent";    -- tìm kiếm không dấu
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- tìm kiếm gần đúng theo tên/SĐT

-- Hàm bỏ dấu IMMUTABLE để dùng được trong index (unaccent gốc là STABLE)
CREATE OR REPLACE FUNCTION f_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$$ SELECT public.unaccent('public.unaccent', $1) $$;

-- Trigger dùng chung: tự cập nhật updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- 1. KIỂU LIỆT KÊ (ENUM)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('customer','stylist','receptionist','owner','admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE appointment_status AS ENUM
    ('pending','confirmed','arrived','in_progress','completed','cancelled','no_show');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE appointment_source AS ENUM ('online','walk_in');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('cash','transfer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM ('draft','paid','closed','adjusted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE discount_type AS ENUM ('percent','amount');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE audit_action AS ENUM ('create','update','delete','login','logout','view');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE email_status AS ENUM ('pending','sent','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE email_kind AS ENUM
    ('booking_confirmation','booking_reminder','booking_changed','booking_cancelled',
     'review_invitation','account_created','password_reset');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM
    ('appointment_assigned','appointment_rescheduled','appointment_cancelled',
     'customer_checked_in','overrun_warning','appointment_new');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 2. TÀI KHOẢN & PHÂN QUYỀN  (EP-01 / S1-01 → S1-04, S1-09)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name              VARCHAR(120) NOT NULL,
  email                  VARCHAR(160) NOT NULL,
  phone                  VARCHAR(20),
  password_hash          VARCHAR(120) NOT NULL,
  role                   user_role    NOT NULL DEFAULT 'receptionist',
  is_active              BOOLEAN      NOT NULL DEFAULT TRUE,
  must_change_password   BOOLEAN      NOT NULL DEFAULT FALSE,
  failed_login_attempts  SMALLINT     NOT NULL DEFAULT 0,
  locked_until           TIMESTAMPTZ,
  last_login_at          TIMESTAMPTZ,
  -- Mọi phiên phát hành trước mốc này đều bị coi là hết hiệu lực (S1-02, S1-04)
  sessions_valid_from    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT users_email_format CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT users_attempts_range CHECK (failed_login_attempts BETWEEN 0 AND 100)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email ON users (lower(email));
CREATE INDEX IF NOT EXISTS ix_users_role_active ON users (role, is_active);
DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(128) NOT NULL,
  user_agent  VARCHAR(255),
  ip_address  VARCHAR(64),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_refresh_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS ix_refresh_user ON refresh_tokens (user_id, revoked_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(128) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,   -- 30 phút (S1-04)
  used_at     TIMESTAMPTZ,
  requested_ip VARCHAR(64),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_reset_hash ON password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS ix_reset_user_created ON password_reset_tokens (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. DANH MỤC DỊCH VỤ  (EP-02 / S1-05, S1-06)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(120) NOT NULL,
  display_order SMALLINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_category_name ON service_categories (lower(name));
DROP TRIGGER IF EXISTS trg_categories_updated ON service_categories;
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON service_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS services (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id      UUID NOT NULL REFERENCES service_categories(id) ON DELETE RESTRICT,
  name             VARCHAR(160) NOT NULL,
  duration_minutes SMALLINT NOT NULL,
  price            NUMERIC(12,0) NOT NULL,
  description      VARCHAR(500),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- S1-05: bội số 15, từ 15 đến 240 phút
  CONSTRAINT services_duration_range CHECK (duration_minutes BETWEEN 15 AND 240),
  CONSTRAINT services_duration_step  CHECK (duration_minutes % 15 = 0),
  -- S1-05: số nguyên dương tối đa 20.000.000 đ
  CONSTRAINT services_price_range    CHECK (price > 0 AND price <= 20000000)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_service_name ON services (lower(name));
CREATE INDEX IF NOT EXISTS ix_services_category ON services (category_id, is_active);
CREATE INDEX IF NOT EXISTS ix_services_name_unaccent
  ON services USING gin (f_unaccent(lower(name)) gin_trgm_ops);
DROP TRIGGER IF EXISTS trg_services_updated ON services;
CREATE TRIGGER trg_services_updated BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. THỢ, KỸ NĂNG, CA LÀM, NGÀY NGHỈ  (EP-02 / S1-07, S1-08, S2-01, S2-02)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stylists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  full_name   VARCHAR(120) NOT NULL,
  phone       VARCHAR(20),
  avatar_url  VARCHAR(400),
  bio         VARCHAR(500),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_stylists_active ON stylists (is_active);
-- Giới tính thợ (Nam/Nữ) để ảnh đại diện mặc định khớp giới tính. NULL = hồ sơ cũ chưa khai báo.
ALTER TABLE stylists ADD COLUMN IF NOT EXISTS gender VARCHAR(10);
ALTER TABLE stylists DROP CONSTRAINT IF EXISTS ck_stylists_gender;
ALTER TABLE stylists ADD CONSTRAINT ck_stylists_gender CHECK (gender IS NULL OR gender IN ('male', 'female'));
DROP TRIGGER IF EXISTS trg_stylists_updated ON stylists;
CREATE TRIGGER trg_stylists_updated BEFORE UPDATE ON stylists
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS stylist_services (
  stylist_id UUID NOT NULL REFERENCES stylists(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id)  ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (stylist_id, service_id)
);
CREATE INDEX IF NOT EXISTS ix_stylist_services_service ON stylist_services (service_id);

-- S1-08: giờ mở cửa của tiệm theo từng thứ (0 = Chủ nhật … 6 = Thứ bảy)
CREATE TABLE IF NOT EXISTS salon_working_hours (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week SMALLINT NOT NULL,
  open_time   TIME NOT NULL DEFAULT '08:00',
  close_time  TIME NOT NULL DEFAULT '20:00',
  is_closed   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT swh_dow_range CHECK (day_of_week BETWEEN 0 AND 6),
  -- Giờ đóng phải sau giờ mở ít nhất 60 phút
  CONSTRAINT swh_min_60m CHECK (
    is_closed = TRUE OR (close_time - open_time) >= INTERVAL '60 minutes'
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_swh_dow ON salon_working_hours (day_of_week);
DROP TRIGGER IF EXISTS trg_swh_updated ON salon_working_hours;
CREATE TRIGGER trg_swh_updated BEFORE UPDATE ON salon_working_hours
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- S2-01: ca làm theo ngày của từng thợ, cho phép nhiều ca / ngày, có nghỉ giữa ca
CREATE TABLE IF NOT EXISTS stylist_shifts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stylist_id  UUID NOT NULL REFERENCES stylists(id) ON DELETE CASCADE,
  work_date   DATE NOT NULL,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  break_start TIME,
  break_end   TIME,
  note        VARCHAR(255),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shift_time_order CHECK (end_time > start_time),
  CONSTRAINT shift_break_pair CHECK (
    (break_start IS NULL AND break_end IS NULL)
    OR (break_start IS NOT NULL AND break_end IS NOT NULL
        AND break_end > break_start
        AND break_start >= start_time AND break_end <= end_time)
  ),
  -- Ca của cùng một thợ trong cùng một ngày không được chồng lấn
  CONSTRAINT stylist_shifts_no_overlap EXCLUDE USING gist (
    stylist_id WITH =,
    tsrange(work_date + start_time, work_date + end_time, '[)') WITH &&
  )
);
CREATE INDEX IF NOT EXISTS ix_shifts_stylist_date ON stylist_shifts (stylist_id, work_date);
CREATE INDEX IF NOT EXISTS ix_shifts_date ON stylist_shifts (work_date);
DROP TRIGGER IF EXISTS trg_shifts_updated ON stylist_shifts;
CREATE TRIGGER trg_shifts_updated BEFORE UPDATE ON stylist_shifts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- S2-02: ngày nghỉ toàn tiệm (theo khoảng ngày)
CREATE TABLE IF NOT EXISTS salon_holidays (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  reason     VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT holiday_range CHECK (end_date >= start_date),
  CONSTRAINT salon_holidays_no_overlap EXCLUDE USING gist (
    daterange(start_date, end_date, '[]') WITH &&
  )
);
CREATE INDEX IF NOT EXISTS ix_holidays_range ON salon_holidays (start_date, end_date);
DROP TRIGGER IF EXISTS trg_holidays_updated ON salon_holidays;
CREATE TRIGGER trg_holidays_updated BEFORE UPDATE ON salon_holidays
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- S2-02: ngày nghỉ riêng của thợ (cả ngày khi start_time/end_time NULL)
CREATE TABLE IF NOT EXISTS stylist_time_off (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stylist_id UUID NOT NULL REFERENCES stylists(id) ON DELETE CASCADE,
  off_date   DATE NOT NULL,
  start_time TIME,
  end_time   TIME,
  reason     VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT time_off_pair CHECK (
    (start_time IS NULL AND end_time IS NULL)
    OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  )
);
CREATE INDEX IF NOT EXISTS ix_time_off_stylist_date ON stylist_time_off (stylist_id, off_date);
DROP TRIGGER IF EXISTS trg_time_off_updated ON stylist_time_off;
CREATE TRIGGER trg_time_off_updated BEFORE UPDATE ON stylist_time_off
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. HỒ SƠ KHÁCH HÀNG  (EP-05 / S3-10)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     VARCHAR(120) NOT NULL,
  phone         VARCHAR(20)  NOT NULL,
  email         VARCHAR(160),
  total_visits  INTEGER NOT NULL DEFAULT 0,
  no_show_count INTEGER NOT NULL DEFAULT 0,
  note          VARCHAR(1000),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- SĐT Việt Nam 10 chữ số (S2-07)
  CONSTRAINT customers_phone_format CHECK (phone ~ '^0[0-9]{9}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_customers_phone ON customers (phone);
-- Tổng số lịch đã đặt (mọi trạng thái). Khác total_visits (chỉ 'completed') và no_show_count (chỉ 'no_show').
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_appointments INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS ix_customers_name_trgm
  ON customers USING gin (f_unaccent(lower(full_name)) gin_trgm_ops);
DROP TRIGGER IF EXISTS trg_customers_updated ON customers;
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. LỊCH HẸN  (EP-03, EP-04)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 VARCHAR(8) NOT NULL,          -- mã tra cứu 8 ký tự (S2-07)
  customer_id          UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  stylist_id           UUID NOT NULL REFERENCES stylists(id)  ON DELETE RESTRICT,
  start_at             TIMESTAMPTZ NOT NULL,
  end_at               TIMESTAMPTZ NOT NULL,
  total_duration_minutes SMALLINT NOT NULL,
  estimated_total      NUMERIC(12,0) NOT NULL DEFAULT 0,
  status               appointment_status NOT NULL DEFAULT 'pending',
  source               appointment_source NOT NULL DEFAULT 'online',
  customer_note        VARCHAR(300),
  -- Vòng đời
  confirmed_at         TIMESTAMPTZ,
  confirmed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  rejected_reason      VARCHAR(255),
  arrived_at           TIMESTAMPTZ,
  checked_in_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  is_late              BOOLEAN NOT NULL DEFAULT FALSE,
  late_minutes         SMALLINT NOT NULL DEFAULT 0,
  started_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  actual_duration_minutes SMALLINT,
  cancelled_at         TIMESTAMPTZ,
  cancelled_by_user    UUID REFERENCES users(id) ON DELETE SET NULL,
  cancelled_by_label   VARCHAR(60),                  -- 'Khách hàng' | tên nhân sự
  cancel_reason        VARCHAR(255),
  no_show_at           TIMESTAMPTZ,
  no_show_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  reminder_sent_at     TIMESTAMPTZ,
  confirmation_sent_at TIMESTAMPTZ,
  created_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  created_ip           VARCHAR(64),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT appt_time_order CHECK (end_at > start_at),
  CONSTRAINT appt_duration_positive CHECK (total_duration_minutes > 0),
  -- S2-08: ràng buộc chặn chồng lấn ở TẦNG CƠ SỞ DỮ LIỆU, không chỉ ở ứng dụng
  CONSTRAINT appointments_no_overlap EXCLUDE USING gist (
    stylist_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status IN ('pending','confirmed','arrived','in_progress'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_appointments_code ON appointments (code);
CREATE INDEX IF NOT EXISTS ix_appt_stylist_start ON appointments (stylist_id, start_at);
CREATE INDEX IF NOT EXISTS ix_appt_start         ON appointments (start_at);
CREATE INDEX IF NOT EXISTS ix_appt_status_start  ON appointments (status, start_at);
CREATE INDEX IF NOT EXISTS ix_appt_customer      ON appointments (customer_id, start_at DESC);
CREATE INDEX IF NOT EXISTS ix_appt_pending       ON appointments (created_at)
  WHERE status = 'pending';
DROP TRIGGER IF EXISTS trg_appt_updated ON appointments;
CREATE TRIGGER trg_appt_updated BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS appointment_services (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id   UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  service_id       UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  -- Ảnh chụp giá & thời lượng tại thời điểm đặt: đổi bảng giá không làm lệch lịch cũ (S1-05)
  price_snapshot   NUMERIC(12,0) NOT NULL,
  duration_snapshot SMALLINT NOT NULL,
  name_snapshot    VARCHAR(160) NOT NULL,
  position         SMALLINT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_appt_services_appt ON appointment_services (appointment_id);
CREATE INDEX IF NOT EXISTS ix_appt_services_service ON appointment_services (service_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_appt_service_pair
  ON appointment_services (appointment_id, service_id);

-- S4-03: ghi chú kỹ thuật của thợ (chỉ nội bộ)
CREATE TABLE IF NOT EXISTS service_notes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  customer_id    UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  stylist_id     UUID REFERENCES stylists(id) ON DELETE SET NULL,
  content        VARCHAR(500) NOT NULL,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_service_note_appt ON service_notes (appointment_id);
CREATE INDEX IF NOT EXISTS ix_service_notes_customer ON service_notes (customer_id, created_at DESC);
DROP TRIGGER IF EXISTS trg_service_notes_updated ON service_notes;
CREATE TRIGGER trg_service_notes_updated BEFORE UPDATE ON service_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Lịch sử thay đổi lịch hẹn (S3-04: ghi người thực hiện, giá trị cũ / mới)
CREATE TABLE IF NOT EXISTS appointment_changes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  field          VARCHAR(60) NOT NULL,
  old_value      VARCHAR(255),
  new_value      VARCHAR(255),
  changed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_by_name VARCHAR(120),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_appt_changes_appt ON appointment_changes (appointment_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 7. THANH TOÁN  (EP-05 / S4-01, S4-02)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vouchers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           VARCHAR(30) NOT NULL,
  description    VARCHAR(255),
  discount_type  discount_type NOT NULL,
  discount_value NUMERIC(12,0) NOT NULL,
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  max_usage      INTEGER,
  used_count     INTEGER NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT voucher_range CHECK (end_date >= start_date),
  CONSTRAINT voucher_value CHECK (
    discount_value > 0 AND (discount_type <> 'percent' OR discount_value <= 100)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_voucher_code ON vouchers (upper(code));
DROP TRIGGER IF EXISTS trg_vouchers_updated ON vouchers;
CREATE TRIGGER trg_vouchers_updated BEFORE UPDATE ON vouchers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS invoices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             VARCHAR(16) NOT NULL,
  appointment_id   UUID NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT,
  customer_id      UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  stylist_id       UUID NOT NULL REFERENCES stylists(id) ON DELETE RESTRICT,
  subtotal         NUMERIC(12,0) NOT NULL DEFAULT 0,
  voucher_id       UUID REFERENCES vouchers(id) ON DELETE SET NULL,
  voucher_code     VARCHAR(30),
  discount_amount  NUMERIC(12,0) NOT NULL DEFAULT 0,
  total            NUMERIC(12,0) NOT NULL DEFAULT 0,
  payment_method   payment_method,
  transfer_note    VARCHAR(255),
  status           invoice_status NOT NULL DEFAULT 'draft',
  -- Phiếu điều chỉnh (S4-01)
  adjusts_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  adjust_reason    VARCHAR(255),
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  paid_at          TIMESTAMPTZ,
  closed_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT invoice_amounts CHECK (subtotal >= 0 AND discount_amount >= 0 AND total >= 0),
  CONSTRAINT invoice_transfer_note CHECK (
    payment_method IS DISTINCT FROM 'transfer'
    OR (transfer_note IS NOT NULL AND length(btrim(transfer_note)) > 0)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_invoice_code ON invoices (code);
-- Một lịch hẹn chỉ có đúng một phiếu gốc (phiếu điều chỉnh không tính)
CREATE UNIQUE INDEX IF NOT EXISTS ux_invoice_appointment_primary
  ON invoices (appointment_id) WHERE adjusts_invoice_id IS NULL;
CREATE INDEX IF NOT EXISTS ix_invoice_stylist_closed ON invoices (stylist_id, closed_at);
-- Khoá ngoại không có chỉ mục -> lịch sử khách / kiểm tra RESTRICT khi xoá phải quét toàn bảng
CREATE INDEX IF NOT EXISTS ix_invoice_customer ON invoices (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_invoice_voucher  ON invoices (voucher_id) WHERE voucher_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_invoice_status_closed  ON invoices (status, closed_at);
DROP TRIGGER IF EXISTS trg_invoices_updated ON invoices;
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS invoice_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  service_id  UUID REFERENCES services(id) ON DELETE SET NULL,
  name        VARCHAR(160) NOT NULL,
  unit_price  NUMERIC(12,0) NOT NULL,
  quantity    SMALLINT NOT NULL DEFAULT 1,
  line_total  NUMERIC(12,0) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT invoice_item_qty CHECK (quantity > 0),
  CONSTRAINT invoice_item_price CHECK (unit_price >= 0)
);
CREATE INDEX IF NOT EXISTS ix_invoice_items_invoice ON invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS ix_invoice_items_service ON invoice_items (service_id);

-- ---------------------------------------------------------------------------
-- 8. ĐÁNH GIÁ  (EP-05 / S4-04)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id   UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  stylist_id       UUID NOT NULL REFERENCES stylists(id) ON DELETE CASCADE,
  customer_id      UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  rating           SMALLINT,
  comment          VARCHAR(500),
  token            VARCHAR(64) NOT NULL,     -- liên kết dùng 1 lần, hạn 7 ngày
  token_expires_at TIMESTAMPTZ NOT NULL,
  submitted_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT review_rating_range CHECK (rating IS NULL OR rating BETWEEN 1 AND 5)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_review_appointment ON reviews (appointment_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_review_token ON reviews (token);
CREATE INDEX IF NOT EXISTS ix_review_stylist ON reviews (stylist_id) WHERE submitted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_review_customer ON reviews (customer_id);

-- ---------------------------------------------------------------------------
-- 9. THÔNG BÁO & EMAIL  (EP-06 / S4-05, S4-06)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type           notification_type NOT NULL,
  title          VARCHAR(160) NOT NULL,
  body           VARCHAR(500) NOT NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  is_read        BOOLEAN NOT NULL DEFAULT FALSE,
  read_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_notifications_user ON notifications (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_notifications_created ON notifications (created_at);

CREATE TABLE IF NOT EXISTS email_queue (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind           email_kind NOT NULL,
  to_email       VARCHAR(160) NOT NULL,
  to_name        VARCHAR(120),
  subject        VARCHAR(255) NOT NULL,
  body_html      TEXT NOT NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  status         email_status NOT NULL DEFAULT 'pending',
  attempts       SMALLINT NOT NULL DEFAULT 0,
  last_error     VARCHAR(500),
  scheduled_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT email_attempts_max CHECK (attempts >= 0 AND attempts <= 10)
);
CREATE INDEX IF NOT EXISTS ix_email_queue_due
  ON email_queue (status, next_attempt_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS ix_email_queue_appt ON email_queue (appointment_id, kind);
DROP TRIGGER IF EXISTS trg_email_queue_updated ON email_queue;
CREATE TRIGGER trg_email_queue_updated BEFORE UPDATE ON email_queue
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 10. NHẬT KÝ HOẠT ĐỘNG  (S1-09) — chỉ đọc, không vai trò nào sửa/xoá
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_email VARCHAR(160),
  actor_role  user_role,
  action      audit_action NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id   VARCHAR(64),
  summary     VARCHAR(500) NOT NULL,
  changes     JSONB,
  ip_address  VARCHAR(64),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_audit_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_actor   ON audit_logs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_entity  ON audit_logs (entity_type, entity_id);

-- Chặn UPDATE / DELETE trên nhật ký, kể cả Admin
CREATE OR REPLACE FUNCTION audit_logs_readonly()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Nhật ký hoạt động chỉ đọc, không được sửa hoặc xoá';
END $$;
DROP TRIGGER IF EXISTS trg_audit_readonly ON audit_logs;
CREATE TRIGGER trg_audit_readonly BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_readonly();

-- ---------------------------------------------------------------------------
-- 11. CHỐNG SPAM / GIỚI HẠN TẦN SUẤT  (S2-07, S2-09, S1-04)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
  id            BIGSERIAL PRIMARY KEY,
  scope         VARCHAR(40) NOT NULL,   -- 'booking_ip' | 'lookup_ip' | 'reset_email'
  identifier    VARCHAR(160) NOT NULL,  -- IP hoặc email
  hit_count     INTEGER NOT NULL DEFAULT 0,
  window_start  TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_until TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_rate_limit ON rate_limits (scope, identifier);
CREATE INDEX IF NOT EXISTS ix_rate_limit_window ON rate_limits (window_start);

-- ---------------------------------------------------------------------------
-- 12. KHUNG NHÌN HỖ TRỢ BÁO CÁO  (S4-07, S4-09)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_revenue_by_stylist AS
SELECT
  i.stylist_id,
  s.full_name                                  AS stylist_name,
  (i.closed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS business_date,
  COUNT(*)                                     AS completed_count,
  SUM(i.total)                                 AS revenue,
  ROUND(AVG(i.total))                          AS avg_per_visit
FROM invoices i
JOIN stylists s ON s.id = i.stylist_id
WHERE i.status = 'closed' AND i.closed_at IS NOT NULL
GROUP BY i.stylist_id, s.full_name, business_date;

CREATE OR REPLACE VIEW v_revenue_by_service AS
SELECT
  ii.service_id,
  ii.name                                      AS service_name,
  (i.closed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS business_date,
  SUM(ii.quantity)                             AS quantity,
  SUM(ii.line_total)                           AS revenue
FROM invoice_items ii
JOIN invoices i ON i.id = ii.invoice_id
WHERE i.status = 'closed' AND i.closed_at IS NOT NULL
GROUP BY ii.service_id, ii.name, business_date;

CREATE OR REPLACE VIEW v_stylist_rating AS
SELECT
  r.stylist_id,
  COUNT(*)                        AS review_count,
  ROUND(AVG(r.rating)::numeric, 2) AS avg_rating
FROM reviews r
WHERE r.submitted_at IS NOT NULL AND r.rating IS NOT NULL
GROUP BY r.stylist_id;

-- ============================================================================
--  KẾT THÚC schema.sql
-- ============================================================================
