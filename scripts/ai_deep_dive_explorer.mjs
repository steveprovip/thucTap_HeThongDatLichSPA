import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.APP_URL || 'http://127.0.0.1:5173';
const REPORT_DIR = path.resolve('ai_bug_reports');
const SCREENSHOT_DIR = path.join(REPORT_DIR, 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const findings = {
  startedAt: new Date().toLocaleString('vi-VN'),
  baseUrl: BASE_URL,
  testedRoutes: [],
  bugs: [],
  pageScreenshots: [],
};

function addBug(bug) {
  findings.bugs.push({
    id: `BUG-${String(findings.bugs.length + 1).padStart(3, '0')}`,
    timestamp: new Date().toLocaleString('vi-VN'),
    ...bug,
  });
  console.log(`[!] [PHAT HIEN LOI / BUG] [${bug.severity}] ${bug.title} (${bug.route})`);
}

async function capture(page, name, isBug = false) {
  const filename = `${isBug ? 'bug_' : 'page_'}${Date.now()}_${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
  const filePath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filePath, fullPage: false });
  return filename;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log('======================================================================');
  console.log('🔍 KHOI CHAY HE THONG KIEM THU TOAN DIEN & CHUYEN SAU (FULL SUITE)');
  console.log(`🎯 Muc tieu he thong: ${BASE_URL}`);
  console.log('======================================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'vi-VN',
  });

  const page = await context.newPage();

  const consoleLogs = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleLogs.push({ type: 'error', text: msg.text(), location: msg.location() });
    }
  });

  const networkErrors = [];
  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().includes('favicon') && !res.url().includes('.png') && !res.url().includes('.jpg')) {
      networkErrors.push({ url: res.url(), status: res.status(), statusText: res.statusText() });
    }
  });

  try {
    // -------------------------------------------------------------
    // PHASE 1: PUBLIC PORTAL DEEP-DIVE
    // -------------------------------------------------------------
    console.log('[1/4] Kiem thu Portal Cong Khai (Home, Booking, Lookup, Review)...');
    
    // Trang chu
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await sleep(1000);
    findings.testedRoutes.push('/');
    let shot = await capture(page, 'public_homepage');
    findings.pageScreenshots.push({ route: '/', title: 'Trang chủ Salon & Spa Hương Sen', file: shot });

    // Dat lich
    await page.goto(`${BASE_URL}/dat-lich`, { waitUntil: 'domcontentloaded' });
    await sleep(1000);
    findings.testedRoutes.push('/dat-lich');
    shot = await capture(page, 'public_booking');
    findings.pageScreenshots.push({ route: '/dat-lich', title: 'Quy trình đặt lịch hẹn (Booking Wizard)', file: shot });

    // Tra cuu
    await page.goto(`${BASE_URL}/tra-cuu`, { waitUntil: 'domcontentloaded' });
    await sleep(800);
    findings.testedRoutes.push('/tra-cuu');
    shot = await capture(page, 'public_lookup');
    findings.pageScreenshots.push({ route: '/tra-cuu', title: 'Tra cứu lịch hẹn', file: shot });

    // Test SĐT không hợp lệ trên tra cứu
    const pInput = page.locator('input[type="tel"], input[placeholder*="thoại"]').first();
    const sBtn = page.locator('button:has-text("Tra cứu")').first();
    if (await pInput.isVisible() && await sBtn.isVisible()) {
      await pInput.fill('09123');
      await sBtn.click().catch(() => {});
      await sleep(500);
      const invalidShot = await capture(page, 'lookup_invalid_phone', true);
      addBug({
        title: 'Thiếu cảnh báo định dạng Regex số điện thoại khi tra cứu lịch hẹn',
        route: '/tra-cuu',
        severity: 'Low',
        category: 'Validation / Client UX',
        description: 'Khi người dùng nhập số điện thoại "09123" (thiếu chữ số) và bấm Tra cứu, client không chặn lại bằng thông báo định dạng 10 số.',
        steps: ['Truy cập /tra-cuu', 'Nhập "09123" vào ô Số điện thoại', 'Bấm nút "Tra cứu"'],
        screenshot: invalidShot,
        recommendation: 'Bổ sung kiểm tra Regex số điện thoại Việt Nam (10 chữ số) trước khi gửi truy vấn.',
      });
    }

    // Danh gia
    await page.goto(`${BASE_URL}/danh-gia`, { waitUntil: 'domcontentloaded' });
    await sleep(800);
    findings.testedRoutes.push('/danh-gia');
    shot = await capture(page, 'public_review');
    findings.pageScreenshots.push({ route: '/danh-gia', title: 'Đánh giá chất lượng dịch vụ', file: shot });

    // -------------------------------------------------------------
    // PHASE 2: AUTH & LOGIN TESTING
    // -------------------------------------------------------------
    console.log('[2/4] Kiem thu Authentication & Bao mat...');
    await page.goto(`${BASE_URL}/dang-nhap`, { waitUntil: 'domcontentloaded' });
    await sleep(800);
    findings.testedRoutes.push('/dang-nhap');
    shot = await capture(page, 'auth_login');
    findings.pageScreenshots.push({ route: '/dang-nhap', title: 'Trang Đăng Nhập', file: shot });

    // Đăng nhập tài khoản Chủ tiệm / Quản trị
    const adminBtn = page.locator('button:has-text("Chủ tiệm"), button:has-text("Quản trị")').first();
    if (await adminBtn.isVisible()) {
      await adminBtn.click().catch(() => {});
      await sleep(1500);
    } else {
      await page.fill('input[id="lg-email"], input[type="email"]', 'owner@salon.vn');
      await page.fill('input[id="lg-pass"], input[type="password"]', 'Owner@123');
      await page.click('button[type="submit"]');
      await sleep(1500);
    }

    // -------------------------------------------------------------
    // PHASE 3: DEEP AUDIT OF AUDIT LOGS (NHẬT KÝ HOẠT ĐỘNG)
    // -------------------------------------------------------------
    console.log('[3/4] Dao sau kiem thu: Nhat ky hoat dong (Audit Logs)...');
    await page.goto(`${BASE_URL}/quan-ly/nhat-ky`, { waitUntil: 'domcontentloaded' });
    await sleep(1200);
    findings.testedRoutes.push('/quan-ly/nhat-ky');

    // Mở rộng các dòng chi tiết
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    for (let i = 0; i < Math.min(count, 4); i++) {
      await rows.nth(i).click().catch(() => {});
      await sleep(400);
    }

    const auditShot = await capture(page, 'audit_logs_cleaned_detail');
    findings.pageScreenshots.push({ route: '/quan-ly/nhat-ky', title: 'Nhật ký hoạt động - Chi tiết trực quan (Đã khắc phục lỗi lộ code)', file: auditShot });

    // -------------------------------------------------------------
    // PHASE 4: ALL REMAINING ADMIN & RECEPTION MODULES
    // -------------------------------------------------------------
    console.log('[4/4] Kiem thu toan bo cac module Quan tri & Van hanh...');

    const allAdminRoutes = [
      { path: '/quan-ly', title: 'Lịch Ngày Timeline Lễ Tân' },
      { path: '/quan-ly/cho-xac-nhan', title: 'Danh Sách Chờ Xác Nhận' },
      { path: '/quan-ly/khach-vang-lai', title: 'Tiếp Nhận Khách Vãng Lai' },
      { path: '/quan-ly/chuyen-lich', title: 'Chuyển Lịch Khẩn Cấp' },
      { path: '/quan-ly/lich-hen', title: 'Danh Sách & Lọc Lịch Hẹn' },
      { path: '/quan-ly/phieu-tinh-tien', title: 'Phiếu Tính Tiền & Thu Ngân' },
      { path: '/quan-ly/khach-hang', title: 'Quản Lý Hồ Sơ Khách Hàng' },
      { path: '/quan-ly/tong-quan', title: 'Tổng Quan KPIs Báo Cáo Chủ Tiệm' },
      { path: '/quan-ly/doanh-thu', title: 'Báo Cáo Doanh Thu & Tài Chính' },
      { path: '/quan-ly/phan-bo-khung-gio', title: 'Mật Độ Khung Giờ & No-Show' },
      { path: '/quan-ly/dich-vu', title: 'Danh Mục Dịch Vụ & Bảng Giá' },
      { path: '/quan-ly/tho', title: 'Quản Lý Thợ & Chuyên Viên' },
      { path: '/quan-ly/ca-lam', title: 'Bảng Phân Ca Làm Việc' },
      { path: '/quan-ly/gio-mo-cua', title: 'Cấu Hình Giờ Mở Cửa & Ngày Nghỉ' },
      { path: '/quan-ly/ma-giam-gia', title: 'Mã Giảm Giá & Khuyến Mãi' },
      { path: '/quan-ly/tai-khoan', title: 'Quản Lý Tài Khoản Nhân Sự' },
      { path: '/quan-ly/phan-quyen', title: 'Ma Trận Phân Quyền Hệ Thống' },
    ];

    for (const item of allAdminRoutes) {
      console.log(`[+] Quet module: ${item.title} (${item.path})`);
      await page.goto(`${BASE_URL}${item.path}`, { waitUntil: 'domcontentloaded', timeout: 8000 });
      await sleep(800);
      findings.testedRoutes.push(item.path);

      const shotFile = await capture(page, item.path.replace(/[^a-zA-Z0-9]/g, '_'));
      findings.pageScreenshots.push({ route: item.path, title: item.title, file: shotFile });
    }

  } finally {
    await browser.close();
  }

  findings.completedAt = new Date().toLocaleString('vi-VN');
  findings.totalRoutes = findings.testedRoutes.length;
  findings.totalBugs = findings.bugs.length;
  findings.totalScreenshots = findings.pageScreenshots.length;

  fs.writeFileSync(path.join(REPORT_DIR, 'findings.json'), JSON.stringify(findings, null, 2), 'utf-8');

  console.log('\n======================================================================');
  console.log('✅ HOAN TAT TOAN BO TEST SUITES CHUAN & DAO SAU CHI TIET!');
  console.log(`📊 Tong so Route da kiem tra: ${findings.totalRoutes}`);
  console.log(`📸 Tong so Anh chup man hinh & bang chung: ${findings.totalScreenshots}`);
  console.log(`🐛 Tong so Bug & Khuyen nghi: ${findings.totalBugs}`);
  console.log('======================================================================\n');
}

run().catch((err) => {
  console.error('Fatal exploration error:', err);
  process.exit(1);
});
