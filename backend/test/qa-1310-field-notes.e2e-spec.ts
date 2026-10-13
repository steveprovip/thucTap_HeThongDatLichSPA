import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ACCOUNTS, createTestApp } from './setup-app';

/**
 * Ghi chú test thực tế 13/10:
 *  - Kéo thả ca kiểu Jira: PATCH /shifts/:id/move chuyển ca sang thợ / ngày khác hoặc sao chép; chặn chồng ca, ngoài giờ mở
 *    cửa, ca đang có lịch hẹn (lịch sẽ mất thợ), chỉ Chủ tiệm.
 *  - "Email chưa nhận được thông báo": GET /notifications/mail-status cho biết thư đang vào hộp thư thử nghiệm (MailDev).
 */
describe('Ghi chú test 13/10 — kéo thả ca, trạng thái gửi email', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let ds: DataSource;
  const tokens: Record<string, string> = {};
  const as = (role: keyof typeof ACCOUNTS) => ({ Authorization: `Bearer ${tokens[role]}` });
  const isoIn = (days: number): string => {
    const d = new Date(Date.now() + 7 * 3600_000);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const plus = (time: string, minutes: number): string => {
    const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + minutes;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };
  let svc = '';
  let s1 = '';
  let s2 = '';
  const days: { date: string; open: string }[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    ds = app.get(DataSource);
    for (const role of ['owner', 'receptionist'] as const) {
      tokens[role] = (await request(server).post('/api/auth/login').send(ACCOUNTS[role]).expect(200)).body.data.accessToken;
    }
    const cat = await request(server).get('/api/service-categories').set(as('owner')).expect(200);
    svc = (await request(server).post('/api/services').set(as('owner'))
      .send({ categoryId: cat.body.data[0].id, name: `Kéo thả ca ${Date.now()}`, durationMinutes: 60, price: 150000 }).expect(201)).body.data.id;
    for (const [name, gender] of [['Thợ kéo ca 1', 'female'], ['Thợ kéo ca 2', 'male']] as const) {
      const id = (await request(server).post('/api/stylists').set(as('owner'))
        .send({ fullName: `${name} ${Date.now()}`, gender, serviceIds: [svc] }).expect(201)).body.data.id as string;
      if (s1) s2 = id; else s1 = id;
    }
    // 2 ngày mở cửa CÙNG THỨ (cách nhau 7 ngày → cùng giờ mở cửa), ở xa để không đụng bộ khác
    const openDay = async (date: string): Promise<string | null> => {
      const [h] = await ds.query(
        `SELECT to_char(open_time,'HH24:MI') AS open FROM salon_working_hours WHERE day_of_week = $1 AND is_closed = FALSE`,
        [new Date(`${date}T12:00:00Z`).getUTCDay()]);
      const [hol] = await ds.query('SELECT 1 FROM salon_holidays WHERE $1::date BETWEEN start_date AND end_date', [date]);
      return h && !hol ? h.open : null;
    };
    for (let d = 110; d < 160 && days.length < 2; d += 1) {
      const [a, b] = [isoIn(d), isoIn(d + 7)];
      const [oa, ob] = [await openDay(a), await openDay(b)];
      if (oa && ob) days.push({ date: a, open: oa }, { date: b, open: ob });
    }
    expect(days).toHaveLength(2);
  }, 60000);

  afterAll(async () => {
    if (ds && s1) {
      await ds.query('UPDATE stylists SET is_active = FALSE WHERE id = ANY($1::uuid[])', [[s1, s2]]);
      await ds.query('UPDATE services SET is_active = FALSE WHERE id = $1', [svc]);
    }
    await app?.close();
  });

  const shift = async (stylistId: string, date: string, start: string, hours: number): Promise<string> =>
    (await request(server).post(`/api/stylists/${stylistId}/shifts`).set(as('owner'))
      .send({ shifts: [{ workDate: date, startTime: start, endTime: plus(start, hours * 60) }] }).expect(201)).body.data[0].id;

  it('kéo ca sang thợ khác / ngày khác; Ctrl+kéo sao chép; chồng ca bị chặn; lễ tân không được kéo', async () => {
    const [d1, d2] = days;
    const id = await shift(s1, d1.date, d1.open, 4);
    await request(server).patch(`/api/shifts/${id}/move`).set(as('receptionist')).send({ stylistId: s2 }).expect(403);

    const moved = await request(server).patch(`/api/shifts/${id}/move`).set(as('owner')).send({ stylistId: s2, workDate: d2.date }).expect(200);
    expect(moved.body.data).toMatchObject({ id, stylistId: s2, workDate: d2.date });
    const [row] = await ds.query("SELECT stylist_id, to_char(work_date,'YYYY-MM-DD') AS d FROM stylist_shifts WHERE id = $1", [id]);
    expect(row).toEqual({ stylist_id: s2, d: d2.date });

    const copy = await request(server).patch(`/api/shifts/${id}/move`).set(as('owner')).send({ stylistId: s1, workDate: d2.date, copy: true }).expect(200);
    expect(copy.body.data.id).not.toBe(id);
    expect(copy.body.data).toMatchObject({ stylistId: s1, workDate: d2.date });
    // Ca gốc vẫn còn ở thợ 2 → sao chép lần nữa vào ô đã có ca cùng giờ thì chồng ca
    const clash = await request(server).patch(`/api/shifts/${id}/move`).set(as('owner')).send({ stylistId: s1, workDate: d2.date, copy: true });
    expect(clash.status).toBe(409);
  });

  it('không chuyển được ca đang có lịch hẹn bên trong (lịch sẽ mất thợ) — sao chép thì vẫn được', async () => {
    const [d1, d2] = days;
    const id = await shift(s1, d1.date, plus(d1.open, 300), 3);
    await request(server).post('/api/appointments/walk-in').set(as('owner'))
      .send({ serviceIds: [svc], date: d1.date, time: plus(d1.open, 330), stylistId: s1, fullName: 'Khách kéo ca', phone: `09${String(Date.now()).slice(-8)}` })
      .expect(201);
    const blocked = await request(server).patch(`/api/shifts/${id}/move`).set(as('owner')).send({ workDate: d2.date });
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toMatch(/đang có 1 lịch hẹn/);
    await request(server).patch(`/api/shifts/${id}/move`).set(as('owner')).send({ stylistId: s2, workDate: d1.date, copy: true }).expect(200);
  });

  it('trạng thái gửi email cho trang Tổng quan; gửi thử chỉ Chủ tiệm / Quản trị, email sai định dạng bị từ chối', async () => {
    const st = await request(server).get('/api/notifications/mail-status').set(as('receptionist')).expect(200);
    expect(['test-inbox', 'smtp']).toContain(st.body.data.mode);
    expect(st.body.data).toEqual(expect.objectContaining({ sent24h: expect.any(Number), failed24h: expect.any(Number), pending: expect.any(Number) }));
    await request(server).post('/api/notifications/mail-test').set(as('receptionist')).send({ to: 'a@b.vn' }).expect(403);
    await request(server).post('/api/notifications/mail-test').set(as('owner')).send({ to: 'không-phải-email' }).expect(400);
  });
});
