import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from '../../database/entities/invoice.entity';
import { InvoiceItem } from '../../database/entities/invoice-item.entity';
import { Voucher } from '../../database/entities/voucher.entity';
import { Appointment } from '../../database/entities/appointment.entity';
import { AppointmentServiceItem } from '../../database/entities/appointment-service.entity';
import { Customer } from '../../database/entities/customer.entity';
import { Stylist } from '../../database/entities/stylist.entity';
import { InvoicesService } from './invoices.service';
import { InvoicesController, VouchersController } from './invoices.controller';
import { ReviewsModule } from '../reviews/reviews.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Invoice, InvoiceItem, Voucher, Appointment, AppointmentServiceItem, Customer, Stylist,
    ]),
    ReviewsModule,
  ],
  providers: [InvoicesService],
  controllers: [InvoicesController, VouchersController],
  exports: [InvoicesService],
})
export class InvoicesModule {}
