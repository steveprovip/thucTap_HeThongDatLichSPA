import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RateLimit } from '../../database/entities/rate-limit.entity';
import { RateLimitService } from './rate-limit.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([RateLimit])],
  providers: [RateLimitService],
  exports: [RateLimitService],
})
export class RateLimitModule {}
