import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Brush,
  CalendarCheck,
  ChevronDown,
  Clock3,
  Droplets,
  Flower2,
  Gem,
  Gift,
  LayoutGrid,
  Palette,
  Scissors,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import { publicApi, getErrorMessage } from "@/api";
import type { PublicCatalogGroup, PublicService } from "@/types";
import {
  CustomerAiAssistant,
  EmptyState,
  Input,
  SegmentedTabs,
  ServiceGridSkeleton,
  SmartImage,
} from "@/components";
import { formatDuration } from "@/utils/format";
import {
  IMAGES,
  STYLIST_PHOTOS,
  assignServiceImages,
  serviceMediaKind,
  stripAccents,
  stylistPhoto,
} from "@/utils/images";
import { useSalonInfo } from "@/utils/salonInfo";
import { openState, salonNow } from "@/utils/salonClock";
import { useMagnetic, usePointerGlow } from "@/hooks/usePointerGlow";
import { useToast } from "@/contexts/ToastContext";

/** TASK v4 · NV4: biểu tượng cho từng nhóm dịch vụ — thanh danh mục gọn, thanh lịch kiểu Fresha. */
function categoryIcon(name: string, size = 15) {
  const n = stripAccents(name);
  if (/uon|nhuom|phuc hoi/.test(n)) return <Palette size={size} />;
  if (/cat|toc/.test(n)) return <Scissors size={size} />;
  if (/goi/.test(n)) return <Droplets size={size} />;
  if (/\bda\b/.test(n)) return <Sparkles size={size} />;
  if (/massage|body/.test(n)) return <Flower2 size={size} />;
  if (/nail|mong/.test(n)) return <Gem size={size} />;
  if (/trang diem|mi/.test(n)) return <Brush size={size} />;
  if (/combo|goi /.test(n)) return <Gift size={size} />;
  return <LayoutGrid size={size} />;
}

const TEAM = [
  { src: STYLIST_PHOTOS.stylist_1, name: "Chuyên viên màu nhuộm" },
  { src: STYLIST_PHOTOS.stylist_2, name: "Chuyên viên cắt tóc nam" },
  { src: STYLIST_PHOTOS.stylist_3, name: "Chuyên viên spa" },
  { src: STYLIST_PHOTOS.stylist_4, name: "Chuyên viên tạo kiểu" },
  { src: STYLIST_PHOTOS.stylist_5, name: "Chuyên viên chăm sóc da" },
];

/** Lưới Bento: cứ 5 dịch vụ thì dịch vụ đầu là thẻ nổi bật (2×2 trên máy tính, trọn hàng trên máy tính bảng). */
const BENTO = 5;
const isFeatured = (index: number): boolean => index % BENTO === 0;

/** Số thẻ hiện trước khi bấm "Xem thêm": 2 khối Bento (4 hàng) trên màn rộng, 1 khối trên điện thoại. */
const limitFor = (w: number): number => (w >= 640 ? BENTO * 2 : BENTO);
function useBentoLimit(): number {
  const [limit, setLimit] = useState(() => (typeof window === "undefined" ? BENTO * 2 : limitFor(window.innerWidth)));
  useEffect(() => {
    const onResize = () => setLimit(limitFor(window.innerWidth));
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return limit;
}

interface Item { service: PublicService; group: PublicCatalogGroup }

/** Thẻ nổi bật của khối Bento: ảnh tràn khung, chữ serif trên lớp phủ, ánh sáng theo con trỏ. */
function FeatureCard({ item, photo, style }: { item: Item; photo?: string; style: CSSProperties }) {
  const glow = usePointerGlow<HTMLElement>();
  const { service, group } = item;
  return (
    <article ref={glow} style={style}
             className="ambient group relative isolate flex min-h-[340px] overflow-hidden rounded-[22px] border border-slate-200/70 shadow-card transition-[transform,box-shadow] duration-spring ease-spring hover:-translate-y-1 hover:shadow-card-hover sm:col-span-2 sm:min-h-[300px] lg:row-span-2 lg:min-h-[520px]">
      <SmartImage src={photo} alt={service.name} loading="lazy" seed={service.id} sizes="(min-width: 1024px) 640px, 100vw"
                  className="absolute inset-0 -z-20 h-full w-full"
                  kind={serviceMediaKind({ name: service.name, categoryId: group.categoryId, categoryName: group.categoryName })}
                  imgClassName="duration-[1200ms] group-hover:scale-[1.05]" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-canvas via-canvas/70 to-canvas/0" />
      <div className="mt-auto flex w-full flex-col gap-3 p-5 sm:p-7">
        <span className="eyebrow inline-flex items-center gap-1.5">{categoryIcon(group.categoryName, 13)} {group.categoryName}</span>
        <h3 className="max-w-md text-balance font-display text-[2rem] font-semibold leading-[1.05] text-slate-900 sm:text-[2.4rem]">{service.name}</h3>
        {service.description && <p className="line-clamp-2 max-w-md text-sm leading-relaxed text-slate-600">{service.description}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="tnum inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/50 px-3 py-1 text-xs font-medium text-slate-700 backdrop-blur">
            <Clock3 size={12} /> {formatDuration(service.durationMinutes)}
          </span>
          <span className="tnum rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-sm font-semibold text-slate-900">{service.priceText}</span>
          <Link to={`/dat-lich?service=${encodeURIComponent(service.id)}`}
                className="ml-auto inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-teal-700 px-5 text-sm font-semibold text-white transition-[transform,background-color] duration-spring ease-spring hover:bg-teal-800 active:scale-[0.96]">
            Đặt lịch <ArrowUpRight size={15} className="transition-transform duration-spring ease-spring group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}

/** Thẻ dịch vụ thường: ngang trên điện thoại (gọn), dọc trên màn rộng. */
function ServiceCard({ item, photo, style }: { item: Item; photo?: string; style: CSSProperties }) {
  const { service, group } = item;
  return (
    <article style={style}
             className="group flex overflow-hidden rounded-[18px] border border-slate-200/70 bg-white shadow-card transition-[transform,box-shadow,border-color] duration-spring ease-spring hover:-translate-y-1 hover:border-gold/30 hover:shadow-card-hover sm:flex-col">
      <div className="relative w-32 shrink-0 overflow-hidden sm:w-auto">
        <SmartImage src={photo} alt={service.name} loading="lazy" seed={service.id} sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 128px"
                    className="h-full min-h-[120px] sm:aspect-[4/3] sm:h-auto"
                    kind={serviceMediaKind({ name: service.name, categoryId: group.categoryId, categoryName: group.categoryName })}
                    fallbackLabel={group.categoryName} imgClassName="duration-700 group-hover:scale-[1.05]" />
        <span className="tnum absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-slate-800 backdrop-blur-md">
          <Clock3 size={11} /> {formatDuration(service.durationMinutes)}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-4">
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">{categoryIcon(group.categoryName, 12)} {group.categoryName}</span>
        <h4 className="line-clamp-2 text-[15px] font-semibold leading-snug text-slate-900">{service.name}</h4>
        <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">{service.description}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="tnum min-w-0 truncate text-base font-semibold text-slate-900" title={service.priceText}>{service.priceText}</span>
          <Link to={`/dat-lich?service=${encodeURIComponent(service.id)}`} aria-label={`Đặt lịch ${service.name}`}
                className="inline-flex min-h-[40px] shrink-0 items-center gap-1 rounded-full border border-gold/40 px-3.5 text-xs font-semibold text-slate-900 transition-[background-color,border-color,color,transform] duration-spring ease-spring hover:border-transparent hover:bg-teal-700 hover:text-white active:scale-[0.96]">
            Đặt lịch <ArrowRight size={13} className="transition-transform duration-spring ease-spring group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}

function Stat({ value, label, icon }: { value: ReactNode; label: string; icon?: ReactNode }) {
  return (
    <div className="min-w-0 py-3 sm:px-6 sm:first:pl-0">
      <p className="tnum flex items-center gap-1.5 font-display text-[1.7rem] font-semibold leading-none text-slate-900">{icon}{value}</p>
      <p className="mt-1.5 truncate text-[11px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
    </div>
  );
}

export function HomePage() {
  const limit = useBentoLimit();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [groups, setGroups] = useState<PublicCatalogGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Dev Frontend – phân hệ Khách: debounce 250ms (giống Step1Services) — gõ nhanh trên điện thoại chỉ tốn một request
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("all");
  const toast = useToast();
  const heroGlow = usePointerGlow<HTMLElement>();
  const cta = useMagnetic<HTMLAnchorElement>();
  // TASK v4: ảnh đội ngũ ở hero = chuyên viên THẬT của tiệm (máy chủ), dự phòng ảnh tĩnh khi chưa tải được
  const info = useSalonInfo().info;
  const team = info?.team ?? [];
  const heroTeam = team.length
    ? team.slice(0, 5).map((m) => ({ src: stylistPhoto(m.id, m.avatarUrl, m.gender), name: m.fullName })).filter((m) => m.src)
    : TEAM;
  // Số liệu THẬT cho dải thống kê: điểm đánh giá trung bình của chuyên viên (chỉ thợ đủ lượt đánh giá mới có điểm)
  const rated = team.map((m) => m.avgRating).filter((r): r is number => typeof r === "number");
  const rating = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null;
  const open = info ? openState(info.openingHours, salonNow()) : null;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fetchCatalog = (retryCount = 0) => {
      setLoading(true);
      publicApi
        .catalog(debouncedSearch.trim() || undefined)
        .then((data) => {
          if (alive) setGroups(data);
        })
        .catch((error) => {
          if (alive && retryCount < 3) {
            timer = setTimeout(() => fetchCatalog(retryCount + 1), 2000);
          } else if (alive) {
            toast.error(getErrorMessage(error));
          }
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    };
    fetchCatalog();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [debouncedSearch, toast]);
  // Danh mục vừa lọc không còn trong kết quả tìm kiếm → quay về "Tất cả" (không kẹt ở màn trống)
  useEffect(() => {
    if (category !== "all" && groups.length && !groups.some((g) => g.categoryId === category)) setCategory("all");
  }, [groups, category]);

  const visible = useMemo(
    () => (category === "all" ? groups : groups.filter((group) => group.categoryId === category)),
    [groups, category],
  );
  const total = groups.reduce((sum, group) => sum + group.services.length, 0);
  // Ảnh riêng cho từng dịch vụ, không trùng lặp trên cùng trang.
  const photos = useMemo(
    () =>
      assignServiceImages(
        groups.flatMap((group) =>
          group.services.map((service) => ({ id: service.id, name: service.name, categoryId: group.categoryId, imageUrl: service.imageUrl })),
        ),
      ),
    [groups],
  );
  const items: Item[] = visible.flatMap((group) => group.services.map((service) => ({ service, group })));
  const showAll = !!expanded[category] || items.length <= limit;
  const shown = showAll ? items : items.slice(0, limit);

  return (
    <div className="space-y-14 pb-6 sm:space-y-20">
      {/* ---------------- Hero biên tập: ảnh tràn khung, chữ serif, ánh sáng champagne theo con trỏ ---------------- */}
      <section ref={heroGlow} aria-labelledby="hero-title"
               className="ambient grain animate-spring-in relative isolate overflow-hidden rounded-[28px] border border-slate-200/60 shadow-pop">
        <SmartImage src={IMAGES.hero_spa_interior} alt="Không gian boutique spa Hương Sen" kind="spa" sizes="(min-width: 1280px) 1280px, 100vw"
                    className="absolute inset-x-0 top-0 -z-20 h-72 sm:h-80 lg:inset-0 lg:h-full" imgClassName="animate-ken-burns" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-canvas via-canvas/85 to-canvas/10 lg:bg-gradient-to-r lg:from-canvas lg:via-canvas/80 lg:to-canvas/5" />
        <div className="flex min-h-[620px] flex-col justify-end px-5 pb-6 pt-56 sm:px-10 sm:pb-8 sm:pt-64 lg:min-h-[640px] lg:max-w-[60%] lg:justify-center lg:px-14 lg:py-16">
          <div className="stagger">
            <p style={{ "--i": 0 } as CSSProperties} className="eyebrow flex items-center gap-3">
              <span aria-hidden className="h-px w-8 bg-gold/70" /> Salon · Spa · Wellness
            </p>
            <h1 id="hero-title" style={{ "--i": 1 } as CSSProperties}
                className="mt-5 text-balance font-display text-[2.9rem] font-medium leading-[0.98] tracking-[-0.015em] text-slate-900 sm:text-[4.2rem] lg:text-[5rem]">
              Khoảnh khắc dành riêng <em className="whitespace-nowrap font-normal italic text-gold">cho bạn</em>
            </h1>
            <p style={{ "--i": 2 } as CSSProperties} className="mt-5 max-w-md text-[15px] leading-relaxed text-slate-600 sm:text-base">
              Chăm sóc tóc, làn da và tinh thần trong một không gian tinh tế. Chọn dịch vụ yêu thích và giữ lịch hẹn chỉ trong vài bước.
            </p>
            <div style={{ "--i": 3 } as CSSProperties} className="mt-8 flex flex-wrap items-center gap-3 [&>*]:w-full sm:[&>*]:w-auto">
              <Link ref={cta} to="/dat-lich"
                    className="magnetic sheen group inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-teal-700 px-7 text-[15px] font-semibold text-white shadow-glow transition-[background-color] duration-200 hover:bg-teal-800">
                <CalendarCheck size={18} /> Đặt lịch ngay
                <ArrowRight size={17} className="transition-transform duration-spring ease-spring group-hover:translate-x-1" />
              </Link>
              <Link to="/tra-cuu"
                    className="glass-soft inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full px-6 text-[15px] font-medium text-slate-800 transition-colors hover:text-slate-900">
                <Search size={17} /> Tra cứu lịch
              </Link>
            </div>
            <div style={{ "--i": 4 } as CSSProperties} className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
              <div className="flex -space-x-2.5">
                {heroTeam.map((member) => (
                  <SmartImage key={member.src} src={member.src} alt={member.name} title={member.name} loading="lazy" kind="person"
                              seed={member.name} className="h-10 w-10 rounded-full ring-2 ring-canvas" />
                ))}
              </div>
              <div className="text-sm leading-tight">
                <p className="font-medium text-slate-900">Đội ngũ chuyên viên tận tâm</p>
                <p className="mt-1 flex items-center gap-1.5 text-slate-500">
                  <ShieldCheck size={14} className="text-gold" /> Xác nhận lịch nhanh · giá minh bạch
                </p>
              </div>
            </div>
          </div>
        </div>
        {/* Trạng thái mở cửa THẬT theo giờ mở cửa của tiệm (không còn huy hiệu "đang nhận lịch" luôn sáng) */}
        {open && (
          <div className="glass animate-fade-in absolute right-4 top-4 flex items-center gap-2.5 rounded-full py-2 pl-3 pr-4 text-xs [animation-delay:500ms] sm:right-6 sm:top-6">
            <span className="relative flex h-2.5 w-2.5">
              {open.kind === "open" && <span className="animate-ping-soft absolute inline-flex h-full w-full rounded-full bg-jade" />}
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${open.kind === "open" ? "bg-jade" : "bg-gold"}`} />
            </span>
            <span className="tnum font-medium text-slate-800">
              {open.kind === "open" ? `Đang mở cửa · đến ${open.closeTime}`
                : open.kind === "later-today" ? `Hôm nay mở lúc ${open.openTime} · đặt trước online`
                : open.next ? `Mở lại ${open.next.dayLabel} lúc ${open.next.openTime}` : "Nhận đặt lịch online 24/7"}
            </span>
          </div>
        )}
      </section>

      {/* Dải số liệu THẬT (danh mục, đội ngũ, điểm đánh giá) — không có con số trang trí */}
      {(total > 0 || team.length > 0) && (
        <section aria-label="Hương Sen trong vài con số" className="-mt-6 grid grid-cols-2 divide-slate-200/70 border-y border-slate-200/70 sm:-mt-10 sm:flex sm:divide-x">
          {total > 0 && <Stat value={total} label="Dịch vụ chăm sóc" />}
          {groups.length > 0 && <Stat value={groups.length} label="Nhóm trị liệu" />}
          {team.length > 0 && <Stat value={team.length} label="Chuyên viên" />}
          {rating !== null && <Stat value={rating.toFixed(1)} label="Điểm đánh giá" icon={<Star size={18} className="fill-current text-gold" />} />}
        </section>
      )}

      {/* ---------------- Thực đơn dịch vụ: lưới Bento ---------------- */}
      <section aria-labelledby="catalog-title" className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Thực đơn dịch vụ</p>
            <h2 id="catalog-title" className="mt-3 font-display text-[2.3rem] font-medium leading-none tracking-[-0.01em] text-slate-900 sm:text-[3rem]">
              Chăm sóc theo cách <em className="italic text-gold">của bạn</em>
            </h2>
            <p className="tnum mt-3 text-sm text-slate-500">{total} dịch vụ · giá minh bạch · chuyên viên tận tâm</p>
          </div>
          <div className="relative w-full sm:w-80">
            <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm dịch vụ (gõ không dấu cũng được)"
                   className="rounded-full pl-11" aria-label="Tìm dịch vụ" />
          </div>
        </div>
        <SegmentedTabs label="Lọc danh mục dịch vụ" value={category} onChange={setCategory}
                       tabs={[
                         { id: "all", label: "Tất cả", count: total, icon: <LayoutGrid size={14} /> },
                         ...groups.map((g) => ({ id: g.categoryId, label: g.categoryName, count: g.services.length, icon: categoryIcon(g.categoryName, 14) })),
                       ]} />
        {loading && groups.length === 0 ? <ServiceGridSkeleton /> : items.length === 0 ? (
          <EmptyState title="Không tìm thấy dịch vụ" description="Thử từ khoá hoặc danh mục khác." />
        ) : (
          <div key={category}>
            <div className="stagger grid grid-flow-dense gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
              {shown.map((item, index) => {
                const style = { "--i": index } as CSSProperties;
                return isFeatured(index)
                  ? <FeatureCard key={item.service.id} item={item} photo={photos[item.service.id]} style={style} />
                  : <ServiceCard key={item.service.id} item={item} photo={photos[item.service.id]} style={style} />;
              })}
            </div>
            {!showAll && (
              <div className="mt-6 text-center">
                <button type="button" onClick={() => setExpanded((e) => ({ ...e, [category]: true }))}
                        className="tnum inline-flex min-h-[46px] items-center gap-1.5 rounded-full border border-slate-200 px-6 text-sm font-medium text-slate-700 transition-[border-color,color,transform] duration-spring ease-spring hover:border-gold/60 hover:text-slate-900 active:scale-[0.97]">
                  Xem thêm {items.length - limit} dịch vụ <ChevronDown size={15} />
                </button>
              </div>
            )}
          </div>
        )}
      </section>
      <CustomerAiAssistant />
    </div>
  );
}
//Dev Frontend – phân hệ Khách//
