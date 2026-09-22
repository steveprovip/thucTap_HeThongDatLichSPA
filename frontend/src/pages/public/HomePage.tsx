import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, Clock, Search, Sparkles, Tag } from 'lucide-react';
import { publicApi, getErrorMessage } from '@/api';
import type { PublicCatalogGroup } from '@/types';
import { Button, Card, EmptyState, Input, Spinner } from '@/components';
import { formatDuration } from '@/utils/format';
import { SALON } from '@/utils/constants';
import { useToast } from '@/contexts/ToastContext';

/** S2-03: trang công khai liệt kê dịch vụ theo nhóm kèm thời lượng và giá. */
export function HomePage() {
  const [groups, setGroups] = useState<PublicCatalogGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    publicApi
      .catalog(search.trim() || undefined)
      .then((data) => { if (alive) setGroups(data); })
      .catch((e) => toast.error(getErrorMessage(e)))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // Tìm kiếm có độ trễ nhẹ để không gọi API mỗi ký tự
  }, [search, toast]);

  const totalServices = useMemo(
    () => groups.reduce((sum, g) => sum + g.services.length, 0),
    [groups],
  );

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 px-5 py-7 text-white">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
          <Sparkles size={14} /> Đặt lịch trong một phút, không cần tài khoản
        </p>
        <h1 className="mt-3 text-2xl font-bold leading-tight sm:text-3xl">
          Chọn dịch vụ, chọn giờ còn trống, tiệm giữ chỗ ngay
        </h1>
        <p className="mt-2 max-w-xl text-sm text-white/85">
          Khung giờ hiển thị được tính từ thời lượng dịch vụ bạn chọn và ca làm thật của từng thợ,
          nên giờ nào hiện ra là giờ đó còn nhận được.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link to="/dat-lich" className="btn bg-white text-brand-800 hover:bg-brand-50">
            <CalendarCheck size={18} /> Đặt lịch ngay
          </Link>
          <Link to="/tra-cuu" className="btn border border-white/40 text-white hover:bg-white/10">
            <Search size={18} /> Tra cứu lịch đã đặt
          </Link>
        </div>
      </section>

      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm dịch vụ — gõ không dấu vẫn ra kết quả (vd: nhuom toc)"
          className="pl-11"
          aria-label="Tìm dịch vụ"
        />
      </div>

      {loading ? (
        <Spinner label="Đang tải bảng dịch vụ…" />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<Tag size={32} />}
          title="Không tìm thấy dịch vụ phù hợp"
          description="Thử từ khoá khác, hoặc gọi trực tiếp cho tiệm để được tư vấn."
          action={<a href={`tel:${SALON.hotline.replace(/\s/g, '')}`} className="btn btn-outline btn-sm">Gọi {SALON.hotline}</a>}
        />
      ) : (
        <>
          <p className="text-sm text-ink-muted">{totalServices} dịch vụ đang nhận lịch</p>
          {groups.map((group) => (
            <section key={group.categoryId} className="space-y-2">
              <h2 className="text-base font-bold text-brand-800">{group.categoryName}</h2>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {group.services.map((s) => (
                  <Card key={s.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{s.name}</p>
                        {s.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{s.description}</p>
                        )}
                        <p className="mt-2 inline-flex items-center gap-1 text-xs text-ink-soft">
                          <Clock size={13} /> {formatDuration(s.durationMinutes)}
                        </p>
                      </div>
                      <p className="shrink-0 text-right font-bold text-brand-800">{s.priceText}</p>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
          <div className="pt-1">
            <Link to="/dat-lich" className="btn-primary w-full sm:w-auto">
              <CalendarCheck size={18} /> Bắt đầu đặt lịch
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
