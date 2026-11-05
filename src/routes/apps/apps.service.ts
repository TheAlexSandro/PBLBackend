import { HttpStatus, Injectable, Logger, Inject } from '@nestjs/common';
import type { Response } from 'express';
import { Utils } from '../../utils/Utils';
import { BucketService } from './bucket.service';
import { DB } from '../../database/database.provider';
import type { Database } from '../../database/database.provider';
import { config } from '../../database/drizzle/schema';
import { toCallback } from '../../types/types.dto';
import { eq, or } from 'drizzle-orm';

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
        .select({
          id: config.id,
          value: config.value,
        })
        .from(config)
        .where(or(eq(config.id, 'APP_VER'), eq(config.id, 'APP_DESC'))),

      (err, rows) => {
        if (err || !rows) return this.fail(res, err);

        const version = rows.find((row) => row.id === 'APP_VER');
        const description = rows.find((row) => row.id === 'APP_DESC');

        const info = {
          latestVersion: version?.value ?? '',
          description: description?.value ?? '',
          url: process.env['DOWNLOAD_URL'] ?? '',
        };

        return void res.status(HttpStatus.OK).json({
          status_code: HttpStatus.OK,
          ok: true,
          error_code: null,
          message: null,
          result: info,
          ...info,
        });
      },
    );
  }

  download(res: Response): void {
    toCallback(
      this.db
        .select({
          id: config.id,
          value: config.value,
        })
        .from(config)
        .where(eq(config.id, 'APP_VER')),
      (err, rows) => {
        if (err || !rows) return this.fail(res, err);

        const filename = `${process.env['R2_APK_KEY']}-v${rows[0]?.value}.apk`;

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
            return Utils.response(res, HttpStatus.OK, true, null, null, {
              url,
            });
          },
        );
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
