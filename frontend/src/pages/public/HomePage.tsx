import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarCheck,
  Clock3,
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
} from "@/utils/images";
import { useToast } from "@/contexts/ToastContext";

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
  const [category, setCategory] = useState("all");
  const toast = useToast();
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fetchCatalog = (retryCount = 0) => {
      setLoading(true);
      publicApi
        .catalog(search.trim() || undefined)
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
  }, [search, toast]);
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
          })),
        ),
      ),
    [groups],
  );
  return (
    <div className="space-y-8 pb-4">
      <section className="animate-fade-in relative isolate overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-card">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-32 -z-10 h-96 w-96 rounded-full bg-teal-100/50 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 left-1/3 -z-10 h-80 w-80 rounded-full bg-amber-50 blur-3xl"
        />
        <div className="grid items-stretch lg:grid-cols-[1.15fr_1fr]">
          <div className="stagger px-6 py-8 sm:px-10 sm:py-10">
            <p
              style={{ "--i": 0 } as React.CSSProperties}
              className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-teal-700"
            >
              <Sparkles size={14} /> Luxury wellness & spa
            </p>
            <h1
              style={{ "--i": 1 } as React.CSSProperties}
              className="mt-4 text-3xl font-bold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl"
            >
              Khoảnh khắc
              <br className="hidden sm:block" /> dành riêng{" "}
              <span className="whitespace-nowrap bg-gradient-to-r from-teal-600 to-emerald-500 bg-clip-text text-transparent">
                cho bạn
              </span>
            </h1>
            <p
              style={{ "--i": 2 } as React.CSSProperties}
              className="mt-3 max-w-lg text-base leading-relaxed text-slate-600"
            >
              Chăm sóc tóc, làn da và tinh thần trong một không gian tinh tế.
              Chọn dịch vụ yêu thích và giữ lịch hẹn chỉ trong vài bước.
            </p>
            <div
              style={{ "--i": 3 } as React.CSSProperties}
              className="mt-6 flex flex-wrap gap-3"
            >
              <Link
                to="/dat-lich"
                className="btn-primary group px-6 shadow-lg shadow-teal-600/20"
              >
                <CalendarCheck size={18} /> Đặt Lịch Ngay{" "}
                <ArrowRight
                  size={17}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </Link>
              <Link to="/tra-cuu" className="btn-outline px-6">
                <Search size={17} /> Tra cứu lịch
              </Link>
            </div>
            <div
              style={{ "--i": 4 } as React.CSSProperties}
              className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3"
            >
              <div className="flex -space-x-2.5">
                {TEAM.map(member => (
                  <SmartImage key={member.src} src={member.src} alt={member.name} loading="lazy" kind="person"
                    seed={member.name} className="h-10 w-10 rounded-full ring-[3px] ring-white" />
                ))}
              </div>
              <div className="text-sm leading-tight">
                <p className="font-semibold text-slate-900">
                  Đội ngũ chuyên viên tận tâm
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-slate-500">
                  <ShieldCheck size={14} className="text-teal-600" /> Xác nhận
                  lịch nhanh · giá minh bạch
                </p>
              </div>
            </div>
          </div>
          <div className="relative hidden min-h-[300px] overflow-hidden lg:block">
            <SmartImage
              src={IMAGES.hero_spa_interior}
              alt="Không gian boutique spa hiện đại"
              kind="spa"
              className="absolute inset-0 h-full w-full"
              imgClassName="animate-ken-burns"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white via-white/5 to-transparent" />
            <div className="animate-fade-in absolute bottom-6 right-6 flex items-center gap-3 rounded-2xl border border-white/60 bg-white/85 px-4 py-3 shadow-lg backdrop-blur-md [animation-delay:500ms]">
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
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-600">
              Dịch vụ của chúng tôi
            </p>
            <h2
              id="catalog-title"
              className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
            >
              Chăm sóc theo cách của bạn
            </h2>
            <p className="mt-2 text-sm text-slate-500">
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
          className="flex gap-2 overflow-x-auto pb-1 thin-scroll"
          role="tablist"
          aria-label="Lọc danh mục dịch vụ"
        >
          {[
            { id: "all", name: "Tất cả" },
            ...groups.map((group) => ({
              id: group.categoryId,
              name: group.categoryName,
            })),
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={category === tab.id}
              onClick={() => setCategory(tab.id)}
              className={`press min-h-10 shrink-0 rounded-full border px-5 text-sm font-medium transition-all duration-200 ${category === tab.id ? "border-slate-900 bg-slate-900 text-white shadow-md shadow-slate-900/10" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"}`}
            >
              {tab.name}
            </button>
          ))}
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
                <div className="stagger grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">{shown.map(({ service, group }, index) => (
                  <article key={service.id} style={{ '--i': index } as React.CSSProperties} className="lift group flex overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card hover:border-slate-300 sm:flex-col">
                    <div className="relative w-28 shrink-0 sm:w-auto">
                      <SmartImage src={photos[service.id]} alt={service.name} loading="lazy" className="h-full min-h-[96px] sm:h-28" seed={service.id}
                        kind={serviceMediaKind({ name: service.name, categoryId: group.categoryId, categoryName: group.categoryName })}
                        fallbackLabel={group.categoryName}
                        imgClassName="duration-700 group-hover:scale-[1.06]" />
                      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-slate-700 shadow-sm backdrop-blur"><Clock3 size={11} /> {formatDuration(service.durationMinutes)}</span>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
                      <div className="flex items-start justify-between gap-2"><h4 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{service.name}</h4><span className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-700">{service.priceText}</span></div>
                      <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">{service.description}</p>
                      <div className="mt-auto flex items-center justify-between pt-1">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{group.categoryName}</span>
                        <Link to={`/dat-lich?service=${encodeURIComponent(service.id)}`} className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800">Chọn <ArrowRight size={13} className="transition-transform duration-300 group-hover:translate-x-1" /></Link>
                      </div>
                    </div>
                  </article>
                ))}</div>
                {!open && (
                  <div className="mt-3 text-center">
                    <button type="button" onClick={() => setExpanded((e) => ({ ...e, [category]: true }))}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300">
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

