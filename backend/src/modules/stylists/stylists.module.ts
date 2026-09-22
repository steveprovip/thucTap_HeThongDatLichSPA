import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Stylist } from '../../database/entities/stylist.entity';
import { StylistService } from '../../database/entities/stylist-service.entity';
import { StylistShift } from '../../database/entities/stylist-shift.entity';
import { StylistTimeOff } from '../../database/entities/stylist-time-off.entity';
import { ServiceItem } from '../../database/entities/service.entity';
import { Appointment } from '../../database/entities/appointment.entity';
import { User } from '../../database/entities/user.entity';
import { StylistsService } from './stylists.service';
import { ShiftsController, StylistsController, TimeOffController } from './stylists.controller';
import { WorkingHoursModule } from '../working-hours/working-hours.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Stylist, StylistService, StylistShift, StylistTimeOff, ServiceItem, Appointment, User]),
    WorkingHoursModule,
  ],
  providers: [StylistsService],
  controllers: [StylistsController, ShiftsController, TimeOffController],
  exports: [StylistsService],
})
export class StylistsModule {}
