import { Injectable } from '@nestjs/common';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Callback, toCallback } from '../types/types.dto';
import type { Readable } from 'stream';

export interface SignedDownloadOptions {
  key: string;
  contentType: string;
  expiresIn: number;
}

export interface GetObjectOptions {
  key: string;
}

export interface BucketObject {
  stream: Readable;
  contentType: string;
  contentLength?: number;
  etag?: string;
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
      ResponseContentDisposition: `attachment; filename="${opts.key}"`,
    });

    toCallback(
      getSignedUrl(this.s3, command, { expiresIn: opts.expiresIn }),
      cb,
    );
  }

  getObject(opts: GetObjectOptions, cb: Callback<BucketObject>): void {
    toCallback(this.fetchObject(opts.key), cb);
  }

  private async fetchObject(key: string): Promise<BucketObject> {
    const res = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    return {
      stream: res.Body as Readable,
      contentType: res.ContentType ?? 'application/octet-stream',
      contentLength: res.ContentLength,
      etag: res.ETag,
    };
  }
}
