import { Controller, Get, Redirect } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReleaseService } from './release.service.js';

@Controller('app')
export class ReleaseController {
  constructor(
    private readonly release: ReleaseService,
    private readonly config: ConfigService,
  ) {}

  @Get('version')
  version() {
    return {
      latestVersion: this.config.getOrThrow<string>('LATEST_VERSION'),
      description: 'Perbaikan bug dan peningkatan sensitivitas scan.',
      url: `${this.config.getOrThrow<string>('DOWNLOAD_URL')}`,
    };
  }

  @Get('download')
  async download() {
    const url = await this.release.getApkDownloadUrl();
    return { url };
  }
}
