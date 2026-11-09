import { Injectable, Inject, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { eq } from 'drizzle-orm';
import { DB } from '../../database/database.provider';
import type { Database } from '../../database/database.provider';
import { config } from '../../database/drizzle/schema';
import { Utils } from '../../utils/Utils';
import { BucketService } from '../../database/bucket.service';
import { toCallback } from '../../types/types.dto';
import { StreamableFile } from '@nestjs/common';

@Injectable()
export class ConfigsService {
  private readonly logger = new Logger(ConfigsService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly bucket: BucketService,
  ) {}

  getHomeIcon(res: Response) {
    toCallback(
      this.db
        .select({
          id: config.id,
          value: config.value,
        })
        .from(config)
        .where(eq(config.id, 'HOME_ICON')),
      (err, rows) => {
        if (err || !rows) return this.fail(res, err);
        const iconPath = rows[0].value;

        this.bucket.getObject({ key: `icon/${iconPath}` }, (err, obj) => {
          if (err || !obj)
            return Utils.response(
              res,
              HttpStatus.NOT_FOUND,
              false,
              'Ikon tidak ditemukan',
              'ICON_NOT_FOUND',
            );

          res.set({
            'Content-Type': obj.contentType,
            'Cache-Control': 'no-cache',
            ...(obj.contentLength && {
              'Content-Length': String(obj.contentLength),
            }),
            ...(obj.etag && { ETag: obj.etag }),
          });

          obj.stream.on('error', (e) => {
            this.logger.error(e.message);
            if (!res.headersSent) this.fail(res, e.message);
            else res.destroy();
          });

          obj.stream.pipe(res);
        });
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
