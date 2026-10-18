import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, CalendarCheck, Clock, Globe, Mail, MapPin, MessageCircle, Phone, Search, Star, ThumbsUp } from 'lucide-react';
import { loadSalonInfo } from '@/utils/salonInfo';
import type { SalonInfo } from '@/types';
import { LotusMark, StylistAvatar } from '@/components';
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
    loadSalonInfo().then((d) => { if (alive) setInfo(d); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const name = info?.name ?? SALON.name;
  const address = info?.address ?? SALON.address;
  const hotline = info?.hotline ?? SALON.hotline;
  const mapUrl = info?.mapUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  // QA Sprint 2 · Footer: Zalo luôn hiện (cấu hình máy chủ → số Zalo của tiệm trong cấu hình giao diện)
  const zaloUrl = info?.zaloUrl ?? (SALON.zalo ? `https://zalo.me/${SALON.zalo.replace(/\D/g, '')}` : null);
  const socials = [
    info?.facebookUrl && { href: info.facebookUrl, label: 'Facebook', icon: <ThumbsUp size={15} /> },
    zaloUrl && { href: zaloUrl, label: SALON.zalo ? `Zalo ${SALON.zalo}` : 'Zalo', icon: <MessageCircle size={15} /> },
    info?.websiteUrl && { href: info.websiteUrl, label: 'Trang của tiệm', icon: <Globe size={15} /> },
  ].filter(Boolean) as { href: string; label: string; icon: JSX.Element }[];

  return (
    <footer className="site-footer relative mt-10 overflow-hidden bg-[#061E1A] text-[#C9D3CC] print:hidden">
      <div aria-hidden className="gold-rule absolute inset-x-0 top-0" />
      {/* Hoa sen chìm cỡ lớn làm nền chân trang — trang trí, không bắt mắt */}
      <LotusMark className="pointer-events-none absolute -right-16 -top-10 h-80 w-80 text-[#D4AF37]/[0.06]" />
      <div className="relative mx-auto grid max-w-7xl gap-10 px-4 pb-8 pt-12 sm:grid-cols-2 lg:grid-cols-[1.25fr_0.9fr_1.4fr_0.8fr]">
        <section aria-label="Thông tin tiệm">
          <Link to="/" className="inline-flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full text-[#D4AF37] ring-1 ring-[#D4AF37]/40"><LotusMark className="h-7 w-7 text-[#D4AF37]" /></span>
            <span className="font-display text-2xl font-semibold italic leading-none text-[#FDFBF7]">{name}</span>
          </Link>
          {info?.slogan && <p className="mt-3 max-w-xs font-display text-lg italic leading-snug text-[#9FB0A6]">“{info.slogan}”</p>}
          <ul className="mt-5 space-y-2.5 text-sm">
            <li>
              <a href={mapUrl} target="_blank" rel="noreferrer" className="flex items-start gap-2.5 transition-colors hover:text-[#FDFBF7]">
                <MapPin size={16} className="mt-0.5 shrink-0 text-[#D4AF37]" /> <span>{address} <span className="text-[#D4AF37]">· Chỉ đường</span></span>
              </a>
            </li>
            <li>
              <a href={`tel:${hotline.replace(/\s/g, '')}`} className="tnum flex items-center gap-2.5 font-semibold text-[#FDFBF7] transition-colors hover:text-[#F1D78A]">
                <Phone size={16} className="shrink-0 text-[#D4AF37]" /> Hotline {hotline}
              </a>
            </li>
            {info?.email && (
              <li>
                <a href={`mailto:${info.email}`} className="flex items-center gap-2.5 transition-colors hover:text-[#FDFBF7]">
                  <Mail size={16} className="shrink-0 text-[#D4AF37]" /> {info.email}
                </a>
              </li>
            )}
          </ul>
          {socials.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {socials.map((x) => (
                <a key={x.label} href={x.href} target="_blank" rel="noreferrer"
                   className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-[#C5A059]/30 px-3.5 text-xs font-medium text-[#E9E4D8] transition-colors hover:border-[#D4AF37]/70 hover:bg-white/5 hover:text-[#FDFBF7]">
                  {x.icon} {x.label}
                </a>
              ))}
            </div>
          )}
        </section>

        <section aria-label="Giờ mở cửa">
          <h3 className="eyebrow !text-[#C5A059] flex items-center gap-2"><Clock size={13} /> Giờ mở cửa</h3>
          <ul className="mt-4 space-y-2 text-sm">
            {info ? groupHours(info.openingHours).map((g) => (
              <li key={g.label} className="flex justify-between gap-3 border-b border-white/10 pb-2 last:border-0">
                <span>{g.label}</span>
                <span className={g.value === 'Nghỉ' ? 'text-rose-300' : 'tnum font-medium text-[#FDFBF7]'}>{g.value}</span>
              </li>
            )) : <li className="text-[#9FB0A6]">Đang cập nhật…</li>}
          </ul>
          <p className="mt-3 text-xs text-[#9FB0A6]">Giờ hiển thị theo múi giờ Việt Nam (GMT+7).</p>
        </section>

        <section aria-label="Đội ngũ chuyên viên">
          <h3 className="eyebrow !text-[#C5A059]">Đội ngũ chuyên viên & chứng chỉ</h3>
          {info?.team.length ? (
            <ul className="mt-4 grid grid-cols-1 gap-3 xs:grid-cols-2">
              {info.team.slice(0, 8).map((m) => (
                <li key={m.id} className="flex items-center gap-2.5">
                  <StylistAvatar id={m.id} name={m.fullName} url={m.avatarUrl} gender={m.gender} size="h-9 w-9" className="ring-[#D4AF37]/30" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-[#FDFBF7]">{m.fullName}</span>
                    <span className="block truncate text-[11px] text-[#9FB0A6]">
                      {m.avgRating ? <><Star size={10} className="-mt-0.5 inline fill-current text-[#D4AF37]" /> <span className="tnum">{m.avgRating.toFixed(1)}</span> · </> : null}
                      {m.specialty ?? 'Chuyên viên'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-4 text-sm text-[#9FB0A6]">Đội ngũ chuyên viên tận tâm, giàu kinh nghiệm.</p>}
          {SALON.credentials.length > 0 && (
            <ul className="mt-5 space-y-1.5 border-t border-white/10 pt-4 text-xs" aria-label="Chứng chỉ & cam kết chuyên môn">
              {SALON.credentials.map((c) => (
                <li key={c} className="flex items-start gap-2"><BadgeCheck size={14} className="mt-px shrink-0 text-[#D4AF37]" /> {c}</li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Liên kết nhanh">
          <h3 className="eyebrow !text-[#C5A059]">Dành cho khách</h3>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link to="/dat-lich" className="inline-flex items-center gap-2.5 transition-colors hover:text-[#FDFBF7]"><CalendarCheck size={15} className="text-[#D4AF37]" /> Đặt lịch online</Link></li>
            <li><Link to="/tra-cuu" className="inline-flex items-center gap-2.5 transition-colors hover:text-[#FDFBF7]"><Search size={15} className="text-[#D4AF37]" /> Tra cứu / huỷ lịch</Link></li>
            <li><Link to="/dang-nhap" className="inline-flex items-center gap-2.5 transition-colors hover:text-[#FDFBF7]"><Globe size={15} className="text-[#D4AF37]" /> Cổng nhân viên</Link></li>
          </ul>
        </section>
      </div>
      <div className="relative border-t border-white/10">
        <p className="mx-auto max-w-7xl px-4 pb-[calc(var(--bottom-nav-h)+1rem+env(safe-area-inset-bottom))] pt-4 text-xs text-[#9FB0A6] sm:pb-4">© {new Date().getFullYear()} {name}. Mọi quyền được bảo lưu.</p>
      </div>
    </footer>
  );
}
