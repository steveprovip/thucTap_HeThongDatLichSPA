import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShiftRequest } from '../../database/entities/shift-request.entity';
import { Stylist } from '../../database/entities/stylist.entity';
import { User } from '../../database/entities/user.entity';
import { StylistsModule } from '../stylists/stylists.module';
import { ShiftRequestsService } from './shift-requests.service';
import { ShiftRequestsController } from './shift-requests.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ShiftRequest, Stylist, User]), StylistsModule],
  providers: [ShiftRequestsService],
  controllers: [ShiftRequestsController],
  exports: [ShiftRequestsService],
})
export class ShiftRequestsModule {}
