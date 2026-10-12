/**
 * Chạy e2e theo THỨ TỰ CỐ ĐỊNH để tái hiện lỗi phụ thuộc thứ tự (Jest mặc định đưa tệp vừa lỗi / chạy lâu lên trước).
 *   E2E_ORDER="qa-1210-nfr,qa-regression" npx jest --config jest-e2e.config.js --runInBand --testSequencer ./test/support/ordered-sequencer.js
 * Tệp không có trong E2E_ORDER chạy sau, theo tên.
 */
const Sequencer = require('@jest/test-sequencer').default;

class OrderedSequencer extends Sequencer {
  sort(tests) {
    const order = (process.env.E2E_ORDER ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const rank = (p) => {
      const i = order.findIndex((name) => p.replace(/\\/g, '/').includes(`/${name}.e2e-spec`));
      return i < 0 ? order.length : i;
    };
    return [...tests].sort((a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path));
  }
}

module.exports = OrderedSequencer;
