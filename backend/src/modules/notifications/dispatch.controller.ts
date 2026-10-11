import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.constant';
import { EventDispatcherService } from './event-dispatcher.service';

/** Nghiệm thu thông báo đa kênh khi chưa có tài khoản Zalo ZNS / SMS: xem 50 sự kiện đã phát gần nhất (kênh mock + webhook). */
@Controller('dispatch')
export class DispatchController {
  constructor(private readonly dispatcher: EventDispatcherService) {}

  @Get('recent')
  @Roles(Role.OWNER, Role.ADMIN)
  recent() {
    return this.dispatcher.recent();
  }
}
