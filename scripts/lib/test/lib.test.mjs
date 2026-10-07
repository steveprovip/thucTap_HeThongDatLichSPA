/**
 * Kiểm thử mô-đun dùng chung của Launcher (chạy: node --test scripts/lib/test/).
 * Không cần gói npm, không cần mạng.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { checkForUpdate, classifyGitError, compareSemver, latestTag, localVersion, parseSemver, readChangelog } from '../version.mjs';
import { crc32, createZip, redactEnv } from '../diagnostics.mjs';
import { APP_NAME, appleScriptSource, asString, createMacApp } from '../macos-app.mjs';
import { composeServices, macAppBrowsers, withToolPath } from '../platform.mjs';
import { adoptRepo, gitLogin } from '../git-repair.mjs';
import { cwdInside, mentionsRoot, parseNetstatListeners, parsePidList } from '../ports.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('so sánh phiên bản theo semver, không theo thứ tự chữ', () => {
  assert.deepEqual(parseSemver('v1.3.6'), [1, 3, 6]);
  assert.equal(parseSemver('release-1'), null);
  assert.ok(compareSemver('v1.10.0', 'v1.9.9') > 0);
  assert.ok(compareSemver('1.4.0', 'v1.4.0') === 0);
  assert.ok(compareSemver('v1.3.6', 'v1.4.0') < 0);
  assert.equal(latestTag(['v1.2.5', 'v1.10.0', 'v1.9.0', 'ghi-chu']), 'v1.10.0');
});

test('đọc CHANGELOG.md của dự án: bản mới nhất ở đầu, có mục và nội dung', () => {
  const list = readChangelog(ROOT);
  assert.ok(list.length >= 2);
  assert.match(list[0].version, /^v\d+\.\d+\.\d+$/);
  assert.ok(compareSemver(list[0].version, list[1].version) > 0);
  assert.ok(list[0].sections.length > 0 && list[0].sections[0].items.length > 0);
  assert.ok(!list[0].sections.flatMap((s) => s.items).some((i) => i.includes('**')), 'đã bỏ ký hiệu markdown');
});

test('ẩn mọi giá trị bí mật trong .env, giữ nguyên tên biến và biến thường', () => {
  const out = redactEnv('PORT=3000\nDB_PASSWORD=salon123\nJWT_ACCESS_SECRET=abc\nDATABASE_URL=postgres://u:p@h/db\nGEMINI_API_KEY=\n# ghi chú');
  assert.equal(out, 'PORT=3000\nDB_PASSWORD=***\nJWT_ACCESS_SECRET=***\nDATABASE_URL=***\nGEMINI_API_KEY=\n# ghi chú');
});

test('CRC-32 chuẩn và tệp ZIP đọc được bằng công cụ unzip / giải nén lại đúng nội dung', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  const zip = createZip([{ name: 'logs/a.log', data: 'xin chào\n'.repeat(50) }, { name: 'thông-tin.txt', data: Buffer.from('ok') }]);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  const nameLen = zip.readUInt16LE(26);
  const compLen = zip.readUInt32LE(18);
  const data = inflateRawSync(zip.subarray(30 + nameLen, 30 + nameLen + compLen)).toString('utf8');
  assert.equal(data, 'xin chào\n'.repeat(50));
  const dir = mkdtempSync(join(tmpdir(), 'zip-'));
  const file = join(dir, 'system_logs.zip');
  writeFileSync(file, zip);
  const unzip = spawnSync('unzip', ['-t', file], { encoding: 'utf8' });
  if (!unzip.error) assert.equal(unzip.status, 0, unzip.stdout);
});

test('kiểm tra bản mới qua thẻ trên origin: báo CẬP NHẬT trên main, chỉ báo (không cho kéo) trên nhánh khác', async () => {
  const g = (cwd, ...args) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  const base = mkdtempSync(join(tmpdir(), 'upd-'));
  const origin = join(base, 'origin.git');
  const dev = join(base, 'dev');
  const shop = join(base, 'shop');
  g(base, 'init', '-q', '--bare', '-b', 'main', origin);
  g(base, 'clone', '-q', origin, dev);
  for (const [k, v] of [['user.name', 't'], ['user.email', 't@t'], ['commit.gpgsign', 'false'], ['tag.gpgsign', 'false']]) g(dev, 'config', k, v);
  writeFileSync(join(dev, 'a.txt'), '1');
  g(dev, 'add', '.');
  g(dev, 'commit', '-qm', 'v1');
  g(dev, 'tag', 'v1.0.0');
  g(dev, 'push', '-q', 'origin', 'main', '--tags');
  g(base, 'clone', '-q', origin, shop);

  const same = await checkForUpdate(shop);
  assert.equal(same.current, 'v1.0.0');
  assert.equal(same.remoteReachable, true);
  assert.equal(same.updateAvailable, false);
  assert.equal(same.canUpdate, false);

  writeFileSync(join(dev, 'a.txt'), '2');
  g(dev, 'commit', '-qam', 'v1.1');
  g(dev, 'tag', 'v1.1.0');
  g(dev, 'push', '-q', 'origin', 'main', '--tags');
  const fresh = await checkForUpdate(shop);
  assert.equal(fresh.latest, 'v1.1.0');
  assert.equal(fresh.behind, 1);
  assert.equal(fresh.updateAvailable, true);
  assert.equal(fresh.canUpdate, true);

  g(shop, 'checkout', '-qb', 'develop');
  const onDevelop = await checkForUpdate(shop);
  assert.equal(onDevelop.updateAvailable, true);
  assert.equal(onDevelop.canUpdate, false, 'chỉ nhánh main được cập nhật 1 chạm');

  const offline = await checkForUpdate(shop, { fetchRemote: false });
  assert.equal(offline.remoteReachable, false);
  assert.equal(offline.latest, null);
});

test('Thiết lập cửa hàng: ghi đúng khoá vào .env, giữ nguyên dòng khác, không lộ mật khẩu', async () => {
  const { buildShopUpdates, parseEnv, readShopConfig, toBankName, upsertEnv } = await import('../shop-config.mjs');
  const env = [
    '# Cấu hình', 'PORT=3000', 'SALON_NAME=Salon & Spa Hương Sen', 'JWT_ACCESS_SECRET=bi_mat', 'SMTP_HOST=localhost',
    'SMTP_PASSWORD=cu123', '#BOOTSTRAP_ADMIN_EMAIL=', '#BOOTSTRAP_ADMIN_PASSWORD=', '',
  ].join('\r\n');

  const bad = buildShopUpdates({ SALON_NAME: '', SALON_HOTLINE: 'abc', BANK_BIN: '970436', BANK_ACCOUNT_NO: '' }, env);
  assert.equal(bad.errors.SALON_NAME, 'Bắt buộc');
  assert.ok(bad.errors.SALON_HOTLINE);
  assert.equal(bad.errors.BANK_ACCOUNT_NO, 'Cần cả ngân hàng và số tài khoản');

  const { errors, updates } = buildShopUpdates({
    SALON_NAME: 'Tiệm #1 Hoa Sen', SALON_ADDRESS: '1 Lê Lợi', SALON_HOTLINE: '0909 123 456',
    BANK_BIN: '970436', BANK_ACCOUNT_NO: '1023 4567 89', BANK_ACCOUNT_NAME: 'Nguyễn Thị Hương',
    SMTP_USER: 'tiem@gmail.com', SMTP_PASSWORD: '', BOOTSTRAP_ADMIN_EMAIL: 'chu@tiem.vn', BOOTSTRAP_ADMIN_PASSWORD: 'MatKhau123',
  }, env);
  assert.deepEqual(errors, {});
  assert.equal(updates.BANK_ACCOUNT_NO, '1023456789');
  assert.equal(updates.BANK_ACCOUNT_NAME, 'NGUYEN THI HUONG');
  assert.equal(updates.SMTP_HOST, 'smtp.gmail.com');
  assert.ok(!('SMTP_PASSWORD' in updates), 'ô mật khẩu trống = giữ mật khẩu cũ');
  assert.equal(updates.MAIL_FROM_NAME, 'Tiệm #1 Hoa Sen');

  const out = upsertEnv(env, updates);
  assert.ok(out.includes('\r\n'), 'giữ kiểu xuống dòng Windows');
  const parsed = parseEnv(out);
  assert.equal(parsed.SALON_NAME, 'Tiệm #1 Hoa Sen', 'giá trị có # được đặt trong nháy kép');
  assert.equal(parsed.JWT_ACCESS_SECRET, 'bi_mat');
  assert.equal(parsed.SMTP_PASSWORD, 'cu123');
  assert.equal(parsed.BOOTSTRAP_ADMIN_EMAIL, 'chu@tiem.vn', 'dòng mẫu #KEY= được bỏ ghi chú');
  assert.equal(parsed.BANK_BIN, '970436', 'khoá chưa có được thêm vào cuối');
  assert.equal(out.match(/^SALON_NAME=/gm).length, 1);

  const view = readShopConfig(out);
  assert.equal(view.values.SALON_NAME, 'Tiệm #1 Hoa Sen');
  assert.ok(!('SMTP_PASSWORD' in view.values) && !('BOOTSTRAP_ADMIN_PASSWORD' in view.values));
  assert.equal(view.hasSmtpPassword, true);
  assert.equal(view.gmailConfigured, true);
  assert.equal(toBankName('Đặng Văn Ân'), 'DANG VAN AN');
});

test('macOS: PATH của ứng dụng mở từ Finder được bổ sung thư mục Docker / Homebrew, node đứng đầu', () => {
  const have = new Set(['/opt/homebrew/bin', '/Applications/Docker.app/Contents/Resources/bin']);
  const opts = { platform: 'darwin', execPath: '/Users/a/.nvm/versions/node/v22/bin/node', home: '/Users/a', exists: (d) => have.has(d) };
  const out = withToolPath('/usr/bin:/bin:/usr/sbin:/sbin', opts).split(':');
  assert.equal(out[0], '/Users/a/.nvm/versions/node/v22/bin');
  assert.deepEqual(out.slice(1, 5), ['/usr/bin', '/bin', '/usr/sbin', '/sbin']);
  assert.deepEqual(out.slice(5), ['/opt/homebrew/bin', '/Applications/Docker.app/Contents/Resources/bin']);
  // đã có sẵn thì không thêm trùng; thư mục không tồn tại thì bỏ qua
  assert.equal(withToolPath(out.join(':'), opts), out.join(':'));
  assert.ok(!out.includes('/usr/local/bin'));
});

test('PATH: Windows giữ nguyên, Linux chỉ thêm thư mục của node', () => {
  assert.equal(withToolPath('C:\\a;C:\\b', { platform: 'win32' }), 'C:\\a;C:\\b');
  assert.equal(withToolPath('/usr/bin', { platform: 'linux', execPath: '/opt/node/bin/node', exists: () => true }), '/opt/node/bin:/usr/bin');
  assert.equal(withToolPath('/opt/node/bin:/usr/bin', { platform: 'linux', execPath: '/opt/node/bin/node' }), '/opt/node/bin:/usr/bin');
});

test('macOS: tìm trình duyệt Chromium trong /Applications và ~/Applications', () => {
  const list = macAppBrowsers('/Users/a');
  assert.ok(list.includes('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'));
  assert.ok(list.includes('/Users/a/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'));
});

test('macOS: mã AppleScript của ứng dụng thoát đúng đường dẫn có dấu cách, nháy kép, dấu tiếng Việt', () => {
  assert.equal(asString('a"b\\c'), '"a\\"b\\\\c"');
  const src = appleScriptSource('/Users/Lan Anh/Dự án "salon"', '/opt/homebrew/bin/node');
  assert.match(src, /^set rootDir to "\/Users\/Lan Anh\/Dự án \\"salon\\""$/m);
  assert.match(src, /quoted form of nodeBin & " scripts\/hoyo\/launcher-ui\.mjs >> logs\/launcher-ui\.log 2>&1 &"/);
});

test('macOS: tạo ứng dụng .app bằng osacompile; nền tảng khác từ chối; osacompile lỗi thì báo lỗi', () => {
  assert.equal(createMacApp({ root: '/x', platform: 'linux' }).ok, false);
  const home = mkdtempSync(join(tmpdir(), 'salon-home-'));
  const calls = [];
  const ok = createMacApp({
    root: '/Users/a/salon', nodePath: '/usr/local/bin/node', home, platform: 'darwin',
    run: (cmd, args) => { calls.push([cmd, args, readFileSync(args[2], 'utf8')]); return { status: 0 }; },
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.path, join(home, 'Applications', APP_NAME));
  assert.equal(calls[0][0], 'osacompile');
  assert.deepEqual(calls[0][1].slice(0, 2), ['-o', ok.path]);
  assert.match(calls[0][2], /set nodeBin to "\/usr\/local\/bin\/node"/);
  const bad = createMacApp({ root: '/x', home, platform: 'darwin', run: () => ({ status: 1, stderr: 'boom' }) });
  assert.deepEqual([bad.ok, bad.error], [false, 'boom']);
});

test('macOS: tệp .sh / .command có quyền chạy (100755) và xuống dòng LF — thiếu là "Permission denied" trên Mac', () => {
  const r = spawnSync('git', ['ls-files', '-s', 'HoYoSalon.command', 'scripts/unix'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) return; // không phải bản git (vd. tải .zip)
  const rows = r.stdout.trim().split('\n').map((l) => l.split(/\s+/));
  assert.ok(rows.length >= 5);
  for (const [mode, , , file] of rows) {
    assert.equal(mode, '100755', `${file} thiếu quyền chạy (git update-index --chmod=+x)`);
    assert.ok(!readFileSync(join(ROOT, file), 'utf8').includes('\r'), `${file} có CRLF`);
  }
});

test('dọn cổng: chỉ lấy tiến trình LISTENING đúng cổng, không khớp cổng dài hơn hay kết nối khách', () => {
  const netstat = [
    '  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       4120',
    '  TCP    0.0.0.0:30001          0.0.0.0:0              LISTENING       999',
    '  TCP    127.0.0.1:51000        127.0.0.1:3000         ESTABLISHED     777',
    '  TCP    [::]:3000              [::]:0                 LISTENING       4120',
    '  UDP    0.0.0.0:3000           *:*                                    555',
  ].join('\r\n');
  assert.deepEqual(parseNetstatListeners(netstat, 3000), [4120]);
  assert.deepEqual(parsePidList('123\n456\n123\nabc\n0\n-5'), [123, 456]);
  assert.deepEqual(parsePidList(''), []);
});

test('dọn cổng: chỉ coi là của dự án khi dòng lệnh / thư mục làm việc nằm trong thư mục dự án', () => {
  const root = 'F:\\hoc_tap\\thuc_tap\\du_an';
  assert.ok(mentionsRoot('node.exe F:/hoc_tap/thuc_tap/du_an/frontend/node_modules/vite/bin/vite.js', root));
  assert.ok(mentionsRoot('"C:\\node.exe" "F:\\HOC_TAP\\thuc_tap\\du_an\\backend\\dist\\main.js"', root));
  assert.ok(!mentionsRoot('node /Users/a/other-app/server.js', '/Users/a/du_an'));
  assert.ok(!mentionsRoot('anything', ''));
  assert.ok(cwdInside('p123\nfcwd\nn/Users/a/du_an/backend\n', '/Users/a/du_an'));
  assert.ok(!cwdInside('p123\nfcwd\nn/Users/a/du_an-khac\n', '/Users/a/du_an'));
  assert.ok(!cwdInside('', '/Users/a/du_an'));
});

test('phân loại lỗi git: đúng nguyên nhân thay vì luôn báo "kiểm tra Internet"', () => {
  assert.equal(classifyGitError('fatal: detected dubious ownership in repository at /x'), 'dubious');
  assert.equal(classifyGitError("fatal: unable to access 'https://github.com/a/b.git/': Could not resolve host: github.com"), 'network');
  assert.equal(classifyGitError("remote: Repository not found.\nfatal: repository 'https://github.com/a/b.git/' not found"), 'auth');
  assert.equal(classifyGitError("fatal: could not read Username for 'https://github.com': terminal prompts disabled"), 'auth');
  assert.equal(classifyGitError("fatal: unable to access 'x': The requested URL returned error: 403"), 'auth');
  assert.equal(classifyGitError('fatal: not a git repository (or any of the parent directories): .git'), 'no-repo');
  assert.equal(classifyGitError('', { missing: true }), 'no-git');
  assert.equal(classifyGitError('lỗi lạ'), 'unknown');
});

test('thư mục không phải git clone: báo "no-repo" kèm cách sửa, KHÔNG báo mất Internet', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'salon-norepo-'));
  writeFileSync(join(dir, 'package.json'), '{"version":"1.5.0"}');
  const info = await checkForUpdate(dir, { fetchRemote: true });
  assert.equal(info.isRepo, false);
  assert.equal(info.remoteReachable, false);
  assert.equal(info.problem.code, 'no-repo');
  assert.equal(info.problem.action, 'repair-git');
  assert.equal(info.canUpdate, false);
});

test('git từ chối thư mục khác chủ sở hữu (dubious ownership): vẫn đọc được commit nhờ safe.directory', { skip: !process.getuid || process.getuid() !== 0 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'salon-owner-'));
  const g = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: dir, encoding: 'utf8' });
  g('init', '-q'); writeFileSync(join(dir, 'a.txt'), 'x'); g('add', '.'); g('commit', '-q', '-m', 'x');
  spawnSync('chown', ['-R', '54321:54321', dir]);
  const direct = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' });
  if (!/dubious ownership/.test(direct.stderr)) return; // môi trường này không áp dụng kiểm tra chủ sở hữu
  const v = localVersion(dir, { fresh: true });
  assert.match(v.commit ?? '', /^[0-9a-f]{7,}$/);
  assert.equal(v.problem, null);
});

test('Sửa kết nối cập nhật: thư mục chép/giải nén .zip được nối với kho mã, giữ .env, lưu bản vá thay đổi tay', () => {
  const base = mkdtempSync(join(tmpdir(), 'salon-adopt-'));
  const origin = join(base, 'origin.git');
  const seed = join(base, 'seed');
  const sh = (cwd, ...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8' });
  mkdirSync(seed);
  sh(seed, 'init', '-q', '-b', 'main');
  writeFileSync(join(seed, 'package.json'), '{"version":"1.0.0"}');
  writeFileSync(join(seed, 'code.js'), 'v1');
  sh(seed, 'add', '.'); sh(seed, 'commit', '-q', '-m', 'v1'); sh(seed, 'tag', 'v1.0.0');
  writeFileSync(join(seed, 'code.js'), 'v2'); writeFileSync(join(seed, 'package.json'), '{"version":"1.1.0"}');
  sh(seed, 'commit', '-q', '-am', 'v2'); sh(seed, 'tag', 'v1.1.0');
  spawnSync('git', ['clone', '-q', '--bare', seed, origin]);

  // "bản .zip" của v1.0.0 (không có .git) + tệp riêng của máy
  const zip = join(base, 'zip');
  sh(base, 'clone', '-q', '--branch', 'v1.0.0', origin, zip);
  rmSync(join(zip, '.git'), { recursive: true, force: true });
  mkdirSync(join(zip, 'backend'));
  writeFileSync(join(zip, 'backend', '.env'), 'SALON_NAME=Tiệm của tôi');
  writeFileSync(join(zip, 'code.js'), 'v1-sua-tay');

  const logs = [];
  const r = adoptRepo(zip, { origin, log: (l) => logs.push(l) });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(readFileSync(join(zip, 'code.js'), 'utf8'), 'v2'); // về đúng origin/main
  assert.equal(readFileSync(join(zip, 'backend', '.env'), 'utf8'), 'SALON_NAME=Tiệm của tôi'); // tệp không theo dõi còn nguyên
  assert.match(readFileSync(r.patch, 'utf8'), /v1-sua-tay|v2/); // bản vá lưu thay đổi cũ
  const v = localVersion(zip, { fresh: true });
  assert.equal(v.branch, 'main');
  assert.equal(v.problem, null);
  assert.equal(v.current, 'v1.1.0');
  assert.equal(adoptRepo(zip, { origin }).ok, false); // đã là git: không làm lại

  // kho không tồn tại: báo lỗi và gỡ sạch .git vừa tạo (máy trở lại như cũ)
  const bare = join(base, 'bare');
  cpSync(zip, bare, { recursive: true }); rmSync(join(bare, '.git'), { recursive: true, force: true });
  const bad = adoptRepo(bare, { origin: join(base, 'khong-ton-tai.git') });
  assert.equal(bad.ok, false);
  assert.ok(bad.problem);
  assert.equal(existsSync(join(bare, '.git')), false);
  assert.equal(typeof gitLogin, 'function');
});

test('Docker: chỉ dựng PostgreSQL (+ Maildev khi gửi thư vào máy này), không tải PgAdmin 0,5 GB', () => {
  assert.deepEqual(composeServices({ smtpHost: 'smtp.gmail.com' }), ['postgres']);
  assert.deepEqual(composeServices({ smtpHost: 'localhost' }), ['postgres', 'maildev']);
  assert.deepEqual(composeServices({}), ['postgres', 'maildev']);
  assert.deepEqual(composeServices({ smtpHost: 'smtp.gmail.com', forced: 'postgres, maildev,pgadmin' }), ['postgres', 'maildev', 'pgadmin']);
});
