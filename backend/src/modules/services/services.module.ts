import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceCategory } from '../../database/entities/service-category.entity';
import { ServiceItem } from '../../database/entities/service.entity';
import { StylistService } from '../../database/entities/stylist-service.entity';
import { AppointmentServiceItem } from '../../database/entities/appointment-service.entity';
import { ServicesService } from './services.service';
import { ServiceCategoriesController, ServicesController } from './services.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceCategory, ServiceItem, StylistService, AppointmentServiceItem])],
  providers: [ServicesService],
  controllers: [ServiceCategoriesController, ServicesController],
  exports: [ServicesService],
})
export class ServicesModule {}
