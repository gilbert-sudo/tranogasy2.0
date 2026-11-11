import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { Payment, PaymentDocument } from './schemas/payment.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

export const MIN_JP_TOKENS = 100;
export const MAX_JP_TOKENS = 1_000_000;
export const ARIARY_PER_JP = 10; // 100 JP = 1,000 Ar

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly configService: ConfigService,
  ) {}

  private get papiKey(): string {
    const key = this.configService.get<string>('PAPI_API_KEY');
    if (!key) {
      throw new BadRequestException(
        'La clé API Papi (PAPI_API_KEY) n’est pas configurée dans le fichier .env.',
      );
    }
    return key;
  }

  private get webhookSecret(): string {
    return this.configService.get<string>('PAPI_WEBHOOK_SECRET') || '';
  }

  private get papiBaseUrl(): string {
    return (
      this.configService.get<string>('PAPI_BASE_URL') ||
      'https://app.papi.mg/engine/api'
    );
  }

  private get frontendUrl(): string {
    return (
      this.configService.get<string>('FRONTEND_URL') ||
      'https://tranogasy2.vercel.app'
    );
  }

  private get apiPublicUrl(): string {
    return (
      this.configService.get<string>('API_PUBLIC_URL') ||
      'https://tranogasy2-api.onrender.com'
    );
  }

  private normalizeMadagascarPhone(rawPhone: string): string {
    let cleaned = String(rawPhone || '').replace(/\D/g, '');
    if (cleaned.startsWith('261') && cleaned.length >= 12) {
      cleaned = cleaned.slice(3);
    }
    if (!cleaned.startsWith('0') && cleaned.length === 9) {
      cleaned = `0${cleaned}`;
    }
    return cleaned;
  }

  // =========================================================================
  // PAPI INTEGRATION METHODS
  // =========================================================================

  /**
   * Creates a secure Papi payment link supporting all 4 methods:
   * MVola, Orange Money, Airtel Money, and Visa/Mastercard (BRED).
   */
  async createPapiPaymentLink(dto: {
    userId?: string;
    userPhone?: string;
    tokens: number;
    clientName?: string;
    payerEmail?: string;
    payerPhone?: string;
    successUrl?: string;
    failureUrl?: string;
  }) {
    const tokens = Number(dto.tokens);
    if (
      !Number.isFinite(tokens) ||
      !Number.isInteger(tokens) ||
      tokens < MIN_JP_TOKENS
    ) {
      throw new BadRequestException(
        `L'achat minimum est de ${MIN_JP_TOKENS} JP (${(MIN_JP_TOKENS * ARIARY_PER_JP).toLocaleString('fr-FR')} Ar).`,
      );
    }
    if (tokens > MAX_JP_TOKENS) {
      throw new BadRequestException(
        `Le montant maximum par transaction est de ${MAX_JP_TOKENS.toLocaleString('fr-FR')} JP.`,
      );
    }

    const amount = tokens * ARIARY_PER_JP;

    let user: UserDocument | null = null;
    if (dto.userId && Types.ObjectId.isValid(dto.userId)) {
      user = await this.userModel.findById(dto.userId).exec();
    }
    if (!user && dto.userPhone) {
      const cleanUserPhone = this.normalizeMadagascarPhone(dto.userPhone);
      const altPhone = cleanUserPhone.startsWith('0')
        ? cleanUserPhone.slice(1)
        : `0${cleanUserPhone}`;
      user = await this.userModel
        .findOne({
          $or: [
            { phone: cleanUserPhone },
            { phone: altPhone },
            { phone: dto.userPhone },
          ],
        })
        .exec();
    }

    if (!user) {
      throw new NotFoundException(
        'Utilisateur introuvable. Veuillez vous connecter.',
      );
    }

    const ref = `JP-PAPI-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const clientName = dto.clientName || user.username || 'Client TranoGasy';
    const payerEmail = dto.payerEmail || user.email || undefined;
    const payerPhone = dto.payerPhone
      ? this.normalizeMadagascarPhone(dto.payerPhone)
      : user.phone
        ? this.normalizeMadagascarPhone(user.phone)
        : undefined;

    const successUrl =
      dto.successUrl ||
      `${this.frontendUrl}/pricing?payment=success&ref=${encodeURIComponent(ref)}`;
    const failureUrl =
      dto.failureUrl ||
      `${this.frontendUrl}/pricing?payment=failed&ref=${encodeURIComponent(ref)}`;
    const notificationUrl = `${this.apiPublicUrl}/api/payments/papi/webhook`;

    // 1. Create a pending payment record
    const payment = new this.paymentModel({
      user: user._id,
      type: 'Papi Checkout',
      operator: 'papi',
      reason: `Recharge de ${tokens} JP via Papi`,
      payload: ref,
      amount,
      tokens,
      phoneNumber: payerPhone || '',
      status: 'pending',
      ref,
      created_at: new Date(),
    });
    await payment.save();

    // 2. Call Papi Engine to create payment link
    try {
      this.logger.log(
        `Creating Papi payment link for ${ref} (${amount} MGA, ${tokens} JP)`,
      );
      const requestBody: Record<string, any> = {
        amount,
        clientName,
        reference: ref,
        description: `Recharge de ${tokens} JP — TranoGasy`,
        successUrl,
        failureUrl,
        notificationUrl,
      };
      if (payerEmail) requestBody.payerEmail = payerEmail;
      if (payerPhone) requestBody.payerPhone = payerPhone;

      const papiRes = await fetch(`${this.papiBaseUrl}/payment-links`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Token: this.papiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!papiRes.ok) {
        const errorText = await papiRes.text();
        this.logger.error(
          `Papi payment link error (${papiRes.status}): ${errorText}`,
        );
        throw new BadRequestException(
          `Impossible de créer le lien de paiement Papi : ${errorText}`,
        );
      }

      const papiData = await papiRes.json();
      const linkInfo = papiData.data || papiData;
      payment.papiPaymentLink = linkInfo.paymentLink;
      payment.papiNotificationToken = linkInfo.notificationToken;
      await payment.save();

      return {
        success: true,
        paymentLink: linkInfo.paymentLink,
        ref,
        amount,
        tokens,
        notificationToken: linkInfo.notificationToken,
      };
    } catch (err: any) {
      if (
        err instanceof BadRequestException ||
        err instanceof NotFoundException
      ) {
        throw err;
      }
      this.logger.error(`Error connecting to Papi: ${err.message}`, err.stack);
      throw new BadRequestException(
        `Erreur lors de la communication avec Papi : ${err.message}`,
      );
    }
  }

  /**
   * Webhook handler for asynchronous Papi notifications
   */
  async handlePapiWebhook(
    rawBody: Buffer | string | undefined,
    signatureHeader: string | undefined,
    payload: any,
  ) {
    this.logger.log(`Received Papi webhook: ${JSON.stringify(payload)}`);

    // Verify HMAC-SHA256 signature if provided
    if (this.webhookSecret && signatureHeader && rawBody) {
      try {
        const computedHmac = crypto
          .createHmac('sha256', this.webhookSecret)
          .update(
            Buffer.isBuffer(rawBody)
              ? rawBody
              : Buffer.from(rawBody, 'utf8'),
          )
          .digest('hex');

        if (computedHmac.toLowerCase() !== signatureHeader.toLowerCase()) {
          this.logger.warn(
            `Papi webhook signature mismatch! Computed: ${computedHmac}, Header: ${signatureHeader}`,
          );
        }
      } catch (err: any) {
        this.logger.error(`Error validating signature: ${err.message}`);
      }
    }

    const ref = payload?.merchantPaymentReference || payload?.reference;
    const status = String(
      payload?.paymentStatus || payload?.status || '',
    ).toUpperCase();

    if (!ref) {
      this.logger.warn('Webhook payload missing reference');
      return { received: true, error: 'Missing reference' };
    }

    const payment = await this.paymentModel.findOne({ ref }).exec();
    if (!payment) {
      this.logger.warn(`Webhook: Payment not found for reference ${ref}`);
      return { received: true, warning: 'Payment reference not found' };
    }

    // Idempotency: if already confirmed, do not double-credit
    if (payment.status === 'confirmed') {
      this.logger.log(`Webhook: Payment ${ref} was already confirmed.`);
      return { received: true, alreadyConfirmed: true };
    }

    payment.papiRawStatus = status;
    if (payload.paymentMethod) {
      payment.papiPaymentMethod = payload.paymentMethod;
      const pm = String(payload.paymentMethod).toLowerCase();
      if (pm.includes('mvola')) payment.operator = 'mvola';
      else if (pm.includes('airtel')) payment.operator = 'airtel';
      else if (pm.includes('orange')) payment.operator = 'orange';
      else if (
        pm.includes('card') ||
        pm.includes('bred') ||
        pm.includes('visa')
      ) {
        payment.operator = 'card';
      }
    }

    if (status === 'SUCCESS' || status === 'PAID') {
      payment.status = 'confirmed';
      await payment.save();

      const updatedUser = await this.userModel.findByIdAndUpdate(
        payment.user,
        { $inc: { balance: payment.tokens } },
        { new: true },
      );
      this.logger.log(
        `Webhook: Successfully credited ${payment.tokens} JP to user ${payment.user}. New balance: ${updatedUser?.balance}`,
      );
    } else if (status === 'FAILED') {
      payment.status = 'failed';
      payment.failureReason =
        payload.failureReason || 'Transaction échouée chez Papi';
      await payment.save();
      this.logger.log(`Webhook: Payment ${ref} marked as failed.`);
    } else {
      await payment.save();
    }

    return { received: true, status: payment.status };
  }

  /**
   * Real-time payment verification and sync endpoint
   * Queries local DB, and if pending, queries Papi API directly!
   */
  async verifyAndSyncPaymentStatus(ref: string) {
    if (!ref) {
      throw new BadRequestException('Référence de paiement requise.');
    }

    const payment = await this.paymentModel.findOne({ ref }).exec();
    if (!payment) {
      throw new NotFoundException(`Paiement ${ref} introuvable.`);
    }

    const user = await this.userModel
      .findById(payment.user)
      .select('balance username phone')
      .lean()
      .exec();

    // If already confirmed, return current status
    if (payment.status === 'confirmed') {
      return {
        status: 'confirmed',
        ref: payment.ref,
        tokens: payment.tokens,
        amount: payment.amount,
        balance: user?.balance ?? 0,
        operator: payment.operator,
      };
    }

    // If still pending, query Papi directly to check if completed
    try {
      this.logger.log(`Syncing status with Papi for ref: ${ref}`);

      let papiRes = await fetch(
        `${this.papiBaseUrl}/payment-links/${encodeURIComponent(ref)}`,
        {
          headers: { Token: this.papiKey },
        },
      );

      if (!papiRes.ok && papiRes.status === 404) {
        papiRes = await fetch(
          `${this.papiBaseUrl}/v1/payments/${encodeURIComponent(ref)}`,
          {
            headers: { Token: this.papiKey },
          },
        );
      }

      if (papiRes.ok) {
        const data = await papiRes.json();
        const pObj = data.data?.payment || data.payment || data.data || data;
        const pStatus = String(
          pObj.paymentStatus || data.data?.status || data.status || '',
        ).toUpperCase();

        payment.papiRawStatus = pStatus;
        if (pObj.paymentMethod) {
          const pm = String(pObj.paymentMethod).toLowerCase();
          if (pm.includes('mvola')) payment.operator = 'mvola';
          else if (pm.includes('airtel')) payment.operator = 'airtel';
          else if (pm.includes('orange')) payment.operator = 'orange';
          else if (
            pm.includes('card') ||
            pm.includes('bred') ||
            pm.includes('visa')
          ) {
            payment.operator = 'card';
          }
        }

        if (pStatus === 'SUCCESS' || pStatus === 'PAID') {
          payment.status = 'confirmed';
          await payment.save();

          const updatedUser = await this.userModel.findByIdAndUpdate(
            payment.user,
            { $inc: { balance: payment.tokens } },
            { new: true },
          );

          this.logger.log(
            `Sync: Payment ${ref} confirmed via Papi query! Credited ${payment.tokens} JP.`,
          );

          return {
            status: 'confirmed',
            ref: payment.ref,
            tokens: payment.tokens,
            amount: payment.amount,
            balance: updatedUser?.balance ?? 0,
            operator: payment.operator,
          };
        } else if (pStatus === 'FAILED') {
          payment.status = 'failed';
          payment.failureReason = pObj.failureReason || 'Échec de transaction';
          await payment.save();

          return {
            status: 'failed',
            ref: payment.ref,
            failureReason: payment.failureReason,
          };
        }
      }
    } catch (err: any) {
      this.logger.warn(`Could not sync status with Papi: ${err.message}`);
    }

    return {
      status: payment.status,
      ref: payment.ref,
      tokens: payment.tokens,
      amount: payment.amount,
      balance: user?.balance ?? 0,
      paymentLink: payment.papiPaymentLink,
    };
  }

  // =========================================================================
  // WALLET & SPEND TOKENS METHODS
  // =========================================================================

  async spendTokens(dto: {
    userId: string;
    tokens: number;
    reason: string;
  }) {
    if (!dto.userId || !Types.ObjectId.isValid(dto.userId)) {
      throw new BadRequestException('Identifiant utilisateur invalide.');
    }

    const tokens = Number(dto.tokens);
    if (!Number.isFinite(tokens) || !Number.isInteger(tokens) || tokens <= 0) {
      throw new BadRequestException('Nombre de jetons JP invalide.');
    }

    const updatedUser = await this.userModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(dto.userId), balance: { $gte: tokens } },
        { $inc: { balance: -tokens } },
        { new: true },
      )
      .select('-password -backUpCode')
      .lean()
      .exec();

    if (!updatedUser) {
      const existing = await this.userModel
        .findById(dto.userId)
        .select('balance')
        .lean()
        .exec();
      if (!existing) {
        throw new NotFoundException('Utilisateur introuvable.');
      }
      throw new BadRequestException(
        `Solde JP insuffisant (${existing.balance || 0} JP disponible, ${tokens} JP requis).`,
      );
    }

    return {
      message: `${tokens} JP utilisés pour : ${dto.reason || 'Action TranoGasy'}`,
      user: updatedUser,
      balance: updatedUser.balance,
    };
  }

  async getUserWallet(userIdOrPhone: string) {
    let user: any = null;
    if (Types.ObjectId.isValid(userIdOrPhone)) {
      user = await this.userModel
        .findById(userIdOrPhone)
        .select('_id username phone balance')
        .lean()
        .exec();
    }
    if (!user && userIdOrPhone) {
      const cleanPhone = this.normalizeMadagascarPhone(userIdOrPhone);
      const altPhone = cleanPhone.startsWith('0')
        ? cleanPhone.slice(1)
        : `0${cleanPhone}`;
      user = await this.userModel
        .findOne({
          $or: [
            { phone: cleanPhone },
            { phone: altPhone },
            { phone: userIdOrPhone },
          ],
        })
        .select('_id username phone balance')
        .lean()
        .exec();
    }

    if (!user) {
      return {
        balance: 0,
        payments: [],
      };
    }

    const payments = await this.paymentModel
      .find({ user: user._id })
      .sort({ created_at: -1 })
      .limit(25)
      .lean()
      .exec();

    return {
      balance: user.balance || 0,
      payments,
    };
  }
}
