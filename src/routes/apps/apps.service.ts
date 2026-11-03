import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Utils } from '../../utils/Utils';
import { BucketService } from './bucket.service';

const APK_CONTENT_TYPE = 'application/vnd.android.package-archive';
const URL_EXPIRES_IN = 3600;

@Injectable()
export class AppsService {
  private readonly logger = new Logger(AppsService.name);

  constructor(private readonly bucket: BucketService) {}

  version(res: Response): void {
    return Utils.response(res, HttpStatus.OK, true, null, null, {
      latestVersion: process.env['LATEST_VERSION']!,
      description: process.env['DESC']!,
      url: process.env['DOWNLOAD_URL']!,
    });
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
}
