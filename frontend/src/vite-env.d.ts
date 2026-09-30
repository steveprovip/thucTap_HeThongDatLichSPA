/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_SALON_NAME: string;
  readonly VITE_SALON_ADDRESS: string;
  readonly VITE_SALON_HOTLINE: string;
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
