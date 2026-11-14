import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as crypto from 'crypto';
import { Model } from 'mongoose';
import { normalizeMalagasyPhone, resolveAuthSecret } from '../common/phone.util';
import {
  OtpVerification,
  OtpVerificationDocument,
} from './schemas/otp-verification.schema';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private cachedToken: string | null = null;
  private tokenExpiry = 0;

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(OtpVerification.name)
    private readonly otpModel: Model<OtpVerificationDocument>,
  ) {}

  private hashOtp(phone: string, code: string): string {
    const secret = resolveAuthSecret(
      this.configService.get<string>('AUTH_TOKEN_SECRET') ||
        this.configService.get<string>('JWT_SECRET'),
      this.configService.get<string>('DATABASE_URI'),
    );
    return crypto.createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex');
  }

  /**
   * Generates a 5-digit OTP, stores its salted hash for 10 minutes, and dispatches SMS.
   */
  async requestAuthOtp(rawPhone: string): Promise<{
    success: boolean;
    phone: string;
    provider: string;
  }> {
    const standardPhone = normalizeMalagasyPhone(rawPhone);
    if (!standardPhone || !/^03[2-9]\d{7}$/.test(standardPhone)) {
      throw new BadRequestException(
        'Veuillez saisir un numéro Malagasy valide (ex: 034 XX XXX XX).',
      );
    }

    const code = String(crypto.randomInt(10000, 100000));
    const codeHash = this.hashOtp(standardPhone, code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.otpModel.findOneAndUpdate(
      { phone: standardPhone },
      {
        $set: {
          phone: standardPhone,
          codeHash,
          attempts: 0,
          expiresAt,
          verifiedAt: null,
        },
      },
      { upsert: true, new: true },
    );

    try {
      const result = await this.sendSMS(
        standardPhone,
        `Votre code de confirmation TranoGasy est le : ${code}`,
      );
      return {
        success: true,
        phone: standardPhone,
        provider: result.provider,
      };
    } catch (error) {
      // Remove undelivered OTP challenge so user isn't locked behind an unsent code
      await this.otpModel.deleteOne({ phone: standardPhone }).catch(() => {});
      throw new BadRequestException(
        "Impossible d'envoyer le code de vérification par SMS. Veuillez réessayer.",
      );
    }
  }

  /**
   * Verifies a 5-digit OTP server-side and consumes the challenge upon success.
   */
  async verifyAuthOtp(rawPhone: string, rawCode: string): Promise<string> {
    const standardPhone = normalizeMalagasyPhone(rawPhone);
    if (!standardPhone) {
      throw new BadRequestException('Numéro de téléphone invalide.');
    }

    const cleanCode = String(rawCode || '').replace(/\D/g, '');
    if (cleanCode.length !== 5) {
      throw new BadRequestException('Veuillez saisir les 5 chiffres du code de vérification.');
    }

    const record = await this.otpModel.findOne({ phone: standardPhone });
    if (!record || record.verifiedAt || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException(
        'Code expiré ou introuvable. Veuillez demander un nouveau code par SMS.',
      );
    }

    if ((record.attempts || 0) >= 5) {
      throw new UnauthorizedException(
        'Trop de tentatives incorrectes. Veuillez demander un nouveau code.',
      );
    }

    const expectedHash = this.hashOtp(standardPhone, cleanCode);
    const actualBuf = Buffer.from(record.codeHash, 'utf8');
    const expectedBuf = Buffer.from(expectedHash, 'utf8');
    const isMatch =
      actualBuf.length === expectedBuf.length && crypto.timingSafeEqual(actualBuf, expectedBuf);

    if (!isMatch) {
      await this.otpModel.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
      throw new UnauthorizedException(
        'Code de vérification incorrect. Veuillez vérifier le code reçu par SMS.',
      );
    }

    await this.otpModel.deleteOne({ _id: record._id });
    return standardPhone;
  }

  private getBefianaApiKey(): string {
    return (
      this.configService.get<string>('BEFIANA_API_KEY') ||
      process.env.BEFIANA_API_KEY ||
      ''
    );
  }

  private getMapiCredentials(): { username: string; password: string } {
    const username =
      this.configService.get<string>('MAPI_USERNAME') ||
      process.env.MAPI_USERNAME ||
      '';
    const password =
      this.configService.get<string>('MAPI_PASSWORD') ||
      process.env.MAPI_PASSWORD ||
      '';
    return { username, password };
  }

  /**
   * Provider 1: Befiana SMS API
   */
  async sendBefianaSMS(
    phoneNumber: string,
    message: string,
  ): Promise<{ provider: string; success: boolean; data: any }> {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const phoneWithoutZero = cleanPhone.replace(/^0+/, '');
    const apiKey = this.getBefianaApiKey();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch('https://api.befiana.cloud/api/smsko/v1/send/', {
        method: 'POST',
        headers: {
          Authorization: apiKey,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone_number: phoneWithoutZero,
          message,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const json = await res.json().catch(() => ({}));
      this.logger.log(`Befiana SMS dispatched (HTTP ${res.status})`);

      if (!res.ok || json.error || json.status === false) {
        throw new Error(json.error || `Befiana SMS failed with HTTP ${res.status}`);
      }

      return { provider: 'befiana', success: true, data: json };
    } catch (error: any) {
      clearTimeout(timeoutId);
      this.logger.error(`Befiana SMS error: ${error.message}`);
      throw new Error(
        error.name === 'AbortError' ? 'Befiana request timeout (8s)' : error.message,
      );
    }
  }

  /**
   * MAPI Login helper
   */
  private async loginMAPI(): Promise<string> {
    const { username, password } = this.getMapiCredentials();
    const form = new FormData();
    form.append('Username', username);
    form.append('Password', password);

    const res = await fetch('https://messaging.mapi.mg/api/authentication/login', {
      method: 'POST',
      body: form,
    });

    const data: any = await res.json().catch(() => ({}));
    if (!data?.status || !data?.token) {
      throw new Error(`Failed to get MAPI token: ${JSON.stringify(data)}`);
    }

    this.cachedToken = data.token;
    this.tokenExpiry = Date.now() + 14 * 60 * 1000;
    return data.token;
  }

  private async getValidMapiToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.tokenExpiry) {
      return this.cachedToken;
    }
    return this.loginMAPI();
  }

  private async logoutMAPI(token: string): Promise<void> {
    try {
      await fetch('https://messaging.mapi.mg/api/authentication/logout', {
        method: 'POST',
        headers: { Authorization: token },
      });
      this.cachedToken = null;
      this.tokenExpiry = 0;
    } catch (err: any) {
      this.logger.warn(`MAPI logout warning: ${err.message}`);
    }
  }

  /**
   * Provider 2: MAPI Provider
   */
  async sendMapiSMS(
    phoneNumber: string,
    message: string,
  ): Promise<{ provider: string; success: boolean; data: any }> {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const phoneWithoutZero = cleanPhone.replace(/^0+/, '');
    const token = await this.getValidMapiToken();

    const form = new FormData();
    form.append('Recipient', phoneWithoutZero);
    form.append('Message', message);
    form.append('Channel', 'sms');

    try {
      const res = await fetch('https://messaging.mapi.mg/api/msg/send', {
        method: 'POST',
        headers: { Authorization: token },
        body: form,
      });

      const json = await res.json().catch(() => ({}));
      this.logger.log(`MAPI SMS dispatched (HTTP ${res.status})`);

      // Logout after sending as in the original service
      await this.logoutMAPI(token);

      if (!res.ok || json.status === false) {
        throw new Error(
          json.result || json.message || `MAPI SMS failed with HTTP ${res.status}`,
        );
      }

      return { provider: 'mapi', success: true, data: json };
    } catch (error: any) {
      await this.logoutMAPI(token);
      this.logger.error(`MAPI SMS error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Combined sendSMS: Try Befiana first, fallback to MAPI
   */
  async sendSMS(
    phoneNumber: string,
    message: string,
  ): Promise<{ provider: string; success: boolean; data: any }> {
    try {
      return await this.sendBefianaSMS(phoneNumber, message);
    } catch (err: any) {
      this.logger.warn(`Befiana failed or timed out (${err.message}), switching to MAPI...`);
      try {
        return await this.sendMapiSMS(phoneNumber, message);
      } catch (fallbackError: any) {
        this.logger.error(`Both SMS providers failed: ${fallbackError.message}`);
        throw new Error(
          `All SMS providers failed: Befiana (${err.message}), MAPI (${fallbackError.message})`,
        );
      }
    }
  }
}
