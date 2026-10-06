import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, Clock, Globe, Mail, MapPin, MessageCircle, Phone, Search, Star, ThumbsUp } from 'lucide-react';
import { publicApi } from '@/api';
import type { SalonInfo } from '@/types';
import { StylistAvatar } from '@/components';
import { DOW_ORDER, SALON } from '@/utils/constants';

/** Gom các ngày liền nhau có cùng giờ mở cửa: "Thứ hai – Thứ sáu 08:00–21:00". */
const groupHours = (hours: SalonInfo['openingHours']): { label: string; value: string }[] => {
  const ordered = DOW_ORDER.map((d) => hours.find((h) => h.dayOfWeek === d)).filter((h): h is SalonInfo['openingHours'][number] => !!h);
  const out: { from: string; to: string; value: string }[] = [];
  for (const h of ordered) {
    const value = h.isClosed ? 'Nghỉ' : `${h.openTime}–${h.closeTime}`;
    const last = out[out.length - 1];
    if (last && last.value === value) last.to = h.dayLabel; else out.push({ from: h.dayLabel, to: h.dayLabel, value });
  }
  return out.map((g) => ({ label: g.from === g.to ? g.from : `${g.from} – ${g.to}`, value: g.value }));
};

/**
 * Mentor Sprint 2 · mục 7 — chân trang nền tối nổi bật, đủ thông tin: địa chỉ + chỉ đường, hotline, email,
 * Facebook, Zalo, trang của tiệm, giờ mở cửa và đội ngũ chuyên viên (lấy từ hồ sơ thợ thật).
 * Máy chủ cũ / chế độ Demo không có API thì vẫn hiện thông tin cơ bản từ cấu hình giao diện.
 */
export function SiteFooter() {
  const [info, setInfo] = useState<SalonInfo | null>(null);
  useEffect(() => {
    let alive = true;
    publicApi.salonInfo().then((d) => { if (alive) setInfo(d); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const name = info?.name ?? SALON.name;
  const address = info?.address ?? SALON.address;
  const hotline = info?.hotline ?? SALON.hotline;
  const mapUrl = info?.mapUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  const socials = [
    info?.facebookUrl && { href: info.facebookUrl, label: 'Facebook', icon: <ThumbsUp size={15} /> },
    info?.zaloUrl && { href: info.zaloUrl, label: 'Zalo', icon: <MessageCircle size={15} /> },
    info?.websiteUrl && { href: info.websiteUrl, label: 'Trang của tiệm', icon: <Globe size={15} /> },
  ].filter(Boolean) as { href: string; label: string; icon: JSX.Element }[];

  return (
    <footer className="mt-6 bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950 text-slate-300 print:hidden">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 pb-8 pt-10 sm:grid-cols-2 lg:grid-cols-[1.2fr_0.9fr_1.4fr_0.9fr]">
        <section aria-label="Liên hệ">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500 text-sm font-bold text-white">HS</span>
            <span className="text-base font-bold text-white">{name}</span>
          </Link>
          {info?.slogan && <p className="mt-2 text-sm text-slate-400">{info.slogan}</p>}
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <a href={mapUrl} target="_blank" rel="noreferrer" className="flex items-start gap-2 hover:text-white">
                <MapPin size={16} className="mt-0.5 shrink-0 text-teal-400" /> <span>{address} <span className="text-teal-400">· Chỉ đường</span></span>
              </a>
            </li>
            <li>
              <a href={`tel:${hotline.replace(/\s/g, '')}`} className="flex items-center gap-2 font-semibold text-white hover:text-teal-300">
                <Phone size={16} className="shrink-0 text-teal-400" /> Hotline {hotline}
              </a>
            </li>
            {info?.email && (
              <li>
                <a href={`mailto:${info.email}`} className="flex items-center gap-2 hover:text-white">
                  <Mail size={16} className="shrink-0 text-teal-400" /> {info.email}
                </a>
              </li>
            )}
          </ul>
          {socials.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {socials.map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noreferrer"
                   className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-teal-400 hover:text-white">
                  {s.icon} {s.label}
                </a>
              ))}
            </div>
          )}
        </section>

        <section aria-label="Giờ mở cửa">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-white"><Clock size={15} className="text-teal-400" /> Giờ mở cửa</h3>
          <ul className="mt-3 space-y-1.5 text-sm">
            {info ? groupHours(info.openingHours).map((g) => (
              <li key={g.label} className="flex justify-between gap-3">
                <span>{g.label}</span>
                <span className={g.value === 'Nghỉ' ? 'text-rose-300' : 'font-medium text-white tabular-nums'}>{g.value}</span>
              </li>
            )) : <li className="text-slate-500">Đang cập nhật…</li>}
          </ul>
          <p className="mt-3 text-xs text-slate-500">Giờ hiển thị theo múi giờ Việt Nam (GMT+7).</p>
        </section>

        <section aria-label="Đội ngũ chuyên viên">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white">Đội ngũ chuyên viên</h3>
          {info?.team.length ? (
            <ul className="mt-3 grid grid-cols-1 gap-2.5 xs:grid-cols-2">
              {info.team.slice(0, 8).map((m) => (
                <li key={m.id} className="flex items-center gap-2.5">
                  <StylistAvatar id={m.id} name={m.fullName} url={m.avatarUrl} gender={m.gender} size="h-9 w-9" className="ring-slate-800" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-white">{m.fullName}</span>
                    <span className="block truncate text-[11px] text-slate-400">
                      {m.avgRating ? <><Star size={10} className="-mt-0.5 inline text-amber-400" /> {m.avgRating.toFixed(1)} · </> : null}
                      {m.specialty ?? 'Chuyên viên'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-slate-500">Đội ngũ chuyên viên tận tâm, giàu kinh nghiệm.</p>}
        </section>

        <section aria-label="Liên kết nhanh">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white">Dành cho khách</h3>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link to="/dat-lich" className="inline-flex items-center gap-2 hover:text-white"><CalendarCheck size={15} className="text-teal-400" /> Đặt lịch online</Link></li>
            <li><Link to="/tra-cuu" className="inline-flex items-center gap-2 hover:text-white"><Search size={15} className="text-teal-400" /> Tra cứu / huỷ lịch</Link></li>
            <li><Link to="/dang-nhap" className="inline-flex items-center gap-2 hover:text-white"><Globe size={15} className="text-teal-400" /> Cổng nhân viên</Link></li>
          </ul>
        </section>
      </div>
      <div className="border-t border-slate-800">
        <p className="mx-auto max-w-7xl px-4 pb-[calc(var(--bottom-nav-h)+1rem+env(safe-area-inset-bottom))] pt-4 text-xs text-slate-500 sm:pb-4">© {new Date().getFullYear()} {name}. Mọi quyền được bảo lưu.</p>
      </div>
    </footer>
  );
}
