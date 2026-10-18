import { useEffect, useMemo, useState, type KeyboardEventHandler, type ReactNode } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { Clock3, GripVertical, Search, Store, Globe2 } from 'lucide-react';
import { appointmentsApi, getErrorMessage } from '@/api';
import type { Appointment, AppointmentStatus, TimelineColumn } from '@/types';
import { Button, Input, Modal, StylistAvatar } from '@/components';
import { STATUS_DOT, STATUS_LABELS } from '@/utils/constants';
import { BOARD_COLUMNS, boardMove, type BoardAction } from '@/utils/dragRules';
import { useToast } from '@/contexts/ToastContext';

const RUN: Record<BoardAction, (id: string, reason: string) => Promise<Appointment>> = {
  confirm: (id) => appointmentsApi.confirm(id),
  reject: (id, r) => appointmentsApi.reject(id, r),
  checkIn: (id) => appointmentsApi.checkIn(id),
  start: (id) => appointmentsApi.start(id),
  complete: (id) => appointmentsApi.complete(id),
  noShow: (id) => appointmentsApi.noShow(id),
  undoNoShow: (id) => appointmentsApi.undoNoShow(id),
  cancel: (id, r) => appointmentsApi.cancel(id, r),
};

/** Màu đầu cột (giống trạng thái ở Lịch ngày). */
const HEAD: Record<AppointmentStatus, string> = {
  pending: 'border-t-amber-400', confirmed: 'border-t-blue-500', arrived: 'border-t-violet-500', in_progress: 'border-t-cyan-500',
  completed: 'border-t-emerald-500', no_show: 'border-t-rose-400', cancelled: 'border-t-slate-400',
};

interface Card extends Appointment { stylistAvatar: string | null; stylistGender: TimelineColumn['gender'] }

/** Số phút đã qua giờ hẹn (âm = chưa tới giờ) — giờ tiệm Asia/Ho_Chi_Minh. */
const minutesSince = (a: Pick<Appointment, 'date' | 'startTime'>) =>
  (Date.now() - new Date(`${a.date}T${a.startTime}:00+07:00`).getTime()) / 60_000;

/** Phần hiển thị của thẻ (dùng cả cho thẻ trong cột lẫn thẻ đang kéo theo con trỏ). */
function CardView({ a, onOpen, handle, faded = false, lifted = false }: {
  a: Card; onOpen?: (a: Appointment) => void; handle?: ReactNode; faded?: boolean; lifted?: boolean;
}) {
  return (
    <div className={`group rounded-lg border border-slate-200 bg-white p-2 text-left text-xs shadow-sm transition
                     ${faded ? 'opacity-30' : 'hover:border-teal-300 hover:shadow-md'} ${lifted ? 'rotate-1 shadow-xl ring-2 ring-teal-400' : ''}`}>
      <div className="flex items-start gap-1">
        {handle}
        <button type="button" onClick={() => onOpen?.(a)} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-1 font-semibold tabular-nums text-slate-900">
            <Clock3 size={11} className="text-slate-400" /> {a.startTime}–{a.endTime}
            {a.source === 'walk_in'
              ? <Store size={11} className="ml-auto text-slate-400" aria-label="Khách vãng lai" />
              : <Globe2 size={11} className="ml-auto text-slate-400" aria-label="Đặt online" />}
          </span>
          <span className="mt-0.5 block truncate text-[13px] font-semibold text-slate-800">{a.customer.fullName}</span>
          <span className="block truncate text-slate-500">{a.services.map((s) => s.name).join(', ')}</span>
          <span className="mt-1 flex items-center gap-1.5 text-slate-600">
            <StylistAvatar id={a.stylist.id} name={a.stylist.fullName} url={a.stylistAvatar} gender={a.stylistGender} size="h-5 w-5" />
            <span className="truncate">{a.stylist.fullName}</span>
            {a.isLate && <span className="ml-auto shrink-0 rounded bg-amber-100 px-1 font-semibold text-amber-800">Trễ {a.lateMinutes}′</span>}
          </span>
        </button>
      </div>
    </div>
  );
}

const GRIP = 'mt-0.5 -ml-1 shrink-0 rounded p-0.5 text-slate-300';

/**
 * QA Sprint 4 — "kéo kiểu Jira dùng được nhưng còn khó": giờ nắm được CẢ THẺ bằng chuột / cảm ứng (không phải nhắm
 * đúng nút ⋮⋮ 14px). Bấm nhả tại chỗ vẫn mở chi tiết vì cảm biến chỉ kích hoạt khi rê quá 6px. Bàn phím vẫn dùng nút ⋮⋮
 * (Enter trên thẻ = mở chi tiết, không vô tình bắt đầu kéo).
 */
function BoardCard({ a, onOpen }: { a: Card; onOpen: (a: Appointment) => void }) {
  const movable = a.status !== 'completed' && a.status !== 'cancelled';
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: a.id, data: { status: a.status }, disabled: !movable });
  const { onKeyDown, ...pointer } = listeners ?? {};
  const handle = movable ? (
    <button type="button" onKeyDown={onKeyDown as KeyboardEventHandler | undefined} {...attributes} aria-label={`Kéo lịch của ${a.customer.fullName}`}
            className={`${GRIP} cursor-grab hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing`}>
      <GripVertical size={14} />
    </button>
  ) : undefined;
  return (
    <div ref={setNodeRef} {...(movable ? pointer : {})} className={movable ? 'cursor-grab touch-manipulation select-none active:cursor-grabbing' : undefined}>
      <CardView a={a} onOpen={onOpen} handle={handle} faded={isDragging} />
    </div>
  );
}

function BoardColumn({ status, cards, from, sinceStart, onOpen }: {
  status: AppointmentStatus; cards: Card[]; from: AppointmentStatus | null; sinceStart?: number; onOpen: (a: Appointment) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const move = from ? boardMove(from, status, sinceStart) : null;
  const target = !!move?.ok;
  const blocked = from !== null && from !== status && !target;
  const narrow = status === 'no_show' || status === 'cancelled';
  return (
    <section ref={setNodeRef} aria-label={STATUS_LABELS[status]}
             className={`flex min-h-[320px] shrink-0 flex-col rounded-xl border border-t-4 bg-slate-50/80 transition
                         ${narrow ? 'w-[200px]' : 'w-[250px] lg:min-w-[220px] lg:flex-1'} ${HEAD[status]}
                         ${isOver && target ? 'scale-[1.01] border-teal-400 bg-teal-50 shadow-lg ring-2 ring-teal-300' : target ? 'border-dashed border-teal-300 bg-teal-50/40' : 'border-slate-200'}
                         ${isOver && blocked ? 'ring-2 ring-rose-300' : ''} ${blocked ? 'opacity-45' : ''} duration-150 ease-out`}>
      <header className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
        <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} /> {STATUS_LABELS[status]}
        <span className="ml-auto rounded-full bg-white px-1.5 py-0.5 text-[11px] tabular-nums text-slate-500 ring-1 ring-slate-200">{cards.length}</span>
      </header>
      {target && <p className="px-2.5 pb-1 text-[11px] font-medium text-teal-700">Thả vào đây: {move.ok && move.label}</p>}
      {isOver && blocked && move && !move.ok && <p className="px-2.5 pb-1 text-[11px] font-medium text-rose-700">{move.reason}</p>}
      <div className="thin-scroll flex-1 space-y-1.5 overflow-y-auto px-2 pb-2">
        {cards.map((a) => <BoardCard key={a.id} a={a} onOpen={onOpen} />)}
        {!cards.length && <p className="px-1 py-6 text-center text-[11px] text-slate-400">Trống</p>}
      </div>
    </section>
  );
}

/**
 * Ghi chú test 13/10: bảng lịch hẹn trong ngày kiểu Jira — mỗi trạng thái một cột, kéo thẻ để xác nhận / check-in /
 * bắt đầu / hoàn tất / không đến / huỷ. Chỉ bước hợp lệ mới sáng lên khi đang kéo; huỷ / từ chối hỏi lý do.
 * Dùng chuột, cảm ứng (giữ ~0,2 giây rồi kéo) hoặc bàn phím (Tab tới nút kéo → Space → mũi tên → Space).
 */
export function DayBoard({ columns, onOpen, onChanged }: { columns: TimelineColumn[]; onOpen: (a: Appointment) => void; onChanged: () => void }) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [stylist, setStylist] = useState('');
  const [override, setOverride] = useState<Record<string, AppointmentStatus>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ask, setAsk] = useState<{ card: Card; to: AppointmentStatus; actions: BoardAction[]; label: string } | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  // Dữ liệu mới từ máy chủ → bỏ trạng thái tạm (lạc quan)
  useEffect(() => { setOverride({}); }, [columns]);
  useEffect(() => { appointmentsApi.rejectReasons().then(setReasons).catch(() => undefined); }, []);

  const cards = useMemo<Card[]>(() => columns.flatMap((c) => c.appointments.map((a) => ({
    ...a, status: override[a.id] ?? a.status, stylistAvatar: c.avatarUrl, stylistGender: c.gender,
  }))).sort((x, y) => x.startTime.localeCompare(y.startTime)), [columns, override]);
  const q = query.trim().toLowerCase();
  const visible = cards.filter((a) => (!stylist || a.stylist.id === stylist)
    && (!q || `${a.customer.fullName} ${a.customer.phone} ${a.services.map((s) => s.name).join(' ')} ${a.code}`.toLowerCase().includes(q)));
  const active = activeId ? cards.find((c) => c.id === activeId) ?? null : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const run = async (card: Card, to: AppointmentStatus, actions: BoardAction[], label: string, why = '') => {
    setOverride((o) => ({ ...o, [card.id]: to }));
    try {
      for (const act of actions) await RUN[act](card.id, why);
      toast.success(`${label}: ${card.customer.fullName} (${card.startTime})`);
      onChanged();
    } catch (e) {
      setOverride((o) => { const n = { ...o }; delete n[card.id]; return n; });
      toast.error(getErrorMessage(e));
      onChanged(); // bước đầu của chuỗi có thể đã thành công (vd. xác nhận xong, check-in chưa tới giờ)
    }
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const card = cards.find((c) => c.id === e.active.id);
    const to = e.over?.id as AppointmentStatus | undefined;
    if (!card || !to) return;
    const move = boardMove(card.status, to, minutesSince(card));
    if (!move) return;
    if (!move.ok) { toast.warning(move.reason); return; }
    if (move.needsReason) { setReason(''); setAsk({ card, to, actions: move.actions, label: move.label }); return; }
    void run(card, to, move.actions, move.label);
  };

  const stylists = columns.map((c) => ({ id: c.stylistId, name: c.stylistName }));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm khách, SĐT, dịch vụ, mã lịch" className="h-9 pl-8" aria-label="Tìm lịch" />
        </div>
        <select value={stylist} onChange={(e) => setStylist(e.target.value)} className="field-input h-9 w-auto" aria-label="Lọc theo thợ">
          <option value="">Tất cả thợ</option>
          {stylists.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <p className="text-xs text-ink-muted">Kéo thẻ (nút ⋮⋮) sang cột khác để đổi trạng thái · bấm thẻ để xem chi tiết.</p>
      </div>
      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="thin-scroll flex gap-2 overflow-x-auto pb-2">
          {BOARD_COLUMNS.map((s) => (
            <BoardColumn key={s} status={s} cards={visible.filter((a) => a.status === s)} from={active?.status ?? null}
                         sinceStart={active ? minutesSince(active) : undefined} onOpen={onOpen} />
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>{active && <CardView a={active} lifted handle={<span className={GRIP}><GripVertical size={14} /></span>} />}</DragOverlay>
      </DndContext>

      <Modal open={!!ask} onClose={() => setAsk(null)} title={ask ? `${ask.label} — ${ask.card.customer.fullName}` : ''}
             footer={(
               <div className="flex justify-end gap-2">
                 <Button variant="ghost" onClick={() => setAsk(null)}>Thôi</Button>
                 <Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={async () => {
                   if (!ask) return;
                   setBusy(true);
                   await run(ask.card, ask.to, ask.actions, ask.label, reason.trim());
                   setBusy(false);
                   setAsk(null);
                 }}>{ask?.label ?? 'Xác nhận'}</Button>
               </div>
             )}>
        <p className="mb-2 text-sm text-ink-soft">Lý do (bắt buộc, khách nhận được trong email):</p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {reasons.map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${reason === r ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 hover:bg-slate-50'}`}>{r}</button>
          ))}
        </div>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} placeholder="Hoặc nhập lý do khác" aria-label="Lý do" />
      </Modal>
    </div>
  );
}
