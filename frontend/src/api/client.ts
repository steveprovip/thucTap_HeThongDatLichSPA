import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import type { ApiError } from '@/types';
import { DEMO_MODE, mockAdapter } from './mockBackend';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export const ACCESS_TOKEN_KEY = 'salon.accessToken';
export const REFRESH_TOKEN_KEY = 'salon.refreshToken';

export const tokenStore = {
  get access(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  get refresh(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_TOKEN_KEY, access);
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
  ...(DEMO_MODE ? { adapter: mockAdapter } : {}),
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Hàng đợi các request đang chờ token mới để không gọi refresh nhiều lần song song. */
let refreshing: Promise<string | null> | null = null;

const doRefresh = async (): Promise<string | null> => {
  const refreshToken = tokenStore.refresh;
  if (!refreshToken) return null;
  try {
    const res = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
    const data = res.data?.data;
    if (data?.accessToken) {
      tokenStore.set(data.accessToken, data.refreshToken ?? refreshToken);
      return data.accessToken as string;
    }
    return null;
  } catch {
    return null;
  }
};

export const onUnauthorized = { handler: (): void => undefined };

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<ApiError>) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean };
    const status = error.response?.status;

    // Access token hết hạn sau 30 phút -> tự động làm mới một lần rồi gọi lại
    const isAuthEndpoint = original?.url?.includes('/auth/login') || original?.url?.includes('/auth/refresh');
    if (status === 401 && original && !original._retried && !isAuthEndpoint) {
      original._retried = true;
      refreshing = refreshing ?? doRefresh().finally(() => { refreshing = null; });
      const newToken = await refreshing;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      tokenStore.clear();
      onUnauthorized.handler();
    }
    return Promise.reject(error);
  },
);

/** Lấy thông điệp tiếng Việt từ lỗi API để hiển thị cho người dùng. */
export const getErrorMessage = (error: unknown, fallback = 'Đã xảy ra lỗi, vui lòng thử lại'): string => {
  const err = error as AxiosError<ApiError>;
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.code === 'ECONNABORTED') return 'Máy chủ phản hồi quá lâu, vui lòng thử lại';
  if (err?.message === 'Network Error') return 'Không kết nối được tới máy chủ';
  return fallback;
};

/** Lấy tên trường bị lỗi để đánh dấu ngay tại ô nhập. */
export const getErrorField = (error: unknown): string | undefined =>
  (error as AxiosError<ApiError>)?.response?.data?.field;

export const getFieldErrors = (error: unknown): Record<string, string> =>
  (error as AxiosError<ApiError>)?.response?.data?.errors ?? {};

/** Bóc lớp vỏ { success, data } của API. */
export const unwrap = <T>(res: { data: { data: T } }): T => res.data.data;
