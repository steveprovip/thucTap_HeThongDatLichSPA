import { LlmGate, SingleFlight, TtlCache } from './llm-gate';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Chịu tải Trợ lý AI — LlmGate / SingleFlight / TtlCache (QA 12/10)', () => {
  it('1000 câu cùng lúc: tối đa N câu chạy mô hình, phần dư trả null NGAY thay vì treo', async () => {
    const gate = new LlmGate(2, 6, 200);
    let running = 0;
    let peak = 0;
    const started = Date.now();
    const results = await Promise.all(Array.from({ length: 1000 }, () => gate.run(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await sleep(20);
      running -= 1;
      return 'llm';
    })));
    const served = results.filter((r) => r === 'llm').length;
    expect(peak).toBeLessThanOrEqual(2);
    expect(served).toBeGreaterThanOrEqual(8); // 2 chạy + 6 hàng chờ
    expect(served).toBeLessThan(1000);
    expect(results.filter((r) => r === null).length).toBe(1000 - served);
    expect(Date.now() - started).toBeLessThan(2000); // không ai chờ tới hết AI_TIMEOUT_MS
    expect(gate.stats).toEqual({ active: 0, queued: 0 });
  });

  it('người chờ quá maxWaitMs được trả null, chỗ trống vẫn được thu hồi đúng', async () => {
    const gate = new LlmGate(1, 5, 30);
    const slow = gate.run(() => sleep(120).then(() => 'a'));
    const waiting = gate.run(async () => 'b');
    expect(await waiting).toBeNull();
    expect(await slow).toBe('a');
    expect(await gate.run(async () => 'c')).toBe('c');
    expect(gate.stats).toEqual({ active: 0, queued: 0 });
  });

  it('lỗi trong fn vẫn trả chỗ', async () => {
    const gate = new LlmGate(1, 0, 10);
    await expect(gate.run(async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(await gate.run(async () => 1)).toBe(1);
  });

  it('SingleFlight: 1000 request cùng khoá chỉ gọi 1 lần', async () => {
    const sf = new SingleFlight<number>();
    let calls = 0;
    const out = await Promise.all(Array.from({ length: 1000 }, () => sf.do('k', async () => { calls += 1; await sleep(10); return 42; })));
    expect(calls).toBe(1);
    expect(new Set(out)).toEqual(new Set([42]));
    await sf.do('k', async () => { calls += 1; return 1; }); // xong rồi thì gọi lại bình thường
    expect(calls).toBe(2);
  });

  it('TtlCache: hết hạn và giới hạn số mục', async () => {
    const c = new TtlCache<number>(30, 2);
    c.set('a', 1); c.set('b', 2); c.set('c', 3);
    expect(c.get('a')).toBeUndefined(); // bị đẩy ra (quá 2 mục)
    expect(c.get('c')).toBe(3);
    await sleep(40);
    expect(c.get('c')).toBeUndefined();
  });
});
