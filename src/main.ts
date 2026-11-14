import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import cookieParser from 'cookie-parser';

/**
 * Selamat Datang Contributor!
 * Code ini berisi fungsi untuk memulai aplikasi
 *
 */

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(helmet());
  app.enableCors({
    // izinkan semua origin untuk pass, backend dipakai tidak hanya untuk frontend tetapi juga spreadsheet tiket
    origin: '*',
    // izinkan 2 headers untuk pass
    allowedHeaders: ['Content-Type', 'X-Scanner-Key', 'X-App-Version'],
    // hanya izinkan 2 method untuk pass
    methods: ['GET', 'POST'],
  });
  app.use(cookieParser());
  app.use(json({ limit: '5mb' }));
  app.use(urlencoded({ limit: '5mb', extended: true }));
  await app.listen(process.env.PORT ?? 3000);
  console.log('STARTED');
}
void bootstrap();
