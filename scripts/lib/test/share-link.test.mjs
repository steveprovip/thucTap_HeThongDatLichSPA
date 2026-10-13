import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cloudflaredAsset, qrDataUri, shareStatus, stopShare, tunnelUrlFrom } from '../share-link.mjs';

test('Chia sẻ link: chọn đúng bản cloudflared theo hệ điều hành (macOS / Windows ARM tự cài)', () => {
  assert.equal(cloudflaredAsset('win32', 'x64'), 'cloudflared-windows-amd64.exe');
  assert.equal(cloudflaredAsset('linux', 'x64'), 'cloudflared-linux-amd64');
  assert.equal(cloudflaredAsset('linux', 'arm64'), 'cloudflared-linux-arm64');
  assert.equal(cloudflaredAsset('darwin', 'arm64'), null);
  assert.equal(cloudflaredAsset('win32', 'arm64'), null);
});

test('Chia sẻ link: đọc địa chỉ trycloudflare trong nhật ký, chỉ phần mới ghi (bỏ link của lần chạy trước)', () => {
  const old = '2026-10-13 INF |  https://old-link-abc.trycloudflare.com  |\n';
  const fresh = '2026-10-13 INF Requesting new quick Tunnel...\n2026-10-13 INF |  https://rose-salon-demo-123.trycloudflare.com  |\n';
  assert.equal(tunnelUrlFrom(old + fresh, old.length), 'https://rose-salon-demo-123.trycloudflare.com');
  assert.equal(tunnelUrlFrom(old, old.length), null);
});

test('Chia sẻ link: trạng thái — chưa mở / tiến trình đã chết thì coi như chưa chia sẻ; đóng link xoá trạng thái', () => {
  const root = mkdtempSync(join(tmpdir(), 'salon-share-'));
  try {
    assert.equal(shareStatus(root), null);
    writeFileSync(join(root, '.salon-share.json'), JSON.stringify({ pid: 999999, url: 'https://x.trycloudflare.com' }));
    assert.equal(shareStatus(root), null); // pid không tồn tại
    writeFileSync(join(root, '.salon-share.json'), JSON.stringify({ pid: process.pid, url: 'https://x.trycloudflare.com' }));
    assert.equal(shareStatus(root).url, 'https://x.trycloudflare.com');
    rmSync(join(root, '.salon-share.json'));
    assert.deepEqual(stopShare(root), { stopped: false });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Chia sẻ link: mã QR dạng SVG (data URI) để quét bằng điện thoại', async () => {
  const uri = await qrDataUri(join(import.meta.dirname, '..', '..', '..'), 'https://rose-salon-demo-123.trycloudflare.com');
  assert.ok(uri === null || uri.startsWith('data:image/svg+xml;base64,'));
});
