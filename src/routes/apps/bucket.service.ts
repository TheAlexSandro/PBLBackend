import { Injectable } from '@nestjs/common';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Callback, toCallback } from '../../types/types.dto';

export interface SignedDownloadOptions {
  key: string;
  contentType: string;
  filename: string;
  expiresIn: number;
}

@Injectable()
export class BucketService {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor() {
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env['R2_ACCESS_KEY_ID']!,
        secretAccessKey: process.env['R2_SECRET_ACCESS_KEY']!,
      },
    });
    this.bucket = process.env['R2_BUCKET']!;
  }

  getSignedDownloadUrl(
    opts: SignedDownloadOptions,
    cb: Callback<string>,
  ): void {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: opts.key,
      ResponseContentType: opts.contentType,
      ResponseContentDisposition: `attachment; filename="${opts.filename}"`,
    });

    toCallback(
      getSignedUrl(this.s3, command, { expiresIn: opts.expiresIn }),
      cb,
    );
  }
}
