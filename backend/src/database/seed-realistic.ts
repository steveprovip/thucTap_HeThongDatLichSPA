/**
 * TASK v4 · NV2 — nạp DỮ LIỆU THỰC TẾ cho máy phát triển / trình diễn, thay bộ dữ liệu tải "Tải thử DV 001..100":
 *   npm run seed:realistic             -> dọn dữ liệu rác + danh mục thật (43 dịch vụ, 14 chuyên viên) + ~900 khách
 *                                        + lịch hẹn 120 ngày qua → 21 ngày tới (giờ vàng, combo, chờ xác nhận… đều có ý nghĩa)
 *   npm run seed:realistic -- --scale  -> quy mô đo hiệu năng: 10.000 khách, 365 ngày lịch sử (thay `seed:scale` cũ)
 * `npm run seed` (launcher chế độ dev) tự chạy bước này sau seed.sql — đặt SALON_SEED_REALISTIC=off để bỏ qua.
 *
 * Chạy lại bao nhiêu lần cũng KHÔNG nhân đôi: mã lịch hẹn tất định theo (thợ, ngày, giờ) nên ngày nào của thợ đã có lịch
 * do bộ này sinh thì bỏ qua; khách theo SĐT; ca theo (thợ, ngày). Tôn trọng mọi bất biến: thời lượng bội số 15, lịch nằm
 * trong ca và ngoài giờ nghỉ, lưới 15 phút, không chồng lấn với BẤT KỲ lịch nào khác của thợ (kể cả lịch đã hoàn tất),
 * thợ chỉ nhận dịch vụ mình có kỹ năng, mỗi khách tối đa 1 lịch / ngày và ≤ 2 lịch đang mở.
 * Chỉ cho máy phát triển: bị chặn khi NODE_ENV=production (trừ SEED_ALLOW_PRODUCTION=1).
 */
import 'reflect-metadata';
import { randomBytes } from 'crypto';
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { addDays, combineMinutes, dayOfWeek, minutesToTime, timeToMinutes, todaySalon } from '../common/utils/time.util';
import { describeDb, resolveDbConnection } from '../config/db-connection';
import { connectWithRetry, hintFor, PgError } from './db-tools';
import { runMigrations } from './migrate';
import {
  ADD_ONS, CATEGORIES, CUSTOMER_NOTES, CUSTOMER_RENAMES, CUSTOMER_REQUESTS, FEMALE_GIVEN, FEMALE_MIDDLE, kindOf, MALE_GIVEN,
  MALE_MIDDLE, PHONE_PREFIXES, REVIEW_COMMENTS, SERVICE_NOTES, SERVICES, ServiceKey, ServiceSeed, STYLISTS, StylistSeed, SURNAMES,
} from './realistic/catalog';

// ------------------------------------------------------------------------------------------------ hàm thuần (có test)

/** Băm chuỗi → số 32 bit (xmur3) — hạt giống cho dãy ngẫu nhiên tất định. */
export function hash32(str: string, seed = 0): number {
  let h = (1779033703 ^ str.length ^ seed) >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32 — dãy số giả ngẫu nhiên tất định trong [0, 1) theo một chuỗi khoá. */
export function rng(key: string): () => number {
  let a = hash32(key);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // cùng bảng chữ với generateBookingCode của máy chủ

/** Mã tra cứu 8 ký tự, tất định theo (thợ, ngày, giờ bắt đầu) → chạy lại không sinh trùng lịch. */
export function bookingCode(stylistId: string, date: string, hhmm: string): string {
  const key = `${stylistId}|${date}|${hhmm}`;
  let a = hash32(key, 0x9e3779b9);
  let b = hash32(key, 0x85ebca6b);
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    if (i < 4) { out += CODE_ALPHABET[a % 31]; a = Math.floor(a / 31); } else { out += CODE_ALPHABET[b % 31]; b = Math.floor(b / 31); }
  }
  return out;
}

const pick = <T>(list: readonly T[], r: () => number): T => list[Math.floor(r() * list.length)];

function weighted<T>(items: readonly [T, number][], r: () => number): T {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let x = r() * total;
  for (const [item, w] of items) { x -= w; if (x < 0) return item; }
  return items[items.length - 1][0];
}

const slug = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export interface CustomerSeed { fullName: string; phone: string; email: string | null; note: string | null; gender: 'male' | 'female'; createdDaysAgo: number }

/** Khách hàng tên Việt thật, SĐT theo dải 098 / 090 / 091 / 038 / 077 (không trùng), ~35% có email @example.com. */
export function makeCustomers(n: number): CustomerSeed[] {
  const r = rng(`customers-v1-${n}`);
  const phones = new Set<string>();
  const out: CustomerSeed[] = [];
  while (out.length < n) {
    const gender: 'male' | 'female' = r() < 0.72 ? 'female' : 'male'; // khách salon & spa phần lớn là nữ
    const surname = weighted(SURNAMES, r);
    const middle = pick(gender === 'female' ? FEMALE_MIDDLE : MALE_MIDDLE, r);
    const given = pick(gender === 'female' ? FEMALE_GIVEN : MALE_GIVEN, r);
    const phone = `${pick(PHONE_PREFIXES, r)}${String(Math.floor(r() * 10_000_000)).padStart(7, '0')}`;
    if (phones.has(phone)) continue;
    phones.add(phone);
    const i = out.length;
    out.push({
      fullName: `${surname} ${middle} ${given}`,
      phone,
      email: r() < 0.35 ? `${slug(given)}.${slug(surname)}${i % 97}@example.com` : null,
      note: r() < 0.1 ? pick(CUSTOMER_NOTES, r) : null,
      gender,
      createdDaysAgo: Math.floor(r() * 720),
    });
  }
  return out;
}

export interface OpenHours { open: number; close: number; closed: boolean }
export interface PlannedShift { start: number; end: number; breakStart: number | null; breakEnd: number | null; note: string }

/** ISO week number parity — thợ "xoay ca" đổi sáng / chiều theo tuần. */
const weekParity = (date: string): number => Math.floor((Date.parse(`${date}T00:00:00Z`) / 86_400_000 + 3) / 7) % 2;

/** Ca làm thực tế theo kiểu của từng thợ, cắt theo giờ mở cửa ngày đó. null = nghỉ. */
export function shiftFor(stylist: Pick<StylistSeed, 'offDay' | 'pattern'>, date: string, hours: OpenHours): PlannedShift | null {
  const dow = dayOfWeek(date);
  if (hours.closed || dow === stylist.offDay) return null;
  const weekend = dow === 0 || dow === 6;
  const kind = stylist.pattern === 'rotate' ? (weekParity(date) ? 'early' : 'late') : stylist.pattern;
  let s: number; let e: number; let bs: number | null; let be: number | null; let note: string;
  if (kind === 'full') {
    s = weekend ? 510 : 540; e = weekend ? 1050 : 1080; bs = 720; be = weekend ? 765 : 780; note = 'Ca hành chính';
  } else if (kind === 'early') {
    s = hours.open; e = hours.open + 390; bs = 705; be = 735; note = 'Ca sáng';
  } else {
    s = weekend ? 780 : 720; e = hours.close; bs = 990; be = 1020; note = 'Ca chiều – tối';
  }
  s = Math.max(s, hours.open);
  e = Math.min(e, hours.close);
  if (e - s < 240) return null;
  if (bs !== null && be !== null && (bs < s || be > e)) { bs = null; be = null; }
  return { start: s, end: e, breakStart: bs, breakEnd: be, note };
}

/** Nhu cầu đặt lịch theo thứ × giờ: tối ngày thường và sáng / chiều cuối tuần là giờ vàng, sáng ngày thường vắng. */
export function demandAt(dow: number, minute: number): number {
  const h = minute / 60;
  const weekend = dow === 0 || dow === 6;
  const base = weekend
    ? (h < 9 ? 0.35 : h < 12 ? 0.8 : h < 13.5 ? 0.45 : h < 18 ? 0.74 : h < 20 ? 0.55 : 0.3)
    : (h < 10 ? 0.2 : h < 12 ? 0.36 : h < 13.5 ? 0.28 : h < 17 ? 0.4 : h < 20 ? 0.76 : 0.3);
  return base * [1.1, 0.85, 0.8, 0.88, 0.95, 1.08, 1.15][dow];
}

export interface PlannedAppointment { start: number; services: ServiceSeed[]; duration: number }

const ADD_ON_MAP = new Map<ServiceKey, ServiceKey[]>();
for (const [a, b] of ADD_ONS) ADD_ON_MAP.set(a, [...(ADD_ON_MAP.get(a) ?? []), b]);

/**
 * Lập lịch một ngày của một thợ: đi theo lưới 15 phút trong các đoạn làm việc (ca trừ giờ nghỉ), né khoảng đã bận,
 * xác suất có khách theo demandAt × độ đắt khách × độ xa ngày; dịch vụ chọn trong kỹ năng theo độ phổ biến, 18% có thêm
 * dịch vụ đi kèm (combo thật). Trả về lịch không chồng lấn, nằm gọn trong đoạn làm việc.
 */
export function planDay(input: {
  dow: number; segments: [number, number][]; busy: [number, number][]; skills: ServiceSeed[]; demand: number; factor: number; r: () => number;
}): PlannedAppointment[] {
  const { dow, segments, busy, skills, demand, factor, r } = input;
  const out: PlannedAppointment[] = [];
  const byKey = new Map(skills.map((s) => [s.key, s]));
  const overlapsBusy = (a: number, b: number): [number, number] | undefined => busy.find(([x, y]) => a < y && x < b);
  for (const [segStart, segEnd] of segments) {
    let t = Math.ceil(segStart / 15) * 15;
    while (t + 30 <= segEnd) {
      const blocked = overlapsBusy(t, t + 15);
      if (blocked) { t = Math.ceil(blocked[1] / 15) * 15; continue; }
      if (r() >= Math.min(0.95, demandAt(dow, t) * demand * factor)) { t += 15; continue; }
      const nextBusy = busy.filter(([x]) => x >= t).reduce((m, [x]) => Math.min(m, x), segEnd);
      const room = Math.min(segEnd, nextBusy) - t;
      const fits = skills.filter((s) => s.duration <= room);
      if (!fits.length) { t += 15; continue; }
      const first = weighted(fits.map((s) => [s, s.weight] as [ServiceSeed, number]), r);
      const services = [first];
      if (r() < 0.18) {
        const addOn = (ADD_ON_MAP.get(first.key) ?? []).map((k) => byKey.get(k)).find((s) => s && first.duration + s.duration <= room);
        if (addOn) services.push(addOn);
      }
      const duration = services.reduce((a, s) => a + s.duration, 0);
      out.push({ start: t, services, duration });
      t += duration + (r() < 0.35 ? 15 : 0); // dọn dẹp / chuẩn bị giữa hai khách
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ ghi CSDL

export interface RealisticOptions {
  historyDays?: number;
  futureDays?: number;
  customers?: number;
  now?: Date;
  log?: (msg: string) => void;
}

export interface RealisticReport {
  removed: Record<string, number>;
  services: number;
  stylists: number;
  customersAdded: number;
  shiftsAdded: number;
  appointmentsAdded: number;
  invoicesAdded: number;
  reviewsAdded: number;
}

/** Dữ liệu rác cần dọn: bộ tải x10 cũ ("Tải thử", "[scale-seed]") và bản ghi do các lượt QA tay để lại trong CSDL phát triển. */
const JUNK = {
  stylist: `(full_name LIKE 'Tải thử Thợ %' OR full_name ~ '^QA[0-9]* Thợ')`,
  customer: `(note = '[scale-seed]' OR email LIKE '%@scale.test' OR full_name ~* '^(QA[0-9]*( |$)|Khach Dong Thoi|Khach Kiem Thu)')`,
  service: `(name LIKE 'Tải thử DV %')`,
  category: `(name LIKE '[scale-seed]%')`,
  user: `(full_name LIKE 'QA %' AND email ~* '^qa[0-9]*\\.[0-9]+@salon\\.vn$')`,
};

/**
 * Dọn dữ liệu rác. Gọi được độc lập (run-seed.ts gọi TRƯỚC seed.sql để seed.sql không sinh ca / lịch cho thợ "Tải thử").
 * Không bao giờ đụng lịch sử tài chính: bản ghi rác đã có phiếu tính tiền đóng thì chỉ đổi tên + ngừng hoạt động.
 */
export async function cleanupJunk(client: Client): Promise<Record<string, number>> {
  await client.query('BEGIN');
  try {
    const removed = await cleanup(client);
    await client.query('COMMIT');
    return removed;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  }
}

async function cleanup(client: Client): Promise<Record<string, number>> {
  const n = async (sql: string): Promise<number> => (await client.query(sql)).rowCount ?? 0;
  const removed: Record<string, number> = {};
  // Lịch hẹn rác chưa có phiếu tính tiền (phiếu đã đóng là lịch sử tài chính — không bao giờ xoá)
  removed.appointments = await n(`
    DELETE FROM appointments a
     WHERE NOT EXISTS (SELECT 1 FROM invoices i WHERE i.appointment_id = a.id)
       AND (a.stylist_id IN (SELECT id FROM stylists WHERE ${JUNK.stylist})
            OR a.customer_id IN (SELECT id FROM customers WHERE ${JUNK.customer})
            OR EXISTS (SELECT 1 FROM appointment_services x JOIN services v ON v.id = x.service_id
                        WHERE x.appointment_id = a.id AND v.${JUNK.service.slice(1, -1)}))`);
  removed.stylists = await n(`
    DELETE FROM stylists s WHERE ${JUNK.stylist}
       AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.stylist_id = s.id)
       AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.stylist_id = s.id)`);
  await n(`UPDATE stylists SET full_name = 'Thợ đã nghỉ việc', is_active = FALSE, bio = NULL WHERE ${JUNK.stylist}`);
  removed.services = await n(`
    DELETE FROM services v WHERE ${JUNK.service}
       AND NOT EXISTS (SELECT 1 FROM appointment_services x WHERE x.service_id = v.id)
       AND NOT EXISTS (SELECT 1 FROM invoice_items it WHERE it.service_id = v.id)`);
  await n(`UPDATE services SET name = 'Dịch vụ ngừng kinh doanh ' || left(id::text, 8), is_active = FALSE, description = NULL WHERE ${JUNK.service}`);
  removed.categories = await n(`
    DELETE FROM service_categories c WHERE ${JUNK.category}
       AND NOT EXISTS (SELECT 1 FROM services v WHERE v.category_id = c.id)`);
  if (await n(`SELECT 1 FROM service_categories WHERE ${JUNK.category}`)) {
    await client.query(`INSERT INTO service_categories (name, display_order) VALUES ('Ngừng kinh doanh', 999) ON CONFLICT DO NOTHING`);
    await client.query(`UPDATE services SET category_id = (SELECT id FROM service_categories WHERE lower(name) = lower('Ngừng kinh doanh'))
                         WHERE category_id IN (SELECT id FROM service_categories WHERE ${JUNK.category})`);
    await client.query(`DELETE FROM service_categories WHERE ${JUNK.category}`);
  }
  removed.customers = await n(`
    DELETE FROM customers c WHERE ${JUNK.customer}
       AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.customer_id = c.id)
       AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.customer_id = c.id)`);
  await n(`UPDATE customers SET full_name = 'Khách lẻ ' || right(phone, 4)
            WHERE full_name ~* '^(QA[0-9]*( |$)|Khach Dong Thoi|Khach Kiem Thu)'`);
  await n(`UPDATE customers SET note = NULL WHERE note = '[scale-seed]'`);
  await n(`UPDATE customers SET email = NULL WHERE email LIKE '%@scale.test'`);
  removed.shifts = await n(`DELETE FROM stylist_shifts WHERE note = '[scale-seed]'`);
  await n(`UPDATE appointments SET cancel_reason = 'Khách bận đột xuất' WHERE cancel_reason LIKE '[scale-seed]%'`);
  // Tài khoản QA: chỉ xoá khi không để lại dấu vết ở bảng lịch sử chỉ-đọc (phiếu đã đóng, nhật ký hoạt động — xoá user sẽ
  // phải sửa created_by / actor_id ở đó và bị trigger chặn); còn lại thì khoá tài khoản
  removed.users = await n(`
    DELETE FROM users u WHERE ${JUNK.user}
       AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.created_by = u.id)
       AND NOT EXISTS (SELECT 1 FROM audit_logs l WHERE l.actor_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM stylists s WHERE s.user_id = u.id)`);
  await n(`UPDATE users SET is_active = FALSE, full_name = 'Tài khoản cũ (đã khoá)' WHERE ${JUNK.user}`);
  return removed;
}

interface CatalogIds { serviceId: Map<ServiceKey, string>; stylistIds: string[]; services: number }

const isSeedImage = (url: string | null): boolean => !url || url.startsWith('https://images.unsplash.com/');

async function upsertCatalog(client: Client): Promise<CatalogIds> {
  // ---- nhóm dịch vụ: thêm nhóm mới; nhóm gốc đổi tên khi còn tên cũ của seed (chủ tiệm chưa sửa tay)
  const cats: { id: string; name: string }[] = (await client.query('SELECT id, name FROM service_categories')).rows;
  const catById = new Map(cats.map((c) => [c.id, c.name]));
  const catOwner = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));
  const catId = new Map<string, string>();
  for (const c of CATEGORIES) {
    const cur = catById.get(c.id);
    const owner = catOwner.get(c.name.toLowerCase());
    if (cur !== undefined) {
      if ((cur === c.name || cur === c.oldName) && (!owner || owner === c.id)) {
        await client.query('UPDATE service_categories SET name = $2, display_order = $3 WHERE id = $1', [c.id, c.name, c.order]);
      }
      catId.set(c.id, c.id);
    } else if (owner) {
      catId.set(c.id, owner);
    } else {
      await client.query('INSERT INTO service_categories (id, name, display_order) VALUES ($1, $2, $3)', [c.id, c.name, c.order]);
      catId.set(c.id, c.id);
    }
  }

  // ---- dịch vụ: dịch vụ gốc đổi sang tên thực tế + ảnh riêng; dịch vụ mới thêm đầy đủ
  const rows: { id: string; name: string; image_url: string | null }[] = (await client.query('SELECT id, name, image_url FROM services')).rows;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const owner = new Map(rows.map((r) => [r.name.toLowerCase(), r.id]));
  const serviceId = new Map<ServiceKey, string>();
  for (const s of SERVICES) {
    const row = byId.get(s.id);
    const nameOwner = owner.get(s.name.toLowerCase());
    if (row) {
      serviceId.set(s.key, s.id);
      const managed = (row.name === s.name || row.name === s.oldName) && (!nameOwner || nameOwner === s.id);
      if (managed) {
        await client.query(
          `UPDATE services SET name = $2, description = $3, category_id = $4,
                  image_url = CASE WHEN image_url IS NULL OR image_url LIKE 'https://images.unsplash.com/%' THEN $5 ELSE image_url END
            WHERE id = $1`, [s.id, s.name, s.description, catId.get(s.categoryId), s.imageUrl]);
      } else if (isSeedImage(row.image_url) && !row.image_url) {
        await client.query('UPDATE services SET image_url = $2 WHERE id = $1 AND image_url IS NULL', [s.id, s.imageUrl]);
      }
    } else if (nameOwner) {
      serviceId.set(s.key, nameOwner);
    } else {
      await client.query(
        `INSERT INTO services (id, category_id, name, duration_minutes, price, description, image_url, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)`,
        [s.id, catId.get(s.categoryId), s.name, s.duration, s.price, s.description, s.imageUrl]);
      serviceId.set(s.key, s.id);
    }
  }

  // ---- chuyên viên: 5 thợ gốc (có tài khoản stylist1..5) đổi sang hồ sơ thực tế, 9 thợ mới thêm; kỹ năng theo chuyên môn
  const staff: { id: string; full_name: string }[] = (await client.query('SELECT id, full_name FROM stylists WHERE id = ANY($1::uuid[])',
    [STYLISTS.map((s) => s.id)])).rows;
  const staffById = new Map(staff.map((s) => [s.id, s.full_name]));
  const stylistIds: string[] = [];
  for (const st of STYLISTS) {
    const cur = staffById.get(st.id);
    const skills = Array.from(new Set(st.skills.map((k) => serviceId.get(k)).filter((x): x is string => !!x)));
    if (cur === undefined) {
      await client.query(
        `INSERT INTO stylists (id, full_name, phone, gender, bio, avatar_url, is_active) VALUES ($1, $2, $3, $4, $5, $6, TRUE)
         ON CONFLICT (id) DO NOTHING`, [st.id, st.fullName, st.phone, st.gender, st.bio, st.avatarUrl]);
    } else if (cur === st.fullName || cur === st.oldName) {
      await client.query(
        `UPDATE stylists SET full_name = $2, phone = $3, gender = $4, bio = $5,
                avatar_url = CASE WHEN avatar_url IS NULL OR avatar_url LIKE 'https://images.unsplash.com/%' THEN $6 ELSE avatar_url END
          WHERE id = $1`, [st.id, st.fullName, st.phone, st.gender, st.bio, st.avatarUrl]);
      if (st.userId) {
        await client.query('UPDATE users SET full_name = $2, phone = $3 WHERE id = $1 AND full_name IN ($4, $2)',
          [st.userId, st.fullName, st.phone, st.oldName ?? st.fullName]);
      }
      // Kỹ năng cũ của seed.sql được GIỮ (lịch sử / lịch sắp tới của seed.sql vẫn khớp kỹ năng); lịch do bộ này sinh
      // chỉ dùng đúng chuyên môn khai báo trong catalog.
    } else {
      continue; // chủ tiệm đã sửa hồ sơ thợ này bằng tay → giữ nguyên, không sinh lịch thay
    }
    await client.query(
      'INSERT INTO stylist_services (stylist_id, service_id) SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING', [st.id, skills]);
    stylistIds.push(st.id);
  }

  for (const c of CUSTOMER_RENAMES) {
    await client.query('UPDATE customers SET full_name = $3 WHERE id = $1 AND full_name = $2', [c.id, c.from, c.to]);
  }
  return { serviceId, stylistIds, services: SERVICES.length };
}

interface PoolCustomer { id: string; gender: 'male' | 'female'; email: string | null; fullName: string }

/**
 * Nạp riêng danh sách khách thực tế. run-seed.ts gọi TRƯỚC seed.sql để lịch mẫu của seed.sql (chọn khách ngẫu nhiên
 * trong toàn bảng) rải đều cho ~900 khách thay vì dồn vào 15 khách mẫu.
 */
export async function seedRealisticCustomers(client: Client, n = 900): Promise<number> {
  return (await upsertCustomers(client, n)).added;
}

async function upsertCustomers(client: Client, n: number): Promise<{ added: number; pool: PoolCustomer[] }> {
  const list = makeCustomers(n);
  let added = 0;
  for (let i = 0; i < list.length; i += 500) {
    const chunk = list.slice(i, i + 500);
    const values: unknown[] = [];
    const rows = chunk.map((c, j) => {
      values.push(c.fullName, c.phone, c.email, c.note, c.createdDaysAgo);
      const b = j * 5;
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, now() - make_interval(days => $${b + 5}::int))`;
    });
    const res = await client.query(
      `INSERT INTO customers (full_name, phone, email, note, created_at) VALUES ${rows.join(',')} ON CONFLICT (phone) DO NOTHING`, values);
    added += res.rowCount ?? 0;
  }
  const genderByPhone = new Map(list.map((c) => [c.phone, c.gender]));
  const found: { id: string; phone: string; email: string | null; full_name: string }[] = (await client.query(
    'SELECT id, phone, email, full_name FROM customers WHERE phone = ANY($1::text[]) ORDER BY phone', [list.map((c) => c.phone)])).rows;
  // Giữ đúng thứ tự sinh để khách "thân thiết" (đầu danh sách) ổn định giữa các lần chạy
  const order = new Map(list.map((c, i) => [c.phone, i]));
  found.sort((a, b) => (order.get(a.phone) ?? 0) - (order.get(b.phone) ?? 0));
  return {
    added,
    pool: found.map((c) => ({ id: c.id, gender: genderByPhone.get(c.phone) ?? 'female', email: c.email, fullName: c.full_name })),
  };
}

/** Lịch mẫu của seed.sql: mã = upper(md5(ngày|thợ|giờ)) — nhận diện CHÍNH XÁC, không đụng lịch thật. */
const LEGACY_CODE = `a.code = upper(substr(md5(to_char(a.start_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') || '|' || a.stylist_id::text
  || '|' || to_char(a.start_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI:SS')), 1, 8))`;

/**
 * Vệ sinh lịch mẫu CŨ của seed.sql tích luỹ qua nhiều lần chạy launcher (khi CSDL chỉ có 15 khách mẫu): xoá lịch "chờ xác
 * nhận" đã qua giờ hẹn, đưa giờ tạo lịch về quá khứ gần (lịch chờ phần lớn mới đặt vài giờ trước), rải lại lịch chưa
 * hoàn tất đang dồn vào một khách (> 2 lịch đang mở hoặc 2 lịch cùng ngày) cho khách thực tế. Lịch đã hoàn tất (có phiếu
 * tính tiền đóng — lịch sử tài chính) giữ nguyên tuyệt đối.
 */
async function normalizeLegacy(client: Client, pool: PoolCustomer[]): Promise<{ stalePending: number; reassigned: number }> {
  const stalePending = (await client.query(
    `DELETE FROM appointments a WHERE ${LEGACY_CODE} AND a.status = 'pending' AND a.start_at < now()
        AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.appointment_id = a.id)`)).rowCount ?? 0;
  await client.query(
    `UPDATE appointments a SET created_at = LEAST(a.start_at - interval '2 hours', now() - make_interval(mins => 30 + abs(hashtext(a.code)) % 870))
      WHERE ${LEGACY_CODE} AND a.status = 'pending' AND a.created_at < now() - interval '12 hours'`);
  // Giờ tạo / giờ xác nhận nằm ở TƯƠNG LAI là bất khả trong dữ liệu thật (lịch mẫu cũ đặt created_at = giờ hẹn - 3 ngày)
  await client.query(
    `UPDATE appointments a SET created_at = LEAST(a.start_at - interval '1 hour', now() - make_interval(mins => 10 + abs(hashtext(a.code)) % 4300))
      WHERE a.created_at > now()`);
  await client.query(
    `UPDATE appointments a SET confirmed_at = LEAST(now() - interval '1 minute', a.start_at, a.created_at + make_interval(mins => 5 + abs(hashtext(a.code || 'c')) % 170))
      WHERE a.confirmed_at IS NOT NULL AND (a.confirmed_at > now() OR a.confirmed_at < a.created_at)`);

  const rows: { customer_id: string; d: string; active: boolean }[] = (await client.query(
    `SELECT customer_id, to_char(start_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS d,
            (status IN ('pending', 'confirmed', 'arrived', 'in_progress')) AS active
       FROM appointments WHERE status <> 'cancelled'`)).rows;
  const days = new Map<string, Map<string, number>>();
  const active = new Map<string, number>();
  for (const x of rows) {
    const m = days.get(x.customer_id) ?? new Map<string, number>();
    m.set(x.d, (m.get(x.d) ?? 0) + 1);
    days.set(x.customer_id, m);
    if (x.active) active.set(x.customer_id, (active.get(x.customer_id) ?? 0) + 1);
  }
  const candidates: { id: string; code: string; customer_id: string; d: string; active: boolean }[] = (await client.query(
    `SELECT a.id, a.code, a.customer_id, to_char(a.start_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS d,
            (a.status IN ('pending', 'confirmed')) AS active
       FROM appointments a
      WHERE ${LEGACY_CODE} AND a.status IN ('pending', 'confirmed', 'no_show')
        AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.appointment_id = a.id)
      ORDER BY a.start_at`)).rows;
  let reassigned = 0;
  for (const c of candidates) {
    const sameDay = (days.get(c.customer_id)?.get(c.d) ?? 0) > 1;
    const overloaded = c.active && (active.get(c.customer_id) ?? 0) > 2;
    if (!sameDay && !overloaded) continue;
    const r = rng(`legacy|${c.code}`);
    let next: PoolCustomer | null = null;
    for (let tries = 0; tries < 12 && !next; tries += 1) {
      const p = pool[Math.floor(r() * pool.length)];
      if (p && !days.get(p.id)?.has(c.d) && (!c.active || (active.get(p.id) ?? 0) < 2)) next = p;
    }
    if (!next) continue;
    await client.query('UPDATE appointments SET customer_id = $2 WHERE id = $1', [c.id, next.id]);
    const from = days.get(c.customer_id)!;
    from.set(c.d, (from.get(c.d) ?? 1) - 1);
    if (c.active) {
      active.set(c.customer_id, (active.get(c.customer_id) ?? 1) - 1);
      active.set(next.id, (active.get(next.id) ?? 0) + 1);
    }
    const to = days.get(next.id) ?? new Map<string, number>();
    to.set(c.d, (to.get(c.d) ?? 0) + 1);
    days.set(next.id, to);
    reassigned += 1;
  }
  return { stalePending, reassigned };
}

async function insertRows(client: Client, table: string, columns: string[], rows: unknown[][], suffix = ''): Promise<{ rowCount: number; rows: Record<string, unknown>[] }> {
  let rowCount = 0;
  const out: Record<string, unknown>[] = [];
  const per = Math.max(1, Math.floor(60000 / columns.length));
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per);
    const values: unknown[] = [];
    const tuples = chunk.map((row) => `(${row.map((v) => { values.push(v); return `$${values.length}`; }).join(', ')})`);
    const res = await client.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')} ${suffix}`, values);
    rowCount += res.rowCount ?? 0;
    out.push(...res.rows);
  }
  return { rowCount, rows: out };
}

const MALE_ONLY = new Set<ServiceKey>(['cut_men', 'beard']);
const FEMALE_ONLY = new Set<ServiceKey>([
  'cut_women', 'blowout_updo', 'perm_korean', 'dye_balayage', 'straight_collagen', 'dye_ombre', 'makeup_party', 'makeup_bridal',
  'makeup_event', 'lash_classic', 'gel_art', 'acrylic', 'body_whitening', 'combo_bride',
]);
const CANCEL_REASONS = ['Khách bận đột xuất', 'Khách đổi lịch sang tuần sau', 'Khách bị ốm', 'Trùng lịch công tác', 'Trời mưa lớn, khách xin hẹn lại'];

export async function seedRealistic(client: Client, opts: RealisticOptions = {}): Promise<RealisticReport> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const now = opts.now ?? new Date();
  const historyDays = opts.historyDays ?? 120;
  const futureDays = opts.futureDays ?? 21;
  const today = todaySalon(now);
  const from = addDays(today, -historyDays);
  const to = addDays(today, futureDays);

  await client.query('BEGIN');
  try {
    log('  · Dọn dữ liệu rác (Tải thử / [scale-seed] / QA) ...');
    const removed = await cleanup(client);
    log(`    đã xoá: ${Object.entries(removed).map(([k, v]) => `${k}=${v}`).join(', ')}`);

    log('  · Danh mục dịch vụ, ảnh, chuyên viên thực tế ...');
    const catalog = await upsertCatalog(client);
    const { added: customersAdded, pool } = await upsertCustomers(client, opts.customers ?? 900);
    const legacy = await normalizeLegacy(client, pool);
    removed.stalePending = legacy.stalePending;
    if (legacy.stalePending || legacy.reassigned) {
      log(`    lịch mẫu cũ: xoá ${legacy.stalePending} lịch chờ đã quá giờ hẹn, rải lại ${legacy.reassigned} lịch cho khách thực tế`);
    }

    const reception: string | null = (await client.query(
      `SELECT id FROM users WHERE role = 'receptionist' AND is_active ORDER BY created_at LIMIT 1`)).rows[0]?.id ?? null;
    const stylistUser = new Map(STYLISTS.filter((s) => s.userId).map((s) => [s.id, s.userId!]));
    const vouchers = new Map<string, { id: string; type: string; value: number }>(((await client.query(
      `SELECT id, upper(code) AS code, discount_type, discount_value FROM vouchers WHERE upper(code) IN ('NGAYTHUONG10', 'CHAOBAN50K')`)).rows as
      { id: string; code: string; discount_type: string; discount_value: string }[]).map((v) => [v.code, { id: v.id, type: v.discount_type, value: Number(v.discount_value) }]));

    // ---- ca làm: theo kiểu ca từng thợ, bỏ ngày tiệm nghỉ / nghỉ lễ / nghỉ phép, không đè ca đã có
    log(`  · Ca làm ${from} → ${to} ...`);
    const hoursRows: { day_of_week: number; open_time: string; close_time: string; is_closed: boolean }[] =
      (await client.query('SELECT day_of_week, open_time::text, close_time::text, is_closed FROM salon_working_hours')).rows;
    const hours = new Map(hoursRows.map((h) => [h.day_of_week, { open: timeToMinutes(h.open_time), close: timeToMinutes(h.close_time), closed: h.is_closed }]));
    const holidays: { start_date: string; end_date: string }[] = (await client.query(
      'SELECT start_date::text, end_date::text FROM salon_holidays WHERE end_date >= $1 AND start_date <= $2', [from, to])).rows;
    const isHoliday = (d: string): boolean => holidays.some((h) => h.start_date <= d && d <= h.end_date);
    const haveShift = new Set(((await client.query(
      'SELECT stylist_id::text || \'|\' || work_date::text AS k FROM stylist_shifts WHERE work_date BETWEEN $1 AND $2', [from, to])).rows as { k: string }[]).map((r) => r.k));
    const dayOff = new Set(((await client.query(
      `SELECT stylist_id::text || '|' || off_date::text AS k FROM stylist_time_off WHERE off_date BETWEEN $1 AND $2 AND start_time IS NULL`, [from, to])).rows as { k: string }[]).map((r) => r.k));
    const managed = STYLISTS.filter((s) => catalog.stylistIds.includes(s.id));
    const shiftRows: unknown[][] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const h = hours.get(dayOfWeek(d));
      if (!h || h.closed || isHoliday(d)) continue;
      for (const st of managed) {
        const key = `${st.id}|${d}`;
        if (haveShift.has(key) || dayOff.has(key)) continue;
        if (rng(`leave|${key}`)() < 0.03) continue; // nghỉ phép lẻ tẻ ~3% số ngày
        const sh = shiftFor(st, d, h);
        if (!sh) continue;
        shiftRows.push([st.id, d, minutesToTime(sh.start), minutesToTime(sh.end),
          sh.breakStart === null ? null : minutesToTime(sh.breakStart), sh.breakEnd === null ? null : minutesToTime(sh.breakEnd), sh.note]);
      }
    }
    const shiftsAdded = (await insertRows(client, 'stylist_shifts',
      ['stylist_id', 'work_date', 'start_time', 'end_time', 'break_start', 'break_end', 'note'], shiftRows)).rowCount;

    // ---- lịch hẹn
    log('  · Lịch hẹn, phiếu tính tiền, đánh giá ...');
    const shifts: { stylist_id: string; work_date: string; start_time: string; end_time: string; break_start: string | null; break_end: string | null }[] =
      (await client.query(
        `SELECT stylist_id, work_date::text, start_time::text, end_time::text, break_start::text, break_end::text
           FROM stylist_shifts WHERE stylist_id = ANY($1::uuid[]) AND work_date BETWEEN $2 AND $3`,
        [catalog.stylistIds, from, to])).rows;
    const existing: { code: string; stylist_id: string; customer_id: string; start_at: Date; end_at: Date; status: string }[] = (await client.query(
      `SELECT code, stylist_id, customer_id, start_at, end_at, status::text FROM appointments
        WHERE start_at >= $1::date - 1 AND start_at < $2::date + 2`, [from, to])).rows;
    const codes = new Set(existing.map((a) => a.code));
    const minuteOf = (d: Date): number => {
      const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
      return (Number(p.find((x) => x.type === 'hour')?.value) % 24) * 60 + Number(p.find((x) => x.type === 'minute')?.value);
    };
    const dateOf = (d: Date): string => todaySalon(d);
    const busyByDay = new Map<string, [number, number][]>();
    const customerDays = new Map<string, Set<string>>();
    const activeByCustomer = new Map<string, number>();
    for (const a of existing) {
      if (a.status === 'cancelled') continue;
      const k = `${a.stylist_id}|${dateOf(a.start_at)}`;
      busyByDay.set(k, [...(busyByDay.get(k) ?? []), [minuteOf(a.start_at), minuteOf(a.start_at) + Math.round((a.end_at.getTime() - a.start_at.getTime()) / 60000)]]);
      customerDays.set(a.customer_id, (customerDays.get(a.customer_id) ?? new Set()).add(dateOf(a.start_at)));
      if (['pending', 'confirmed', 'arrived', 'in_progress'].includes(a.status)) activeByCustomer.set(a.customer_id, (activeByCustomer.get(a.customer_id) ?? 0) + 1);
    }

    const svcById = new Map(SERVICES.map((s) => [catalog.serviceId.get(s.key)!, s]));
    const skillRows: { stylist_id: string; service_id: string }[] = (await client.query(
      'SELECT stylist_id, service_id FROM stylist_services WHERE stylist_id = ANY($1::uuid[])', [catalog.stylistIds])).rows;
    const skillsOf = new Map<string, ServiceSeed[]>();
    const declared = new Map(STYLISTS.map((s) => [s.id, new Set(s.skills)]));
    for (const r of skillRows) {
      const s = svcById.get(r.service_id);
      // Chỉ lập lịch theo chuyên môn khai báo (kỹ năng cũ giữ lại từ seed.sql không sinh thêm lịch)
      if (s && declared.get(r.stylist_id)?.has(s.key)) skillsOf.set(r.stylist_id, [...(skillsOf.get(r.stylist_id) ?? []), s]);
    }

    // Khách thân thiết (20% đầu danh sách) quay lại nhiều gấp 5 lần; chọn khách đúng giới tính với dịch vụ
    const poolOf = (g: 'male' | 'female' | null) => {
      const list = pool.filter((c) => !g || c.gender === g);
      const cum: number[] = [];
      let acc = 0;
      list.forEach((_, i) => { acc += i < list.length * 0.2 ? 5 : i < list.length * 0.5 ? 2 : 1; cum.push(acc); });
      return { list, cum, total: acc };
    };
    const pools = { male: poolOf('male'), female: poolOf('female'), any: poolOf(null) };
    const drawCustomer = (p: ReturnType<typeof poolOf>, r: () => number): PoolCustomer | null => {
      if (!p.list.length) return null;
      const x = r() * p.total;
      let lo = 0; let hi = p.cum.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (p.cum[mid] > x) hi = mid; else lo = mid + 1; }
      return p.list[lo];
    };

    const byDay = new Map<string, typeof shifts>();
    for (const s of shifts) byDay.set(`${s.stylist_id}|${s.work_date}`, [...(byDay.get(`${s.stylist_id}|${s.work_date}`) ?? []), s]);
    const nowMs = now.getTime();
    const apptRows: unknown[][] = [];
    const meta = new Map<string, { services: ServiceSeed[]; stylistId: string; customer: PoolCustomer; status: string; start: Date; end: Date; date: string }>();

    for (const [key, dayShifts] of byDay) {
      const [stylistId, date] = key.split('|');
      const st = STYLISTS.find((s) => s.id === stylistId)!;
      const skills = skillsOf.get(stylistId) ?? [];
      if (!skills.length) continue;
      // Ngày đã sinh ở lần chạy trước (có mã tất định của ngày này) → bỏ qua, không nhân đôi
      let generated = false;
      for (let m = 360; m < 1380 && !generated; m += 15) generated = codes.has(bookingCode(stylistId, date, minutesToTime(m)));
      if (generated) continue;

      const segments: [number, number][] = [];
      for (const s of dayShifts) {
        const a = timeToMinutes(s.start_time); const b = timeToMinutes(s.end_time);
        if (s.break_start && s.break_end) {
          segments.push([a, timeToMinutes(s.break_start)], [timeToMinutes(s.break_end), b]);
        } else segments.push([a, b]);
      }
      const daysAhead = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
      const factor = daysAhead <= 0 ? 1 : daysAhead <= 3 ? 0.9 : daysAhead <= 7 ? 0.7 : daysAhead <= 14 ? 0.45 : 0.25;
      const r = rng(`day|${key}`);
      const plan = planDay({ dow: dayOfWeek(date), segments: segments.filter(([a, b]) => b - a >= 30), busy: busyByDay.get(key) ?? [],
        skills, demand: st.demand, factor, r });

      for (const p of plan) {
        const hhmm = minutesToTime(p.start);
        const code = bookingCode(stylistId, date, hhmm);
        if (codes.has(code)) continue;
        const start = combineMinutes(date, p.start);
        const end = combineMinutes(date, p.start + p.duration);
        const keys = p.services.map((s) => s.key);
        const g = keys.some((k) => MALE_ONLY.has(k)) ? 'male' : keys.some((k) => FEMALE_ONLY.has(k)) ? 'female' : 'any';
        const future = end.getTime() > nowMs;
        let customer: PoolCustomer | null = null;
        for (let tries = 0; tries < 8 && !customer; tries += 1) {
          const c = drawCustomer(pools[g], r);
          if (!c || customerDays.get(c.id)?.has(date)) continue;
          if (future && (activeByCustomer.get(c.id) ?? 0) >= 2) continue;
          customer = c;
        }
        if (!customer) continue;

        // Trạng thái theo thời điểm thực: quá khứ hoàn tất / không đến / huỷ; đang diễn ra; sắp tới chờ / đã xác nhận
        const online = r() >= 0.22;
        const x = r();
        let status: string;
        if (end.getTime() <= nowMs) status = x < 0.84 ? 'completed' : x < 0.89 ? 'no_show' : 'cancelled';
        else if (start.getTime() <= nowMs) status = 'in_progress';
        else if (start.getTime() - nowMs <= 45 * 60_000) status = x < 0.5 ? 'arrived' : 'confirmed';
        else status = online && daysAhead <= 7 && x < 0.15 ? 'pending' : 'confirmed';

        const minutes = (n: number): number => n * 60_000;
        // Lịch chờ xác nhận phần lớn mới đặt trong vài giờ qua; ~20% đã chờ quá 12 giờ (hiện cảnh báo "quá hạn")
        const createdAt = new Date(status === 'pending'
          ? Math.min(nowMs - minutes(20 + Math.floor(r() * 880)), start.getTime() - minutes(120))
          // không bao giờ ở tương lai: lịch xa ngày tới được đặt trong vài ngày gần đây
          : Math.min(nowMs - minutes(10 + Math.floor(r() * 4300)),
            online ? start.getTime() - minutes(60 * (6 + Math.floor(r() * 300))) : start.getTime() - minutes(5 + Math.floor(r() * 2800))));
        const confirmedAt = status === 'pending' ? null
          : new Date(Math.min(start.getTime() - minutes(5), nowMs - 60_000, createdAt.getTime() + (online ? minutes(5 + Math.floor(r() * 170)) : 0)));
        const late = status === 'completed' && r() < 0.1 ? 5 + Math.floor(r() * 11) : 0;
        const arrivedAt = ['arrived', 'in_progress', 'completed'].includes(status)
          ? new Date(late ? start.getTime() + minutes(late) : start.getTime() - minutes(Math.floor(r() * 12))) : null;
        const startedAt = ['in_progress', 'completed'].includes(status) ? new Date(Math.max(start.getTime(), arrivedAt?.getTime() ?? 0)) : null;
        const completedAt = status === 'completed' ? new Date(end.getTime() + minutes(late)) : null;
        const cancelledAt = status === 'cancelled'
          ? new Date(Math.max(createdAt.getTime() + minutes(10), start.getTime() - minutes(120 + Math.floor(r() * 2700)))) : null;
        const total = p.services.reduce((a, s) => a + s.price, 0);
        apptRows.push([
          code, customer.id, stylistId, start, end, p.duration, total, status, online ? 'online' : 'walk_in',
          r() < 0.08 ? pick(CUSTOMER_REQUESTS, r) : null,
          confirmedAt, confirmedAt ? reception : null, arrivedAt, arrivedAt ? reception : null, late > 0, late,
          startedAt, completedAt, completedAt ? p.duration + Math.round((r() * 15 - 5) / 5) * 5 : null,
          cancelledAt, cancelledAt ? 'Khách hàng' : null, cancelledAt ? pick(CANCEL_REASONS, r) : null,
          status === 'no_show' ? new Date(start.getTime() + minutes(30)) : null, status === 'no_show' ? reception : null,
          online && customer.email && confirmedAt ? new Date(confirmedAt.getTime() + 60_000) : null,
          !future || start.getTime() - nowMs < minutes(24 * 60) ? new Date(Math.max(createdAt.getTime(), start.getTime() - minutes(24 * 60))) : null,
          online ? null : reception, createdAt,
        ]);
        codes.add(code);
        busyByDay.set(key, [...(busyByDay.get(key) ?? []), [p.start, p.start + p.duration]]);
        customerDays.set(customer.id, (customerDays.get(customer.id) ?? new Set()).add(date));
        if (['pending', 'confirmed', 'arrived', 'in_progress'].includes(status)) activeByCustomer.set(customer.id, (activeByCustomer.get(customer.id) ?? 0) + 1);
        meta.set(code, { services: p.services, stylistId, customer, status, start, end, date });
      }
    }

    const inserted = await insertRows(client, 'appointments', [
      'code', 'customer_id', 'stylist_id', 'start_at', 'end_at', 'total_duration_minutes', 'estimated_total', 'status', 'source',
      'customer_note', 'confirmed_at', 'confirmed_by', 'arrived_at', 'checked_in_by', 'is_late', 'late_minutes', 'started_at',
      'completed_at', 'actual_duration_minutes', 'cancelled_at', 'cancelled_by_label', 'cancel_reason', 'no_show_at', 'no_show_by',
      'confirmation_sent_at', 'reminder_sent_at', 'created_by', 'created_at',
    ], apptRows, 'ON CONFLICT (code) DO NOTHING RETURNING id, code');

    const serviceRows: unknown[][] = [];
    const invoiceRows: unknown[][] = [];
    const itemsByInvoice = new Map<string, ServiceSeed[]>();
    const reviewRows: unknown[][] = [];
    const noteRows: unknown[][] = [];
    const invoiceCodes = new Set(((await client.query('SELECT code FROM invoices')).rows as { code: string }[]).map((x) => x.code));
    const firstVisit = new Set<string>();
    for (const row of inserted.rows) {
      const id = String(row.id);
      const code = String(row.code);
      const m = meta.get(code);
      if (!m) continue;
      m.services.forEach((s, i) => serviceRows.push([id, catalog.serviceId.get(s.key), s.price, s.duration, s.name, i]));
      if (m.status !== 'completed') continue;
      const r = rng(`after|${code}`);
      const subtotal = m.services.reduce((a, s) => a + s.price, 0);
      const weekday = ![0, 6].includes(dayOfWeek(m.date));
      const isFirst = !firstVisit.has(m.customer.id) && r() < 0.15;
      firstVisit.add(m.customer.id);
      const v = weekday && r() < 0.06 ? vouchers.get('NGAYTHUONG10') : isFirst && subtotal >= 150000 ? vouchers.get('CHAOBAN50K') : undefined;
      const discount = !v ? 0 : v.type === 'percent' ? Math.round((subtotal * v.value) / 100 / 1000) * 1000 : Math.min(v.value, subtotal);
      let invCode = '';
      for (let salt = 0; salt < 5 && (!invCode || invoiceCodes.has(invCode)); salt += 1) {
        const h = hash32(`${code}|${salt}`);
        invCode = `HD${m.date.slice(2, 4)}${m.date.slice(5, 7)}${m.date.slice(8, 10)}${[0, 1, 2, 3].map((i) => CODE_ALPHABET[Math.floor(h / 31 ** i) % 31]).join('')}`;
      }
      if (invoiceCodes.has(invCode)) continue;
      invoiceCodes.add(invCode);
      const transfer = r() < 0.45;
      const paidAt = new Date(m.end.getTime() + (3 + Math.floor(r() * 10)) * 60_000);
      invoiceRows.push([invCode, id, m.customer.id, m.stylistId, subtotal, v?.id ?? null, v ? (v.type === 'percent' ? 'NGAYTHUONG10' : 'CHAOBAN50K') : null,
        discount, subtotal - discount, transfer ? 'transfer' : 'cash', transfer ? `CK ${code}` : null, 'closed', reception,
        paidAt, new Date(paidAt.getTime() + 60_000), m.end]);
      itemsByInvoice.set(invCode, m.services);

      const kind = kindOf(m.services[0].categoryId);
      if (r() < 0.6) {
        const submitAt = m.end.getTime() + (1 + Math.floor(r() * 47)) * 3_600_000;
        const submitted = r() < 0.7 && submitAt < nowMs;
        const y = r();
        const rating = y < 0.64 ? 5 : y < 0.9 ? 4 : y < 0.98 ? 3 : 2;
        const comment = submitted && r() < 0.7 ? pick(rating >= 4 ? REVIEW_COMMENTS[kind].good : REVIEW_COMMENTS[kind].ok, r) : null;
        reviewRows.push([id, m.stylistId, m.customer.id, submitted ? rating : null, comment, randomBytes(24).toString('hex'),
          new Date(m.end.getTime() + 7 * 86_400_000), submitted ? new Date(submitAt) : null, m.end]);
      }
      if (r() < 0.2) noteRows.push([id, m.customer.id, m.stylistId, pick(SERVICE_NOTES[kind], r), stylistUser.get(m.stylistId) ?? null, m.end]);
    }
    await insertRows(client, 'appointment_services',
      ['appointment_id', 'service_id', 'price_snapshot', 'duration_snapshot', 'name_snapshot', 'position'], serviceRows,
      'ON CONFLICT DO NOTHING');
    const invoices = await insertRows(client, 'invoices', [
      'code', 'appointment_id', 'customer_id', 'stylist_id', 'subtotal', 'voucher_id', 'voucher_code', 'discount_amount', 'total',
      'payment_method', 'transfer_note', 'status', 'created_by', 'paid_at', 'closed_at', 'created_at',
    ], invoiceRows, 'ON CONFLICT DO NOTHING RETURNING id, code');
    const itemRows: unknown[][] = [];
    for (const inv of invoices.rows) {
      for (const s of itemsByInvoice.get(String(inv.code)) ?? []) {
        itemRows.push([inv.id, catalog.serviceId.get(s.key), s.name, s.price, 1, s.price]);
      }
    }
    await insertRows(client, 'invoice_items', ['invoice_id', 'service_id', 'name', 'unit_price', 'quantity', 'line_total'], itemRows);
    const reviews = await insertRows(client, 'reviews',
      ['appointment_id', 'stylist_id', 'customer_id', 'rating', 'comment', 'token', 'token_expires_at', 'submitted_at', 'created_at'],
      reviewRows, 'ON CONFLICT DO NOTHING');
    await insertRows(client, 'service_notes', ['appointment_id', 'customer_id', 'stylist_id', 'content', 'created_by', 'created_at'],
      noteRows, 'ON CONFLICT DO NOTHING');

    // ---- số liệu tổng hợp trên hồ sơ khách + mã giảm giá (ứng dụng tự cập nhật khi chạy thật; ở đây tính theo tập hợp)
    await client.query(`
      UPDATE customers c SET total_visits = COALESCE(t.visits, 0), no_show_count = COALESCE(t.no_shows, 0),
                             total_appointments = COALESCE(t.total, 0)
        FROM customers c2
        LEFT JOIN (SELECT customer_id, COUNT(*) FILTER (WHERE status = 'completed') AS visits,
                          COUNT(*) FILTER (WHERE status = 'no_show') AS no_shows, COUNT(*) AS total
                     FROM appointments GROUP BY customer_id) t ON t.customer_id = c2.id
       WHERE c.id = c2.id AND (c.total_visits, c.no_show_count, c.total_appointments)
             IS DISTINCT FROM (COALESCE(t.visits, 0), COALESCE(t.no_shows, 0), COALESCE(t.total, 0))`);
    await client.query(`UPDATE vouchers v SET used_count = u.c
                          FROM (SELECT voucher_id, COUNT(*)::int AS c FROM invoices WHERE voucher_id IS NOT NULL GROUP BY voucher_id) u
                         WHERE u.voucher_id = v.id AND v.used_count IS DISTINCT FROM u.c`);
    await client.query(`
      INSERT INTO audit_logs (actor_email, actor_role, action, entity_type, entity_id, summary)
      SELECT 'system', 'admin', 'create', 'system', 'seed-realistic',
             'Nạp dữ liệu thực tế: 43 dịch vụ có ảnh riêng, 14 chuyên viên, khách & lịch hẹn theo giờ cao điểm thật'
       WHERE NOT EXISTS (SELECT 1 FROM audit_logs WHERE entity_type = 'system' AND entity_id = 'seed-realistic')`);
    await client.query('COMMIT');
    for (const t of ['services', 'stylists', 'customers', 'stylist_shifts', 'appointments', 'appointment_services', 'invoices']) {
      await client.query(`ANALYZE ${t}`);
    }
    return {
      removed, services: catalog.services, stylists: catalog.stylistIds.length, customersAdded, shiftsAdded,
      appointmentsAdded: inserted.rowCount, invoicesAdded: invoices.rowCount, reviewsAdded: reviews.rowCount,
    };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  }
}

// ------------------------------------------------------------------------------------------------ chạy trực tiếp

async function main(): Promise<void> {
  loadEnv();
  if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== '1') {
    throw Object.assign(new Error('Từ chối nạp dữ liệu mẫu khi NODE_ENV=production (đặt SEED_ALLOW_PRODUCTION=1 nếu thật sự muốn).'), { code: 'SEED_BLOCKED' });
  }
  const scale = process.argv.includes('--scale');
  const daysArg = process.argv.find((a) => a.startsWith('--days='));
  const conn = resolveDbConnection();
  console.log(`> Kết nối ${describeDb(conn)}`);
  await runMigrations(conn, { backup: 'auto' });
  const client = await connectWithRetry(conn);
  try {
    const t0 = Date.now();
    console.log(`> Nạp dữ liệu thực tế${scale ? ' (quy mô đo hiệu năng)' : ''} ...`);
    const report = await seedRealistic(client, {
      customers: scale ? 10_000 : 900,
      historyDays: daysArg ? Number(daysArg.slice(7)) : scale ? 365 : 120,
    });
    console.log(`  Xong sau ${((Date.now() - t0) / 1000).toFixed(1)} giây:`, report);
    const { rows } = await client.query(
      `SELECT (SELECT COUNT(*) FROM services WHERE is_active) AS services, (SELECT COUNT(*) FROM stylists WHERE is_active) AS stylists,
              (SELECT COUNT(*) FROM customers) AS customers, (SELECT COUNT(*) FROM appointments) AS appointments,
              (SELECT COUNT(*) FROM appointments WHERE status = 'pending') AS pending, (SELECT COUNT(*) FROM invoices) AS invoices`);
    console.log('> Tổng trong CSDL:', rows[0]);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((err: PgError) => {
    console.error('Nạp dữ liệu thực tế thất bại:', err.message || err.code || String(err));
    const hint = hintFor(resolveDbConnection(), err);
    if (hint) console.error(`Gợi ý: ${hint}`);
    process.exit(1);
  });
}
