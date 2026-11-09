import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './filters/exceptions.filter';
import { DatabaseModule } from './database/database.module';
import { TicketsModule } from './routes/tickets/tickets.module';
import { AppsModule } from './routes/apps/apps.module';
import { ConfigsModule } from './routes/configs/configs.module';

@Module({
  imports: [DatabaseModule, TicketsModule, AppsModule, ConfigsModule],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
