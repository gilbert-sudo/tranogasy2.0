import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getMessaging, SendResponse } from 'firebase-admin/messaging';
import * as path from 'path';
import * as fs from 'fs';

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
  imageUrl?: string;
}

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private firebaseApp: App | null = null;

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
      // 1. Try file-based credentials
      const configuredPath = this.configService.get<string>(
        'FIREBASE_SERVICE_ACCOUNT_PATH',
      );
      const possiblePaths = [
        configuredPath,
        path.resolve(process.cwd(), 'firebase-service-account.json'),
        path.resolve(
          process.cwd(),
          '../tranogasy-3400-firebase-adminsdk-fbsvc-da42a1cf3d.json',
        ),
      ].filter(Boolean) as string[];

      for (const filePath of possiblePaths) {
        if (fs.existsSync(filePath)) {
          const serviceAccount = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          this.firebaseApp = initializeApp({
            credential: cert(serviceAccount),
            projectId: serviceAccount.project_id,
          });
          this.logger.log(
            `Firebase Admin initialized successfully using service account file: ${filePath}`,
          );
          return;
        }
      }

      // 2. Try raw JSON string in environment variable
      const jsonEnv = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
      if (jsonEnv) {
        const serviceAccount = JSON.parse(jsonEnv);
        this.firebaseApp = initializeApp({
          credential: cert(serviceAccount),
          projectId: serviceAccount.project_id,
        });
        this.logger.log(
          `Firebase Admin initialized successfully using FIREBASE_SERVICE_ACCOUNT_JSON for project: ${serviceAccount.project_id}`,
        );
        return;
      }

      // 3. Try individual environment variables
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
        'Firebase service account credentials not found. Push notifications will be disabled until credentials are configured.',
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

  /**
   * Sends a push notification to one or more FCM device tokens.
   * Returns list of invalid/expired tokens that should be cleaned up.
   */
  async sendToTokens(
    tokens: string[],
    payload: PushNotificationPayload,
  ): Promise<{
    successCount: number;
    failureCount: number;
    invalidTokens: string[];
  }> {
    if (!this.isReady() || !tokens || tokens.length === 0) {
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    const uniqueTokens = Array.from(new Set(tokens.filter(Boolean)));
    if (uniqueTokens.length === 0) {
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    const invalidTokens: string[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Convert data values to strings as required by FCM
    const stringData: Record<string, string> = {};
    if (payload.data) {
      for (const [key, val] of Object.entries(payload.data)) {
        stringData[key] =
          typeof val === 'string' ? val : JSON.stringify(val);
      }
    }

    try {
      const messaging = getMessaging(this.firebaseApp!);
      const response = await messaging.sendEachForMulticast({
        tokens: uniqueTokens,
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
      });

      successCount = response.successCount;
      failureCount = response.failureCount;

      response.responses.forEach((resp: SendResponse, idx: number) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          if (
            errorCode === 'messaging/registration-token-not-registered' ||
            errorCode === 'messaging/invalid-registration-token'
          ) {
            invalidTokens.push(uniqueTokens[idx]);
          }
          this.logger.warn(
            `FCM send error for token [${uniqueTokens[idx].substring(0, 12)}...]: ${resp.error?.message}`,
          );
        }
      });

      this.logger.log(
        `FCM Multicast result: ${successCount} sent, ${failureCount} failed (${invalidTokens.length} pruned).`,
      );
    } catch (err: any) {
      this.logger.error(`Error sending FCM message: ${err.message}`, err.stack);
    }

    return { successCount, failureCount, invalidTokens };
  }
}
