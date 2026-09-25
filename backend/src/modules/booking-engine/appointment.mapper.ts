import { Appointment, AppointmentStatus } from '../../database/entities/appointment.entity';
import { AppointmentServiceItem } from '../../database/entities/appointment-service.entity';
import { Customer } from '../../database/entities/customer.entity';
import { Stylist } from '../../database/entities/stylist.entity';
import { APPOINTMENT_STATUS_LABELS } from '../../common/constants/messages.constant';
import { Role } from '../../common/constants/roles.constant';
import { maskPhone } from '../../common/utils/phone.util';
import { formatVnd } from '../../common/utils/currency.util';
import { formatDateTimeVN, formatTimeVN, toDateString, toTimeString } from '../../common/utils/time.util';

export interface AppointmentView {
  id: string;
  code: string;
  status: AppointmentStatus;
  statusLabel: string;
  source: string;
  date: string;
  startTime: string;
  endTime: string;
  startAt: Date;
  endAt: Date;
  startAtText: string;
  totalDurationMinutes: number;
  estimatedTotal: number;
  estimatedTotalText: string;
  customer: { id: string; fullName: string; phone: string; phoneMasked: boolean; email: string | null;
    totalVisits: number; noShowCount: number };
  stylist: { id: string; fullName: string };
  services: { id: string; serviceId: string; name: string; durationMinutes: number; price: number; priceText: string }[];
  customerNote: string | null;
  isLate: boolean;
  lateMinutes: number;
  arrivedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  actualDurationMinutes: number | null;
  cancelledAt: Date | null;
  cancelledByLabel: string | null;
  cancelReason: string | null;
  rejectedReason: string | null;
  confirmedAt: Date | null;
  noShowAt: Date | null;
  /** Lịch chờ xác nhận quá 12 giờ (S3-02). */
  pendingOverdue: boolean;
  createdAt: Date;
}

export interface MapContext {
  viewerRole: Role;
  pendingOverdueHours: number;
  now?: Date;
}

export const mapAppointment = (
  appt: Appointment,
  customer: Customer,
  stylist: Stylist,
  services: AppointmentServiceItem[],
  ctx: MapContext,
): AppointmentView => {
  const mask = ctx.viewerRole === Role.STYLIST || ctx.viewerRole === Role.CUSTOMER;
  const now = ctx.now ?? new Date();
  const pendingOverdue =
    appt.status === AppointmentStatus.PENDING &&
    now.getTime() - appt.createdAt.getTime() > ctx.pendingOverdueHours * 3600_000;

  return {
    id: appt.id,
    code: appt.code,
    status: appt.status,
    statusLabel: APPOINTMENT_STATUS_LABELS[appt.status] ?? appt.status,
    source: appt.source,
    date: toDateString(appt.startAt),
    startTime: toTimeString(appt.startAt),
    endTime: toTimeString(appt.endAt),
    startAt: appt.startAt,
    endAt: appt.endAt,
    startAtText: formatDateTimeVN(appt.startAt),
    totalDurationMinutes: appt.totalDurationMinutes,
    estimatedTotal: appt.estimatedTotal,
    estimatedTotalText: formatVnd(appt.estimatedTotal),
    customer: {
      id: customer.id,
      fullName: customer.fullName,
      phone: mask ? maskPhone(customer.phone) : customer.phone,
      phoneMasked: mask,
      email: mask ? null : customer.email,
      totalVisits: customer.totalVisits,
      noShowCount: customer.noShowCount,
    },
    stylist: { id: stylist.id, fullName: stylist.fullName },
    services: services
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        id: s.id,
        serviceId: s.serviceId,
        name: s.nameSnapshot,
        durationMinutes: s.durationSnapshot,
        price: s.priceSnapshot,
        priceText: formatVnd(s.priceSnapshot),
      })),
    customerNote: appt.customerNote,
    isLate: appt.isLate,
    lateMinutes: appt.lateMinutes,
    arrivedAt: appt.arrivedAt,
    startedAt: appt.startedAt,
    completedAt: appt.completedAt,
    actualDurationMinutes: appt.actualDurationMinutes,
    cancelledAt: appt.cancelledAt,
    cancelledByLabel: appt.cancelledByLabel,
    cancelReason: appt.cancelReason,
    rejectedReason: appt.rejectedReason,
    confirmedAt: appt.confirmedAt,
    noShowAt: appt.noShowAt,
    pendingOverdue,
    createdAt: appt.createdAt,
  };
};

/** Bản rút gọn cho khách tra cứu công khai — không lộ dữ liệu nội bộ. */
export const mapPublicAppointment = (
  appt: Appointment,
  customer: Customer,
  stylist: Stylist,
  services: AppointmentServiceItem[],
) => ({
  code: appt.code,
  status: appt.status,
  statusLabel: APPOINTMENT_STATUS_LABELS[appt.status] ?? appt.status,
  date: toDateString(appt.startAt),
  startTime: toTimeString(appt.startAt),
  endTime: toTimeString(appt.endAt),
  startAtText: formatDateTimeVN(appt.startAt),
  expectedEndText: formatTimeVN(appt.endAt),
  totalDurationMinutes: appt.totalDurationMinutes,
  estimatedTotal: appt.estimatedTotal,
  estimatedTotalText: formatVnd(appt.estimatedTotal),
  customerName: customer.fullName,
  customerPhoneMasked: maskPhone(customer.phone),
  stylistName: stylist.fullName,
  services: services
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      name: s.nameSnapshot,
      durationMinutes: s.durationSnapshot,
      price: s.priceSnapshot,
      priceText: formatVnd(s.priceSnapshot),
    })),
  customerNote: appt.customerNote,
  cancelledAt: appt.cancelledAt,
  cancelledByLabel: appt.cancelledByLabel,
  cancelReason: appt.cancelReason,
});
