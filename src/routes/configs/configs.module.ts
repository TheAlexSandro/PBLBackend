import { Module } from '@nestjs/common';
import { ConfigsController } from './configs.controller';
import { ConfigsService } from './configs.service';
import { BucketService } from '../../database/bucket.service';

@Module({
  controllers: [ConfigsController],
  providers: [ConfigsService, BucketService],
})
export class ConfigsModule {}
