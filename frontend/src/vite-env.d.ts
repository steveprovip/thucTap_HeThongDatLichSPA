/// <reference types="vite/client" />

/** Mã bản dựng do vite.config.ts định nghĩa (so với /version.json để biết có bản mới). */
declare const __APP_BUILD_ID__: string;

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_SALON_NAME: string;
  readonly VITE_SALON_ADDRESS: string;
  readonly VITE_SALON_HOTLINE: string;
  readonly VITE_SALON_ZALO?: string;
  readonly VITE_SALON_CREDENTIALS?: string;
  /** 'false' = gọi backend thật; giá trị khác = demo (mockBackend). Không đặt: dev = demo, build production = API thật. */
  readonly VITE_DEMO_MODE?: string;
  /** VietQR: BIN ngân hàng 6 số (NAPAS), số tài khoản và tên chủ TK nhận tiền. */
  readonly VITE_BANK_BIN?: string;
  readonly VITE_BANK_ACCOUNT_NO?: string;
  readonly VITE_BANK_ACCOUNT_NAME?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
