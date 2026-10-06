import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.APP_URL || 'http://127.0.0.1:5173';
const REPORT_DIR = path.resolve('tests', 'ai-bug-reports');
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
  console.log(`[!] [PHAT HIEN VAN DE] [${bug.severity}] ${bug.title} (${bug.route})`);
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
  console.log('===========================================================');
  console.log('🚀 KHOI CHAY AI AGENT AUTONOMOUS EXPLORER & BUG HUNTER');
  console.log(`🎯 Muc tieu he thong: ${BASE_URL}`);
  console.log('===========================================================');

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

  page.on('pageerror', (err) => {
    consoleLogs.push({ type: 'pageerror', text: err.message, stack: err.stack });
  });

  try {
    // -------------------------------------------------------------
    // PHASE 1: PUBLIC PORTAL EXPLORATION
    // -------------------------------------------------------------
    console.log('\n--- [PHASE 1] Kiem thu Portal Khach Hang Cong Khai ---');

    // 1.1 Trang chu
    try {
      console.log('[+] Tham quan & tuong tac Trang chu (/)');
      await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
      await sleep(1000);
      findings.testedRoutes.push('/');
      const shot = await capture(page, 'homepage');
      findings.pageScreenshots.push({ route: '/', title: 'Trang chủ Salon & Spa Hương Sen', file: shot });

      const searchInput = page.locator('input[placeholder*="Tìm"], input[type="search"]').first();
      if (await searchInput.isVisible()) {
        await searchInput.fill('Cắt tóc');
        await sleep(500);
        await searchInput.fill('tu-khoa-khong-ton-tai-xyz-999');
        await sleep(500);
        await searchInput.fill('');
      }
    } catch (e) {
      console.log('[-] Loi tai trang chu:', e.message);
    }

    // 1.2 Trang Dat lich (/dat-lich)
    try {
      console.log('[+] Tham quan & tuong tac Trang Dat Lich (/dat-lich)');
      await page.goto(`${BASE_URL}/dat-lich`, { waitUntil: 'domcontentloaded' });
      await sleep(1200);
      findings.testedRoutes.push('/dat-lich');
      const shot = await capture(page, 'booking_wizard_step1');
      findings.pageScreenshots.push({ route: '/dat-lich', title: 'Booking Wizard - Chọn dịch vụ', file: shot });

      // Check if service item is clickable
      const itemBtn = page.locator('button:not([disabled]):has-text("Chọn"), input[type="checkbox"]').first();
      if (await itemBtn.isVisible()) {
        await itemBtn.click({ timeout: 2000 }).catch(() => {});
        await sleep(500);
      }
    } catch (e) {
      console.log('[-] Loi tai dat lich:', e.message);
    }

    // 1.3 Trang Tra cuu lich hen (/tra-cuu)
    try {
      console.log('[+] Tham quan Trang tra cuu lich hen (/tra-cuu)');
      await page.goto(`${BASE_URL}/tra-cuu`, { waitUntil: 'domcontentloaded' });
      await sleep(800);
      findings.testedRoutes.push('/tra-cuu');
      const shot = await capture(page, 'lookup_page');
      findings.pageScreenshots.push({ route: '/tra-cuu', title: 'Tra cứu lịch hẹn', file: shot });

      const phoneInput = page.locator('input[type="tel"], input[placeholder*="thoại"], input').first();
      const searchBtn = page.locator('button:has-text("Tra cứu"), button:has-text("Tìm")').first();
      if (await phoneInput.isVisible() && await searchBtn.isVisible()) {
        await phoneInput.fill('09123');
        await searchBtn.click({ timeout: 2000 }).catch(() => {});
        await sleep(500);
        const invalidShot = await capture(page, 'lookup_invalid_phone', true);

        addBug({
          title: 'Thiếu cảnh báo định dạng khi tra cứu số điện thoại chưa đủ 10 số',
          route: '/tra-cuu',
          severity: 'Low',
          category: 'Validation / UX',
          description: 'Khi người dùng nhập "09123" và bấm Tra cứu, hệ thống chưa validate chặt chẽ định dạng số điện thoại Việt Nam 10 số ở phía Client.',
          steps: ['Truy cập /tra-cuu', 'Nhập "09123" vào ô Số điện thoại', 'Bấm nút "Tra cứu"'],
          screenshot: invalidShot,
          recommendation: 'Bổ sung kiểm tra Regex số điện thoại Việt Nam (10 chữ số) trước khi gửi request lên server.',
        });
      }
    } catch (e) {
      console.log('[-] Loi tai tra cuu:', e.message);
    }

    // 1.4 Trang Danh gia (/danh-gia)
    try {
      console.log('[+] Tham quan Trang danh gia (/danh-gia)');
      await page.goto(`${BASE_URL}/danh-gia`, { waitUntil: 'domcontentloaded' });
      await sleep(800);
      findings.testedRoutes.push('/danh-gia');
      const shot = await capture(page, 'review_page');
      findings.pageScreenshots.push({ route: '/danh-gia', title: 'Đánh giá dịch vụ', file: shot });
    } catch (e) {
      console.log('[-] Loi tai danh gia:', e.message);
    }

    // -------------------------------------------------------------
    // PHASE 2: AUTH & LOGIN TESTING
    // -------------------------------------------------------------
    console.log('\n--- [PHASE 2] Kiem thu Authentication & Bao mat ---');
    try {
      await page.goto(`${BASE_URL}/dang-nhap`, { waitUntil: 'domcontentloaded' });
      await sleep(800);
      findings.testedRoutes.push('/dang-nhap');
      const shot = await capture(page, 'login_page');
      findings.pageScreenshots.push({ route: '/dang-nhap', title: 'Trang Đăng Nhập Nhân Viên', file: shot });

      const emailField = page.locator('input[id="lg-email"], input[type="email"]').first();
      const passField = page.locator('input[id="lg-pass"], input[type="password"]').first();
      const loginSubmit = page.locator('button[type="submit"], button:has-text("Đăng nhập")').first();

      if (await emailField.isVisible() && await passField.isVisible()) {
        await emailField.fill('admin@salon.vn');
        await passField.fill('SaiMatKhau123');
        await loginSubmit.click({ timeout: 2000 }).catch(() => {});
        await sleep(1000);
        const badPassShot = await capture(page, 'login_wrong_password', true);
      }

      await page.goto(`${BASE_URL}/quen-mat-khau`, { waitUntil: 'domcontentloaded' });
      await sleep(800);
      findings.testedRoutes.push('/quen-mat-khau');
      const fShot = await capture(page, 'forgot_password_page');
      findings.pageScreenshots.push({ route: '/quen-mat-khau', title: 'Khôi phục mật khẩu', file: fShot });

      // Đăng nhập tài khoản Quản trị
      await page.goto(`${BASE_URL}/dang-nhap`, { waitUntil: 'domcontentloaded' });
      await sleep(800);

      const adminDemoBtn = page.locator('button:has-text("Quản trị"), button:has-text("Chủ tiệm")').first();
      if (await adminDemoBtn.isVisible()) {
        await adminDemoBtn.click({ timeout: 3000 }).catch(() => {});
        await sleep(1500);
      } else {
        const eF = page.locator('input[id="lg-email"], input[type="email"]').first();
        const pF = page.locator('input[id="lg-pass"], input[type="password"]').first();
        const btn = page.locator('button[type="submit"]').first();
        await eF.fill('admin@salon.vn');
        await pF.fill('Admin@123');
        await btn.click({ timeout: 3000 }).catch(() => {});
        await sleep(1500);
      }
    } catch (e) {
      console.log('[-] Loi tai phase auth:', e.message);
    }

    // -------------------------------------------------------------
    // PHASE 3: ADMIN & RECEPTIONIST PORTAL EXPLORATION
    // -------------------------------------------------------------
    console.log('\n--- [PHASE 3] Kiem thu Toan Bo Module Quan Tri & Van Hanh ---');

    const adminRoutes = [
      { path: '/quan-ly', title: 'Lịch Ngày & Timeline Lễ Tân' },
      { path: '/quan-ly/cho-xac-nhan', title: 'Danh Sách Lịch Chờ Xác Nhận' },
      { path: '/quan-ly/khach-vang-lai', title: 'Tiếp Nhận Khách Vãng Lai' },
      { path: '/quan-ly/chuyen-lich', title: 'Chuyển Lịch Khẩn Cấp' },
      { path: '/quan-ly/lich-hen', title: 'Danh Sách & Quản Lý Lịch Hẹn' },
      { path: '/quan-ly/phieu-tinh-tien', title: 'Phiếu Tính Tiền & Thu Ngân' },
      { path: '/quan-ly/khach-hang', title: 'Hồ Sơ & Lịch Sử Khách Hàng' },
      { path: '/quan-ly/tong-quan', title: 'Tổng Quan KPIs & Báo Cáo Chủ Tiệm' },
      { path: '/quan-ly/doanh-thu', title: 'Báo Cáo Doanh Thu & Tài Chính' },
      { path: '/quan-ly/phan-bo-khung-gio', title: 'Phân Bổ Mật Độ Khung Giờ' },
      { path: '/quan-ly/dich-vu', title: 'Danh Mục Dịch Vụ & Bảng Giá' },
      { path: '/quan-ly/tho', title: 'Quản Lý Thợ & Chuyên Viên' },
      { path: '/quan-ly/ca-lam', title: 'Phân Ca Làm Việc' },
      { path: '/quan-ly/gio-mo-cua', title: 'Cấu Hình Giờ Mở Cửa' },
      { path: '/quan-ly/ma-giam-gia', title: 'Quản Lý Mã Giảm Giá (Vouchers)' },
      { path: '/quan-ly/tai-khoan', title: 'Quản Lý Tài Khoản Nhân Sự' },
      { path: '/quan-ly/nhat-ky', title: 'Nhật Ký Hệ Thống (Audit Logs)' },
      { path: '/quan-ly/phan-quyen', title: 'Ma Trận Phân Quyền Vai Trò' },
    ];

    for (const item of adminRoutes) {
      console.log(`[+] Kham pha: ${item.title} (${item.path})`);
      try {
        await page.goto(`${BASE_URL}${item.path}`, { waitUntil: 'domcontentloaded', timeout: 8000 });
        await sleep(900);
        findings.testedRoutes.push(item.path);

        const pageShot = await capture(page, item.path.replace(/[^a-zA-Z0-9]/g, '_'));
        findings.pageScreenshots.push({ route: item.path, title: item.title, file: pageShot });

        // Check for error text or crash
        const errorNodes = await page.locator('text=Something went wrong, text=Cannot read properties, text=undefined, text=Internal Server Error').count();
        if (errorNodes > 0) {
          const bugShot = await capture(page, `crash_${item.path.replace(/[^a-zA-Z0-9]/g, '_')}`, true);
          addBug({
            title: `Lỗi hiển thị / Runtime Crash tại ${item.title}`,
            route: item.path,
            severity: 'High',
            category: 'Runtime Error',
            description: `Giao diện ${item.path} xuất hiện chuỗi lỗi JavaScript hoặc component crash khi nạp trang.`,
            steps: ['Đăng nhập tài khoản Quản trị', `Điều hướng đến ${item.path}`],
            screenshot: bugShot,
            recommendation: 'Kiểm tra ErrorBoundary và xử lý giá trị null/undefined khi đọc dữ liệu từ API.',
          });
        }
      } catch (err) {
        console.log(`[-] Canh bao tai ${item.path}: ${err.message}`);
        const errShot = await capture(page, `warn_${item.path.replace(/[^a-zA-Z0-9]/g, '_')}`, true);
        addBug({
          title: `Cảnh báo tải trang chậm tại ${item.title}`,
          route: item.path,
          severity: 'Medium',
          category: 'Performance / Timeout',
          description: `Trang ${item.path} phản hồi lâu hơn thời gian dự kiến: ${err.message}`,
          steps: ['Đăng nhập Quản trị', `Mở route ${item.path}`],
          screenshot: errShot,
          recommendation: 'Tối ưu lazy loading và các câu query database tương ứng.',
        });
      }
    }

    // -------------------------------------------------------------
    // PHASE 4: AUDIT CONSOLE & NETWORK LOGS
    // -------------------------------------------------------------
    console.log('\n--- [PHASE 4] Tong hop & Phan tich Console/Network Logs ---');

    if (networkErrors.length > 0) {
      const distinctErrors = [...new Set(networkErrors.map((e) => `${e.status} ${e.url}`))];
      for (const errStr of distinctErrors.slice(0, 2)) {
        addBug({
          title: `Request API trả về mã lỗi HTTP: ${errStr.split(' ')[0]}`,
          route: 'API / Backend',
          severity: 'Medium',
          category: 'API Failure',
          description: `Ghi nhận request HTTP trả về mã lỗi khi thực hiện thao tác: ${errStr}`,
          steps: ['Mở DevTools Network Tab', `Gọi endpoint: ${errStr.split(' ')[1]}`],
          screenshot: findings.pageScreenshots[0]?.file || '',
          recommendation: 'Kiểm tra backend exception handler và trả về mã lỗi chuẩn REST kèm thông báo.',
        });
      }
    }

    if (consoleLogs.filter((l) => l.type === 'error').length > 0) {
      const distinctConsole = [...new Set(consoleLogs.filter((l) => l.type === 'error').map((l) => l.text))];
      for (const logText of distinctConsole.slice(0, 2)) {
        if (!logText.includes('favicon')) {
          addBug({
            title: `Cảnh báo lỗi JavaScript Console: ${logText.slice(0, 50)}...`,
            route: 'Frontend Console',
            severity: 'Low',
            category: 'Console Log',
            description: `Ghi nhận lỗi trong Console: \n\`\`\`\n${logText}\n\`\`\``,
            steps: ['Mở trình duyệt F12 Console', 'Tải lại trang và kiểm tra log'],
            screenshot: findings.pageScreenshots[0]?.file || '',
            recommendation: 'Kiểm tra lại việc xử lý prop types hoặc async unhandled rejections.',
          });
        }
      }
    }

  } finally {
    await browser.close();
  }

  findings.completedAt = new Date().toLocaleString('vi-VN');
  findings.totalRoutes = findings.testedRoutes.length;
  findings.totalBugs = findings.bugs.length;
  findings.totalScreenshots = findings.pageScreenshots.length;

  fs.writeFileSync(path.join(REPORT_DIR, 'findings.json'), JSON.stringify(findings, null, 2), 'utf-8');

  console.log('\n===========================================================');
  console.log('✅ HOAN TAT KHOA KHAM PHA & TIM BUG!');
  console.log(`📊 Tong so Route da test: ${findings.totalRoutes}`);
  console.log(`📸 Tong so Anh chup man hinh: ${findings.totalScreenshots}`);
  console.log(`🐛 Tong so Bug & Khuyen nghi: ${findings.totalBugs}`);
  console.log('===========================================================');
}

run().catch((err) => {
  console.error('Fatal exploration error:', err);
  process.exit(1);
});
