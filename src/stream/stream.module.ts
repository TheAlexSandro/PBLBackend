import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { StreamController } from './stream.controller';
import { StreamGateway } from './stream.gateway';
import { StreamService } from './stream.service';
import { ScannerKeyGuard } from '../routes/tickets/tickets.guard';
import { AppVersionService } from '../routes/tickets/app-version.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env['STREAM_JWT_SECRET'];
        if (!secret || secret.length < 32) {
          throw new Error('Invalid stream jwt');
        }
        return { secret, signOptions: { algorithm: 'HS256' as const } };
      },
    }),
  ],
  controllers: [StreamController],
  providers: [StreamGateway, StreamService, ScannerKeyGuard, AppVersionService],
})
export class StreamModule {}
