import { Controller, Get, HttpStatus, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Subscription } from 'rxjs';
import { Role } from '../../common/constants/roles.constant';
import { Roles } from '../../common/decorators/roles.decorator';
import { EventsService } from './events.service';

/** Thiết bị mất kết nối không báo (ngủ máy, tắt wifi) sẽ bị dọn sau khoảng này; client tự nối lại với token mới. */
const MAX_STREAM_MS = 20 * 60_000;
const HEARTBEAT_MS = 20_000;
const MAX_CLIENTS = 200;

/**
 * Đồng bộ trực tiếp giữa các thiết bị bằng Server-Sent Events (SSE) — một chiều từ máy chủ xuống trình duyệt,
 * chạy trên HTTP thường nên đi qua Cloudflare Tunnel / Render / Koyeb được mà không cần cấu hình WebSocket.
 *
 *   GET /api/events/stream   luồng SSE (cần đăng nhập nhân viên; gửi token trong header Authorization)
 *   GET /api/events/version  dấu phiên bản dữ liệu, dùng khi luồng SSE bị chặn (chế độ hỏi định kỳ)
 */
@Controller('events')
@Roles(Role.STYLIST, Role.RECEPTIONIST, Role.OWNER, Role.ADMIN)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get('version')
  version() {
    return { version: this.events.version, bootId: this.events.bootId, seq: this.events.currentSeq };
  }

  @Get('stream')
  stream(@Req() req: Request, @Res() res: Response): void {
    if (this.events.clientCount >= MAX_CLIENTS) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        success: false,
        statusCode: 503,
        message: 'Quá nhiều thiết bị đang kết nối trực tiếp, vui lòng thử lại sau ít phút.',
      });
      return;
    }

    res.status(HttpStatus.OK);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    // no-transform: proxy/CDN không được nén hay gộp luồng; X-Accel-Buffering: nginx không đệm
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    res.write('retry: 5000\n\n');
    send('hello', { bootId: this.events.bootId, seq: this.events.currentSeq, serverTime: new Date().toISOString() });

    this.events.clientConnected();
    const sub: Subscription = this.events.stream().subscribe((e) => send('change', e));
    // Dòng bắt đầu bằng ":" là chú thích SSE: trình duyệt bỏ qua nhưng giữ cho kết nối không bị coi là rảnh
    const heartbeat = setInterval(() => res.write(': ping\n\n'), Number(process.env.SSE_HEARTBEAT_MS) || HEARTBEAT_MS);
    const lifetime = setTimeout(() => res.end(), MAX_STREAM_MS);

    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      clearTimeout(lifetime);
      sub.unsubscribe();
      this.events.clientDisconnected();
    };
    req.on('close', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);
  }
}
