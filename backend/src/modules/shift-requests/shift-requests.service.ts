import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  ShiftRequest, ShiftRequestKind, ShiftRequestStatus,
} from '../../database/entities/shift-request.entity';
import { Stylist } from '../../database/entities/stylist.entity';
import { User } from '../../database/entities/user.entity';
import { NotificationType } from '../../database/entities/notification.entity';
import { Role } from '../../common/constants/roles.constant';
import { AuthUser } from '../../common/types/auth.types';
import { addDays, timeToMinutes, todaySalon, trimSeconds } from '../../common/utils/time.util';
import { shiftDayText } from '../stylists/shift-rules';
import { StylistsService } from '../stylists/stylists.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ApproveShiftRequestDto, CreateShiftRequestsDto, ListShiftRequestsQueryDto, ShiftRequestItemDto,
} from './dto/shift-request.dto';

/** Thợ được đăng ký trước tối đa bao nhiêu ngày. */
export const SHIFT_REQUEST_HORIZON_DAYS = 60;

export interface ShiftRequestView {
  id: string;
  stylistId: string;
  stylistName: string;
  kind: ShiftRequestKind;
  workDate: string;
  dayText: string;
  startTime: string | null;
  endTime: string | null;
  breakStart: string | null;
  breakEnd: string | null;
  note: string | null;
  status: ShiftRequestStatus;
  reviewNote: string | null;
  reviewedAt: Date | null;
  reviewerName: string | null;
  createdAt: Date;
}

export interface ApproveWarning {
  warning: string;
  affected: number;
  codes: string[];
  requiresForce: true;
}

const t = (v: string | null | undefined): string | null => (v ? trimSeconds(v) : null);

/**
 * Mentor Sprint 2 · mục 6 — quy trình "thợ tự đăng ký -> quản lý duyệt".
 * Trước đây chỉ Chủ tiệm / Lễ tân xếp ca hộ; nay thợ gửi lịch rảnh của mình (ca làm hoặc nghỉ), quản lý xem cùng
 * bảng ca + cảnh báo thiếu thợ rồi duyệt (có thể chỉnh giờ cho khớp hoạt động của tiệm) hoặc từ chối kèm lý do.
 * Khi duyệt, ca / ngày nghỉ được tạo qua ĐÚNG các hàm của StylistsService nên mọi luật cũ vẫn áp dụng
 * (trong giờ mở cửa, không trùng ngày lễ, không chồng ca, cảnh báo lịch hẹn bị ảnh hưởng).
 */
@Injectable()
export class ShiftRequestsService {
  private readonly logger = new Logger(ShiftRequestsService.name);

  constructor(
    private readonly stylists: StylistsService,
    private readonly notifications: NotificationsService,
    @InjectRepository(ShiftRequest) private readonly repo: Repository<ShiftRequest>,
    @InjectRepository(Stylist) private readonly stylistRepo: Repository<Stylist>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  // ------------------------------------------------------------------ helpers
  private async views(rows: ShiftRequest[]): Promise<ShiftRequestView[]> {
    if (!rows.length) return [];
    const stylistIds = Array.from(new Set(rows.map((r) => r.stylistId)));
    const reviewerIds = Array.from(new Set(rows.map((r) => r.reviewedBy).filter((v): v is string => !!v)));
    const [stylists, reviewers] = await Promise.all([
      this.stylistRepo.find({ where: { id: In(stylistIds) } }),
      reviewerIds.length ? this.userRepo.find({ where: { id: In(reviewerIds) } }) : Promise.resolve([] as User[]),
    ]);
    const names = new Map(stylists.map((s) => [s.id, s.fullName]));
    const reviewerNames = new Map(reviewers.map((u) => [u.id, u.fullName]));
    return rows.map((r) => ({
      id: r.id,
      stylistId: r.stylistId,
      stylistName: names.get(r.stylistId) ?? '',
      kind: r.kind,
      workDate: String(r.workDate),
      dayText: shiftDayText(String(r.workDate)),
      startTime: t(r.startTime),
      endTime: t(r.endTime),
      breakStart: t(r.breakStart),
      breakEnd: t(r.breakEnd),
      note: r.note,
      status: r.status,
      reviewNote: r.reviewNote,
      reviewedAt: r.reviewedAt,
      reviewerName: r.reviewedBy ? reviewerNames.get(r.reviewedBy) ?? null : null,
      createdAt: r.createdAt,
    }));
  }

  private requireStylist(user: AuthUser): string {
    if (!user.stylistId) throw new ForbiddenException('Tài khoản chưa gắn với hồ sơ thợ nên không đăng ký ca được');
    return user.stylistId;
  }

  /** Kiểm tra một mục đăng ký theo đúng luật của bảng ca (trừ phần chồng lấn với yêu cầu khác). */
  private async validateItem(stylistId: string, item: ShiftRequestItemDto, today: string): Promise<void> {
    if (item.workDate < today) throw new BadRequestException(`${shiftDayText(item.workDate)}: không đăng ký cho ngày đã qua`);
    if (item.workDate > addDays(today, SHIFT_REQUEST_HORIZON_DAYS)) {
      throw new BadRequestException(`${shiftDayText(item.workDate)}: chỉ đăng ký trước tối đa ${SHIFT_REQUEST_HORIZON_DAYS} ngày`);
    }
    if (item.kind === ShiftRequestKind.SHIFT) {
      if (!item.startTime || !item.endTime) throw new BadRequestException('Đăng ký ca làm phải có giờ bắt đầu và giờ kết thúc');
      await this.stylists.assertWithinSalonHours({
        workDate: item.workDate, startTime: item.startTime, endTime: item.endTime,
        breakStart: item.breakStart ?? null, breakEnd: item.breakEnd ?? null,
      });
      await this.stylists.assertNoShiftOverlap(stylistId, [{ workDate: item.workDate, startTime: item.startTime, endTime: item.endTime }]);
    } else {
      if (!!item.startTime !== !!item.endTime) throw new BadRequestException('Nghỉ theo khoảng giờ phải có cả giờ bắt đầu và giờ kết thúc');
      if (item.startTime && item.endTime && timeToMinutes(item.endTime) <= timeToMinutes(item.startTime)) {
        throw new BadRequestException('Giờ kết thúc nghỉ phải sau giờ bắt đầu nghỉ');
      }
    }
  }

  // ------------------------------------------------------------------ thợ
  // (describeShiftRequests ở cuối tệp: hàm thuần, có kiểm thử đơn vị)
  async createForSelf(user: AuthUser, dto: CreateShiftRequestsDto, today: string = todaySalon()): Promise<ShiftRequestView[]> {
    const stylistId = this.requireStylist(user);
    const stylist = await this.stylistRepo.findOne({ where: { id: stylistId } });
    if (!stylist?.isActive) throw new ForbiddenException('Hồ sơ thợ đang ngừng hoạt động');

    const dates = Array.from(new Set(dto.items.map((i) => i.workDate)));
    const pending = await this.repo.find({
      where: { stylistId, status: ShiftRequestStatus.PENDING, workDate: In(dates) },
    });
    const accepted: { kind: ShiftRequestKind; workDate: string; start: number; end: number }[] = pending.map((p) => ({
      kind: p.kind, workDate: String(p.workDate),
      start: p.startTime ? timeToMinutes(trimSeconds(p.startTime)) : 0,
      end: p.endTime ? timeToMinutes(trimSeconds(p.endTime)) : 24 * 60,
    }));
    for (const item of dto.items) {
      await this.validateItem(stylistId, item, today);
      const start = item.startTime ? timeToMinutes(item.startTime) : 0;
      const end = item.endTime ? timeToMinutes(item.endTime) : 24 * 60;
      const clash = accepted.find((a) => a.workDate === item.workDate && a.kind === item.kind && a.start < end && start < a.end);
      if (clash) {
        throw new ConflictException(`${shiftDayText(item.workDate)}: bạn đã có yêu cầu ${item.kind === ShiftRequestKind.SHIFT ? 'ca làm' : 'nghỉ'} trùng khung giờ đang chờ duyệt`);
      }
      accepted.push({ kind: item.kind, workDate: item.workDate, start, end });
    }

    const saved = await this.repo.save(dto.items.map((i) => this.repo.create({
      stylistId,
      kind: i.kind,
      workDate: i.workDate,
      startTime: i.startTime ?? null,
      endTime: i.endTime ?? null,
      breakStart: i.kind === ShiftRequestKind.SHIFT ? i.breakStart ?? null : null,
      breakEnd: i.kind === ShiftRequestKind.SHIFT ? i.breakEnd ?? null : null,
      note: i.note?.trim() || null,
      status: ShiftRequestStatus.PENDING,
    })));

    const note = describeShiftRequests(stylist.fullName, saved.map((s) => ({
      kind: s.kind, workDate: String(s.workDate),
      startTime: s.startTime ? trimSeconds(s.startTime) : null, endTime: s.endTime ? trimSeconds(s.endTime) : null,
      note: s.note,
    })));
    await this.notifyManagers(note.title, note.body);
    return this.views(saved);
  }

  async listMine(user: AuthUser, from?: string, to?: string): Promise<ShiftRequestView[]> {
    const stylistId = this.requireStylist(user);
    return this.list({ stylistId, from, to });
  }

  async cancelMine(user: AuthUser, id: string): Promise<{ success: boolean }> {
    const stylistId = this.requireStylist(user);
    const res = await this.repo.createQueryBuilder().update(ShiftRequest)
      .set({ status: ShiftRequestStatus.CANCELLED })
      .where('id = :id AND stylist_id = :sid AND status = :st', { id, sid: stylistId, st: ShiftRequestStatus.PENDING })
      .execute();
    if (!res.affected) throw new BadRequestException('Chỉ huỷ được yêu cầu của chính bạn khi còn đang chờ duyệt');
    return { success: true };
  }

  // ------------------------------------------------------------------ quản lý
  async list(query: ListShiftRequestsQueryDto): Promise<ShiftRequestView[]> {
    const qb = this.repo.createQueryBuilder('r');
    if (query.status) qb.andWhere('r.status = :st', { st: query.status });
    if (query.stylistId) qb.andWhere('r.stylist_id = :sid', { sid: query.stylistId });
    if (query.from) qb.andWhere('r.work_date >= :from', { from: query.from });
    if (query.to) qb.andWhere('r.work_date <= :to', { to: query.to });
    qb.orderBy('r.work_date', 'ASC').addOrderBy('r.start_time', 'ASC', 'NULLS FIRST').addOrderBy('r.created_at', 'ASC').take(500);
    return this.views(await qb.getMany());
  }

  /**
   * Duyệt: GIỮ CHỖ yêu cầu bằng một câu UPDATE có điều kiện (hai quản lý bấm cùng lúc chỉ một người thắng),
   * rồi mới tạo ca / ngày nghỉ. Tạo lỗi -> trả yêu cầu về "chờ duyệt" và báo lỗi nguyên văn của luật bảng ca.
   */
  async approve(id: string, reviewer: AuthUser, dto: ApproveShiftRequestDto = {}): Promise<ShiftRequestView | ApproveWarning> {
    const req = await this.repo.findOne({ where: { id } });
    if (!req) throw new NotFoundException('Không tìm thấy yêu cầu đăng ký');
    if (req.status !== ShiftRequestStatus.PENDING) throw new ConflictException('Yêu cầu này đã được xử lý');

    const workDate = String(req.workDate);
    const claim = await this.repo.createQueryBuilder().update(ShiftRequest)
      .set({ status: ShiftRequestStatus.APPROVED, reviewedBy: reviewer.id, reviewedAt: new Date(), reviewNote: dto.note?.trim() || null })
      .where('id = :id AND status = :st', { id, st: ShiftRequestStatus.PENDING })
      .execute();
    if (!claim.affected) throw new ConflictException('Yêu cầu này vừa được người khác xử lý');

    const rollback = () => this.repo.update(id, { status: ShiftRequestStatus.PENDING, reviewedBy: null, reviewedAt: null, reviewNote: null });
    let resultId: string;
    try {
      if (req.kind === ShiftRequestKind.SHIFT) {
        const startTime = dto.startTime ?? t(req.startTime)!;
        const endTime = dto.endTime ?? t(req.endTime)!;
        const keepBreak = !!req.breakStart && !!req.breakEnd
          && timeToMinutes(t(req.breakStart)!) >= timeToMinutes(startTime) && timeToMinutes(t(req.breakEnd)!) <= timeToMinutes(endTime);
        const [shift] = await this.stylists.createShifts(req.stylistId, {
          shifts: [{
            workDate, startTime, endTime,
            breakStart: keepBreak ? t(req.breakStart) : null,
            breakEnd: keepBreak ? t(req.breakEnd) : null,
            note: req.note ?? undefined,
          }],
        });
        resultId = shift.id;
      } else {
        const off = await this.stylists.createTimeOff(req.stylistId, {
          offDate: workDate, startTime: t(req.startTime), endTime: t(req.endTime),
          reason: req.note ?? 'Thợ đăng ký nghỉ', force: dto.force,
        });
        if ('warning' in off) {
          await rollback();
          return { ...off, requiresForce: true };
        }
        resultId = off.id;
      }
    } catch (e) {
      await rollback();
      throw e;
    }
    await this.repo.update(id, { resultId });
    const label = req.kind === ShiftRequestKind.SHIFT ? 'ca làm' : 'ngày nghỉ';
    await this.notifications.notifyStylist(
      req.stylistId, NotificationType.SHIFT_REQUEST_REVIEWED, 'Yêu cầu đã được duyệt',
      `Quản lý đã duyệt ${label} ${shiftDayText(workDate)}${dto.startTime || dto.endTime ? ' (có chỉnh giờ)' : ''}`,
    );
    const [view] = await this.views([(await this.repo.findOne({ where: { id } }))!]);
    return view;
  }

  async reject(id: string, reviewer: AuthUser, note?: string): Promise<ShiftRequestView> {
    const res = await this.repo.createQueryBuilder().update(ShiftRequest)
      .set({ status: ShiftRequestStatus.REJECTED, reviewedBy: reviewer.id, reviewedAt: new Date(), reviewNote: note?.trim() || null })
      .where('id = :id AND status = :st', { id, st: ShiftRequestStatus.PENDING })
      .execute();
    const req = await this.repo.findOne({ where: { id } });
    if (!req) throw new NotFoundException('Không tìm thấy yêu cầu đăng ký');
    if (!res.affected) throw new ConflictException('Yêu cầu này đã được xử lý');
    await this.notifications.notifyStylist(
      req.stylistId, NotificationType.SHIFT_REQUEST_REVIEWED, 'Yêu cầu bị từ chối',
      `${req.kind === ShiftRequestKind.SHIFT ? 'Ca làm' : 'Ngày nghỉ'} ${shiftDayText(String(req.workDate))} không được duyệt${note ? `: ${note}` : ''}`,
    );
    const [view] = await this.views([req]);
    return view;
  }

  /** Duyệt nhanh nhiều yêu cầu; yêu cầu nào vướng luật (chồng ca, cần xác nhận lịch khách…) được báo riêng. */
  async approveMany(ids: string[], reviewer: AuthUser): Promise<{ approved: string[]; failed: { id: string; message: string }[] }> {
    const approved: string[] = [];
    const failed: { id: string; message: string }[] = [];
    for (const id of ids) {
      try {
        const r = await this.approve(id, reviewer);
        if ('warning' in r) failed.push({ id, message: r.warning });
        else approved.push(id);
      } catch (e) {
        const resp = (e as { getResponse?: () => unknown }).getResponse?.();
        const message = typeof resp === 'object' && resp && 'message' in resp ? String((resp as { message: unknown }).message) : (e as Error).message;
        failed.push({ id, message });
      }
    }
    return { approved, failed };
  }

  private async notifyManagers(title: string, body: string): Promise<void> {
    // QA 11/10: thông báo nêu rõ LOẠI yêu cầu (ca làm / xin nghỉ), ngày giờ và lý do — xem describeShiftRequests
    try {
      const managers = await this.userRepo.find({ where: { role: In([Role.OWNER, Role.RECEPTIONIST]), isActive: true } });
      for (const m of managers) {
        await this.notifications.create({ userId: m.id, type: NotificationType.SHIFT_REQUEST_NEW, title, body });
      }
    } catch (e) {
      this.logger.warn(`Không gửi được thông báo cho quản lý: ${(e as Error).message}`);
    }
  }
}

/**
 * QA 11/10 — thông báo yêu cầu ca/nghỉ cho chủ tiệm & lễ tân trước đây chỉ ghi "Yêu cầu đăng ký ca mới (Thứ 3 13/10…)",
 * không biết là xin LÀM hay xin NGHỈ, giờ nào. Giờ nêu rõ loại, ngày, khung giờ và lý do (tối đa 3 mục).
 */
export function describeShiftRequests(
  stylistName: string,
  items: { kind: ShiftRequestKind; workDate: string; startTime: string | null; endTime: string | null; note?: string | null }[],
): { title: string; body: string } {
  const shifts = items.filter((i) => i.kind === ShiftRequestKind.SHIFT).length;
  const offs = items.length - shifts;
  const title = shifts && offs ? `${stylistName} gửi ${items.length} yêu cầu ca làm & xin nghỉ`
    : shifts ? `${stylistName} đăng ký ${shifts} ca làm` : `${stylistName} xin nghỉ ${offs} ngày`;
  const line = (i: (typeof items)[number]): string => {
    const range = i.startTime && i.endTime ? `${i.startTime}–${i.endTime}` : null;
    const what = i.kind === ShiftRequestKind.SHIFT ? `Ca làm ${range ?? ''}`.trim() : range ? `Nghỉ ${range}` : 'Nghỉ cả ngày';
    const note = i.note?.trim();
    return `${shiftDayText(i.workDate)}: ${what}${note ? ` — "${note.length > 60 ? `${note.slice(0, 60)}…` : note}"` : ''}`;
  };
  const shown = items.slice(0, 3).map(line);
  if (items.length > 3) shown.push(`… và ${items.length - 3} yêu cầu khác`);
  // Cột notifications: title ≤ 160, body ≤ 500 ký tự
  return { title: title.slice(0, 160), body: `${shown.join('; ')}. Mở màn hình Ca làm để duyệt.`.slice(0, 500) };
}
