import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { SALON } from './utils/constants';
import { loadSalonInfo } from './utils/salonInfo';

const render = (): void => {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  );
};

// Tên / địa chỉ / hotline của tiệm lấy từ máy chủ lúc chạy (Launcher > Thiết lập cửa hàng) để tiêu đề trang, phiếu in…
// khớp ngay mà không cần build lại. Chờ tối đa 800 ms rồi vẫn hiển thị bằng giá trị lúc build nếu API chậm / lỗi.
const applyRuntimeSalon = loadSalonInfo().then((info) => {
  Object.assign(SALON, { name: info.name || SALON.name, address: info.address || SALON.address, hotline: info.hotline || SALON.hotline });
});
void Promise.race([applyRuntimeSalon, new Promise((resolve) => { setTimeout(resolve, 800); })]).catch(() => undefined).finally(render);
