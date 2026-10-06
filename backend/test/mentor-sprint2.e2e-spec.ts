import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ACCOUNTS, createTestApp } from './setup-app';

/**
 * Góp ý Mentor Sprint 2 (06/10/2026) trên máy chủ THẬT (PostgreSQL), mỗi mục một khối describe.
 * Dữ liệu tự tạo dùng năm/ngày ở xa để không ảnh hưởng các bộ kiểm thử khác chạy chung CSDL.
 */
describe('Mentor Sprint 2', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let ds: DataSource;
  const tokens: Record<string, string> = {};
  const as = (role: keyof typeof ACCOUNTS): { Authorization: string } => ({ Authorization: `Bearer ${tokens[role]}` });

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    ds = app.get(DataSource);
    for (const role of Object.keys(ACCOUNTS) as (keyof typeof ACCOUNTS)[]) {
      const res = await request(server).post('/api/auth/login').send(ACCOUNTS[role]).expect(200);
      tokens[role] = res.body.data.accessToken as string;
    }
  }, 60000);

  afterAll(async () => {
    await app?.close();
  });

  // ------------------------------------------------------------------ helpers dùng chung
  interface Hours { open: string; close: string }
  const plus = (time: string, minutes: number): string => {
    const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + minutes;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };
  const isoIn = (days: number): string => {
    const d = new Date(Date.now() + 7 * 3600_000);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  /** Ngày mở cửa, không phải ngày lễ, thợ chưa có ca — trong khoảng [start, start+span). */
  const freeDays = async (stylistId: string, start: number, count: number, span = 18): Promise<{ date: string; hours: Hours }[]> => {
    const out: { date: string; hours: Hours }[] = [];
    for (let d = start; d < start + span && out.length < count; d += 1) {
      const date = isoIn(d);
      const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
      const [hours] = await ds.query(
        `SELECT to_char(open_time,'HH24:MI') AS open, to_char(close_time,'HH24:MI') AS close
           FROM salon_working_hours WHERE day_of_week = $1 AND is_closed = FALSE`, [dow]);
      const [hol] = await ds.query('SELECT 1 FROM salon_holidays WHERE $1::date BETWEEN start_date AND end_date', [date]);
      const [busy] = await ds.query('SELECT 1 FROM stylist_shifts WHERE stylist_id = $1 AND work_date = $2', [stylistId, date]);
      const [off] = await ds.query('SELECT 1 FROM stylist_time_off WHERE stylist_id = $1 AND off_date = $2', [stylistId, date]);
      if (hours && !hol && !busy && !off) out.push({ date, hours });
    }
    if (out.length < count) throw new Error('Không tìm đủ ngày trống cho thợ');
    return out;
  };

  describe('Mục 6 — Thợ tự đăng ký ca, quản lý duyệt', () => {
    let stylistId = '';
    beforeAll(async () => {
      const me = await request(server).get('/api/auth/me').set(as('stylist')).expect(200);
      stylistId = me.body.data.stylistId as string;
      expect(stylistId).toBeTruthy();
    });

    it('đăng ký -> trùng bị chặn -> duyệt có chỉnh giờ -> ca thật được tạo, thợ nhận thông báo', async () => {
      const [a, b] = await freeDays(stylistId, 40, 2);
      const created = await request(server).post('/api/shift-requests').set(as('stylist')).send({
        items: [
          { kind: 'shift', workDate: a.date, startTime: a.hours.open, endTime: plus(a.hours.open, 240), note: 'Rảnh buổi sáng' },
          { kind: 'time_off', workDate: b.date },
        ],
      }).expect(201);
      const [shiftReq, offReq] = created.body.data as { id: string; status: string; kind: string }[];
      expect(shiftReq.status).toBe('pending');

      await request(server).post('/api/shift-requests').set(as('stylist'))
        .send({ items: [{ kind: 'shift', workDate: a.date, startTime: plus(a.hours.open, 60), endTime: plus(a.hours.open, 120) }] })
        .expect(409);

      const pending = await request(server).get(`/api/shift-requests?status=pending&from=${a.date}&to=${b.date}`).set(as('owner')).expect(200);
      expect((pending.body.data as { id: string }[]).map((r) => r.id)).toEqual(expect.arrayContaining([shiftReq.id, offReq.id]));
      const [{ count: notified }] = await ds.query(
        `SELECT COUNT(*)::int AS count FROM notifications n JOIN users u ON u.id = n.user_id
          WHERE u.role = 'owner' AND n.type = 'shift_request_new'`);
      expect(notified).toBeGreaterThan(0);

      await request(server).post(`/api/shift-requests/${shiftReq.id}/approve`).set(as('receptionist')).send({}).expect(403);
      const ok = await request(server).post(`/api/shift-requests/${shiftReq.id}/approve`).set(as('owner'))
        .send({ endTime: plus(a.hours.open, 180) }).expect(201);
      expect(ok.body.data.status).toBe('approved');
      const [shift] = await ds.query(
        `SELECT to_char(end_time,'HH24:MI') AS end FROM stylist_shifts WHERE stylist_id = $1 AND work_date = $2`, [stylistId, a.date]);
      expect(shift.end).toBe(plus(a.hours.open, 180));
      await request(server).post(`/api/shift-requests/${shiftReq.id}/approve`).set(as('owner')).send({}).expect(409);

      const rej = await request(server).post(`/api/shift-requests/${offReq.id}/reject`).set(as('owner'))
        .send({ note: 'Tuần này thiếu người' }).expect(201);
      expect(rej.body.data).toMatchObject({ status: 'rejected', reviewNote: 'Tuần này thiếu người' });
      await request(server).delete(`/api/shift-requests/${offReq.id}`).set(as('stylist')).expect(400);

      const mine = await request(server).get('/api/shift-requests/mine').set(as('stylist')).expect(200);
      expect((mine.body.data as { id: string }[]).some((r) => r.id === offReq.id)).toBe(true);
      const [{ count: reviewed }] = await ds.query(
        `SELECT COUNT(*)::int AS count FROM notifications n JOIN stylists s ON s.user_id = n.user_id
          WHERE s.id = $1 AND n.type = 'shift_request_reviewed'`, [stylistId]);
      expect(reviewed).toBeGreaterThanOrEqual(2);
    });

    it('duyệt yêu cầu chồng lên ca đã có thì báo lỗi và yêu cầu quay lại "chờ duyệt"', async () => {
      const [a] = await freeDays(stylistId, 58, 1, 2).catch(() => freeDays(stylistId, 30, 1));
      const r1 = await request(server).post('/api/shift-requests').set(as('stylist'))
        .send({ items: [{ kind: 'shift', workDate: a.date, startTime: a.hours.open, endTime: plus(a.hours.open, 120) }] }).expect(201);
      // Quản lý tự xếp một ca chồng lên trước khi duyệt
      await request(server).post(`/api/stylists/${stylistId}/shifts`).set(as('owner'))
        .send({ shifts: [{ workDate: a.date, startTime: plus(a.hours.open, 60), endTime: plus(a.hours.open, 180) }] }).expect(201);
      await request(server).post(`/api/shift-requests/${r1.body.data[0].id}/approve`).set(as('owner')).send({}).expect(409);
      const [row] = await ds.query('SELECT status FROM shift_requests WHERE id = $1', [r1.body.data[0].id]);
      expect(row.status).toBe('pending');
    });

    it('chặn ngày đã qua, quá 60 ngày, và tài khoản không phải thợ', async () => {
      await request(server).post('/api/shift-requests').set(as('stylist'))
        .send({ items: [{ kind: 'time_off', workDate: isoIn(-1) }] }).expect(400);
      await request(server).post('/api/shift-requests').set(as('stylist'))
        .send({ items: [{ kind: 'time_off', workDate: isoIn(75) }] }).expect(400);
      await request(server).post('/api/shift-requests').set(as('owner'))
        .send({ items: [{ kind: 'time_off', workDate: isoIn(3) }] }).expect(403);
    });
  });

  describe('Mục 9 — Cảnh báo khung giờ chưa có thợ, gợi ý cân bằng', () => {
    it('ngày chỉ có một ca ngắn -> báo khoảng trống đúng giờ, có thợ gợi ý; lễ tân xem được, thợ không', async () => {
      const cat = await request(server).get('/api/service-categories').set(as('owner')).expect(200);
      const svc = await request(server).post('/api/services').set(as('owner'))
        .send({ categoryId: cat.body.data[0].id, name: `Phủ ca ${Date.now()}`, durationMinutes: 30, price: 100000 }).expect(201);
      const solo = await request(server).post('/api/stylists').set(as('owner'))
        .send({ fullName: `Thợ phủ ca ${Date.now()}`, gender: 'male', serviceIds: [svc.body.data.id] }).expect(201);
      // Một ngày mà KHÔNG thợ nào có ca: chỉ xếp thợ mới 2 tiếng đầu ngày
      let target: { date: string; hours: Hours } | null = null;
      for (let d = 70; d < 100 && !target; d += 1) {
        const date = isoIn(d);
        const [{ n }] = await ds.query('SELECT COUNT(*)::int AS n FROM stylist_shifts WHERE work_date = $1', [date]);
        if (n > 0) continue;
        const found = await freeDays(solo.body.data.id, d, 1, 1).catch(() => []);
        if (found.length) target = found[0];
      }
      expect(target).not.toBeNull();
      const { date, hours } = target!;
      await request(server).post(`/api/stylists/${solo.body.data.id}/shifts`).set(as('owner'))
        .send({ shifts: [{ workDate: date, startTime: hours.open, endTime: plus(hours.open, 120) }] }).expect(201);

      const res = await request(server).get(`/api/shifts/coverage?from=${date}&to=${date}`).set(as('receptionist')).expect(200);
      const day = res.body.data.days[0];
      expect(day.staffCount).toBe(1);
      expect(day.gaps).toHaveLength(1);
      expect(day.gaps[0]).toMatchObject({ startTime: plus(hours.open, 120), endTime: hours.close, minCount: 0 });
      expect(day.gaps[0].candidates.length).toBeGreaterThan(0);
      expect(day.gaps[0].candidates.some((c: { stylistId: string }) => c.stylistId === solo.body.data.id)).toBe(false);
      expect(res.body.data.understaffedDays).toBe(1);

      await request(server).get(`/api/shifts/coverage?from=${date}&to=${date}`).set(as('stylist')).expect(403);
      await request(server).get(`/api/shifts/coverage?from=${date}&to=${isoIn(200)}`).set(as('owner')).expect(400);
    });
  });

  describe('Mục 11 — Tạm giữ chỗ khi khách đang điền form', () => {
    let serviceId = '';
    let stylistId = '';
    let date = '';
    let time = '';
    const body = (extra: Record<string, unknown> = {}) => ({ serviceIds: [serviceId], date, time, ...extra });
    const customer = (n: number) => ({ fullName: `Khách giữ chỗ ${n}`, phone: `09${String(Date.now() + n).slice(-8)}` });

    beforeAll(async () => {
      const cat = await request(server).get('/api/service-categories').set(as('owner')).expect(200);
      const svc = await request(server).post('/api/services').set(as('owner'))
        .send({ categoryId: cat.body.data[0].id, name: `Giữ chỗ ${Date.now()}`, durationMinutes: 60, price: 150000 }).expect(201);
      serviceId = svc.body.data.id;
      const sty = await request(server).post('/api/stylists').set(as('owner'))
        .send({ fullName: `Thợ giữ chỗ ${Date.now()}`, gender: 'female', serviceIds: [serviceId] }).expect(201);
      stylistId = sty.body.data.id;
      const [d] = await freeDays(stylistId, 20, 1, 15);
      date = d.date;
      await request(server).post(`/api/stylists/${stylistId}/shifts`).set(as('owner'))
        .send({ shifts: [{ workDate: date, startTime: d.hours.open, endTime: plus(d.hours.open, 180) }] }).expect(201);
      time = plus(d.hours.open, 60);
    });

    const slotsOf = async (token?: string): Promise<string[]> => {
      const res = await request(server).get('/api/public/availability')
        .query({ date, serviceIds: serviceId, stylistId, ...(token ? { holdToken: token } : {}) }).expect(200);
      return (res.body.data.slots as { time: string }[]).map((x) => x.time);
    };

    it('giữ chỗ ẩn khung giờ với khách khác, chặn giữ trùng / chốt trùng / tạo tại quầy; chủ giữ chỗ chốt được', async () => {
      expect(await slotsOf()).toContain(time);
      const a = await request(server).post('/api/public/holds').send(body()).expect(201);
      const hold = a.body.data as { holdToken: string; stylistId: string; holdMinutes: number; expiresAt: string };
      expect(hold.stylistId).toBe(stylistId);
      expect(hold.holdMinutes).toBe(10);
      expect(new Date(hold.expiresAt).getTime() - Date.now()).toBeGreaterThan(9 * 60_000);

      expect(await slotsOf()).not.toContain(time);
      expect(await slotsOf(hold.holdToken)).toContain(time);

      const b = await request(server).post('/api/public/holds').send(body({ stylistId })).expect(409);
      expect(b.body.code ?? b.body.error?.code ?? JSON.stringify(b.body)).toContain('SLOT_HELD');
      await request(server).post('/api/public/bookings').send(body({ stylistId, ...customer(1) })).expect(409);
      await request(server).post('/api/appointments/walk-in').set(as('owner')).send(body({ stylistId, ...customer(2) })).expect(409);

      const ok = await request(server).post('/api/public/bookings').send(body({ holdToken: hold.holdToken, ...customer(3) })).expect(201);
      expect(ok.body.data.stylistName).toContain('Thợ giữ chỗ');
      const [{ n }] = await ds.query('SELECT COUNT(*)::int AS n FROM slot_holds WHERE token = $1', [hold.holdToken]);
      expect(n).toBe(0);
    });

    it('10 khách cùng giữ một khung giờ một lúc -> đúng 1 người giữ được', async () => {
      const t3 = plus(time, -60); // khung đầu ca, chưa ai đặt
      const results = await Promise.all(Array.from({ length: 10 }, () =>
        request(server).post('/api/public/holds').send({ serviceIds: [serviceId], date, time: t3, stylistId })));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(9);
      await ds.query('DELETE FROM slot_holds WHERE stylist_id = $1', [stylistId]);
    });

    it('Mục 10: đặt lịch có email -> email xác nhận đầy đủ; chưa có email -> gửi bổ sung bằng mã + SĐT', async () => {
      const t4 = plus(time, 60);
      const phone = `09${String(Date.now()).slice(-8)}`;
      const withMail = await request(server).post('/api/public/bookings')
        .send({ serviceIds: [serviceId], date, time: t4, stylistId, fullName: 'Khách Email', phone, email: 'khach.email@example.com' })
        .expect(201);
      expect(withMail.body.data.emailQueued).toBe(true);
      const [mail] = await ds.query(
        `SELECT subject, body_html FROM email_queue WHERE to_email = 'khach.email@example.com' ORDER BY created_at DESC LIMIT 1`);
      expect(mail.subject).toContain(withMail.body.data.code);
      expect(mail.body_html).toContain('Thêm vào Google Calendar');
      expect(mail.body_html).toContain('Chờ tiệm xác nhận');
      expect(mail.body_html).toContain(`tra-cuu?code=${withMail.body.data.code}`);
      await ds.query('UPDATE appointments SET status = \'cancelled\' WHERE code = $1', [withMail.body.data.code]);

      const phone2 = `09${String(Date.now() + 7).slice(-8)}`;
      const noMail = await request(server).post('/api/public/bookings')
        .send({ serviceIds: [serviceId], date, time: t4, stylistId, fullName: 'Khách Chưa Email', phone: phone2 }).expect(201);
      expect(noMail.body.data.emailQueued).toBe(false);
      const code = noMail.body.data.code as string;
      await request(server).post('/api/public/bookings/email').send({ code, phone: '0912345678', email: 'x@example.com' }).expect(404);
      const sent = await request(server).post('/api/public/bookings/email')
        .send({ code, phone: phone2, email: 'Bo.Sung@Example.com' }).expect(200);
      expect(sent.body.data).toEqual({ emailQueued: true, toEmail: 'bo***@example.com' });
      const [row] = await ds.query(`SELECT COUNT(*)::int AS n FROM email_queue WHERE to_email = 'bo.sung@example.com' AND subject LIKE '%' || $1 || '%'`, [code]);
      expect(row.n).toBe(1);
      const [cust] = await ds.query('SELECT email FROM customers WHERE phone = $1', [phone2]);
      expect(cust.email).toBe('bo.sung@example.com');
      await ds.query('UPDATE appointments SET status = \'cancelled\' WHERE code = $1', [code]);
    });

    it('Mục 4: Trợ lý AI gợi ý khung giờ có điểm + lý do, khoảng rảnh từng thợ; thợ không được dùng', async () => {
      const res = await request(server).get('/api/appointments/smart-slots')
        .query({ serviceIds: serviceId, date, days: 1 }).set(as('receptionist')).expect(200);
      const data = res.body.data as {
        suggestions: { date: string; time: string; stylistId: string; score: number; reasons: string[] }[];
        windows: { date: string; stylists: { stylistId: string; free: { start: string; end: string }[] }[] }[];
      };
      expect(data.suggestions.length).toBeGreaterThan(0);
      const ours = data.suggestions.filter((x) => x.stylistId === stylistId);
      expect(ours.length).toBeLessThanOrEqual(2);
      expect(data.suggestions.every((x) => x.reasons.length > 0 && x.date === date)).toBe(true);
      const w = data.windows[0].stylists.find((x) => x.stylistId === stylistId);
      expect(w?.free.length).toBeGreaterThan(0);
      // Gợi ý nào cho thợ này cũng phải nằm trọn trong khoảng rảnh của thợ
      for (const sug of ours) expect(w!.free.some((f) => f.start <= sug.time && sug.time < f.end)).toBe(true);
      await request(server).get('/api/appointments/smart-slots').query({ serviceIds: serviceId, date }).set(as('stylist')).expect(403);
    });

    it('giữ chỗ hết hạn thì tự trả lại; trả chỗ chủ động bằng DELETE', async () => {
      const t2 = plus(time, 60);
      const a = await request(server).post('/api/public/holds').send({ serviceIds: [serviceId], date, time: t2, stylistId }).expect(201);
      await ds.query(`UPDATE slot_holds SET expires_at = now() - interval '1 second' WHERE token = $1`, [a.body.data.holdToken]);
      const slots = (await request(server).get('/api/public/availability').query({ date, serviceIds: serviceId, stylistId }).expect(200))
        .body.data.slots as { time: string }[];
      expect(slots.map((x) => x.time)).toContain(t2);

      const c = await request(server).post('/api/public/holds').send({ serviceIds: [serviceId], date, time: t2, stylistId }).expect(201);
      const rel = await request(server).delete(`/api/public/holds/${c.body.data.holdToken}`).expect(200);
      expect(rel.body.data.released).toBe(true);
      await request(server).post('/api/public/holds').send({ serviceIds: [serviceId], date, time: t2, stylistId }).expect(201);
    });
  });

  describe('Mục 7 — Chân trang: liên hệ, mạng xã hội, đội ngũ chuyên viên', () => {
    it('GET /public/salon-info không cần đăng nhập, đủ thông tin, đội ngũ lấy từ hồ sơ thợ đang làm', async () => {
      const res = await request(server).get('/api/public/salon-info').expect(200);
      const info = res.body.data;
      expect(info).toMatchObject({ name: expect.any(String), address: expect.any(String), hotline: expect.any(String) });
      expect(info.zaloUrl).toMatch(/^https:\/\/zalo\.me\//);
      expect(info.mapUrl).toContain('google.com/maps');
      expect(info.openingHours).toHaveLength(7);
      const [{ n }] = await ds.query('SELECT COUNT(*)::int AS n FROM stylists WHERE is_active');
      expect(info.team).toHaveLength(n);
      expect(JSON.stringify(info)).not.toMatch(/phone|email":"stylist/);
    });
  });

  describe('Mục 5 — AI sinh ngày lễ cả năm', () => {
    const YEAR = 2099;
    afterAll(async () => {
      await ds.query(`DELETE FROM salon_holidays WHERE start_date >= '2099-01-01'`);
    });

    it('đề xuất đủ ngày lễ, đánh dấu ngày đang có lịch khách là conflict và KHÔNG tự tạo ngày đó', async () => {
      // Một lịch hẹn giả đúng ngày Quốc khánh 2099 để kiểm tra "không chèn lên lịch khách"
      const [stylist] = await ds.query('SELECT id FROM stylists WHERE is_active LIMIT 1');
      const [customer] = await ds.query('SELECT id FROM customers LIMIT 1');
      await ds.query(
        `INSERT INTO appointments (code, customer_id, stylist_id, start_at, end_at, total_duration_minutes, status, source)
         VALUES ('HOL2099X', $1, $2, '2099-09-02T02:00:00Z', '2099-09-02T02:30:00Z', 30, 'confirmed', 'online')`,
        [customer.id, stylist.id],
      );
      try {
        const res = await request(server).get(`/api/holidays/suggestions?year=${YEAR}`).set(as('owner')).expect(200);
        const list = res.body.data as { key: string; status: string; startDate: string; endDate: string }[];
        expect(list).toHaveLength(7);
        expect(list.find((h) => h.key === '2099-quoc-khanh')?.status).toBe('conflict');
        expect(list.find((h) => h.key === '2099-tet-duong-lich')?.status).toBe('ready');

        const gen = await request(server).post('/api/holidays/generate').set(as('owner')).send({ year: YEAR }).expect(201);
        expect(gen.body.data.created).toHaveLength(6);
        expect(gen.body.data.skipped.map((s: { key: string }) => s.key)).toEqual(['2099-quoc-khanh']);

        // Chạy lại: mọi ngày đã có -> không tạo trùng
        const again = await request(server).post('/api/holidays/generate').set(as('owner')).send({ year: YEAR }).expect(201);
        expect(again.body.data.created).toHaveLength(0);

        const [{ count }] = await ds.query(`SELECT COUNT(*)::int AS count FROM audit_logs WHERE summary LIKE 'Sinh tự động%2099'`);
        expect(count).toBeGreaterThanOrEqual(1);
      } finally {
        await ds.query(`DELETE FROM appointments WHERE code = 'HOL2099X'`);
      }
    });

    it('chỉ Chủ tiệm được áp dụng; Lễ tân chỉ xem đề xuất; năm sai bị từ chối', async () => {
      await request(server).get(`/api/holidays/suggestions?year=${YEAR}`).set(as('receptionist')).expect(200);
      await request(server).post('/api/holidays/generate').set(as('receptionist')).send({ year: YEAR }).expect(403);
      await request(server).get('/api/holidays/suggestions?year=1800').set(as('owner')).expect(400);
    });
  });
});
