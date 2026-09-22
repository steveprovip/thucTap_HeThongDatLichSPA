import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { MSG } from '../constants/messages.constant';

interface PgError extends Error {
  code?: string;
  constraint?: string;
  detail?: string;
}

/** Ánh xạ lỗi ràng buộc của PostgreSQL sang thông điệp tiếng Việt rõ nghĩa. */
const mapDbError = (err: PgError): { status: number; message: string; field?: string } | null => {
  switch (err.code) {
    case '23505': // unique_violation
      if (err.constraint?.includes('users_email') || err.constraint === 'ux_users_email')
        return { status: HttpStatus.CONFLICT, message: MSG.EMAIL_DUPLICATED, field: 'email' };
      if (err.constraint === 'ux_service_name')
        return { status: HttpStatus.CONFLICT, message: MSG.SERVICE_NAME_DUPLICATED, field: 'name' };
      if (err.constraint === 'ux_category_name')
        return { status: HttpStatus.CONFLICT, message: MSG.CATEGORY_NAME_DUPLICATED, field: 'name' };
      if (err.constraint === 'ux_customers_phone')
        return { status: HttpStatus.CONFLICT, message: 'Số điện thoại đã tồn tại trong hệ thống', field: 'phone' };
      if (err.constraint === 'ux_invoice_appointment_primary')
        return { status: HttpStatus.CONFLICT, message: MSG.INVOICE_EXISTS };
      return { status: HttpStatus.CONFLICT, message: 'Dữ liệu bị trùng với một bản ghi đã có' };

    case '23P01': // exclusion_violation
      if (err.constraint === 'appointments_no_overlap')
        return { status: HttpStatus.CONFLICT, message: MSG.SLOT_TAKEN };
      if (err.constraint === 'stylist_shifts_no_overlap')
        return { status: HttpStatus.CONFLICT, message: MSG.SHIFT_OVERLAP };
      if (err.constraint === 'salon_holidays_no_overlap')
        return { status: HttpStatus.CONFLICT, message: 'Khoảng ngày nghỉ bị chồng lấn với một khai báo đã có' };
      return { status: HttpStatus.CONFLICT, message: 'Khoảng thời gian bị chồng lấn với một bản ghi đã có' };

    case '23514': // check_violation
      if (err.constraint === 'services_duration_range' || err.constraint === 'services_duration_step')
        return { status: HttpStatus.BAD_REQUEST, message: MSG.SERVICE_DURATION_INVALID, field: 'durationMinutes' };
      if (err.constraint === 'services_price_range')
        return { status: HttpStatus.BAD_REQUEST, message: MSG.SERVICE_PRICE_INVALID, field: 'price' };
      if (err.constraint === 'swh_min_60m')
        return { status: HttpStatus.BAD_REQUEST, message: MSG.WORKING_HOURS_MIN_60, field: 'closeTime' };
      if (err.constraint === 'customers_phone_format')
        return { status: HttpStatus.BAD_REQUEST, message: MSG.PHONE_INVALID, field: 'phone' };
      if (err.constraint === 'invoice_transfer_note')
        return { status: HttpStatus.BAD_REQUEST, message: MSG.TRANSFER_NOTE_REQUIRED, field: 'transferNote' };
      return { status: HttpStatus.BAD_REQUEST, message: MSG.VALIDATION_FAILED };

    case '23503': // foreign_key_violation
      return { status: HttpStatus.CONFLICT, message: 'Dữ liệu đang được tham chiếu ở nơi khác nên không xoá được' };

    case '40001': // serialization_failure
      return { status: HttpStatus.CONFLICT, message: MSG.SLOT_TAKEN };

    default:
      return null;
  }
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = MSG.INTERNAL_ERROR;
    let field: string | undefined;
    let errors: Record<string, string> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        message = (r.message as string | string[]) ?? exception.message;
        field = r.field as string | undefined;
        errors = r.errors as Record<string, string> | undefined;
      }
    } else if (exception instanceof QueryFailedError) {
      const mapped = mapDbError(exception.driverError as PgError);
      if (mapped) {
        status = mapped.status;
        message = mapped.message;
        field = mapped.field;
      } else {
        this.logger.error(`DB error: ${exception.message}`, exception.stack);
      }
    } else if (exception instanceof Error) {
      const mapped = mapDbError(exception as PgError);
      if (mapped) {
        status = mapped.status;
        message = mapped.message;
        field = mapped.field;
      } else {
        this.logger.error(exception.message, exception.stack);
      }
    }

    if (status >= 500) {
      this.logger.error(`${request.method} ${request.url} -> ${status}`);
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message: Array.isArray(message) ? message[0] : message,
      messages: Array.isArray(message) ? message : undefined,
      field,
      errors,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
