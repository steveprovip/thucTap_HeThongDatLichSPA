import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './fonts.css';
import './index.css';
import { SALON } from './utils/constants';
import { loadSalonInfo } from './utils/salonInfo';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
const render = (): void => {
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  );
};

// Vẽ NGAY (không chờ API): trước đây chờ tới 800 ms thông tin tiệm rồi mới vẽ — cộng thẳng vào thời gian hiển thị nội dung
// chính (LCP), nhất là khi máy chủ Render vừa thức dậy. Tên / địa chỉ / hotline lấy từ máy chủ lúc chạy (Launcher > Thiết lập
// cửa hàng); nếu khác giá trị lúc build thì vẽ lại MỘT lần (state giữ nguyên) để tiêu đề trang, phiếu in… vẫn khớp.
render();
loadSalonInfo().then((info) => {
  const next = { name: info.name || SALON.name, address: info.address || SALON.address, hotline: info.hotline || SALON.hotline };
  if (next.name === SALON.name && next.address === SALON.address && next.hotline === SALON.hotline) return;
  Object.assign(SALON, next);
  render();
}).catch(() => undefined);
