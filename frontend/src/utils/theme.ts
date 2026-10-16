import { useEffect, useSyncExternalStore } from 'react';

/**
 * Giao diện theo khu vực (RFC-2026-SPA-V3 · Pillar I.1): trang khách luôn Lotus Noir; khu nhân viên dùng lựa chọn đã lưu
 * (mặc định sáng — lễ tân làm việc dưới đèn quầy, in phiếu), bật Noir một chạm ở thanh đầu trang.
 * Script nội tuyến trong index.html chạy cùng luật trước lần vẽ đầu để không nháy trắng.
 */
export type Theme = 'light' | 'noir';

const STAFF_KEY = 'salon.staffTheme';
const STAFF_PATH = /^\/(quan-ly|dang-nhap|quen-mat-khau|dat-lai-mat-khau)(\/|$)/;
const META_COLOR: Record<Theme, string> = { noir: '#080C10', light: '#F8FAFC' };

const listeners = new Set<() => void>();
const readStaff = (): Theme => {
  try { return localStorage.getItem(STAFF_KEY) === 'noir' ? 'noir' : 'light'; } catch { return 'light'; }
};
let staffTheme: Theme = typeof window === 'undefined' ? 'light' : readStaff();

export const isStaffPath = (pathname: string): boolean => STAFF_PATH.test(pathname);
export const themeForPath = (pathname: string, staff: Theme = staffTheme): Theme => (isStaffPath(pathname) ? staff : 'noir');

export function setStaffTheme(next: Theme): void {
  staffTheme = next;
  try { localStorage.setItem(STAFF_KEY, next); } catch { /* chế độ riêng tư: chỉ nhớ trong phiên */ }
  listeners.forEach((l) => l());
}

export function useStaffTheme(): Theme {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => staffTheme,
    () => 'light',
  );
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (root.getAttribute('data-theme') !== theme) root.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLOR[theme]);
}

/** Đồng bộ data-theme trên <html> với trang đang mở (portal, toast, thanh cuộn đều theo). */
export function useRouteTheme(pathname: string): Theme {
  const staff = useStaffTheme();
  const theme = themeForPath(pathname, staff);
  useEffect(() => { applyTheme(theme); }, [theme]);
  return theme;
}
