import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { findLocalAiDir, isLoopbackUrl, LOCAL_AI_MODEL, LOCAL_AI_SCRIPT } from './local-ai-launcher';

describe('AI local tự phục hồi (QA Sprint 3 · mục 6)', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'salon-ai-')); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('chỉ nhận thư mục model_AI_local đã có cả script chạy lẫn tệp model', () => {
    const dir = join(root, 'model_AI_local');
    const backend = join(root, 'backend');
    mkdirSync(dir); mkdirSync(backend);
    writeFileSync(join(dir, LOCAL_AI_SCRIPT), '@echo off');
    expect(findLocalAiDir({}, backend)).toBeNull(); // chưa tải model → không tự bật
    writeFileSync(join(dir, LOCAL_AI_MODEL), '');
    expect(findLocalAiDir({}, backend)).toBe(dir); // backend chạy với cwd = backend/
    expect(findLocalAiDir({}, root)).toBe(dir);
    expect(findLocalAiDir({ AI_LOCAL_DIR: join(root, 'khong-co') }, join(root, 'a', 'b'))).toBeNull();
    expect(findLocalAiDir({ AI_LOCAL_DIR: dir }, join(root, 'a', 'b'))).toBe(dir);
  });

  it('chỉ tự bật khi địa chỉ AI là máy này', () => {
    expect(isLoopbackUrl('http://localhost:11434/v1')).toBe(true);
    expect(isLoopbackUrl('http://127.0.0.1:11434')).toBe(true);
    expect(isLoopbackUrl('https://api.groq.com/openai/v1')).toBe(false);
    expect(isLoopbackUrl('khong-phai-url')).toBe(false);
  });
});
