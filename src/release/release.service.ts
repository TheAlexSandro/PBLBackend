import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class ReleaseService {
  private readonly s3: S3Client;

  constructor(private readonly config: ConfigService) {
    const accountId = this.config.getOrThrow<string>('R2_ACCOUNT_ID');
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('R2_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow<string>('R2_SECRET_ACCESS_KEY'),
      },
    });
  }

  async getApkDownloadUrl(): Promise<string> {
    const key = this.config.getOrThrow<string>('R2_APK_KEY');
    const filename = `${key}-v${this.config.getOrThrow<string>('LATEST_VERSION')}.apk`;

    const command = new GetObjectCommand({
      Bucket: this.config.getOrThrow<string>('R2_BUCKET'),
      Key: filename,
      ResponseContentType: 'application/vnd.android.package-archive',
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    });

    return getSignedUrl(this.s3, command, { expiresIn: 3600 });
  }
}
