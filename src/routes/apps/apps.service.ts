import { HttpStatus, Injectable, Logger, Inject } from '@nestjs/common';
import type { Response } from 'express';
import { Utils } from '../../utils/Utils';
import { BucketService } from './bucket.service';
import { DB } from '../../database/database.provider';
import type { Database } from '../../database/database.provider';
import { config } from '../../database/drizzle/schema';
import { toCallback } from '../../types/types.dto';
import { eq } from 'drizzle-orm';

const APK_CONTENT_TYPE = 'application/vnd.android.package-archive';
const URL_EXPIRES_IN = 3600;

@Injectable()
export class AppsService {
  private readonly logger = new Logger(AppsService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly bucket: BucketService,
  ) {}

  version(res: Response): void {
    toCallback(
      this.db
        .select({ value: config.value })
        .from(config)
        .where(eq(config.id, 'APP_VER'))
        .limit(1),
      (err, rows) => {
        if (err || !rows) return this.fail(res, err);
        return Utils.response(res, HttpStatus.OK, true, null, null, {
          latestVersion: rows[0]?.value,
          description: process.env['DESC']!,
          url: process.env['DOWNLOAD_URL']!,
        });
      },
    );
  }

  download(res: Response): void {
    const filename = `${process.env['R2_APK_KEY']}-v${process.env['LATEST_VERSION']}.apk`;

    this.bucket.getSignedDownloadUrl(
      {
        key: filename,
        contentType: APK_CONTENT_TYPE,
        filename,
        expiresIn: URL_EXPIRES_IN,
      },
      (err, url) => {
        if (err || !url) {
          this.logger.error(`Gagal membuat signed URL: ${err}`);
          return Utils.response(
            res,
            HttpStatus.INTERNAL_SERVER_ERROR,
            false,
            'Gagal membuat link download',
            'INTERNAL_SERVER_ERROR',
          );
        }
        return Utils.response(res, HttpStatus.OK, true, null, null, { url });
      },
    );
  }

  private fail(res: Response, error: string | null): void {
    this.logger.error(error ?? 'Unknown error');
    return Utils.response(
      res,
      HttpStatus.INTERNAL_SERVER_ERROR,
      false,
      'Terjadi kesalahan pada server',
      'INTERNAL_SERVER_ERROR',
    );
  }
}
