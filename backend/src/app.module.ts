import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import { buildTypeOrmOptions } from './config/database.config';
import { buildStaticOptions } from './config/static.config';

import { AuditModule } from './modules/audit/audit.module';
import { RateLimitModule } from './modules/rate-limit/rate-limit.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ServicesModule } from './modules/services/services.module';
import { WorkingHoursModule } from './modules/working-hours/working-hours.module';
import { StylistsModule } from './modules/stylists/stylists.module';
import { ShiftRequestsModule } from './modules/shift-requests/shift-requests.module';
import { CustomersModule } from './modules/customers/customers.module';
import { BookingEngineModule } from './modules/booking-engine/booking-engine.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { EventsModule } from './modules/events/events.module';
import { HealthController } from './health.controller';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { MustChangePasswordGuard } from './common/guards/must-change-password.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { RealtimeInterceptor } from './modules/events/realtime.interceptor';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { AssistantModule } from './modules/assistant/assistant.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], envFilePath: ['.env'] }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildTypeOrmOptions(config),
    }),
    ServeStaticModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildStaticOptions(config),
    }),

    AuditModule,
    RateLimitModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    ServicesModule,
    WorkingHoursModule,
    StylistsModule,
    ShiftRequestsModule,
    CustomersModule,
    BookingEngineModule,
    ReviewsModule,
    InvoicesModule,
    AnalyticsModule,
    EventsModule,
    MaintenanceModule,
    AssistantModule,
  ],
  controllers: [HealthController],
  providers: [
    // Mặc định MỌI endpoint đều yêu cầu đăng nhập; endpoint công khai phải gắn @Public()
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: MustChangePasswordGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
    // Sau mỗi thao tác ghi thành công: báo cho các thiết bị khác tải lại (đồng bộ trực tiếp, xem modules/events)
    { provide: APP_INTERCEPTOR, useClass: RealtimeInterceptor },
  ],
})
export class AppModule {}
