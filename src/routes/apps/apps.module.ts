import { Module } from '@nestjs/common';
import { AppsController } from './apps.controller';
import { AppsService } from './apps.service';
import { BucketService } from './bucket.service';

@Module({
  controllers: [AppsController],
  providers: [AppsService, BucketService],
})
export class AppsModule {}
