import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

import { ReleaseModule } from './release/release.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ScannerModule } from './scanner/scanner.module.js';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ReleaseModule,
    PrismaModule,
    ScannerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
