import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Appointment, AppointmentStatus } from '../../database/entities/appointment.entity';
import { MSG } from '../../common/constants/messages.constant';

/**
 * Ghi lịch hẹn CHỈ KHI trạng thái trong CSDL vẫn là trạng thái mà thao tác đã đọc và kiểm tra.
 *
 * Mọi thao tác đổi trạng thái (xác nhận, từ chối, check-in, không đến, huỷ, bắt đầu, hoàn tất) trước đây theo kiểu
 * đọc -> kiểm tra -> save: khách tự huỷ bằng mã đúng lúc lễ tân bấm "Xác nhận" trên dữ liệu cũ thì lần save sau
 * ghi đè "Đã huỷ" thành "Đã xác nhận" — lịch đã huỷ sống lại, khung giờ đã trả bị chiếm lại. Khoá dòng lịch hẹn
 * (FOR UPDATE) rồi đối chiếu trạng thái trong cùng giao dịch: thao tác đến sau nhận 409 kèm trạng thái hiện tại.
 */
export async function saveAppointmentGuarded(
  dataSource: DataSource,
  appt: Appointment,
  expected: readonly AppointmentStatus[],
): Promise<void> {
  await dataSource.transaction(async (manager) => {
    const rows: { status: AppointmentStatus }[] = await manager.query(
      'SELECT status FROM appointments WHERE id = $1 FOR UPDATE',
      [appt.id],
    );
    if (!rows.length) throw new NotFoundException(MSG.APPOINTMENT_NOT_FOUND);
    if (!expected.includes(rows[0].status)) {
      throw new ConflictException(MSG.APPOINTMENT_CHANGED_CONCURRENTLY(rows[0].status));
    }
    await manager.save(Appointment, appt);
  });
}
