import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, CornerDownLeft, Moon, Search, Sun, UserRound, Users, Volume2, VolumeX } from 'lucide-react';
import { appointmentsApi, customersApi, stylistsApi } from '@/api';
import type { Appointment, Customer, Role, Stylist } from '@/types';
import { addDaysISO, todayISO } from '@/utils/format';
import { buildIndex, search, type SearchDoc } from '@/utils/fuzzy';
import { swrStore } from '@/utils/swrStore';
import { setStaffTheme, useStaffTheme } from '@/utils/theme';
import { setSoundMuted, useSoundMuted } from '@/utils/sound';
import { STATUS_LABELS } from '@/utils/constants';

export interface PaletteNavItem { to: string; label: string; group: string; icon: ReactNode }

interface Row {
  id: string;
  section: string;
  title: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

const STAFF_LIST: Role[] = ['receptionist', 'owner', 'admin'];

/** Tải (và đệm) dữ liệu nền cho bảng lệnh: mở lại lần sau hiện NGAY từ bản đệm rồi làm mới ngầm. */
function usePaletteData<T>(key: string, enabled: boolean, open: boolean, fetcher: () => Promise<T[]>): T[] {
  const [items, setItems] = useState<T[]>(() => swrStore.get<T[]>(key)?.data ?? []);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  useEffect(() => {
    if (!open || !enabled) return;
    let alive = true;
    swrStore.fetch(key, () => fetcherRef.current()).then((d) => { if (alive) setItems(d); }).catch(() => undefined);
    return () => { alive = false; };
  }, [key, enabled, open]);
  return items;
}

/**
 * Command Palette — Ctrl / ⌘ + K (RFC-2026-SPA-V3 · Pillar I.5): tìm tức thì trên lịch hẹn 8 ngày quanh hôm nay, chuyên viên,
 * trang quản trị (chỉ mục dựng sẵn trong RAM, so khớp không dấu < 15 ms) + khách hàng (tìm trên máy chủ, debounce 180 ms).
 * Bàn phím: ↑ ↓ chọn, Enter mở, Esc đóng. Mẫu combobox / listbox theo WAI-ARIA.
 */
export function CommandPalette({ open, onClose, navItems, role }: {
  open: boolean; onClose: () => void; navItems: PaletteNavItem[]; role: Role | undefined;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [customers, setCustomers] = useState<Customer[]>([]);
  /** Lịch hẹn tìm trên máy chủ (ngoài 200 lịch nạp sẵn quanh hôm nay) — gộp sau kết quả tức thì trong RAM. */
  const [remoteAppts, setRemoteAppts] = useState<Appointment[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const theme = useStaffTheme();
  const muted = useSoundMuted();
  const staff = !!role && STAFF_LIST.includes(role);
  const today = todayISO();

  const appointments = usePaletteData<Appointment>(`palette:appointments:${today}`, !!role, open,
    async () => (await appointmentsApi.list({ from: addDaysISO(today, -1), to: addDaysISO(today, 7), limit: 200, page: 1, order: 'asc' })).items);
  const stylists = usePaletteData<Stylist>('palette:stylists', staff, open, () => stylistsApi.list({ isActive: true }));

  const apptIndex = useMemo<SearchDoc<Appointment>[]>(
    () => buildIndex(appointments, (a) => [a.code, a.customer.fullName, a.customer.phone, a.stylist.fullName, ...a.services.map((s) => s.name), a.startAtText]),
    [appointments],
  );
  const stylistIndex = useMemo(() => buildIndex(stylists, (s) => [s.fullName, s.phone, s.bio]), [stylists]);
  const navIndex = useMemo(() => buildIndex(navItems, (n) => [n.label, n.group]), [navItems]);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setActive(0);
    setCustomers([]);
    setRemoteAppts([]);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  // Khách hàng + lịch hẹn mọi ngày: tìm trên máy chủ (dữ liệu lớn, che SĐT theo quyền) — chỉ khi gõ ≥ 2 ký tự
  useEffect(() => {
    if (!open || q.trim().length < 2) { setCustomers([]); setRemoteAppts([]); return; }
    let alive = true;
    const t = window.setTimeout(() => {
      if (staff) customersApi.search({ q: q.trim(), limit: 5 }).then((r) => { if (alive) setCustomers(r.items); }).catch(() => undefined);
      if (role) appointmentsApi.list({ search: q.trim(), limit: 6, page: 1 }).then((r) => { if (alive) setRemoteAppts(r.items); }).catch(() => undefined);
    }, 180);
    return () => { alive = false; window.clearTimeout(t); };
  }, [q, open, staff, role]);

  const go = (to: string) => { onClose(); navigate(to); };

  const { rows, elapsed } = useMemo<{ rows: Row[]; elapsed: number }>(() => {
    const t0 = performance.now();
    const query = q.trim();
    const out: Row[] = [];
    const local = query ? search(apptIndex, query, 6) : [];
    const appts = query
      ? [...local, ...remoteAppts.filter((r) => !local.some((l) => l.id === r.id))].slice(0, 8)
      : appointments.filter((a) => a.date === today && ['pending', 'confirmed', 'arrived', 'in_progress'].includes(a.status)).slice(0, 5);
    for (const a of appts) {
      out.push({
        id: `a:${a.id}`, section: query ? 'Lịch hẹn' : 'Lịch hôm nay', icon: <CalendarClock size={16} />,
        title: `${a.startTime} · ${a.customer.fullName}`,
        hint: `${a.code} · ${a.stylist.fullName} · ${STATUS_LABELS[a.status]}${a.date !== today ? ` · ${a.date.slice(8, 10)}/${a.date.slice(5, 7)}` : ''}`,
        run: () => go(`/quan-ly/lich-hen/${a.id}`),
      });
    }
    if (query) {
      for (const c of customers) {
        out.push({
          id: `c:${c.id}`, section: 'Khách hàng', icon: <UserRound size={16} />, title: c.fullName,
          hint: `${c.phone} · ${c.totalVisits} lượt làm`, run: () => go(`/quan-ly/khach-hang?q=${encodeURIComponent(c.phoneMasked ? c.fullName : c.phone)}`),
        });
      }
      for (const s of search(stylistIndex, query, 4)) {
        out.push({ id: `s:${s.id}`, section: 'Chuyên viên', icon: <Users size={16} />, title: s.fullName, hint: s.phone ?? undefined, run: () => go('/quan-ly/tho') });
      }
    }
    for (const n of query ? search(navIndex, query, 5) : navItems.slice(0, 6)) {
      out.push({ id: `n:${n.to}`, section: 'Đi tới', icon: n.icon, title: n.label, hint: n.group, run: () => go(n.to) });
    }
    const toggles: Row[] = [
      { id: 'cmd:theme', section: 'Lệnh', icon: theme === 'noir' ? <Sun size={16} /> : <Moon size={16} />,
        title: theme === 'noir' ? 'Chuyển giao diện sáng' : 'Chuyển giao diện Lotus Noir', run: () => setStaffTheme(theme === 'noir' ? 'light' : 'noir') },
      { id: 'cmd:sound', section: 'Lệnh', icon: muted ? <Volume2 size={16} /> : <VolumeX size={16} />,
        title: muted ? 'Bật âm báo lịch mới' : 'Tắt âm báo lịch mới', run: () => setSoundMuted(!muted) },
    ];
    out.push(...(query ? search(buildIndex(toggles, (r) => [r.title, 'lenh giao dien am thanh theme sound']), query, 2) : toggles));
    return { rows: out, elapsed: performance.now() - t0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, apptIndex, appointments, remoteAppts, customers, stylistIndex, navIndex, navItems, theme, muted, today]);

  useEffect(() => { setActive((i) => Math.min(i, Math.max(0, rows.length - 1))); }, [rows.length]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-row="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (rows.length ? (i + 1) % rows.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); rows[active]?.run(); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 pt-[10vh] sm:pt-[14vh]" role="presentation" onKeyDown={onKeyDown}>
      <div className="animate-fade absolute inset-0 bg-scrim/40 backdrop-blur-[3px]" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Tìm nhanh"
           className="glass glass-strong animate-pop-in relative flex max-h-[72vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl [transform-origin:top_center]">
        <div className="flex items-center gap-3 border-b border-slate-200/70 px-4">
          <Search size={18} className="shrink-0 text-slate-400" />
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }}
                 role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={rows[active] ? `palette-${active}` : undefined}
                 placeholder="Tìm lịch hẹn, khách, chuyên viên, trang… (gõ không dấu được)"
                 className="min-h-[56px] flex-1 bg-transparent text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0" />
          <kbd className="hidden rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 sm:inline">Esc</kbd>
        </div>
        <ul ref={listRef} id="palette-list" role="listbox" className="thin-scroll min-h-0 flex-1 overflow-y-auto p-2">
          {rows.length === 0 && <li className="px-3 py-8 text-center text-sm text-slate-500">Không tìm thấy kết quả cho “{q}”.</li>}
          {rows.map((r, i) => (
            <li key={r.id} role="presentation">
              {(i === 0 || rows[i - 1].section !== r.section) && (
                <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 first:pt-1">{r.section}</p>
              )}
              <button type="button" id={`palette-${i}`} data-row={i} role="option" aria-selected={i === active}
                      onMouseMove={() => { if (active !== i) setActive(i); }} onClick={r.run}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-100 ${i === active ? 'bg-teal-50 text-slate-900' : 'text-slate-700'}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${i === active ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-500'}`}>{r.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="tnum block truncate text-sm font-medium">{r.title}</span>
                  {r.hint && <span className="tnum block truncate text-xs text-slate-500">{r.hint}</span>}
                </span>
                {i === active && <CornerDownLeft size={14} className="shrink-0 text-slate-400" />}
              </button>
            </li>
          ))}
        </ul>
        <div className="tnum flex items-center justify-between gap-3 border-t border-slate-200/70 px-4 py-2 text-[11px] text-slate-500">
          <span className="flex items-center gap-2"><kbd className="rounded border border-slate-200 px-1">↑</kbd><kbd className="rounded border border-slate-200 px-1">↓</kbd> chọn · <kbd className="rounded border border-slate-200 px-1">Enter</kbd> mở</span>
          <span title="Thời gian lọc trong bộ nhớ (không tính tìm khách trên máy chủ)">{rows.length} kết quả · {elapsed.toFixed(1)} ms</span>
        </div>
      </div>
    </div>
  );
}
