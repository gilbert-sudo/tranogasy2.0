import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bucket, Storage } from '@google-cloud/storage';

@Injectable()
export class FbGcsService implements OnModuleInit {
  private readonly logger = new Logger(FbGcsService.name);
  private storage: Storage | null = null;
  private bucket: Bucket | null = null;
  private bucketName = 'tranogasy-images';

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.bucketName =
      this.configService.get<string>('GCS_BUCKET_NAME')?.trim() || 'tranogasy-images';
    const projectId =
      this.configService.get<string>('GCS_PROJECT_ID')?.trim() || 'tranogasy-gilbert-414910';
    const rawJson = this.configService.get<string>('GCS_SERVICE_ACCOUNT_JSON')?.trim();

    if (!rawJson) {
      this.logger.warn('GCS_SERVICE_ACCOUNT_JSON is missing; FB image re-upload will fail.');
      return;
    }

    try {
      let cleaned = rawJson;
      if (
        (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
        (cleaned.startsWith('"') && cleaned.endsWith('"'))
      ) {
        cleaned = cleaned.slice(1, -1);
      }
      const credentials = JSON.parse(cleaned);
      if (typeof credentials.private_key === 'string') {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      }
      this.storage = new Storage({ projectId, credentials });
      this.bucket = this.storage.bucket(this.bucketName);
      this.logger.log(`Initialized GCS uploader for bucket "${this.bucketName}"`);
    } catch (error) {
      this.logger.error(`Failed to parse GCS_SERVICE_ACCOUNT_JSON: ${(error as Error).message}`);
    }
  }

  private getExtFromContentType(contentType: string, sourceUrl: string): string {
    const lower = contentType.toLowerCase();
    if (lower.includes('png')) return 'png';
    if (lower.includes('webp')) return 'webp';
    if (lower.includes('gif')) return 'gif';
    if (lower.includes('avif')) return 'avif';
    if (sourceUrl.toLowerCase().includes('.png')) return 'png';
    if (sourceUrl.toLowerCase().includes('.webp')) return 'webp';
    return 'jpg';
  }

  private async uploadSingleFbImage(
    url: string,
    idx: number,
    safePostId: string,
  ): Promise<string> {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} downloading FB image`);
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    if (!contentType.toLowerCase().startsWith('image/')) {
      throw new Error(`Unexpected content-type: ${contentType}`);
    }

    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    if (buffer.length < 500) {
      throw new Error(`Downloaded image too small (${buffer.length} bytes)`);
    }

    const ext = this.getExtFromContentType(contentType, url);
    const objectPath = `fb-ingested/${safePostId}_${Date.now()}_${idx}.${ext}`;
    const file = this.bucket!.file(objectPath);

    await file.save(buffer, {
      contentType,
      resumable: false,
      metadata: {
        cacheControl: 'public, max-age=31536000',
        metadata: {
          source: 'fb-ingestion',
          canonicalPostId: safePostId,
        },
      },
    });

    return `https://storage.googleapis.com/${this.bucketName}/${objectPath}`;
  }

  /**
   * Downloads temporary Facebook CDN photos and persists them into GCS.
   * Uses bounded concurrency (4) while preserving original photo ordering.
   */
  async reuploadFbImages(
    photoUrls: string[],
    canonicalPostId: string,
  ): Promise<{ uploadedUrls: string[]; failedCount: number; errors: string[] }> {
    const errors: string[] = [];
    let failedCount = 0;

    if (!this.bucket) {
      return {
        uploadedUrls: [],
        failedCount: photoUrls.length,
        errors: ['GCS bucket is not initialized'],
      };
    }

    const targets = photoUrls.slice(0, 12);
    const safePostId = canonicalPostId.replace(/[^a-zA-Z0-9_-]/g, '');
    const orderedResults: Array<string | null> = new Array(targets.length).fill(null);

    let nextIndex = 0;
    const workerCount = Math.min(4, targets.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (nextIndex < targets.length) {
        const idx = nextIndex++;
        try {
          orderedResults[idx] = await this.uploadSingleFbImage(targets[idx], idx, safePostId);
        } catch (err) {
          failedCount++;
          const msg = (err as Error).message;
          errors.push(msg);
          this.logger.warn(`Failed image #${idx} for post ${safePostId}: ${msg}`);
        }
      }
    });

    await Promise.all(workers);

    return {
      uploadedUrls: orderedResults.filter((u): u is string => Boolean(u)),
      failedCount,
      errors,
    };
  }

  /**
   * Deletes rejected or removed ingested images from GCS so orphaned files never accumulate.
   */
  async deleteGcsUrls(urls: string[]): Promise<number> {
    if (!this.bucket || !Array.isArray(urls) || urls.length === 0) return 0;

    const prefix = `https://storage.googleapis.com/${this.bucketName}/`;
    let deleted = 0;

    for (const url of urls) {
      if (!url || !url.startsWith(prefix)) continue;
      const objectPath = decodeURIComponent(url.slice(prefix.length).split('?')[0]);
      // Restrict automatic deletion to the ingestion prefix for safety.
      if (!objectPath.startsWith('fb-ingested/')) continue;

      try {
        await this.bucket.file(objectPath).delete({ ignoreNotFound: true });
        deleted++;
      } catch (err) {
        this.logger.warn(`Failed to delete GCS object ${objectPath}: ${(err as Error).message}`);
      }
    }

    return deleted;
  }
}

