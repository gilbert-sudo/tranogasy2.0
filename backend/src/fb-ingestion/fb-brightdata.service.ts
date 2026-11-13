import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrightDataPostRecord } from './fb-dedup.util';

export interface BrightDataTriggerTarget {
  url: string;
  num_of_posts: number;
  posts_to_not_include?: string[];
}

export interface BrightDataSnapshotMeta {
  id: string;
  dataset_id: string;
  status: string;
  dataset_size?: number;
  created?: string;
}

@Injectable()
export class FbBrightDataService {
  private readonly logger = new Logger(FbBrightDataService.name);
  private readonly baseUrl = 'https://api.brightdata.com/datasets/v3';

  constructor(private readonly configService: ConfigService) {}

  private getApiKey(): string {
    const key = this.configService.get<string>('BRIGHT_DATA_API_KEY')?.trim();
    if (!key) {
      throw new Error('BRIGHT_DATA_API_KEY is not configured in .env');
    }
    return key;
  }

  private getDatasetId(): string {
    return (
      this.configService.get<string>('BRIGHT_DATA_DATASET_ID')?.trim() ||
      'gd_lz11l67o2cb3r0lkj3'
    );
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.getApiKey()}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Lists existing Bright Data snapshots for this dataset so admins can inspect or re-import them.
   */
  async listSnapshots(limit = 20): Promise<BrightDataSnapshotMeta[]> {
    const datasetId = this.getDatasetId();
    const res = await fetch(`${this.baseUrl}/snapshots?dataset_id=${encodeURIComponent(datasetId)}`, {
      headers: this.getHeaders(),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Bright Data listSnapshots failed (${res.status}): ${txt}`);
    }
    const data = (await res.json()) as BrightDataSnapshotMeta[];
    return Array.isArray(data) ? data.slice(0, limit) : [];
  }

  /**
   * Triggers an asynchronous Bright Data collection batch across active groups.
   */
  async triggerCollection(targets: BrightDataTriggerTarget[]): Promise<string> {
    if (targets.length === 0) {
      throw new Error('No active target groups to scrape');
    }

    const datasetId = this.getDatasetId();
    const payload = targets.map((t) => ({
      url: t.url,
      num_of_posts: Math.max(1, Math.min(200, Math.round(t.num_of_posts))),
      ...(t.posts_to_not_include && t.posts_to_not_include.length > 0
        ? { posts_to_not_include: t.posts_to_not_include.slice(-50) }
        : {}),
    }));

    const res = await fetch(
      `${this.baseUrl}/trigger?dataset_id=${encodeURIComponent(datasetId)}&include_errors=true`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Bright Data trigger failed (${res.status}): ${txt}`);
    }

    const data = (await res.json()) as { snapshot_id?: string };
    if (!data.snapshot_id) {
      throw new Error(`Bright Data trigger returned no snapshot_id: ${JSON.stringify(data)}`);
    }

    this.logger.log(`Triggered Bright Data snapshot ${data.snapshot_id} for ${targets.length} groups`);
    return data.snapshot_id;
  }

  /**
   * Polls Bright Data until the snapshot reaches `ready` (or throws on failure/timeout).
   */
  async waitForSnapshot(
    snapshotId: string,
    maxWaitMs = 600000,
    onProgress?: (info: { elapsedSec: number; status: string }) => Promise<void> | void,
  ): Promise<void> {
    const startedAt = Date.now();
    const deadline = startedAt + maxWaitMs;
    let consecutiveCheckErrors = 0;

    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${this.baseUrl}/progress/${encodeURIComponent(snapshotId)}`, {
          headers: this.getHeaders(),
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`Bright Data progress check failed (${res.status}): ${txt}`);
        }
        consecutiveCheckErrors = 0;

        const statusData = (await res.json()) as { status?: string; errors?: number };
        const status = (statusData.status || '').toLowerCase();

        if (status === 'ready') {
          if (onProgress) {
            await onProgress({
              elapsedSec: Math.round((Date.now() - startedAt) / 1000),
              status: 'ready',
            });
          }
          return;
        }
        if (status === 'failed' || status === 'canceled') {
          throw new Error(`Bright Data snapshot ${snapshotId} ended with status: ${status}`);
        }

        if (onProgress) {
          await onProgress({
            elapsedSec: Math.round((Date.now() - startedAt) / 1000),
            status: status || 'running',
          });
        }
      } catch (err) {
        const msg = (err as Error).message;
        // Re-throw terminal snapshot status failures immediately; tolerate up to 3 transient network glitches.
        if (msg.includes('ended with status:')) {
          throw err;
        }
        consecutiveCheckErrors++;
        this.logger.warn(
          `Transient Bright Data progress poll error (${consecutiveCheckErrors}/3) for ${snapshotId}: ${msg}`,
        );
        if (consecutiveCheckErrors >= 3) {
          throw err;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 6000));
    }

    throw new Error(`Timed out waiting for Bright Data snapshot ${snapshotId} after ${Math.round(maxWaitMs / 1000)}s`);
  }

  /**
   * Downloads JSON records from a ready Bright Data snapshot.
   */
  async downloadSnapshot(snapshotId: string): Promise<BrightDataPostRecord[]> {
    const res = await fetch(
      `${this.baseUrl}/snapshot/${encodeURIComponent(snapshotId)}?format=json`,
      {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(60000),
      },
    );
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Bright Data snapshot download failed (${res.status}): ${txt}`);
    }

    const text = await res.text();
    const trimmed = text.trim();
    if (!trimmed) return [];

    // Bright Data can return either a JSON array or NDJSON lines depending on dataset size.
    if (trimmed.startsWith('[')) {
      return JSON.parse(trimmed) as BrightDataPostRecord[];
    }
    return trimmed
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as BrightDataPostRecord);
  }
}

