import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { Public } from './common/decorators/public.decorator';

/**
 * GET /health — dùng cho launcher (scripts\windows\run_project.bat/.sh) và giám sát.
 *   200 { status: 'ok' }        : API chạy VÀ truy vấn được CSDL
 *   503 { status: 'degraded' }  : API chạy nhưng CSDL chưa sẵn sàng
 * Launcher chỉ mở trình duyệt khi nhận 200, nên không bao giờ mở giao diện khi API
 * chưa dùng được.
 */
@Controller('health')
@Public()
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check(@Res({ passthrough: true }) res: Response) {
    let db: 'up' | 'down' = 'down';
    try {
      await this.dataSource.query('SELECT 1');
      db = 'up';
    } catch {
      db = 'down';
    }
    if (db === 'down') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      database: db,
      timezone: process.env.TZ,
      time: new Date().toISOString(),
    };
  }
}
