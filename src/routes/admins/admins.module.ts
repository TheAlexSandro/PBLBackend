import { Module } from '@nestjs/common';
import { AdminController } from './admins.controller';
import { AdminService } from './admins.service';
import { AuthGuard } from '../../filters/auth.guard';

@Module({
  controllers: [AdminController],
  providers: [AdminService, AuthGuard],
})
export class AdminsModule {}
