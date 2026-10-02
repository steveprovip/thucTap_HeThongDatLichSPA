/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_SALON_NAME: string;
  readonly VITE_SALON_ADDRESS: string;
  readonly VITE_SALON_HOTLINE: string;
  /** 'false' = gọi backend thật; mọi giá trị khác (kể cả bỏ trống) = chế độ demo dùng mockBackend. */
  readonly VITE_DEMO_MODE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
