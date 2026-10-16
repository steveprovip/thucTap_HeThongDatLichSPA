import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ACCOUNTS, createTestApp } from './setup-app';

/**
 * QA 12/10 (Sprint 1–3) trên máy chủ THẬT:
 *  - Mã giảm giá: PATCH /vouchers/:id (bật / tắt / sửa) — trước đây 404 "Cannot PATCH"; giá trị đơn tối thiểu được lưu và áp.
 *  - Trợ lý AI: câu "Đang có thợ nào làm việc vậy?" trả danh sách thợ có ca hôm nay (không rơi vào "chưa hiểu").
 *  - Sprint 3 · mục 1: Lễ tân duyệt / từ chối yêu cầu XIN NGHỈ của thợ; đăng ký CA LÀM vẫn do Chủ tiệm duyệt.
 *  - Sprint 3 · mục 2: sửa email trong hồ sơ thợ → tạo / gắn / đổi tài khoản đăng nhập, hai màn hình khớp nhau.
 */
describe('QA 12/10 — voucher PATCH, AI thợ đang trực, duyệt nghỉ, email hồ sơ thợ', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let ds: DataSource;
  const tokens: Record<string, string> = {};
  const as = (role: keyof typeof ACCOUNTS) => ({ Authorization: `Bearer ${tokens[role]}` });
  const runId = Date.now().toString().slice(-6);
  const isoIn = (days: number): string => {
    const d = new Date(Date.now() + 7 * 3_600_000); // ngày theo giờ tiệm (UTC+7)
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const plus = (time: string, minutes: number): string => {
    const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + minutes;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    ds = app.get(DataSource);
    // Bộ đếm AI khách theo IP nằm trong CSDL dùng chung: mọi bộ test gọi từ 127.0.0.1 cùng một xô 20 lượt / 10 phút
    await ds.query(`DELETE FROM rate_limits WHERE scope = 'public_assistant_ip'`);
    for (const role of ['admin', 'owner', 'receptionist', 'stylist'] as const) {
      const r = await request(server).post('/api/auth/login').send(ACCOUNTS[role]).expect(200);
      tokens[role] = r.body.data.accessToken as string;
    }
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  describe('Mã giảm giá — PATCH /api/vouchers/:id', () => {
    let id = '';
    const code = `QA1210${runId}`;

    beforeAll(async () => {
      const r = await request(server).post('/api/vouchers').set(as('owner')).send({
        code, discountType: 'percent', discountValue: 10, startDate: isoIn(-1), endDate: isoIn(30), minOrderValue: 200000,
      }).expect(201);
      id = r.body.data.id as string;
      expect(r.body.data.minOrderValue).toBe(200000);
    });

    it('tắt / bật mã bằng công tắc (trước đây 404 Cannot PATCH)', async () => {
      const off = await request(server).patch(`/api/vouchers/${id}`).set(as('owner')).send({ isActive: false }).expect(200);
      expect(off.body.data.isActive).toBe(false);
      await request(server).get('/api/invoices/voucher-preview').query({ code, subtotal: 500000 }).set(as('owner')).expect(400);
      const on = await request(server).patch(`/api/vouchers/${id}`).set(as('owner')).send({ isActive: true }).expect(200);
      expect(on.body.data.isActive).toBe(true);
      const [row] = await ds.query('SELECT is_active FROM vouchers WHERE id = $1', [id]);
      expect(row.is_active).toBe(true);
    });

    it('sửa đầy đủ: đổi mã, giá trị, đơn tối thiểu; kiểm tra trùng mã / % > 100 / khoảng ngày / quyền', async () => {
      const newCode = `QA1210E${runId}`;
      const r = await request(server).patch(`/api/vouchers/${id}`).set(as('owner')).send({
        code: newCode.toLowerCase(), description: 'Sửa từ màn hình', discountType: 'amount', discountValue: 50000,
        minOrderValue: 300000, maxUsage: 5,
      }).expect(200);
      expect(r.body.data).toMatchObject({ code: newCode, discountType: 'amount', discountValue: 50000, minOrderValue: 300000, maxUsage: 5 });

      // Đơn tối thiểu được áp thật: dưới 300.000 ₫ không dùng được mã
      const low = await request(server).get('/api/invoices/voucher-preview').query({ code: newCode, subtotal: 250000 }).set(as('owner')).expect(400);
      expect(low.body.message).toContain('chỉ áp dụng cho đơn từ');
      const ok = await request(server).get('/api/invoices/voucher-preview').query({ code: newCode, subtotal: 400000 }).set(as('owner')).expect(200);
      expect(ok.body.data.discountAmount).toBe(50000);

      const other = await request(server).post('/api/vouchers').set(as('owner')).send({
        code: `QA1210O${runId}`, discountType: 'amount', discountValue: 10000, startDate: isoIn(0), endDate: isoIn(10),
      }).expect(201);
      await request(server).patch(`/api/vouchers/${other.body.data.id}`).set(as('owner')).send({ code: newCode }).expect(409);
      await request(server).patch(`/api/vouchers/${id}`).set(as('owner')).send({ discountType: 'percent', discountValue: 150 }).expect(400);
      await request(server).patch(`/api/vouchers/${id}`).set(as('owner')).send({ endDate: isoIn(-5) }).expect(400);
      await request(server).patch(`/api/vouchers/${id}`).set(as('receptionist')).send({ isActive: false }).expect(403);
      await request(server).patch('/api/vouchers/7f1d9c3e-0000-4000-8000-000000000000').set(as('owner')).send({ isActive: false }).expect(404);

      // Bỏ yêu cầu đơn tối thiểu
      const cleared = await request(server).patch(`/api/vouchers/${id}`).set(as('owner')).send({ minOrderValue: null }).expect(200);
      expect(cleared.body.data.minOrderValue).toBeFalsy();
    });
  });

  describe('Trợ lý AI — thợ đang trực hôm nay', () => {
    it('trả lời "Đang có thợ nào làm việc vậy?" bằng danh sách thợ có ca hôm nay', async () => {
      const name = `QA1210 Trực ${runId}`;
      const sty = await request(server).post('/api/stylists').set(as('owner')).send({ fullName: name, gender: 'female' }).expect(201);
      // Ca phủ cả ngày hôm nay (ghi thẳng vào CSDL để không phụ thuộc giờ mở cửa của ngày chạy test)
      await ds.query(
        `INSERT INTO stylist_shifts (stylist_id, work_date, start_time, end_time)
         VALUES ($1, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, '00:00', '23:59')`, [sty.body.data.id]);

      const chat = await request(server).post('/api/assistant/chat').set(as('receptionist'))
        .send({ message: 'Đang có thợ nào làm việc vậy?' }).expect(200);
      expect(chat.body.data.intent).toBe('working_stylists');
      expect(chat.body.data.answer).toContain(name);
      expect(chat.body.data.answer).toContain('00:00–23:59');
      expect(chat.body.data.answer).not.toContain('chưa chắc đã hiểu');

      const free = await request(server).post('/api/assistant/chat').set(as('owner')).send({ message: 'Ai đang rảnh?' }).expect(200);
      expect(free.body.data.intent).toBe('working_stylists');

      const list = await request(server).get('/api/assistant/working-today').set(as('owner')).expect(200);
      const me = (list.body.data as { fullName: string; onShiftNow: boolean }[]).find((x) => x.fullName === name);
      expect(me).toBeDefined();
      await request(server).get('/api/assistant/working-today').set(as('stylist')).expect(403);
    });

    it('bật AI local một chạm: chỉ Chủ tiệm / Lễ tân; máy chưa cấu hình thì báo rõ, không lỗi', async () => {
      const r = await request(server).post('/api/assistant/local/start').set(as('owner')).expect(200);
      expect(r.body.data.started).toBe(false);
      expect(typeof r.body.data.message).toBe('string');
      await request(server).post('/api/assistant/local/start').set(as('stylist')).expect(403);
      const st = await request(server).get('/api/assistant/status').set(as('receptionist')).expect(200);
      expect(st.body.data).toMatchObject({ mode: 'rules', localAvailable: false });
    });
  });

  describe('AI tư vấn khách — số lượng / rẻ nhất tính trên danh mục thật (không bịa)', () => {
    it('"có bao nhiêu dịch vụ", "dịch vụ rẻ nhất là" khớp đúng /api/public/catalog, thẻ gợi ý bám câu hỏi', async () => {
      const groups = (await request(server).get('/api/public/catalog').expect(200)).body.data as
        { categoryName: string; services: { id: string; name: string; price: number; durationMinutes: number }[] }[];
      const all = groups.flatMap((g) => g.services);
      expect(all.length).toBeGreaterThan(1);
      const minPrice = Math.min(...all.map((s) => s.price));

      const count = await request(server).post('/api/public/assistant/chat').send({ message: 'có bao nhiêu dịch vụ ?' }).expect(200);
      expect(count.body.data).toMatchObject({ intent: 'count_services', source: 'rules' });
      expect(count.body.data.answer).toContain(`có ${all.length} dịch vụ đặt online, chia thành ${groups.filter((g) => g.services.length).length} danh mục`);

      const cheap = await request(server).post('/api/public/assistant/chat').send({ message: 'dịch vụ rẻ nhất là' }).expect(200);
      expect(cheap.body.data.intent).toBe('cheapest_service');
      expect(cheap.body.data.suggestions[0].price).toBe(minPrice);
      expect(cheap.body.data.answer).toContain(cheap.body.data.suggestions[0].name);
      expect(cheap.body.data.answer).not.toMatch(/\*\*|\[Đặt lịch\]/);

      const pricey = await request(server).post('/api/public/assistant/chat').send({ message: 'dịch vụ đắt nhất' }).expect(200);
      expect(pricey.body.data.suggestions[0].price).toBe(Math.max(...all.map((s) => s.price)));
    });
  });

  describe('AI tư vấn khách — tra giờ trống THẬT (QA nhập vai 12/10)', () => {
    it('"<dịch vụ> ngày dd/mm còn giờ nào" trả đúng số khung giờ của trang đặt lịch; câu nối tiếp hiểu theo ngữ cảnh', async () => {
      const groups = (await request(server).get('/api/public/catalog').expect(200)).body.data as { services: { id: string; name: string }[] }[];
      let pick: { svc: { id: string; name: string }; date: string; count: number } | null = null;
      for (let d = 3; d < 12 && !pick; d += 1) {
        const date = isoIn(d);
        for (const svc of groups.flatMap((g) => g.services).slice(0, 6)) {
          const slots = (await request(server).get('/api/public/availability').query({ date, serviceIds: svc.id }).expect(200)).body.data.slots as { stylistIds: string[] }[];
          const count = slots.filter((x) => x.stylistIds.length).length;
          if (count > 0) { pick = { svc, date, count }; break; }
        }
      }
      expect(pick).not.toBeNull();
      const { svc, date, count } = pick!;
      const ddmm = `${date.slice(8, 10)}/${date.slice(5, 7)}`;
      const r = await request(server).post('/api/public/assistant/chat').send({ message: `${svc.name} ngày ${ddmm} còn giờ nào` }).expect(200);
      expect(r.body.data).toMatchObject({ intent: 'availability', source: 'rules' });
      expect(r.body.data.answer).toContain(`còn ${count} khung giờ trống`);
      expect(r.body.data.suggestions.map((s: { id: string }) => s.id)).toEqual([svc.id]);
      expect(r.body.data.pending).toBeUndefined(); // dữ liệu nội bộ không lộ ra giao diện
      expect(r.body.data.bookDate).toBe(date); // nút "Đặt" mở phiếu đặt lịch đúng ngày vừa tra

      // Lượt sau không nêu dịch vụ: hiểu theo câu trước
      const next = await request(server).post('/api/public/assistant/chat').send({
        message: `ngày ${ddmm} buổi tối còn không`,
        history: [{ role: 'user', content: `${svc.name} ngày ${ddmm} còn giờ nào` }, { role: 'assistant', content: r.body.data.answer }],
      }).expect(200);
      expect(next.body.data.intent).toBe('availability');
      expect(next.body.data.answer).toContain(svc.name);
    

      // Trạng thái hội thoại (dialogue state) như widget: "ngày X còn giờ nào" → hỏi dịch vụ → khách chỉ gõ tên dịch vụ
      const ask = await request(server).post('/api/public/assistant/chat').send({ message: `ngày ${ddmm} còn giờ nào trống` }).expect(200);
      expect(ask.body.data.state).toMatchObject({ task: 'availability', date, awaitingService: true });
      const answer = await request(server).post('/api/public/assistant/chat')
        .send({ message: `${svc.name} ?`, state: ask.body.data.state }).expect(200);
      expect(answer.body.data).toMatchObject({ intent: 'availability', bookDate: date });
      expect(answer.body.data.answer).toContain(`còn ${count} khung giờ trống`);
      // "thế giờ trống là ?" giữ đúng ngày + dịch vụ đang tra (log 12/10: từng nhảy về "hôm nay")
      const again = await request(server).post('/api/public/assistant/chat')
        .send({ message: 'thế giờ trống là ?', state: answer.body.data.state }).expect(200);
      expect(again.body.data).toMatchObject({ intent: 'availability', bookDate: date });
    });

    it('state do client gửi được kiểm tra chặt (ngày / giờ / id sai định dạng → 400)', async () => {
      for (const state of [{ date: '13/10' }, { time: '25:00' }, { serviceId: 'abc' }, { task: 'drop table' }]) {
        await request(server).post('/api/public/assistant/chat').send({ message: 'còn giờ không', state }).expect(400);
      }
    });

    it('log 12/10 lần 4: "dịch vụ mát xoa nào trống lịch" tra CẢ NHÓM; "có những thợ gì có thể làm" nêu tên thợ thật', async () => {
      const date = isoIn(4);
      const ddmm = `${date.slice(8, 10)}/${date.slice(5, 7)}`;
      const g = await request(server).post('/api/public/assistant/chat').send({ message: `ngày ${ddmm} có dịch vụ mát xoa nào trống lịch không ?` }).expect(200);
      expect(g.body.data.intent).toBe('availability');
      expect(g.body.data.answer).toMatch(/nhóm massage (còn trống|đều đã kín)|tiệm nghỉ/);
      expect(g.body.data.state).toMatchObject({ date, awaitingService: true });

      const groups = (await request(server).get('/api/public/catalog').expect(200)).body.data as { services: { id: string; name: string }[] }[];
      const svc = groups.flatMap((x) => x.services)[0];
      const capable = (await request(server).get('/api/public/stylists').query({ serviceIds: svc.id }).expect(200)).body.data as { fullName: string }[];
      const first = await request(server).post('/api/public/assistant/chat').send({ message: `"${svc.name}" ngày ${ddmm} có lịch trống không ?` }).expect(200);
      const who = await request(server).post('/api/public/assistant/chat').send({
        message: 'có những thợ gì có thể làm ?', state: first.body.data.state,
        history: [{ role: 'user', content: `"${svc.name}" ngày ${ddmm} có lịch trống không ?` }, { role: 'assistant', content: first.body.data.answer }],
      }).expect(200);
      expect(who.body.data.intent).toBe('stylists');
      for (const c of capable.slice(0, 3)) expect(who.body.data.answer).toContain(c.fullName);
    });

    it('vòng tự cải tiến: chủ tiệm dạy cụm từ → trợ lý hiểu ngay; lễ tân không duyệt được; câu vô nghĩa không được học', async () => {
      const groups = (await request(server).get('/api/public/catalog').expect(200)).body.data as { services: { id: string; name: string }[] }[];
      const svc = groups.flatMap((x) => x.services)[0];
      const before = await request(server).post('/api/public/assistant/chat').send({ message: 'zxqdv giá bao nhiêu' }).expect(200);
      expect(before.body.data.suggestions.map((x: { id: string }) => x.id)).not.toContain(svc.id);

      await request(server).post('/api/assistant/learning').set(as('receptionist')).send({ kind: 'alias', phrase: 'zxqdv', rewrite: svc.name }).expect(403);
      await request(server).post('/api/assistant/learning').set(as('owner')).send({ kind: 'question', phrase: 'qwz qwz', rewrite: 'abc xyz' }).expect(400);
      const added = await request(server).post('/api/assistant/learning').set(as('owner')).send({ kind: 'alias', phrase: 'zxqdv', rewrite: svc.name }).expect(201);
      expect(added.body.data).toMatchObject({ kind: 'alias', phrase: 'zxqdv', status: 'approved', source: 'owner' });

      const after = await request(server).post('/api/public/assistant/chat').send({ message: 'zxqdv giá bao nhiêu' }).expect(200);
      expect(after.body.data.intent).toBe('service_price');
      expect(after.body.data.suggestions.map((x: { id: string }) => x.id)).toContain(svc.id);

      const listed = (await request(server).get('/api/assistant/learning').query({ status: 'approved' }).set(as('receptionist')).expect(200)).body.data;
      expect(listed.some((x: { phrase: string }) => x.phrase === 'zxqdv')).toBe(true);
      await request(server).patch(`/api/assistant/learning/${added.body.data.id}`).set(as('owner')).send({ status: 'rejected' }).expect(200);
      const reverted = await request(server).post('/api/public/assistant/chat').send({ message: 'zxqdv giá bao nhiêu' }).expect(200);
      expect(reverted.body.data.suggestions.map((x: { id: string }) => x.id)).not.toContain(svc.id);

      // Câu ngoài dữ liệu: chủ tiệm soạn câu trả lời ("snippet") → trợ lý trả đúng câu đó
      const parking = 'Tiệm có chỗ giữ xe máy miễn phí trước cửa; ô tô gửi ở bãi cách 50 m.';
      const unknown = await request(server).post('/api/public/assistant/chat').send({ message: 'tiệm có chỗ để xe hơi ko' }).expect(200);
      expect(unknown.body.data.intent).toBe('unknown');
      const faq = await request(server).post('/api/assistant/learning').set(as('owner')).send({ kind: 'answer', phrase: 'chỗ để xe', rewrite: parking }).expect(201);
      const answered = await request(server).post('/api/public/assistant/chat').send({ message: 'tiệm có chỗ để xe hơi ko' }).expect(200);
      expect(answered.body.data).toMatchObject({ intent: 'faq', answer: parking });
      await request(server).patch(`/api/assistant/learning/${faq.body.data.id}`).set(as('owner')).send({ status: 'rejected' }).expect(200);
    });

    it('khách bấm 👎 → câu đó vào báo cáo cải tiến của chủ tiệm', async () => {
      await request(server).post('/api/public/assistant/feedback').send({ question: 'tiệm có gửi xe máy không ạ', intent: 'unknown', helpful: false }).expect(200);
      await request(server).post('/api/public/assistant/feedback').send({ question: 'x', intent: 'unknown' }).expect(400);
      const rep = (await request(server).get('/api/assistant/improvement').set(as('owner')).expect(200)).body.data;
      expect(rep.feedback.down).toBeGreaterThanOrEqual(1);
      expect(rep.gaps.items.find((g: { question: string }) => g.question.includes('gửi xe máy'))).toMatchObject({ intent: 'dislike:unknown' });
      expect(Array.isArray(rep.suggestions)).toBe(true);
      await request(server).get('/api/assistant/improvement').expect(401);
    });

    it('câu chưa trả lời được ghi vào "lỗ hổng kiến thức" (đã che SĐT) — chỉ nhân viên xem được', async () => {
      await request(server).post('/api/public/assistant/chat').send({ message: 'tiệm có bán vé số 0912345678 không qwz' }).expect(200);
      await request(server).get('/api/assistant/knowledge-gaps').expect(401);
      const gaps = (await request(server).get('/api/assistant/knowledge-gaps').set(as('owner')).expect(200)).body.data;
      const hit = gaps.items.find((g: { question: string }) => g.question.includes('vé số'));
      expect(hit).toBeDefined();
      expect(hit.question).not.toContain('0912345678');
      expect(hit.question).toContain('[sđt]');
    });
  });

  describe('Bộ nhớ đệm danh mục công khai không làm chậm thay đổi của chủ tiệm (S1-06, S1-07, S2-03)', () => {
    type Group = { categoryId: string; services: { id: string }[] };
    const catalog = async (): Promise<Group[]> => (await request(server).get('/api/public/catalog').expect(200)).body.data;
    const has = (groups: Group[], id: string) => groups.some((g) => g.services.some((s) => s.id === id));

    it('ngưng tài khoản thợ ở "Tài khoản nhân sự" → dịch vụ chỉ thợ đó làm biến mất khỏi trang khách NGAY', async () => {
      const categoryId = (await request(server).get('/api/service-categories').set(as('owner')).expect(200)).body.data[0].id;
      const svc = await request(server).post('/api/services').set(as('owner'))
        .send({ categoryId, name: `QA1210 Cache ${runId}`, durationMinutes: 30, price: 150000 }).expect(201);
      const sty = await request(server).post('/api/stylists').set(as('owner')).send({
        fullName: `QA1210 Cache ${runId}`, gender: 'female', serviceIds: [svc.body.data.id], email: `qa1210.cache.${runId}@salon.vn`,
      }).expect(201);
      expect(has(await catalog(), svc.body.data.id)).toBe(true); // nạp vào bộ nhớ đệm
      await request(server).patch(`/api/users/${sty.body.data.userId}`).set(as('admin')).send({ isActive: false }).expect(200);
      expect(has(await catalog(), svc.body.data.id)).toBe(false);
      await request(server).patch(`/api/users/${sty.body.data.userId}`).set(as('admin')).send({ isActive: true }).expect(200);
      expect(has(await catalog(), svc.body.data.id)).toBe(true);
      await request(server).patch(`/api/services/${svc.body.data.id}`).set(as('owner')).send({ isActive: false }).expect(200);
      expect(has(await catalog(), svc.body.data.id)).toBe(false);
    });

    it('đổi thứ tự hiển thị nhóm dịch vụ → trang khách đổi thứ tự ngay', async () => {
      const before = await catalog();
      expect(before.length).toBeGreaterThan(1);
      const last = before[before.length - 1].categoryId;
      const [{ display_order: old }] = await ds.query('SELECT display_order FROM service_categories WHERE id = $1', [last]);
      await request(server).patch(`/api/service-categories/${last}`).set(as('owner')).send({ displayOrder: 0 }).expect(200);
      expect((await catalog()).findIndex((g) => g.categoryId === last)).toBeLessThan(before.length - 1);
      await request(server).patch(`/api/service-categories/${last}`).set(as('owner')).send({ displayOrder: old }).expect(200);
      expect((await catalog()).at(-1)!.categoryId).toBe(last);
    });
  });

  describe('Sprint 3 · mục 1 — Lễ tân duyệt yêu cầu xin nghỉ', () => {
    it('lễ tân duyệt / từ chối được yêu cầu nghỉ, nhưng không duyệt được đăng ký ca làm', async () => {
      const me = await request(server).get('/api/auth/me').set(as('stylist')).expect(200);
      const stylistId = me.body.data.stylistId as string;
      const days: { date: string; open: string }[] = [];
      for (let d = 50; d < 60 && days.length < 3; d += 1) {
        const date = isoIn(d);
        const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
        const [wh] = await ds.query(
          `SELECT to_char(open_time,'HH24:MI') AS open FROM salon_working_hours WHERE day_of_week = $1 AND NOT is_closed`, [dow]);
        const [hol] = await ds.query('SELECT 1 FROM salon_holidays WHERE $1::date BETWEEN start_date AND end_date', [date]);
        const [busy] = await ds.query(
          `SELECT 1 FROM stylist_shifts WHERE stylist_id = $1 AND work_date = $2
           UNION ALL SELECT 1 FROM stylist_time_off WHERE stylist_id = $1 AND off_date = $2
           UNION ALL SELECT 1 FROM shift_requests WHERE stylist_id = $1 AND work_date = $2 AND status = 'pending'`, [stylistId, date]);
        if (wh && !hol && !busy) days.push({ date, open: wh.open });
      }
      expect(days.length).toBe(3);

      const created = await request(server).post('/api/shift-requests').set(as('stylist')).send({
        items: [
          { kind: 'time_off', workDate: days[0].date, note: 'Việc gia đình' },
          { kind: 'time_off', workDate: days[1].date },
          { kind: 'shift', workDate: days[2].date, startTime: days[2].open, endTime: plus(days[2].open, 240) },
        ],
      }).expect(201);
      const [off1, off2, shift] = created.body.data as { id: string; kind: string }[];
      expect(shift.kind).toBe('shift');

      const ok = await request(server).post(`/api/shift-requests/${off1.id}/approve`).set(as('receptionist')).send({}).expect(201);
      expect(ok.body.data.status).toBe('approved');
      const [off] = await ds.query('SELECT 1 FROM stylist_time_off WHERE stylist_id = $1 AND off_date = $2', [stylistId, days[0].date]);
      expect(off).toBeDefined();

      const rej = await request(server).post(`/api/shift-requests/${off2.id}/reject`).set(as('receptionist'))
        .send({ note: 'Hôm đó đông khách' }).expect(201);
      expect(rej.body.data.status).toBe('rejected');

      await request(server).post(`/api/shift-requests/${shift.id}/approve`).set(as('receptionist')).send({}).expect(403);
      await request(server).post(`/api/shift-requests/${shift.id}/reject`).set(as('receptionist')).send({}).expect(403);
      const [still] = await ds.query('SELECT status FROM shift_requests WHERE id = $1', [shift.id]);
      expect(still.status).toBe('pending');
      await request(server).post(`/api/shift-requests/${shift.id}/reject`).set(as('owner')).send({}).expect(201);
    });
  });

  describe('Sprint 3 · mục 2 — email hồ sơ thợ ↔ tài khoản nhân sự', () => {
    it('thêm email cho thợ chưa có tài khoản → tạo tài khoản Thợ, đăng nhập được; đổi email → tài khoản đổi theo', async () => {
      const sty = await request(server).post('/api/stylists').set(as('owner'))
        .send({ fullName: `QA1210 Email ${runId}`, gender: 'male' }).expect(201);
      const id = sty.body.data.id as string;
      expect(sty.body.data.userId).toBeNull();

      const email = `qa1210.tho.${runId}@salon.vn`;
      const up = await request(server).patch(`/api/stylists/${id}`).set(as('owner')).send({ email: email.toUpperCase() }).expect(200);
      expect(up.body.data.email).toBe(email);
      expect(up.body.data.userId).toBeTruthy();
      expect(up.body.data.tempPassword).toBeTruthy();
      await request(server).post('/api/auth/login').send({ email, password: up.body.data.tempPassword }).expect(200);
      const [acc] = await ds.query('SELECT role, full_name FROM users WHERE id = $1', [up.body.data.userId]);
      expect(acc).toMatchObject({ role: 'stylist', full_name: `QA1210 Email ${runId}` });

      const next = `qa1210.moi.${runId}@salon.vn`;
      const changed = await request(server).patch(`/api/stylists/${id}`).set(as('owner')).send({ email: next }).expect(200);
      expect(changed.body.data).toMatchObject({ email: next, userId: up.body.data.userId });
      expect(changed.body.data.tempPassword).toBeUndefined();
      const users = await request(server).get('/api/users').query({ search: next }).set(as('admin')).expect(200);
      expect(JSON.stringify(users.body.data)).toContain(id); // danh sách tài khoản nhân sự thấy đúng hồ sơ thợ

      // Email của người khác → 409, hồ sơ giữ nguyên
      await request(server).patch(`/api/stylists/${id}`).set(as('owner')).send({ email: ACCOUNTS.owner.email }).expect(409);
    });

    it('gắn tài khoản Thợ tạo sẵn ở "Tài khoản nhân sự" vào hồ sơ thợ chưa có tài khoản', async () => {
      const email = `qa1210.gan.${runId}@salon.vn`;
      const user = await request(server).post('/api/users').set(as('admin')).send({
        fullName: `QA1210 Gắn ${runId}`, email, role: 'stylist', createStylistProfile: false,
      }).expect(201);
      const sty = await request(server).post('/api/stylists').set(as('owner'))
        .send({ fullName: `QA1210 Gắn ${runId}`, gender: 'female' }).expect(201);
      const linked = await request(server).patch(`/api/stylists/${sty.body.data.id}`).set(as('owner')).send({ email }).expect(200);
      expect(linked.body.data.userId).toBe(user.body.data.id);
      expect(linked.body.data.tempPassword).toBeUndefined();

      // Tài khoản đã gắn hồ sơ khác / không phải vai trò Thợ → 409
      const sty2 = await request(server).post('/api/stylists').set(as('owner'))
        .send({ fullName: `QA1210 Gắn2 ${runId}`, gender: 'female' }).expect(201);
      await request(server).patch(`/api/stylists/${sty2.body.data.id}`).set(as('owner')).send({ email }).expect(409);
      await request(server).patch(`/api/stylists/${sty2.body.data.id}`).set(as('owner')).send({ email: ACCOUNTS.receptionist.email }).expect(409);
    });
  });
});
