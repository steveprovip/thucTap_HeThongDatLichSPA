import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalonWorkingHour } from '../../database/entities/salon-working-hour.entity';
import { SalonHoliday } from '../../database/entities/salon-holiday.entity';
import { Appointment } from '../../database/entities/appointment.entity';
import { WorkingHoursService } from './working-hours.service';
import { HolidaysController, WorkingHoursController } from './working-hours.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SalonWorkingHour, SalonHoliday, Appointment])],
  providers: [WorkingHoursService],
  controllers: [WorkingHoursController, HolidaysController],
  exports: [WorkingHoursService],
})
export class WorkingHoursModule {}
