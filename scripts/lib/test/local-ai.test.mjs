import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aiEnv, ensureLocalAi, MODEL_SIZE, planLocalAi, RUNTIME_SIZE } from '../local-ai.mjs';

const base = { platform: 'win32', provider: 'auto', autostart: true, modelSize: MODEL_SIZE, partSize: 0, partMtime: 0, runtime: true, ollama: false, freeBytes: 50e9, now: 1e12 };

test('AI local 1 chạm: đủ model + bộ chạy → bật; thiếu → tự tải; đang tải ở nơi khác → không tải chồng', () => {
  assert.equal(planLocalAi(base).action, 'ready');
  assert.equal(planLocalAi({ ...base, runtime: false, ollama: true }).action, 'ready'); // máy có Ollama không cần llama.cpp
  assert.equal(planLocalAi({ ...base, modelSize: 0 }).action, 'download'); // laptop mới clone: model nằm trong .gitignore
  assert.equal(planLocalAi({ ...base, runtime: false }).action, 'download');
  assert.equal(planLocalAi({ ...base, modelSize: 0, partSize: 1e9, partMtime: base.now - 30_000 }).action, 'downloading');
  assert.equal(planLocalAi({ ...base, modelSize: 0, partSize: 1e9, partMtime: base.now - 3_600_000 }).action, 'download'); // tải dở bị ngắt → tải tiếp
});

test('AI local: không đủ chỗ trên ổ đĩa thì báo, không tải dở dang; tính cả phần đã tải', () => {
  const r = planLocalAi({ ...base, modelSize: 0, runtime: false, freeBytes: 1e9 });
  assert.equal(r.action, 'no-space');
  assert.ok(r.needBytes > MODEL_SIZE + RUNTIME_SIZE - 1);
  assert.equal(planLocalAi({ ...base, modelSize: 0, partSize: MODEL_SIZE - 1e8, freeBytes: 1e9 }).action, 'download');
});

test('AI local: bỏ qua khi không phải Windows, AI_PROVIDER cố định hoặc AI_LOCAL_AUTOSTART=0', () => {
  assert.equal(planLocalAi({ ...base, platform: 'linux' }).action, 'skip');
  assert.equal(planLocalAi({ ...base, provider: 'off' }).action, 'skip');
  assert.equal(planLocalAi({ ...base, provider: 'openai' }).action, 'skip');
  assert.equal(planLocalAi({ ...base, autostart: false }).action, 'skip');
});

test('AI local: đọc AI_PROVIDER / AI_LOCAL_AUTOSTART từ backend/.env', () => {
  const root = mkdtempSync(join(tmpdir(), 'salon-ai-'));
  try {
    mkdirSync(join(root, 'backend'));
    writeFileSync(join(root, 'backend', '.env'), 'AI_PROVIDER=\nAI_LOCAL_AUTOSTART=0\n');
    const saved = { p: process.env.AI_PROVIDER, a: process.env.AI_LOCAL_AUTOSTART };
    delete process.env.AI_PROVIDER; delete process.env.AI_LOCAL_AUTOSTART;
    assert.deepEqual(aiEnv(root), { provider: 'auto', autostart: false });
    if (saved.p !== undefined) process.env.AI_PROVIDER = saved.p;
    if (saved.a !== undefined) process.env.AI_LOCAL_AUTOSTART = saved.a;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('AI local (Windows): máy chưa có model → chạy ẩn "tải rồi bật" bằng đường dẫn tuyệt đối, ghi logs/ai-local.log', { skip: process.platform !== 'win32' }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'salon ai '));
  try {
    const dir = join(root, 'model_AI_local');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'tai_model_local.cmd'), '@echo off\r\necho TAI_OK\r\n');
    writeFileSync(join(dir, 'chay_ai_local.cmd'), '@echo off\r\necho CHAY_OK\r\n');
    const lines = [];
    const env = { p: process.env.AI_PROVIDER, a: process.env.AI_LOCAL_AUTOSTART };
    process.env.AI_PROVIDER = 'auto'; process.env.AI_LOCAL_AUTOSTART = '1';
    const r = await ensureLocalAi(root, (l) => lines.push(l));
    if (env.p === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = env.p;
    if (env.a === undefined) delete process.env.AI_LOCAL_AUTOSTART; else process.env.AI_LOCAL_AUTOSTART = env.a;
    assert.equal(r, 'download');
    assert.ok(lines.some((l) => l.includes('đang tự tải')));
    let log = '';
    for (let i = 0; i < 40 && !log.includes('CHAY_OK'); i += 1) {
      await new Promise((ok) => setTimeout(ok, 250));
      try { log = readFileSync(join(root, 'logs', 'ai-local.log'), 'utf8'); } catch { /* chưa có */ }
    }
    assert.match(log, /TAI_OK[\s\S]*CHAY_OK/); // tải xong mới bật, cả hai chạy được dù thư mục có dấu cách
  } finally {
    await new Promise((ok) => setTimeout(ok, 300));
    rmSync(root, { recursive: true, force: true });
  }
});
