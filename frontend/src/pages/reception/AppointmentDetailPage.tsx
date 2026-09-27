import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PanelRightOpen } from 'lucide-react';
import { appointmentsApi, getErrorMessage } from '@/api';
import type { Appointment } from '@/types';
import { BackButton, Button, Card, EmptyState, SectionTitle, Spinner, StatusBadge } from '@/components';
import { formatDuration } from '@/utils/format';
import { useToast } from '@/contexts/ToastContext';
import { AppointmentDrawer } from './AppointmentDrawer';

/** Mở thẳng một lịch hẹn từ thông báo trong ứng dụng (S4-06). */
export function AppointmentDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setAppointment(await appointmentsApi.detail(id));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => { void load(); }, [load]);

  const back = <BackButton to="/quan-ly/lich-hen" label="Danh sách lịch hẹn" />;

  if (loading) return <Spinner />;
  if (!appointment) {
    return <EmptyState title="Không tìm thấy lịch hẹn" description="Lịch có thể đã bị xoá hoặc bạn không có quyền xem." action={back} />;
  }

  return (
    <div className="space-y-3">
      <SectionTitle title={`Lịch hẹn ${appointment.code}`} />
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="font-semibold">{appointment.customer.fullName}</p>
          <p className="text-sm text-ink-muted">
            {appointment.startAtText} · {appointment.stylist.fullName} · {formatDuration(appointment.totalDurationMinutes)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={appointment.status} />
          <Button size="sm" icon={<PanelRightOpen size={15} />} onClick={() => setDrawerOpen(true)}>Mở bảng thao tác</Button>
        </div>
      </Card>
      <AppointmentDrawer appointment={drawerOpen ? appointment : null} onClose={() => setDrawerOpen(false)} onChanged={load} />
    </div>
  );
}
