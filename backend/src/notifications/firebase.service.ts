import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as http2 from 'http2';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getMessaging, SendResponse } from 'firebase-admin/messaging';

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
  imageUrl?: string;
}

const RAW_APNS_HEX_REGEX = /^[a-fA-F0-9]{64}$/;

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private firebaseApp: App | null = null;
  private cachedApnsJwt: { token: string; issuedAtSec: number } | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    const existingApps = getApps();
    if (existingApps.length > 0) {
      this.firebaseApp = existingApps[0];
      this.logger.log('Firebase Admin already initialized.');
      return;
    }

    try {
      // 1. Try full JSON string from environment variable (FIREBASE_SERVICE_ACCOUNT_JSON)
      const jsonEnv = this.configService.get<string>(
        'FIREBASE_SERVICE_ACCOUNT_JSON',
      );
      if (jsonEnv) {
        const serviceAccount = JSON.parse(jsonEnv);
        this.firebaseApp = initializeApp({
          credential: cert(serviceAccount),
          projectId: serviceAccount.project_id,
        });
        this.logger.log(
          `Firebase Admin initialized successfully from environment variable for project: ${serviceAccount.project_id}`,
        );
        return;
      }

      // 2. Try individual environment variables
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.configService.get<string>(
        'FIREBASE_CLIENT_EMAIL',
      );
      const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

      if (projectId && clientEmail && privateKey) {
        const formattedKey = privateKey.replace(/\\n/g, '\n');
        this.firebaseApp = initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey: formattedKey,
          }),
          projectId,
        });
        this.logger.log(
          `Firebase Admin initialized successfully using environment credentials for project: ${projectId}`,
        );
        return;
      }

      this.logger.warn(
        'Firebase service account credentials not found in environment variables (FIREBASE_SERVICE_ACCOUNT_JSON). Web/Android FCM push will be disabled until configured.',
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to initialize Firebase Admin: ${error.message}`,
        error.stack,
      );
    }
  }

  isReady(): boolean {
    return this.firebaseApp !== null;
  }

  private getApnsConfig(): {
    keyId: string;
    teamId: string;
    bundleId: string;
    privateKeyPem: string;
    host: string;
  } | null {
    const keyId = this.configService.get<string>('APNS_KEY_ID')?.trim();
    const rawKey = this.configService.get<string>('APNS_PRIVATE_KEY_P8')?.trim();
    if (!keyId || !rawKey) {
      return null;
    }

    const teamId =
      this.configService.get<string>('APNS_TEAM_ID')?.trim() || 'SFRD9ZT2DQ';
    const bundleId =
      this.configService.get<string>('APNS_BUNDLE_ID')?.trim() ||
      'mg.tranogasy.app';
    const isSandbox =
      this.configService.get<string>('APNS_SANDBOX')?.toLowerCase() === 'true';

    let privateKeyPem = rawKey.replace(/\\n/g, '\n');
    if (!privateKeyPem.includes('BEGIN PRIVATE KEY')) {
      try {
        const decoded = Buffer.from(rawKey, 'base64').toString('utf8');
        if (decoded.includes('BEGIN PRIVATE KEY')) {
          privateKeyPem = decoded;
        }
      } catch {
        // Keep rawKey as-is
      }
    }

    return {
      keyId,
      teamId,
      bundleId,
      privateKeyPem,
      host: isSandbox
        ? 'https://api.sandbox.push.apple.com'
        : 'https://api.push.apple.com',
    };
  }

  isApnsReady(): boolean {
    return this.getApnsConfig() !== null;
  }

  private getOrCreateApnsJwt(
    keyId: string,
    teamId: string,
    privateKeyPem: string,
  ): string {
    const nowSec = Math.floor(Date.now() / 1000);
    // Refresh every 45 minutes (Apple allows up to 60 minutes)
    if (
      this.cachedApnsJwt &&
      nowSec - this.cachedApnsJwt.issuedAtSec < 45 * 60
    ) {
      return this.cachedApnsJwt.token;
    }

    const header = Buffer.from(
      JSON.stringify({ alg: 'ES256', kid: keyId }),
      'utf8',
    ).toString('base64url');
    const claims = Buffer.from(
      JSON.stringify({ iss: teamId, iat: nowSec }),
      'utf8',
    ).toString('base64url');
    const signingInput = `${header}.${claims}`;

    const signature = crypto
      .sign('sha256', Buffer.from(signingInput, 'utf8'), {
        key: privateKeyPem,
        dsaEncoding: 'ieee-p1363',
      })
      .toString('base64url');

    const jwt = `${signingInput}.${signature}`;
    this.cachedApnsJwt = { token: jwt, issuedAtSec: nowSec };
    return jwt;
  }

  private isApnsToken(token: string): boolean {
    return token.startsWith('apns:') || RAW_APNS_HEX_REGEX.test(token);
  }

  private stripApnsPrefix(token: string): string {
    return token.startsWith('apns:') ? token.slice(5) : token;
  }

  private sendSingleApnsNotification(
    client: http2.ClientHttp2Session,
    hexToken: string,
    jwt: string,
    bundleId: string,
    bodyStr: string,
  ): Promise<{ ok: boolean; status: number; reason?: string }> {
    return new Promise((resolve) => {
      try {
        const req = client.request({
          ':method': 'POST',
          ':path': `/3/device/${hexToken}`,
          authorization: `bearer ${jwt}`,
          'apns-topic': bundleId,
          'apns-push-type': 'alert',
          'apns-priority': '10',
          'content-type': 'application/json',
        });

        let status = 0;
        let responseBody = '';

        req.setEncoding('utf8');
        req.on('response', (headers) => {
          status = Number(headers[':status'] || 0);
        });
        req.on('data', (chunk) => {
          responseBody += chunk;
        });
        req.on('end', () => {
          if (status === 200) {
            resolve({ ok: true, status });
            return;
          }
          let reason = responseBody;
          try {
            const parsed = JSON.parse(responseBody);
            if (parsed?.reason) reason = parsed.reason;
          } catch {
            // Keep raw text
          }
          resolve({ ok: false, status, reason });
        });
        req.on('error', (err) => {
          resolve({ ok: false, status: 0, reason: err.message });
        });

        req.end(bodyStr);
      } catch (err: any) {
        resolve({ ok: false, status: 0, reason: err.message });
      }
    });
  }

  private async sendToApnsTokens(
    apnsTokens: string[],
    payload: PushNotificationPayload,
    stringData: Record<string, string>,
  ): Promise<{
    successCount: number;
    failureCount: number;
    invalidTokens: string[];
    apnsConfigured: boolean;
  }> {
    const apnsConfig = this.getApnsConfig();
    if (!apnsConfig) {
      this.logger.warn(
        `APNs credentials (APNS_KEY_ID / APNS_PRIVATE_KEY_P8) not configured; skipping ${apnsTokens.length} iOS APNs token(s).`,
      );
      return {
        successCount: 0,
        failureCount: apnsTokens.length,
        invalidTokens: [],
        apnsConfigured: false,
      };
    }

    let jwt: string;
    try {
      jwt = this.getOrCreateApnsJwt(
        apnsConfig.keyId,
        apnsConfig.teamId,
        apnsConfig.privateKeyPem,
      );
    } catch (err: any) {
      this.logger.error(`Failed to sign APNs JWT: ${err.message}`);
      return {
        successCount: 0,
        failureCount: apnsTokens.length,
        invalidTokens: [],
        apnsConfigured: true,
      };
    }

    const bodyStr = JSON.stringify({
      aps: {
        alert: {
          title: payload.title,
          body: payload.body,
        },
        sound: 'default',
      },
      ...stringData,
    });

    const invalidTokens: string[] = [];
    let successCount = 0;
    let failureCount = 0;

    const client = http2.connect(apnsConfig.host);
    client.on('error', (err) => {
      this.logger.warn(`APNs HTTP/2 connection error: ${err.message}`);
    });

    try {
      const results = await Promise.all(
        apnsTokens.map(async (rawToken) => {
          const hexToken = this.stripApnsPrefix(rawToken);
          const result = await this.sendSingleApnsNotification(
            client,
            hexToken,
            jwt,
            apnsConfig.bundleId,
            bodyStr,
          );
          return { rawToken, result };
        }),
      );

      for (const { rawToken, result } of results) {
        if (result.ok) {
          successCount += 1;
        } else {
          failureCount += 1;
          if (
            result.status === 410 ||
            result.reason === 'Unregistered' ||
            result.reason === 'BadDeviceToken'
          ) {
            invalidTokens.push(rawToken);
          }
          this.logger.warn(
            `APNs send error (${result.status}) for [${rawToken.substring(0, 14)}...]: ${result.reason || 'unknown'}`,
          );
        }
      }

      this.logger.log(
        `APNs result: ${successCount} sent, ${failureCount} failed (${invalidTokens.length} pruned).`,
      );
    } finally {
      client.close();
    }

    return {
      successCount,
      failureCount,
      invalidTokens,
      apnsConfigured: true,
    };
  }

  /**
   * Sends a push notification to one or more device tokens:
   * - `apns:<hex>` (or 64-char hex) tokens are sent directly via Apple APNs HTTP/2
   * - All other tokens are sent via Firebase Cloud Messaging (Web & Android)
   */
  async sendToTokens(
    tokens: string[],
    payload: PushNotificationPayload,
  ): Promise<{
    successCount: number;
    failureCount: number;
    invalidTokens: string[];
    apnsConfigured?: boolean;
  }> {
    if (!tokens || tokens.length === 0) {
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    const uniqueTokens = Array.from(new Set(tokens.filter(Boolean)));
    if (uniqueTokens.length === 0) {
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    const apnsTokens = uniqueTokens.filter((t) => this.isApnsToken(t));
    const fcmTokens = uniqueTokens.filter((t) => !this.isApnsToken(t));

    const stringData: Record<string, string> = {};
    if (payload.data) {
      for (const [key, val] of Object.entries(payload.data)) {
        stringData[key] =
          typeof val === 'string' ? val : JSON.stringify(val);
      }
    }

    const invalidTokens: string[] = [];
    let successCount = 0;
    let failureCount = 0;
    let apnsConfigured: boolean | undefined;

    // 1. Send to iOS APNs tokens directly via HTTP/2
    if (apnsTokens.length > 0) {
      const apnsRes = await this.sendToApnsTokens(
        apnsTokens,
        payload,
        stringData,
      );
      successCount += apnsRes.successCount;
      failureCount += apnsRes.failureCount;
      invalidTokens.push(...apnsRes.invalidTokens);
      apnsConfigured = apnsRes.apnsConfigured;
    }

    // 2. Send to Web & Android FCM tokens via Firebase Admin SDK
    if (fcmTokens.length > 0 && this.isReady()) {
      try {
        const messaging = getMessaging(this.firebaseApp!);
        const response = await messaging.sendEachForMulticast({
          tokens: fcmTokens,
          notification: {
            title: payload.title,
            body: payload.body,
            imageUrl: payload.imageUrl,
          },
          data: stringData,
          webpush: {
            notification: {
              title: payload.title,
              body: payload.body,
              icon: '/icon-logo.png',
              badge: '/icon-logo.png',
            },
            fcmOptions: {
              link: stringData.url || '/',
            },
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
              },
            },
          },
        });

        successCount += response.successCount;
        failureCount += response.failureCount;

        response.responses.forEach((resp: SendResponse, idx: number) => {
          if (!resp.success) {
            const errorCode = resp.error?.code;
            if (
              errorCode === 'messaging/registration-token-not-registered' ||
              errorCode === 'messaging/invalid-registration-token'
            ) {
              invalidTokens.push(fcmTokens[idx]);
            }
            this.logger.warn(
              `FCM send error for token [${fcmTokens[idx].substring(0, 12)}...]: ${resp.error?.message}`,
            );
          }
        });

        this.logger.log(
          `FCM Multicast result: ${response.successCount} sent, ${response.failureCount} failed.`,
        );
      } catch (err: any) {
        this.logger.error(`Error sending FCM message: ${err.message}`, err.stack);
        failureCount += fcmTokens.length;
      }
    }

    return { successCount, failureCount, invalidTokens, apnsConfigured };
  }
}
