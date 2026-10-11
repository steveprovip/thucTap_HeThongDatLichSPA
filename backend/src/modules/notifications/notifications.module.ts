import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from '../../database/entities/notification.entity';
import { EmailQueueItem } from '../../database/entities/email-queue.entity';
import { Stylist } from '../../database/entities/stylist.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { MailService } from './mail.service';
import { EmailQueueService } from './email-queue.service';
import { EventDispatcherService } from './event-dispatcher.service';
import { DispatchController } from './dispatch.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Notification, EmailQueueItem, Stylist])],
  providers: [NotificationsService, MailService, EmailQueueService, EventDispatcherService],
  controllers: [NotificationsController, DispatchController],
  exports: [NotificationsService, MailService, EmailQueueService, EventDispatcherService],
})
export class NotificationsModule {}
