import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { appointmentsApi, getErrorMessage } from '@/api';
import type { Appointment } from '@/types';
import { Button, SectionTitle, Spinner } from '@/components';
import { useToast } from '@/contexts/ToastContext';
import { AppointmentDrawer } from './AppointmentDrawer';

/** Mở thẳng một lịch hẹn từ thông báo trong ứng dụng (S4-06). */
export function AppointmentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      setAppointment(await appointmentsApi.detail(id));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  if (loading) return <Spinner />;
  if (!appointment) return <p className="text-sm text-ink-muted">Không tìm thấy lịch hẹn.</p>;

  return (
    <div>
      <SectionTitle
        title={`Lịch hẹn ${appointment.code}`}
        action={<Button variant="ghost" size="sm" icon={<ArrowLeft size={15} />} onClick={() => navigate(-1)}>Quay lại</Button>}
      />
      <AppointmentDrawer appointment={appointment} onClose={() => navigate(-1)} onChanged={load} />
    </div>
  );
}
