/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_SALON_NAME: string;
  readonly VITE_SALON_ADDRESS: string;
  readonly VITE_SALON_HOTLINE: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
