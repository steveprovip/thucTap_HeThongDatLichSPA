import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Brush,
  CalendarCheck,
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
} from "lucide-react";
import { publicApi, getErrorMessage } from "@/api";
import type { PublicCatalogGroup } from "@/types";
import {
  CustomerAiAssistant,
  EmptyState,
  Input,
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
import { useToast } from "@/contexts/ToastContext";

/** TASK v4 · NV4: biểu tượng cho từng nhóm dịch vụ — thanh danh mục gọn, thanh lịch kiểu Fresha. */
function categoryIcon(name: string) {
  const n = stripAccents(name);
  const size = 15;
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

/** Số cột của lưới dịch vụ theo bề ngang (khớp các lớp sm/md/lg của lưới bên dưới). */
const columnsFor = (w: number): number => (w >= 1024 ? 4 : w >= 768 ? 3 : w >= 640 ? 2 : 1);
function useGridColumns(): number {
  const [cols, setCols] = useState(() => (typeof window === "undefined" ? 4 : columnsFor(window.innerWidth)));
  useEffect(() => {
    const onResize = () => setCols(columnsFor(window.innerWidth));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return cols;
}

export function HomePage() {
  // Mentor S2 · mục 8: mỗi nhóm chỉ hiện 2 hàng (4 cột trên máy tính = 8 dịch vụ), bấm "Xem thêm" để mở hết
  const cols = useGridColumns();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [groups, setGroups] = useState<PublicCatalogGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Dev Frontend – phân hệ Khách: debounce 250ms (giống Step1Services) — gõ nhanh trên điện thoại chỉ tốn một request
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("all");
  const toast = useToast();
  // TASK v4: ảnh đội ngũ ở hero = chuyên viên THẬT của tiệm (máy chủ), dự phòng ảnh tĩnh khi chưa tải được
  const team = useSalonInfo().info?.team ?? [];
  const heroTeam = team.length
    ? team.slice(0, 5).map((m) => ({ src: stylistPhoto(m.id, m.avatarUrl, m.gender), name: m.fullName })).filter((m) => m.src)
    : TEAM;
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
  const visible = useMemo(
    () =>
      category === "all"
        ? groups
        : groups.filter((group) => group.categoryId === category),
    [groups, category],
  );
  const total = groups.reduce((sum, group) => sum + group.services.length, 0);
  // Ảnh riêng cho từng dịch vụ, không trùng lặp trên cùng trang.
  const photos = useMemo(
    () =>
      assignServiceImages(
        groups.flatMap((group) =>
          group.services.map((service) => ({
            id: service.id,
            name: service.name,
            categoryId: group.categoryId,
            imageUrl: service.imageUrl,
          })),
        ),
      ),
    [groups],
  );
  return (
    <div className="space-y-8 pb-4">
      {/* Hero: ảnh không gian tiệm luôn hiện (điện thoại ở trên, máy tính bên phải); tiêu đề serif thay chữ gradient */}
      <section className="animate-fade-in overflow-hidden rounded-2xl bg-white ring-1 ring-ivory-line">
        <div className="grid items-stretch lg:grid-cols-[1.1fr_1fr]">
          <div className="stagger order-2 px-5 pb-7 pt-6 sm:px-10 sm:py-12 lg:order-1 lg:py-14">
            <h1
              style={{ "--i": 0 } as React.CSSProperties}
              className="text-balance break-words font-display text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.02em] text-slate-900 sm:text-6xl lg:text-[4.25rem]"
            >
              Khoảnh khắc dành riêng{" "}
              <em className="whitespace-nowrap font-medium italic text-teal-700">cho bạn</em>
            </h1>
            <p
              style={{ "--i": 1 } as React.CSSProperties}
              className="mt-4 max-w-md text-[15px] leading-relaxed text-slate-600 sm:text-base"
            >
              Chăm sóc tóc, làn da và tinh thần trong một không gian tinh tế.
              Chọn dịch vụ yêu thích và giữ lịch hẹn chỉ trong vài bước.
            </p>
            <div
              style={{ "--i": 2 } as React.CSSProperties}
              className="mt-7 flex flex-wrap gap-3 [&>*]:w-full sm:[&>*]:w-auto"
            >
              <Link
                to="/dat-lich"
                className="btn group min-h-[48px] bg-teal-800 px-6 text-[15px] text-white shadow-[0_10px_24px_-12px_rgba(17,94,89,0.55)] hover:bg-teal-900"
              >
                <CalendarCheck size={18} /> Đặt lịch ngay{" "}
                <ArrowRight
                  size={17}
                  className="transition-transform duration-200 ease-out group-hover:translate-x-0.5"
                />
              </Link>
              <Link to="/tra-cuu" className="btn btn-outline min-h-[48px] border-ivory-line px-6 text-[15px] hover:border-slate-300 hover:bg-ivory">
                <Search size={17} /> Tra cứu lịch
              </Link>
            </div>
            <div
              style={{ "--i": 3 } as React.CSSProperties}
              className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-ivory-line pt-6"
            >
              <div className="flex -space-x-2.5">
                {heroTeam.map(member => (
                  <SmartImage key={member.src} src={member.src} alt={member.name} title={member.name} loading="lazy" kind="person"
                    seed={member.name} className="h-10 w-10 rounded-full ring-[3px] ring-white" />
                ))}
              </div>
              <div className="text-sm leading-tight">
                <p className="font-semibold text-slate-900">
                  Đội ngũ chuyên viên tận tâm
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-slate-500">
                  <ShieldCheck size={14} className="text-teal-700" /> Xác nhận
                  lịch nhanh · giá minh bạch
                </p>
              </div>
            </div>
          </div>
          <div className="relative order-1 h-52 overflow-hidden xs:h-60 sm:h-72 lg:order-2 lg:h-auto lg:min-h-[440px]">
            <SmartImage
              src={IMAGES.hero_spa_interior}
              alt="Không gian boutique spa hiện đại"
              kind="spa"
              className="absolute inset-0 h-full w-full"
              imgClassName="animate-ken-burns"
            />
            <div className="animate-fade-in absolute bottom-3 left-3 flex items-center gap-3 rounded-xl bg-white px-3.5 py-2.5 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.28)] [animation-delay:400ms] sm:bottom-5 sm:left-auto sm:right-5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping-soft absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              <div className="text-xs leading-tight">
                <p className="font-semibold text-slate-900">
                  Đang nhận lịch hôm nay
                </p>
                <p className="text-slate-500">
                  Chọn giờ trống chỉ trong một phút
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section aria-labelledby="catalog-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2
              id="catalog-title"
              className="font-display text-[2rem] font-semibold leading-tight tracking-[-0.01em] text-slate-900 sm:text-[2.5rem]"
            >
              Chăm sóc theo cách của bạn
            </h2>
            <p className="mt-1 text-sm tabular-nums text-slate-500">
              {total} dịch vụ · giá minh bạch · chuyên viên tận tâm
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search
              size={17}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm dịch vụ"
              className="pl-10"
              aria-label="Tìm dịch vụ"
            />
          </div>
        </div>
        <div
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 thin-scroll"
          role="tablist"
          aria-label="Lọc danh mục dịch vụ"
        >
          {[
            { id: "all", name: "Tất cả", count: total },
            ...groups.map((group) => ({
              id: group.categoryId,
              name: group.categoryName,
              count: group.services.length,
            })),
          ].map((tab) => {
            const active = category === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(tab.id)}
                className={`press inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-[color,background-color,border-color,transform] duration-150 ease-out ${active ? "border-teal-800 bg-teal-800 text-white" : "border-ivory-line bg-white text-slate-700 hover:border-teal-300 hover:text-teal-800"}`}
              >
                <span className={active ? "text-amber-100" : "text-teal-700"}>{tab.id === "all" ? <LayoutGrid size={15} /> : categoryIcon(tab.name)}</span>
                {tab.name}
                <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>{tab.count}</span>
              </button>
            );
          })}
        </div>
        {loading && groups.length === 0 ? <ServiceGridSkeleton /> : visible.length === 0 ? <EmptyState title="Không tìm thấy dịch vụ" description="Thử từ khoá hoặc danh mục khác." /> : (
          <div key={category}>{(() => {
            // Một lưới liền mạch cho mọi nhóm (không chia khối theo nhóm) -> không còn cột trống khi nhóm ít dịch vụ
            const items = visible.flatMap((group) => group.services.map((service) => ({ service, group })));
            const limit = cols === 1 ? 4 : cols * 2; // điện thoại 1 cột: 4 thẻ ngang gọn
            const open = !!expanded[category] || items.length <= limit;
            const shown = open ? items : items.slice(0, limit);
            return (
              <>
                <div className="stagger grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">{shown.map(({ service, group }, index) => (
                  <article key={service.id} style={{ '--i': index } as React.CSSProperties}
                           className="group flex overflow-hidden rounded-2xl border border-ivory-line/80 bg-white transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-card-hover sm:flex-col">
                    <div className="relative w-32 shrink-0 overflow-hidden sm:w-auto">
                      <SmartImage src={photos[service.id]} alt={service.name} loading="lazy" className="h-full min-h-[112px] sm:aspect-[4/3] sm:h-auto" seed={service.id}
                        kind={serviceMediaKind({ name: service.name, categoryId: group.categoryId, categoryName: group.categoryName })}
                        fallbackLabel={group.categoryName}
                        imgClassName="duration-500 ease-out group-hover:scale-[1.04]" />
                      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-slate-700 shadow-sm backdrop-blur"><Clock3 size={11} /> {formatDuration(service.durationMinutes)}</span>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3.5">
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-teal-700/80">{categoryIcon(group.categoryName)} {group.categoryName}</span>
                      <h4 className="line-clamp-2 text-[15px] font-semibold leading-snug text-slate-900">{service.name}</h4>
                      <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">{service.description}</p>
                      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                        <span className="min-w-0 truncate text-base font-bold tabular-nums text-slate-900" title={service.priceText}>{service.priceText}</span>
                        <Link to={`/dat-lich?service=${encodeURIComponent(service.id)}`}
                              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-teal-800 px-4 text-xs font-semibold text-white transition-[background-color,transform] duration-150 ease-out hover:bg-teal-900 active:scale-[0.97]">
                          Đặt lịch <ArrowRight size={13} className="transition-transform duration-300 group-hover:translate-x-0.5" />
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}</div>
                {!open && (
                  <div className="mt-3 text-center">
                    <button type="button" onClick={() => setExpanded((e) => ({ ...e, [category]: true }))}
                            className="press inline-flex min-h-[44px] items-center gap-1 rounded-full border border-ivory-line bg-white px-5 text-sm font-semibold text-slate-700 hover:border-slate-300">
                      Xem thêm {items.length - limit} dịch vụ <ChevronDown size={14} />
                    </button>
                  </div>
                )}
              </>
            );
          })()}</div>
        )}
      </section>
      <CustomerAiAssistant />
    </div>
  );
}
//Dev Frontend – phân hệ Khách//

