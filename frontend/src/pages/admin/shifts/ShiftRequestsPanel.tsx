import { useEffect, useState } from 'react';
import { Check, CheckCheck, Inbox, Pencil, X } from 'lucide-react';
import { getErrorMessage, shiftRequestsApi } from '@/api';
import type { ShiftRequest } from '@/types';
import { Button, ConfirmDialog, Field, Input, Modal, TimeSelect24 } from '@/components';
import { timeToMinutes } from '@/utils/format';
import { useToast } from '@/contexts/ToastContext';

/**
 * Mentor Sprint 2 · mục 6 — hộp "Yêu cầu chờ duyệt" trên Bảng ca: quản lý xem lịch rảnh thợ gửi lên cạnh bảng ca
 * và cảnh báo thiếu thợ, rồi Duyệt / Sửa giờ & duyệt / Từ chối (kèm lý do) hoặc Duyệt tất cả.
 */
export function ShiftRequestsPanel({ requests, canApprove, timeOffOnly = false, onChanged }: {
  requests: ShiftRequest[]; canApprove: boolean;
  /** QA Sprint 3 · mục 1: Lễ tân duyệt / từ chối được yêu cầu xin nghỉ, còn đăng ký ca làm do Chủ tiệm duyệt. */
  timeOffOnly?: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  // Mở từ chuông thông báo (/quan-ly/ca-lam#yeu-cau) → cuộn thẳng tới hộp duyệt
  useEffect(() => { if (window.location.hash === '#yeu-cau') document.getElementById('yeu-cau')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, []);
  const [edit, setEdit] = useState<{ req: ShiftRequest; start: string; end: string } | null>(null);
  const [reject, setReject] = useState<{ req: ShiftRequest; note: string } | null>(null);
  const [force, setForce] = useState<{ req: ShiftRequest; warning: string; codes: string[] } | null>(null);

  if (!requests.length) return null;
  const canAct = (r: ShiftRequest) => canApprove && (!timeOffOnly || r.kind === 'time_off');
  const actionable = requests.filter(canAct);

  const approve = async (req: ShiftRequest, payload: { startTime?: string; endTime?: string; force?: boolean } = {}) => {
    setBusy(req.id);
    try {
      const res = await shiftRequestsApi.approve(req.id, payload);
      if ('requiresForce' in res) { setForce({ req, warning: res.warning, codes: res.codes }); return; }
      toast.success(`Đã duyệt ${req.kind === 'shift' ? 'ca' : 'ngày nghỉ'} của ${req.stylistName}`);
      setEdit(null);
      onChanged();
    } catch (e) {
      toast.error(getErrorMessage(e));
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  const approveAll = async () => {
    setBusy('all');
    try {
      const res = await shiftRequestsApi.approveMany(actionable.map((r) => r.id));
      if (res.approved.length) toast.success(`Đã duyệt ${res.approved.length} yêu cầu`);
      if (res.failed.length) toast.warning(`${res.failed.length} yêu cầu cần xem lại: ${res.failed[0].message}`);
      onChanged();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const doReject = async () => {
    if (!reject) return;
    setBusy(reject.req.id);
    try {
      await shiftRequestsApi.reject(reject.req.id, reject.note.trim() || undefined);
      toast.success('Đã từ chối yêu cầu');
      setReject(null);
      onChanged();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const editInvalid = !!edit && timeToMinutes(edit.end) <= timeToMinutes(edit.start);

  return (
    <section id="yeu-cau" className="scroll-mt-20 rounded-2xl border border-amber-200 bg-amber-50/50 p-3" aria-label="Yêu cầu đăng ký ca chờ duyệt">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
          <Inbox size={16} /> {requests.length} yêu cầu thợ tự đăng ký đang chờ duyệt
        </h3>
        {actionable.length > 0 && (
          <Button size="sm" icon={<CheckCheck size={15} />} loading={busy === 'all'} onClick={approveAll}>
            {timeOffOnly ? `Duyệt ${actionable.length} yêu cầu nghỉ` : 'Duyệt tất cả'}
          </Button>
        )}
      </div>
      <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {requests.map((r) => (
          <li key={r.id} className="flex items-start justify-between gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2">
            <div className="min-w-0 text-sm">
              <p className="truncate font-semibold text-ink">{r.stylistName}</p>
              <p className="text-xs text-ink-soft">
                {r.dayText} · {r.kind === 'shift'
                  ? <span className="font-medium text-teal-700">Ca {r.startTime}–{r.endTime}</span>
                  : <span className="font-medium text-rose-700">{r.startTime ? `Nghỉ ${r.startTime}–${r.endTime}` : 'Nghỉ cả ngày'}</span>}
              </p>
              {r.note && <p className="truncate text-xs italic text-ink-muted">“{r.note}”</p>}
            </div>
            {!canAct(r) && canApprove && r.kind === 'shift' && (
              <span className="shrink-0 text-[11px] text-ink-muted" title="Yêu cầu đăng ký ca làm do Chủ tiệm duyệt">Chờ chủ tiệm</span>
            )}
            {canAct(r) && (
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" aria-label={`Duyệt yêu cầu của ${r.stylistName}`} title="Duyệt"
                        loading={busy === r.id} onClick={() => approve(r)}><Check size={15} className="text-emerald-600" /></Button>
                {r.kind === 'shift' && (
                  <Button size="sm" variant="ghost" aria-label="Sửa giờ rồi duyệt" title="Sửa giờ rồi duyệt"
                          onClick={() => setEdit({ req: r, start: r.startTime ?? '09:00', end: r.endTime ?? '18:00' })}>
                    <Pencil size={14} />
                  </Button>
                )}
                <Button size="sm" variant="ghost" aria-label={`Từ chối yêu cầu của ${r.stylistName}`} title="Từ chối"
                        onClick={() => setReject({ req: r, note: '' })}><X size={15} className="text-red-600" /></Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <Modal open={!!edit} size="sm" title="Sửa giờ rồi duyệt" onClose={() => setEdit(null)}
             footer={<div className="flex justify-end gap-2">
               <Button variant="ghost" onClick={() => setEdit(null)}>Đóng</Button>
               <Button disabled={editInvalid} loading={busy === edit?.req.id}
                       onClick={() => edit && approve(edit.req, { startTime: edit.start, endTime: edit.end })}>Duyệt với giờ mới</Button>
             </div>}>
        {edit && (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">{edit.req.stylistName} · {edit.req.dayText} · thợ đăng ký {edit.req.startTime}–{edit.req.endTime}</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bắt đầu (24h)"><TimeSelect24 value={edit.start} onChange={(v) => setEdit({ ...edit, start: v })} /></Field>
              <Field label="Kết thúc (24h)" error={editInvalid ? 'Giờ kết thúc phải sau giờ bắt đầu' : undefined}>
                <TimeSelect24 value={edit.end} invalid={editInvalid} onChange={(v) => setEdit({ ...edit, end: v })} />
              </Field>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!reject} size="sm" title="Từ chối yêu cầu" onClose={() => setReject(null)}
             footer={<div className="flex justify-end gap-2">
               <Button variant="ghost" onClick={() => setReject(null)}>Đóng</Button>
               <Button variant="danger" loading={busy === reject?.req.id} onClick={doReject}>Từ chối</Button>
             </div>}>
        {reject && (
          <Field label="Lý do (thợ sẽ thấy)">
            <Input value={reject.note} onChange={(e) => setReject({ ...reject, note: e.target.value })}
                   placeholder="VD: ngày này đã đủ người" autoFocus />
          </Field>
        )}
      </Modal>

      <ConfirmDialog
        open={!!force}
        danger
        title="Ngày nghỉ trùng lịch hẹn của khách"
        confirmLabel="Vẫn duyệt"
        message={`${force?.warning ?? ''} Lịch bị ảnh hưởng: ${force?.codes.join(', ') ?? ''}`}
        onConfirm={async () => { if (force) await approve(force.req, { force: true }); setForce(null); }}
        onClose={() => setForce(null)}
      />
    </section>
  );
}
