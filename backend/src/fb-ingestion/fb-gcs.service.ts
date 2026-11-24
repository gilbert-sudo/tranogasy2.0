import * as crypto from 'crypto';
import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bucket, Storage } from '@google-cloud/storage';
import sharp from 'sharp';

export interface ImageContactBox {
  ymin: number; // 0..1000
  xmin: number; // 0..1000
  ymax: number; // 0..1000
  xmax: number; // 0..1000
}

export interface ImageContactRedactionSpec {
  imageIndex: number;
  isFullContactCard?: boolean;
  boxes?: ImageContactBox[];
}

export interface VisionInlineImage {
  index: number;
  mimeType: string;
  base64Data: string;
}

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

  /**
   * Downloads up to `maxImages` photos and downscales them to compact 768px JPEGs
   * for low-token multimodal Gemini Vision OCR + property quality analysis.
   */
  async fetchVisionInlineImages(
    photoUrls: string[],
    maxImages = 4,
  ): Promise<VisionInlineImage[]> {
    if (!Array.isArray(photoUrls) || photoUrls.length === 0) return [];
    const targets = photoUrls.slice(0, Math.max(1, Math.min(5, maxImages)));
    const results: Array<VisionInlineImage | null> = await Promise.all(
      targets.map(async (url, index) => {
        try {
          const res = await fetch(url, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
              Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            },
            signal: AbortSignal.timeout(10000),
          });
          if (!res.ok) return null;
          const contentType = (res.headers.get('content-type') || 'image/jpeg').toLowerCase();
          if (!contentType.startsWith('image/')) return null;

          const rawBuf = Buffer.from(await res.arrayBuffer());
          if (rawBuf.length < 500) return null;

          try {
            const resized = await sharp(rawBuf)
              .rotate()
              .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
              .jpeg({ quality: 78 })
              .toBuffer();
            return {
              index,
              mimeType: 'image/jpeg',
              base64Data: resized.toString('base64'),
            };
          } catch {
            // Fallback if buffer is a synthetic test image that sharp cannot decode
            return null;
          }
        } catch {
          return null;
        }
      }),
    );

    return results.filter((item): item is VisionInlineImage => Boolean(item));
  }

  /**
   * Server-side irreversible pixel redaction of phone numbers / contact watermarks on property photos.
   * Crops each detected contact bounding box (0..1000 scale), applies a heavy blur + dark frosted mask,
   * and composites it back onto the image so public users cannot inspect or download unblurred contacts.
   */
  async redactImageBuffer(
    buffer: Buffer,
    spec?: ImageContactRedactionSpec,
  ): Promise<{ buffer: Buffer; redacted: boolean; mimeType?: string }> {
    if (
      !spec ||
      (!spec.isFullContactCard && (!Array.isArray(spec.boxes) || spec.boxes.length === 0))
    ) {
      return { buffer, redacted: false };
    }

    try {
      const baseImg = sharp(buffer).rotate();
      const meta = await baseImg.metadata();
      const imgW = meta.width || 0;
      const imgH = meta.height || 0;
      if (imgW < 16 || imgH < 16) {
        return { buffer, redacted: false };
      }

      if (spec.isFullContactCard) {
        const blurredFull = await baseImg
          .blur(32)
          .modulate({ brightness: 0.55 })
          .jpeg({ quality: 84 })
          .toBuffer();
        return { buffer: blurredFull, redacted: true, mimeType: 'image/jpeg' };
      }

      const normBuf = await baseImg.toBuffer();
      const overlays: Array<{ input: Buffer; left: number; top: number }> = [];

      for (const box of spec.boxes || []) {
        const ymin = Math.max(0, Math.min(1000, Number(box.ymin) || 0));
        const xmin = Math.max(0, Math.min(1000, Number(box.xmin) || 0));
        const ymax = Math.max(0, Math.min(1000, Number(box.ymax) || 0));
        const xmax = Math.max(0, Math.min(1000, Number(box.xmax) || 0));
        if (ymax <= ymin || xmax <= xmin) continue;

        // Add a 2% safety margin around the detected phone digits
        const padY = 20;
        const padX = 20;
        const y0 = Math.max(0, ymin - padY);
        const x0 = Math.max(0, xmin - padX);
        const y1 = Math.min(1000, ymax + padY);
        const x1 = Math.min(1000, xmax + padX);

        const left = Math.max(0, Math.floor((x0 / 1000) * imgW));
        const top = Math.max(0, Math.floor((y0 / 1000) * imgH));
        const width = Math.min(imgW - left, Math.ceil(((x1 - x0) / 1000) * imgW));
        const height = Math.min(imgH - top, Math.ceil(((y1 - y0) / 1000) * imgH));

        if (width < 4 || height < 4) continue;

        const patch = await sharp(normBuf)
          .extract({ left, top, width, height })
          .blur(26)
          .modulate({ brightness: 0.42 })
          .toBuffer();

        overlays.push({ input: patch, left, top });
      }

      if (overlays.length === 0) {
        return { buffer, redacted: false };
      }

      const redactedBuffer = await sharp(normBuf)
        .composite(overlays)
        .jpeg({ quality: 86 })
        .toBuffer();

      return { buffer: redactedBuffer, redacted: true, mimeType: 'image/jpeg' };
    } catch (err) {
      this.logger.warn(`Image contact redaction skipped: ${(err as Error).message}`);
      return { buffer, redacted: false };
    }
  }

  private async uploadSingleFbImage(
    url: string,
    idx: number,
    safePostId: string,
    redactionSpec?: ImageContactRedactionSpec,
  ): Promise<{ url: string; redacted: boolean }> {
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

    let contentType = res.headers.get('content-type') || 'image/jpeg';
    if (!contentType.toLowerCase().startsWith('image/')) {
      throw new Error(`Unexpected content-type: ${contentType}`);
    }

    const arrayBuf = await res.arrayBuffer();
    let buffer: Buffer = Buffer.from(arrayBuf);
    if (buffer.length < 500) {
      throw new Error(`Downloaded image too small (${buffer.length} bytes)`);
    }

    let redacted = false;
    if (redactionSpec) {
      const redResult = await this.redactImageBuffer(buffer, redactionSpec);
      buffer = redResult.buffer;
      redacted = redResult.redacted;
      if (redResult.mimeType) {
        contentType = redResult.mimeType;
      }
    }

    const ext = redacted ? 'jpg' : this.getExtFromContentType(contentType, url);
    const objectPath = `fb-ingested/${safePostId}_${Date.now()}_${idx}${redacted ? '_redacted' : ''}.${ext}`;
    const file = this.bucket!.file(objectPath);

    await file.save(buffer, {
      contentType,
      resumable: false,
      metadata: {
        cacheControl: 'public, max-age=31536000',
        metadata: {
          source: 'fb-ingestion',
          canonicalPostId: safePostId,
          contactRedacted: String(redacted),
        },
      },
    });

    return {
      url: `https://storage.googleapis.com/${this.bucketName}/${objectPath}`,
      redacted,
    };
  }

  /**
   * Downloads temporary Facebook CDN photos, applies server-side contact redaction
   * where Gemini Vision detected watermarked phone numbers, reorders the best cover
   * photo to #1, and persists them into GCS.
   */
  async reuploadFbImages(
    photoUrls: string[],
    canonicalPostId: string,
    options?: {
      redactions?: ImageContactRedactionSpec[];
      recommendedCoverIndex?: number | null;
    },
  ): Promise<{
    uploadedUrls: string[];
    failedCount: number;
    redactedCount: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let failedCount = 0;
    let redactedCount = 0;

    if (!this.bucket) {
      return {
        uploadedUrls: [],
        failedCount: photoUrls.length,
        redactedCount: 0,
        errors: ['GCS bucket is not initialized'],
      };
    }

    const targets = photoUrls.slice(0, 12);
    const safePostId = canonicalPostId.replace(/[^a-zA-Z0-9_-]/g, '');
    const orderedResults: Array<{ url: string; index: number; isFullCard: boolean } | null> =
      new Array(targets.length).fill(null);

    const redactionMap = new Map<number, ImageContactRedactionSpec>();
    for (const r of options?.redactions || []) {
      if (typeof r?.imageIndex === 'number') {
        redactionMap.set(r.imageIndex, r);
      }
    }

    let nextIndex = 0;
    const workerCount = Math.min(4, targets.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (nextIndex < targets.length) {
        const idx = nextIndex++;
        const spec = redactionMap.get(idx);
        try {
          const uploaded = await this.uploadSingleFbImage(
            targets[idx],
            idx,
            safePostId,
            spec,
          );
          if (uploaded.redacted) redactedCount++;
          orderedResults[idx] = {
            url: uploaded.url,
            index: idx,
            isFullCard: Boolean(spec?.isFullContactCard),
          };
        } catch (err) {
          failedCount++;
          const msg = (err as Error).message;
          errors.push(msg);
          this.logger.warn(`Failed image #${idx} for post ${safePostId}: ${msg}`);
        }
      }
    });

    await Promise.all(workers);

    const validItems = orderedResults.filter(
      (item): item is { url: string; index: number; isFullCard: boolean } => Boolean(item),
    );

    // Promote the recommended cover photo to #1 (if valid and not a full contact card),
    // and push full contact cards to the end of the gallery.
    const recIdx = options?.recommendedCoverIndex;
    const coverCandidate =
      typeof recIdx === 'number' && recIdx > 0
        ? validItems.find((item) => item.index === recIdx && !item.isFullCard)
        : undefined;

    const reordered: string[] = [];
    if (coverCandidate) {
      reordered.push(coverCandidate.url);
    }
    for (const item of validItems) {
      if (coverCandidate && item.index === coverCandidate.index) continue;
      if (!item.isFullCard) {
        reordered.push(item.url);
      }
    }
    for (const item of validItems) {
      if (item.isFullCard) {
        reordered.push(item.url);
      }
    }

    return {
      uploadedUrls: reordered,
      failedCount,
      redactedCount,
      errors,
    };
  }

  isPermanentGcsUrl(url?: string | null): boolean {
    if (!url || typeof url !== 'string') return false;
    return url.startsWith(`https://storage.googleapis.com/${this.bucketName}/`);
  }

  /**
   * Downloads a temporary Facebook profile avatar and persists it permanently in GCS
   * under `fb-avatars/` (kept separate from `fb-ingested/` so rejecting one candidate
   * never deletes a shared publisher avatar used by other listings).
   */
  async reuploadFbAvatar(
    avatarUrl?: string | null,
    authorKey?: string | null,
  ): Promise<string | null> {
    if (!avatarUrl || !/^https?:\/\//i.test(avatarUrl)) return null;
    if (this.isPermanentGcsUrl(avatarUrl)) return avatarUrl;
    if (!this.bucket) return null;

    const safeKey =
      (authorKey || `avatar_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) ||
      `avatar_${Date.now()}`;

    try {
      // Reuse already cached GCS avatar if we previously uploaded it for this FB user ID
      if (authorKey) {
        const [existingFiles] = await this.bucket.getFiles({
          prefix: `fb-avatars/${safeKey}.`,
          maxResults: 1,
        });
        if (existingFiles && existingFiles.length > 0) {
          return `https://storage.googleapis.com/${this.bucketName}/${existingFiles[0].name}`;
        }
      }

      const res = await fetch(avatarUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(12000),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} downloading FB avatar`);
      }

      const contentType = res.headers.get('content-type') || 'image/jpeg';
      if (!contentType.toLowerCase().startsWith('image/')) {
        throw new Error(`Unexpected avatar content-type: ${contentType}`);
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 300) {
        throw new Error(`Downloaded avatar too small (${buffer.length} bytes)`);
      }

      const ext = this.getExtFromContentType(contentType, avatarUrl);
      const objectPath = `fb-avatars/${safeKey}.${ext}`;
      const file = this.bucket.file(objectPath);

      await file.save(buffer, {
        contentType,
        resumable: false,
        metadata: {
          cacheControl: 'public, max-age=31536000',
          metadata: {
            source: 'fb-avatar',
            authorKey: safeKey,
          },
        },
      });

      return `https://storage.googleapis.com/${this.bucketName}/${objectPath}`;
    } catch (err) {
      this.logger.warn(`Failed avatar re-upload for ${safeKey}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Uploads an image sent from the standalone Admin console directly to GCS under `fb-ingested/`.
   */
  async uploadAdminImage(input: {
    dataUrl?: string;
    base64?: string;
    mimeType?: string;
    fileName?: string;
  }): Promise<{ imageUrl: string; fileName: string }> {
    if (!this.bucket) {
      throw new BadRequestException('GCS bucket is not initialized on the backend');
    }

    let rawBase64 = (input?.base64 || '').trim();
    let mimeType = (input?.mimeType || '').trim().toLowerCase();

    if (!rawBase64 && input?.dataUrl) {
      const match = String(input.dataUrl).match(/^data:([^;]+);base64,(.+)$/i);
      if (!match) {
        throw new BadRequestException('Format dataUrl invalide');
      }
      mimeType = mimeType || match[1].toLowerCase();
      rawBase64 = match[2];
    }

    if (!rawBase64) {
      throw new BadRequestException('Contenu image requis');
    }

    if (mimeType && !mimeType.startsWith('image/')) {
      throw new BadRequestException(`Type de fichier non supporté: ${mimeType}`);
    }

    const rawBuffer = Buffer.from(rawBase64, 'base64');
    if (rawBuffer.length < 100) {
      throw new BadRequestException('Image invalide ou vide');
    }
    if (rawBuffer.length > 8 * 1024 * 1024) {
      throw new BadRequestException('Image trop volumineuse (max 8 Mo)');
    }

    let outputBuffer: Buffer;
    try {
      outputBuffer = await sharp(rawBuffer)
        .rotate()
        .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 84, mozjpeg: true })
        .toBuffer();
    } catch (err) {
      throw new BadRequestException(
        `Impossible de décoder l'image : ${(err as Error).message}`,
      );
    }

    const suffix = crypto.randomBytes(6).toString('hex');
    const objectPath = `fb-ingested/admin_${Date.now()}_${suffix}.jpg`;
    const file = this.bucket.file(objectPath);

    await file.save(outputBuffer, {
      contentType: 'image/jpeg',
      resumable: false,
      metadata: {
        cacheControl: 'public, max-age=31536000',
        metadata: {
          source: 'admin-manual-upload',
          originalName: String(input?.fileName || 'upload.jpg').slice(0, 120),
        },
      },
    });

    return {
      imageUrl: `https://storage.googleapis.com/${this.bucketName}/${objectPath}`,
      fileName: objectPath,
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

