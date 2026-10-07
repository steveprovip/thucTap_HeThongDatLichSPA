/**
 * Chẩn đoán cho Launcher: thông tin thiết bị, đọc đuôi nhật ký, ẩn bí mật trong .env và đóng gói system_logs.zip.
 * Node thuần (zlib có sẵn) — không cần gói npm.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import { basename, join } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const run = (cmd, args, timeout = 8000) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout, windowsHide: true, shell: process.platform === 'win32' && cmd === 'npm' });
  return r.status === 0 ? (r.stdout || '').trim() : null;
};

export const portInUse = (port, host = '127.0.0.1') => new Promise((resolve) => {
  const s = net.connect({ port, host });
  const done = (v) => { s.destroy(); resolve(v); };
  s.setTimeout(800, () => done(false));
  s.once('connect', () => done(true));
  s.once('error', () => done(false));
});

export const PORTS = [
  { port: 3000, name: 'API NestJS' },
  { port: 5173, name: 'Giao diện Vite' },
  { port: 5432, name: 'PostgreSQL' },
  { port: 1080, name: 'Maildev' },
  { port: 5050, name: 'PgAdmin' },
];

/** Thông số máy + phần mềm + trạng thái cổng / Docker — để dán vào phiếu hỗ trợ. */
export async function deviceInfo(root, extra = {}) {
  const dockerVersion = run('docker', ['--version']);
  const dockerUp = dockerVersion ? spawnSync('docker', ['info'], { stdio: 'ignore', timeout: 12000, windowsHide: true }).status === 0 : false;
  const containers = dockerUp ? run('docker', ['ps', '--format', '{{.Names}}\t{{.Status}}'])?.split('\n').filter((l) => l.startsWith('salon_')) ?? [] : [];
  const ports = await Promise.all(PORTS.map(async (p) => ({ ...p, open: await portInUse(p.port) })));
  return {
    generatedAt: new Date().toISOString(),
    os: `${os.type()} ${os.release()} (${os.platform()} ${os.arch()})`,
    hostname: os.hostname(),
    cpu: `${os.cpus()[0]?.model ?? 'không rõ'} × ${os.cpus().length}`,
    memory: `${Math.round(os.totalmem() / 1024 ** 3)} GB (trống ${Math.round(os.freemem() / 1024 ** 3)} GB)`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    node: process.version,
    npm: run('npm', ['--version']),
    git: run('git', ['--version']),
    docker: dockerVersion ?? 'chưa cài',
    dockerEngine: dockerVersion ? (dockerUp ? 'đang chạy' : 'chưa bật') : 'không có',
    containers,
    ports,
    projectDir: root,
    ...extra,
  };
}

/** Bản văn bản dễ đọc của deviceInfo — dùng cho nút "Sao chép thông tin thiết bị". */
export function deviceInfoText(info) {
  const lines = [
    '=== Thông tin thiết bị — Hệ thống đặt lịch Salon Spa ===',
    `Thời điểm     : ${info.generatedAt}`,
    `Phiên bản     : ${info.version ?? '?'} (commit ${info.commit ?? '?'}, nhánh ${info.branch ?? '?'})`,
    `Hệ điều hành  : ${info.os}`,
    `Máy           : ${info.hostname} · CPU ${info.cpu} · RAM ${info.memory}`,
    `Múi giờ       : ${info.timezone}`,
    `Node.js       : ${info.node} · npm ${info.npm ?? 'không rõ'}`,
    `Git           : ${info.git ?? 'chưa cài'}`,
    `Docker        : ${info.docker} · engine ${info.dockerEngine}`,
    `Container     : ${info.containers.length ? info.containers.join(' | ') : 'không có container salon_*'}`,
    `Cổng          : ${info.ports.map((p) => `${p.port} ${p.name} ${p.open ? 'MỞ' : 'đóng'}`).join(' · ')}`,
    `Ứng dụng      : ${info.appStatus ?? 'không rõ'}`,
    `Thư mục       : ${info.projectDir}`,
  ];
  return lines.join('\n');
}

/** N dòng cuối của tệp (đọc tối đa maxBytes cuối để không tốn bộ nhớ với tệp lớn). */
export function tailFile(file, lines = 400, maxBytes = 2 * 1024 * 1024) {
  if (!existsSync(file)) return '';
  const size = statSync(file).size;
  const buf = readFileSync(file);
  const text = buf.subarray(Math.max(0, size - maxBytes)).toString('utf8');
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/).slice(-lines).join('\n');
}

const SECRET_KEY = /(SECRET|PASSWORD|PASS|TOKEN|API_KEY|_KEY|DATABASE_URL|PRIVATE)/i;
/** Nội dung .env với mọi giá trị bí mật bị thay bằng *** (giữ nguyên tên biến để chẩn đoán cấu hình). */
export function redactEnv(text) {
  return text.split(/\r?\n/).map((line) => {
    const m = /^\s*([A-Z0-9_]+)\s*=(.*)$/i.exec(line);
    if (!m) return line;
    return SECRET_KEY.test(m[1]) && m[2].trim() ? `${m[1]}=***` : line;
  }).join('\n');
}

// ------------------------------------------------------------------ ZIP (PKZIP, deflate)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const dosTime = (d) => ({
  time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
  date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
});

/** Đóng gói [{ name, data: Buffer|string }] thành một tệp .zip (tên UTF-8, nén deflate). */
export function createZip(entries, now = new Date()) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const { time, date } = dosTime(now);
  for (const e of entries) {
    const name = Buffer.from(e.name.replace(/\\/g, '/'), 'utf8');
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(String(e.data), 'utf8');
    const comp = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8); local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    locals.push(local, name, comp);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10); central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + comp.length;
  }
  const cdSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

/** Gói chẩn đoán system_logs.zip: toàn bộ logs/*.log (đuôi 2MB), .env đã ẩn bí mật, thông tin thiết bị, Git, Docker. */
export async function buildLogBundle(root, info, extraLogs = {}) {
  const entries = [];
  const logsDir = join(root, 'logs');
  if (existsSync(logsDir)) {
    for (const f of readdirSync(logsDir)) {
      const p = join(logsDir, f);
      if (statSync(p).isFile() && /(\.log(\.\d+)?|^startup-timing\.json)$/.test(f)) entries.push({ name: `logs/${basename(f)}`, data: tailFile(p, 1_000_000) });
    }
  }
  for (const [name, text] of Object.entries(extraLogs)) if (text) entries.push({ name: `logs/${name}`, data: text });
  for (const rel of ['.env', 'backend/.env', 'frontend/.env']) {
    const p = join(root, rel);
    if (existsSync(p)) entries.push({ name: `config/${rel.replace(/\//g, '__')}.redacted`, data: redactEnv(readFileSync(p, 'utf8')) });
  }
  entries.push({ name: 'device-info.txt', data: deviceInfoText(info) });
  entries.push({ name: 'device-info.json', data: JSON.stringify(info, null, 2) });
  const gitStatus = run('git', ['-C', root, 'status', '--short', '--branch']);
  const gitLog = run('git', ['-C', root, 'log', '--oneline', '-n', '20']);
  if (gitStatus !== null) entries.push({ name: 'git/status.txt', data: `${gitStatus}\n\n${gitLog ?? ''}` });
  const dockerPs = run('docker', ['ps', '-a', '--format', '{{.Names}}\t{{.Image}}\t{{.Status}}']);
  if (dockerPs !== null) entries.push({ name: 'docker/ps.txt', data: dockerPs });
  return createZip(entries);
}
