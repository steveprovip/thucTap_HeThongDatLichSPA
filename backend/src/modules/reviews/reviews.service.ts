import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from '../../database/entities/review.entity';
import { Appointment, AppointmentStatus } from '../../database/entities/appointment.entity';
import { AppointmentServiceItem } from '../../database/entities/appointment-service.entity';
import { Customer } from '../../database/entities/customer.entity';
import { Stylist } from '../../database/entities/stylist.entity';
import { EmailKind } from '../../database/entities/email-queue.entity';
import { MSG } from '../../common/constants/messages.constant';
import { generateToken } from '../../common/utils/code.util';
import { formatDateVN } from '../../common/utils/time.util';
import { MailService } from '../notifications/mail.service';
import { MailTemplates } from '../notifications/mail-templates';
import { SubmitReviewDto } from './dto/review.dto';

export interface ReviewFormView {
  token: string;
  appointmentCode: string;
  customerName: string;
  stylistName: string;
  serviceNames: string[];
  dateText: string;
  alreadySubmitted: boolean;
  rating: number | null;
  comment: string | null;
}

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly mail: MailService,
    @InjectRepository(Review) private readonly repo: Repository<Review>,
    @InjectRepository(Appointment) private readonly apptRepo: Repository<Appointment>,
    @InjectRepository(AppointmentServiceItem) private readonly apptServiceRepo: Repository<AppointmentServiceItem>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Stylist) private readonly stylistRepo: Repository<Stylist>,
  ) {}

  /**
   * S4-04: lịch hẹn đóng xong thì phát sinh liên kết đánh giá dùng một lần,
   * hạn 7 ngày, và gửi email cho khách có email.
   */
  async createInvitation(appointmentId: string): Promise<Review> {
    const existing = await this.repo.findOne({ where: { appointmentId } });
    if (existing) return existing;

    const appt = await this.apptRepo.findOne({ where: { id: appointmentId } });
    if (!appt) throw new NotFoundException(MSG.APPOINTMENT_NOT_FOUND);
    if (appt.status !== AppointmentStatus.COMPLETED) {
      throw new BadRequestException(MSG.REVIEW_REQUIRES_COMPLETED);
    }

    const days = this.config.get<number>('business.reviewTokenDays')!;
    const review = await this.repo.save(
      this.repo.create({
        appointmentId,
        stylistId: appt.stylistId,
        customerId: appt.customerId,
        token: generateToken(24),
        tokenExpiresAt: new Date(Date.now() + days * 24 * 3600_000),
      }),
    );

    const customer = await this.customerRepo.findOne({ where: { id: appt.customerId } });
    if (customer?.email) {
      const stylist = await this.stylistRepo.findOne({ where: { id: appt.stylistId } });
      const services = await this.apptServiceRepo.find({ where: { appointmentId } });
      const tpl = MailTemplates.reviewInvitation(
        this.mail.salonInfo,
        {
          code: appt.code, customerName: customer.fullName, stylistName: stylist?.fullName ?? '',
          startAt: appt.startAt, endAt: appt.endAt,
          services: services.map((s) => ({
            name: s.nameSnapshot, durationMinutes: s.durationSnapshot, price: s.priceSnapshot,
          })),
          totalDuration: appt.totalDurationMinutes, estimatedTotal: appt.estimatedTotal,
        },
        review.token,
      );
      await this.mail.enqueue({
        kind: EmailKind.REVIEW_INVITATION,
        toEmail: customer.email,
        toName: customer.fullName,
        subject: tpl.subject,
        html: tpl.html,
        appointmentId,
      });
    }
    return review;
  }

  /** Mở biểu mẫu đánh giá bằng token. */
  async getByToken(token: string): Promise<ReviewFormView> {
    const review = await this.repo.findOne({ where: { token } });
    if (!review) throw new NotFoundException(MSG.REVIEW_TOKEN_INVALID);
    if (review.tokenExpiresAt < new Date() && !review.submittedAt) {
      throw new BadRequestException(MSG.REVIEW_TOKEN_EXPIRED);
    }

    const appt = await this.apptRepo.findOne({ where: { id: review.appointmentId } });
    const customer = await this.customerRepo.findOne({ where: { id: review.customerId } });
    const stylist = await this.stylistRepo.findOne({ where: { id: review.stylistId } });
    const services = await this.apptServiceRepo.find({ where: { appointmentId: review.appointmentId } });

    return {
      token: review.token,
      appointmentCode: appt?.code ?? '',
      customerName: customer?.fullName ?? '',
      stylistName: stylist?.fullName ?? '',
      serviceNames: services.map((s) => s.nameSnapshot),
      dateText: appt ? formatDateVN(appt.startAt) : '',
      alreadySubmitted: !!review.submittedAt,
      rating: review.rating,
      comment: review.comment,
    };
  }

  /** Liên kết chỉ dùng được một lần. */
  async submit(token: string, dto: SubmitReviewDto): Promise<ReviewFormView> {
    const review = await this.repo.findOne({ where: { token } });
    if (!review) throw new NotFoundException(MSG.REVIEW_TOKEN_INVALID);
    if (review.submittedAt) throw new BadRequestException(MSG.REVIEW_TOKEN_USED);
    if (review.tokenExpiresAt < new Date()) throw new BadRequestException(MSG.REVIEW_TOKEN_EXPIRED);

    review.rating = dto.rating;
    review.comment = dto.comment?.trim() || null;
    review.submittedAt = new Date();
    await this.repo.save(review);
    return this.getByToken(token);
  }

  /** Khách tra cứu bằng mã cũng mở được biểu mẫu đánh giá (S4-04). */
  async getByAppointmentCode(code: string): Promise<ReviewFormView> {
    const appt = await this.apptRepo.findOne({ where: { code: code.trim().toUpperCase() } });
    if (!appt) throw new NotFoundException(MSG.CODE_NOT_FOUND);
    if (appt.status !== AppointmentStatus.COMPLETED) {
      throw new BadRequestException(MSG.REVIEW_REQUIRES_COMPLETED);
    }
    const review = await this.repo.findOne({ where: { appointmentId: appt.id } })
      ?? await this.createInvitation(appt.id);
    return this.getByToken(review.token);
  }

  /**
   * S4-04: điểm trung bình chỉ hiển thị khi có tối thiểu 5 lượt đánh giá,
   * dưới ngưỡng ghi "Chưa đủ dữ liệu".
   */
  async stylistRatings(): Promise<{
    stylistId: string; stylistName: string; reviewCount: number;
    avgRating: number | null; display: string;
  }[]> {
    const min = this.config.get<number>('business.minReviewsToShowAvg')!;
    const stylists = await this.stylistRepo.find({ order: { fullName: 'ASC' } });
    const rows = await this.repo
      .createQueryBuilder('r')
      .select('r.stylist_id', 'stylistId')
      .addSelect('COUNT(*)', 'cnt')
      .addSelect('AVG(r.rating)', 'avg')
      .where('r.submitted_at IS NOT NULL AND r.rating IS NOT NULL')
      .groupBy('r.stylist_id')
      .getRawMany<{ stylistId: string; cnt: string; avg: string }>();
    const map = new Map(rows.map((r) => [r.stylistId, { cnt: Number(r.cnt), avg: Number(r.avg) }]));

    return stylists.map((s) => {
      const r = map.get(s.id);
      const count = r?.cnt ?? 0;
      const avg = r ? Math.round(r.avg * 10) / 10 : null;
      return {
        stylistId: s.id,
        stylistName: s.fullName,
        reviewCount: count,
        avgRating: count >= min ? avg : null,
        display: count >= min ? `${avg?.toFixed(1)} / 5` : MSG.NOT_ENOUGH_REVIEWS,
      };
    });
  }

  async listForStylist(stylistId: string, limit = 50): Promise<Review[]> {
    return this.repo.find({
      where: { stylistId },
      order: { submittedAt: 'DESC' },
      take: limit,
    });
  }
}
