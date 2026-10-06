import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ACCOUNTS, createTestApp } from './setup-app';

/**
 * Rà soát 5 bất biến nghiệp vụ đối chiếu tệp yêu cầu (39 US / 165 SP) — các lỗ hổng tìm được và đã vá:
 *  - Giữ chỗ (holdToken) không được dùng để đặt dịch vụ mà thợ không làm được / giờ lệch lưới 15 phút.
 *  - Thua cuộc tranh khung giờ (409) không bị tính vào hạn mức 5 lượt đặt / IP / giờ.
 *  - Đổi trạng thái đồng thời (khách huỷ ↔ lễ tân xác nhận) không làm lịch đã huỷ "sống lại".
 *  - Dời lịch vào chỗ đang giữ bị chặn; chuyển hàng loạt không có thợ thay thế không bị đếm là thành công.
 *  - Ngày nghỉ theo giờ cắt ngang lịch hẹn được cảnh báo; giờ nghỉ giữa ca không đè lên lịch đã đặt.
 *  - Phiếu đã đóng bất biến ở tầng CSDL; hai lượt lập phiếu điều chỉnh cùng lúc chỉ một lượt thành công.
 */
describe('Bất biến nghiệp vụ (rà soát yêu cầu đề tài)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let ds: DataSource;
  const tokens: Record<string, string> = {};
  const as = (role: keyof typeof ACCOUNTS): { Authorization: string } => ({ Authorization: `Bearer ${tokens[role]}` });
  let seq = 0;
  const phone = (): string => `09${String(Date.now() + (seq += 1)).slice(-8)}`;
  const plus = (time: string, minutes: number): string => {
    const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + minutes;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };
  const isoIn = (days: number): string => {
    const d = new Date(Date.now() + 7 * 3600_000);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  let svcA = '';
  let svcB = '';
  let s1 = '';
  let s2 = '';
  let date = '';
  let open = '';

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    ds = app.get(DataSource);
    for (const role of Object.keys(ACCOUNTS) as (keyof typeof ACCOUNTS)[]) {
      const res = await request(server).post('/api/auth/login').send(ACCOUNTS[role]).expect(200);
      tokens[role] = res.body.data.accessToken as string;
    }
    const cat = await request(server).get('/api/service-categories').set(as('owner')).expect(200);
    const mk = async (name: string): Promise<string> => (await request(server).post('/api/services').set(as('owner'))
      .send({ categoryId: cat.body.data[0].id, name: `${name} ${Date.now()}`, durationMinutes: 60, price: 120000 }).expect(201)).body.data.id;
    svcA = await mk('Bất biến A');
    svcB = await mk('Bất biến B');
    s1 = (await request(server).post('/api/stylists').set(as('owner'))
      .send({ fullName: `Thợ bất biến 1 ${Date.now()}`, gender: 'female', serviceIds: [svcA] }).expect(201)).body.data.id;
    s2 = (await request(server).post('/api/stylists').set(as('owner'))
      .send({ fullName: `Thợ bất biến 2 ${Date.now()}`, gender: 'male', serviceIds: [svcB] }).expect(201)).body.data.id;
    // Ngày mở cửa, không phải ngày lễ, ở xa để không đụng các bộ kiểm thử khác
    for (let d = 70; d < 100 && !date; d += 1) {
      const candidate = isoIn(d);
      const dow = new Date(`${candidate}T12:00:00Z`).getUTCDay();
      const [h] = await ds.query(
        `SELECT to_char(open_time,'HH24:MI') AS open FROM salon_working_hours WHERE day_of_week = $1 AND is_closed = FALSE`, [dow]);
      const [hol] = await ds.query('SELECT 1 FROM salon_holidays WHERE $1::date BETWEEN start_date AND end_date', [candidate]);
      if (h && !hol) { date = candidate; open = h.open; }
    }
    expect(date).toBeTruthy();
    await request(server).post(`/api/stylists/${s1}/shifts`).set(as('owner'))
      .send({ shifts: [{ workDate: date, startTime: open, endTime: plus(open, 300) }] }).expect(201);
  }, 60000);

  afterAll(async () => {
    await app?.close();
  });

  const book = (body: Record<string, unknown>) => request(server).post('/api/public/bookings')
    .send({ date, fullName: 'Khách bất biến', phone: phone(), ...body });

  it('Bất biến 2: giữ chỗ cho dịch vụ A không dùng được để đặt dịch vụ B mà thợ giữ chỗ không làm được', async () => {
    const hold = await request(server).post('/api/public/holds')
      .send({ serviceIds: [svcA], date, time: plus(open, 60), stylistId: s1 }).expect(201);
    const res = await book({ serviceIds: [svcB], time: plus(open, 60), holdToken: hold.body.data.holdToken });
    // Thợ 2 (làm được B) không có ca hôm đó -> không còn thợ hợp lệ; trước bản vá: 201 và gán nhầm Thợ 1
    expect(res.status).toBe(409);
    const [{ n }] = await ds.query(
      `SELECT COUNT(*)::int AS n FROM appointments WHERE stylist_id = $1 AND start_at::date = $2::date`, [s1, date]);
    expect(n).toBe(0);
    await request(server).delete(`/api/public/holds/${hold.body.data.holdToken}`).expect(200);
  });

  it('Bất biến 2: giữ chỗ lệch lưới 15 phút bị từ chối như lúc chốt lịch', async () => {
    await request(server).post('/api/public/holds')
      .send({ serviceIds: [svcA], date, time: plus(open, 67), stylistId: s1 }).expect(400);
  });

  it('Bất biến 4: thua cuộc tranh khung giờ (409) được trả lại lượt; lỗi dữ liệu (400) vẫn bị tính', async () => {
    const t = plus(open, 120);
    await book({ serviceIds: [svcA], time: t, stylistId: s1 }).expect(201);
    const counter = async (): Promise<number> => {
      const [row] = await ds.query(
        `SELECT hit_count FROM rate_limits WHERE scope = 'booking_ip' ORDER BY updated_at DESC LIMIT 1`);
      return Number(row?.hit_count ?? 0);
    };
    const before = await counter();
    await book({ serviceIds: [svcA], time: t, stylistId: s1 }).expect(409);
    expect(await counter()).toBe(before);
    await book({ serviceIds: [svcA], date: isoIn(-1), time: t, stylistId: s1 }).expect(400);
    expect(await counter()).toBe(before + 1);
  });

  it('Bất biến 3: khách huỷ đồng thời với lễ tân xác nhận -> lịch đã huỷ không bao giờ "sống lại"', async () => {
    for (let i = 0; i < 4; i += 1) {
      const created = await book({ serviceIds: [svcA], time: plus(open, 180), stylistId: s1 }).expect(201);
      const { code } = created.body.data as { code: string };
      const [{ id }] = await ds.query('SELECT id FROM appointments WHERE code = $1', [code]);
      const [cancel, confirm] = await Promise.all([
        request(server).post('/api/public/cancel').send({ code }),
        request(server).patch(`/api/appointments/${id}/confirm`).set(as('receptionist')).send({}),
      ]);
      const [{ status }] = await ds.query('SELECT status FROM appointments WHERE id = $1', [id]);
      if (cancel.status === 200) expect(status).toBe('cancelled');
      else expect(status).toBe('confirmed');
      expect([200, 400, 409]).toContain(confirm.status);
      // Trả khung giờ cho vòng sau
      if (status !== 'cancelled') {
        await request(server).patch(`/api/appointments/${id}/cancel`).set(as('owner')).send({ reason: 'Dọn dữ liệu kiểm thử' }).expect(200);
      }
    }
  });

  describe('Dời lịch, chuyển hàng loạt, ngày nghỉ, giờ nghỉ', () => {
    let apptId = '';
    let walkInCode = '';
    beforeAll(async () => {
      const created = await request(server).post('/api/appointments/walk-in').set(as('owner'))
        .send({ serviceIds: [svcA], date, time: plus(open, 0), stylistId: s1, fullName: 'Khách tại quầy', phone: phone() }).expect(201);
      walkInCode = created.body.data.code;
      const [{ id }] = await ds.query('SELECT id FROM appointments WHERE code = $1', [walkInCode]);
      apptId = id;
    });

    it('Bất biến 3: dời lịch vào khung giờ khách khác đang giữ chỗ bị chặn', async () => {
      const t = plus(open, 240);
      const hold = await request(server).post('/api/public/holds')
        .send({ serviceIds: [svcA], date, time: t, stylistId: s1 }).expect(201);
      await request(server).patch(`/api/appointments/${apptId}/reschedule`).set(as('receptionist'))
        .send({ date, time: t }).expect(409);
      await request(server).delete(`/api/public/holds/${hold.body.data.holdToken}`).expect(200);
    });

    it('S3-09: chuyển hàng loạt mà không chọn thợ thay thế / giờ mới -> báo cần gọi khách, không đếm là thành công', async () => {
      const res = await request(server).post('/api/appointments/bulk-reassign').set(as('receptionist'))
        .send({ items: [{ appointmentId: apptId }] }).expect(201);
      expect(res.body.data.succeeded).toBe(0);
      expect(res.body.data.failed).toHaveLength(1);
    });

    it('Bất biến 5: ngày nghỉ theo giờ cắt ngang lịch hẹn (không chỉ lịch bắt đầu trong khoảng) được cảnh báo trước khi lưu', async () => {
      const res = await request(server).post(`/api/stylists/${s1}/time-off`).set(as('owner'))
        .send({ offDate: date, startTime: plus(open, 30), endTime: plus(open, 45), reason: 'Việc riêng' });
      expect([200, 201]).toContain(res.status);
      // Không lịch nào BẮT ĐẦU trong 30'–45' (truy vấn cũ trả 0), nhưng lịch tại quầy 0'–60' bị cắt ngang
      expect(res.body.data.affected).toBe(1);
      expect(res.body.data.codes).toEqual([walkInCode]);
      const [{ n }] = await ds.query('SELECT COUNT(*)::int AS n FROM stylist_time_off WHERE stylist_id = $1 AND off_date = $2', [s1, date]);
      expect(n).toBe(0);
    });

    it('Bất biến 5: giờ nghỉ giữa ca mới không được đè lên lịch hẹn đã đặt', async () => {
      const [shift] = await ds.query('SELECT id FROM stylist_shifts WHERE stylist_id = $1 AND work_date = $2', [s1, date]);
      const res = await request(server).patch(`/api/shifts/${shift.id}`).set(as('owner'))
        .send({ breakStart: plus(open, 15), breakEnd: plus(open, 45) }).expect(409);
      expect(res.body.message).toContain('Giờ nghỉ');
    });
  });

  describe('Bất biến 5: lịch sử tài chính', () => {
    let invoiceId = '';
    beforeAll(async () => {
      const [row] = await ds.query(`SELECT id FROM invoices WHERE status = 'closed' ORDER BY created_at LIMIT 1`);
      invoiceId = row.id;
    });

    it('phiếu đã đóng bất biến ở tầng CSDL: không sửa số tiền, không xoá dòng dịch vụ, không xoá phiếu, không TRUNCATE', async () => {
      await expect(ds.query('UPDATE invoices SET total = total + 1 WHERE id = $1', [invoiceId])).rejects.toThrow(/đã đóng/);
      await expect(ds.query('DELETE FROM invoice_items WHERE invoice_id = $1', [invoiceId])).rejects.toThrow(/phiếu đã đóng/);
      await expect(ds.query('DELETE FROM invoices WHERE id = $1', [invoiceId])).rejects.toThrow(/không được xoá/);
      await expect(ds.query('TRUNCATE audit_logs')).rejects.toThrow(/TRUNCATE/);
      // Chuyển "đã đóng" -> "đã điều chỉnh" (chỉ đổi trạng thái) là hợp lệ; thử trong giao dịch rồi huỷ
      const qr = ds.createQueryRunner();
      await qr.startTransaction();
      await expect(qr.query(`UPDATE invoices SET status = 'adjusted' WHERE id = $1`, [invoiceId])).resolves.toBeDefined();
      await qr.rollbackTransaction();
      await qr.release();
    });

    it('hai lượt lập phiếu điều chỉnh cùng lúc chỉ một lượt thành công', async () => {
      const body = { reason: 'Khách được tặng thêm', items: [{ name: 'Điều chỉnh', unitPrice: 100000, quantity: 1 }] };
      const results = await Promise.all([0, 1].map(() =>
        request(server).post(`/api/invoices/${invoiceId}/adjust`).set(as('owner')).send(body)));
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const [{ n }] = await ds.query('SELECT COUNT(*)::int AS n FROM invoices WHERE adjusts_invoice_id = $1', [invoiceId]);
      expect(n).toBe(1);
    });
  });
});
