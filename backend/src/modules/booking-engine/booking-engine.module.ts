import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from '../../database/entities/appointment.entity';
import { AppointmentServiceItem } from '../../database/entities/appointment-service.entity';
import { AppointmentChange } from '../../database/entities/appointment-change.entity';
import { Customer } from '../../database/entities/customer.entity';
import { Stylist } from '../../database/entities/stylist.entity';
import { ServiceItem } from '../../database/entities/service.entity';
import { ServiceCategory } from '../../database/entities/service-category.entity';
import { StylistService } from '../../database/entities/stylist-service.entity';
import { AvailabilityService } from './availability.service';
import { BookingService } from './booking.service';
import { AppointmentsService } from './appointments.service';
import { PublicBookingController } from './public-booking.controller';
import { AppointmentsController } from './appointments.controller';
import { StylistsModule } from '../stylists/stylists.module';
import { CustomersModule } from '../customers/customers.module';
import { WorkingHoursModule } from '../working-hours/working-hours.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Appointment, AppointmentServiceItem, AppointmentChange,
      Customer, Stylist, ServiceItem, ServiceCategory, StylistService,
    ]),
    StylistsModule,
    CustomersModule,
    WorkingHoursModule,
  ],
  providers: [AvailabilityService, BookingService, AppointmentsService],
  controllers: [PublicBookingController, AppointmentsController],
  exports: [AvailabilityService, BookingService, AppointmentsService],
})
export class BookingEngineModule {}
