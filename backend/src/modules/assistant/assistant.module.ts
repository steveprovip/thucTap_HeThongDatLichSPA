import { Module } from '@nestjs/common';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { StylistsModule } from '../stylists/stylists.module';
import { WorkingHoursModule } from '../working-hours/working-hours.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  imports: [RateLimitModule, StylistsModule, WorkingHoursModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
