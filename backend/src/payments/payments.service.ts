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
import { NotificationsService } from '../notifications/notifications.service';

export type SubscriptionPlanId = 'plan_24h' | 'plan_3d' | 'plan_7d';
export type AssistancePlanId = 'assistance_24h' | 'assistance_3d' | 'assistance_7d';

export interface DurationPlanConfig {
  id: string;
  label: string;
  durationHours: number;
  amount: number;
}

export const TIME_SUBSCRIPTION_PLANS: Record<SubscriptionPlanId, DurationPlanConfig> = {
  plan_24h: {
    id: 'plan_24h',
    label: '24 heures',
    durationHours: 24,
    amount: 3000,
  },
  plan_3d: {
    id: 'plan_3d',
    label: '3 jours',
    durationHours: 72,
    amount: 5000,
  },
  plan_7d: {
    id: 'plan_7d',
    label: '1 semaine',
    durationHours: 168,
    amount: 10000,
  },
};

export const AGENCY_ASSISTANCE_PLANS: Record<AssistancePlanId, DurationPlanConfig> = {
  assistance_24h: {
    id: 'assistance_24h',
    label: '24 heures',
    durationHours: 24,
    amount: 3000,
  },
  assistance_3d: {
    id: 'assistance_3d',
    label: '3 jours',
    durationHours: 72,
    amount: 5000,
  },
  assistance_7d: {
    id: 'assistance_7d',
    label: '1 semaine',
    durationHours: 168,
    amount: 10000,
  },
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
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

  private isPapiFailureStatus(status: string): boolean {
    return ['FAILED', 'CANCELED', 'CANCELLED', 'REFUSED', 'EXPIRED'].includes(
      status,
    );
  }

  private async resolveUserForPayment(
    userId?: string,
    userPhone?: string,
  ): Promise<UserDocument> {
    let user: UserDocument | null = null;
    if (userId && Types.ObjectId.isValid(userId)) {
      user = await this.userModel.findById(userId).exec();
    }
    if (!user && userPhone) {
      const cleanUserPhone = this.normalizeMadagascarPhone(userPhone);
      const altPhone = cleanUserPhone.startsWith('0')
        ? cleanUserPhone.slice(1)
        : `0${cleanUserPhone}`;
      user = await this.userModel
        .findOne({
          $or: [
            { phone: cleanUserPhone },
            { phone: altPhone },
            { phone: userPhone },
          ],
        })
        .exec();
    }

    if (!user) {
      throw new NotFoundException(
        'Utilisateur introuvable. Veuillez vous connecter.',
      );
    }
    return user;
  }

  private async dispatchPapiPaymentLink(params: {
    payment: PaymentDocument;
    user: UserDocument;
    description: string;
    clientName?: string;
    payerEmail?: string;
    payerPhone?: string;
    successUrl?: string;
    failureUrl?: string;
  }) {
    const { payment, user } = params;
    const ref = payment.ref;
    const clientName = params.clientName || user.username || 'Client TranoGasy';
    const payerEmail = params.payerEmail || user.email || undefined;
    const payerPhone = params.payerPhone
      ? this.normalizeMadagascarPhone(params.payerPhone)
      : user.phone
        ? this.normalizeMadagascarPhone(user.phone)
        : undefined;

    const successUrl =
      params.successUrl ||
      `${this.frontendUrl}/pricing?payment=success&ref=${encodeURIComponent(ref)}`;
    const failureUrl =
      params.failureUrl ||
      `${this.frontendUrl}/pricing?payment=failed&ref=${encodeURIComponent(ref)}`;
    const notificationUrl = `${this.apiPublicUrl}/api/payments/papi/webhook`;

    try {
      this.logger.log(
        `Creating Papi payment link for ${ref} (${payment.amount} MGA, category=${payment.category})`,
      );
      const requestBody: Record<string, any> = {
        amount: payment.amount,
        clientName,
        reference: ref,
        description: params.description,
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
        amount: payment.amount,
        category: payment.category,
        subscriptionPlanId: payment.subscriptionPlanId,
        subscriptionDurationHours: payment.subscriptionDurationHours,
        assistancePlanId: payment.assistancePlanId,
        assistanceDurationHours: payment.assistanceDurationHours,
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
   * Creates a Papi payment link for Web/Android time-based subscriptions (24h, 3d, 1w).
   */
  async createSubscriptionPaymentLink(dto: {
    userId?: string;
    userPhone?: string;
    planId: SubscriptionPlanId;
    clientName?: string;
    payerEmail?: string;
    payerPhone?: string;
    successUrl?: string;
    failureUrl?: string;
  }) {
    const plan = TIME_SUBSCRIPTION_PLANS[dto.planId];
    if (!plan) {
      throw new BadRequestException("Forfait d'abonnement invalide.");
    }

    const user = await this.resolveUserForPayment(dto.userId, dto.userPhone);
    const ref = `TG-SUB-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const payerPhone = dto.payerPhone
      ? this.normalizeMadagascarPhone(dto.payerPhone)
      : user.phone
        ? this.normalizeMadagascarPhone(user.phone)
        : '';

    const payment = new this.paymentModel({
      user: user._id,
      type: 'Abonnement TranoGasy',
      operator: 'papi',
      category: 'time_subscription',
      subscriptionPlanId: plan.id,
      subscriptionDurationHours: plan.durationHours,
      reason: `Abonnement ${plan.label} — Accès illimité`,
      payload: ref,
      amount: plan.amount,
      phoneNumber: payerPhone,
      status: 'pending',
      ref,
      created_at: new Date(),
    });
    await payment.save();

    return this.dispatchPapiPaymentLink({
      payment,
      user,
      description: `Abonnement ${plan.label} — TranoGasy`,
      clientName: dto.clientName,
      payerEmail: dto.payerEmail,
      payerPhone: dto.payerPhone,
      successUrl: dto.successUrl,
      failureUrl: dto.failureUrl,
    });
  }

  /**
   * Creates a Papi payment link for iOS real-world Agency Assistance services.
   */
  async createAssistancePaymentLink(dto: {
    userId?: string;
    userPhone?: string;
    planId: AssistancePlanId;
    clientName?: string;
    payerEmail?: string;
    payerPhone?: string;
    successUrl?: string;
    failureUrl?: string;
  }) {
    const plan = AGENCY_ASSISTANCE_PLANS[dto.planId];
    if (!plan) {
      throw new BadRequestException("Forfait d'assistance invalide.");
    }

    const user = await this.resolveUserForPayment(dto.userId, dto.userPhone);
    const ref = `TG-AST-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const payerPhone = dto.payerPhone
      ? this.normalizeMadagascarPhone(dto.payerPhone)
      : user.phone
        ? this.normalizeMadagascarPhone(user.phone)
        : '';

    const payment = new this.paymentModel({
      user: user._id,
      type: 'Assistance Tranogasy',
      operator: 'papi',
      category: 'agency_assistance',
      assistancePlanId: plan.id,
      assistanceDurationHours: plan.durationHours,
      reason: `Assistance Tranogasy (${plan.label}) — Plus d’informations par agent et mise en relation`,
      payload: ref,
      amount: plan.amount,
      phoneNumber: payerPhone,
      status: 'pending',
      ref,
      created_at: new Date(),
    });
    await payment.save();

    return this.dispatchPapiPaymentLink({
      payment,
      user,
      description: `Assistance Tranogasy ${plan.label} — TranoGasy`,
      clientName: dto.clientName,
      payerEmail: dto.payerEmail,
      payerPhone: dto.payerPhone,
      successUrl: dto.successUrl,
      failureUrl: dto.failureUrl,
    });
  }

  private applyPaymentMethodToRecord(payment: PaymentDocument, paymentMethod?: string) {
    if (!paymentMethod) return;
    payment.papiPaymentMethod = paymentMethod;
    const pm = String(paymentMethod).toLowerCase();
    if (pm.includes('mvola')) payment.operator = 'mvola';
    else if (pm.includes('airtel')) payment.operator = 'airtel';
    else if (pm.includes('orange')) payment.operator = 'orange';
    else if (pm.includes('card') || pm.includes('bred') || pm.includes('visa')) {
      payment.operator = 'card';
    }
  }

  private async applyConfirmedPayment(payment: PaymentDocument) {
    payment.status = 'confirmed';
    const isAssistance = payment.category === 'agency_assistance';
    const existingUser = await this.userModel
      .findById(payment.user)
      .select('subscriptionExpiresAt assistanceExpiresAt')
      .lean()
      .exec();

    const nowMs = Date.now();
    const relevantExpiry = isAssistance
      ? existingUser?.assistanceExpiresAt || existingUser?.subscriptionExpiresAt
      : existingUser?.subscriptionExpiresAt;
    const baseTimeMs =
      relevantExpiry && new Date(relevantExpiry).getTime() > nowMs
        ? new Date(relevantExpiry).getTime()
        : nowMs;

    const durationHours =
      Number(payment.subscriptionDurationHours || payment.assistanceDurationHours) ||
      24;
    const expiresAt = new Date(baseTimeMs + durationHours * 3600 * 1000);

    const planLabel = isAssistance
      ? AGENCY_ASSISTANCE_PLANS[payment.assistancePlanId as AssistancePlanId]?.label ||
        `${durationHours}h`
      : TIME_SUBSCRIPTION_PLANS[payment.subscriptionPlanId as SubscriptionPlanId]?.label ||
        `${durationHours}h`;

    if (isAssistance) {
      payment.assistanceExpiresAt = expiresAt;
    } else {
      payment.subscriptionExpiresAt = expiresAt;
    }
    await payment.save();

    // For iOS (agency_assistance), do NOT set subscriptionExpiresAt or hasAllContactsUnlocked
    // automatically on payment confirmation; an admin activates contact access remotely.
    const userUpdateFields = isAssistance
      ? {
          assistanceExpiresAt: expiresAt,
          assistancePlanLabel: planLabel,
        }
      : {
          subscriptionExpiresAt: expiresAt,
          subscriptionPlanLabel: planLabel,
        };

    const updatedUser = await this.userModel.findByIdAndUpdate(
      payment.user,
      { $set: userUpdateFields },
      { new: true },
    );

    this.logger.log(
      `Payment ${payment.ref} confirmed (${payment.category}). ${isAssistance ? 'Assistance' : 'Subscription'} (${planLabel}) expires: ${expiresAt.toISOString()}`,
    );

    try {
      await this.notificationsService.createAndSend({
        userId: payment.user.toString(),
        title: isAssistance
          ? '🎉 Reçu confirmé !'
          : '🎉 Abonnement activé !',
        body: isAssistance
          ? `Votre forfait ${planLabel} (${payment.amount.toLocaleString('fr-FR')} Ar) est validé. Réf: ${payment.ref}.`
          : `Votre accès ${planLabel} (${payment.amount.toLocaleString('fr-FR')} Ar) est actif sur TranoGasy.`,
        data: {
          url: '/pricing',
          type: 'payment_success',
          ref: payment.ref,
        },
      });
    } catch (notifErr: any) {
      this.logger.warn(
        `Could not dispatch payment push notification: ${notifErr.message}`,
      );
    }

    return updatedUser;
  }

  private buildPaymentStatusPayload(payment: PaymentDocument, user?: any) {
    const isAssistance = payment.category === 'agency_assistance';
    const planLabel =
      (isAssistance
        ? payment.assistancePlanId
          ? AGENCY_ASSISTANCE_PLANS[payment.assistancePlanId as AssistancePlanId]?.label
          : null
        : payment.subscriptionPlanId
          ? TIME_SUBSCRIPTION_PLANS[payment.subscriptionPlanId as SubscriptionPlanId]?.label
          : null) ||
      (isAssistance ? user?.assistancePlanLabel : user?.subscriptionPlanLabel) ||
      null;

    return {
      status: payment.status,
      ref: payment.ref,
      amount: payment.amount,
      operator: payment.operator,
      category: payment.category || 'time_subscription',
      subscriptionPlanId: payment.subscriptionPlanId || payment.assistancePlanId,
      subscriptionDurationHours:
        payment.subscriptionDurationHours || payment.assistanceDurationHours,
      subscriptionExpiresAt: isAssistance
        ? user?.subscriptionExpiresAt || null
        : payment.subscriptionExpiresAt || user?.subscriptionExpiresAt || null,
      subscriptionPlanLabel: isAssistance
        ? user?.subscriptionPlanLabel || null
        : planLabel,
      assistancePlanId: payment.assistancePlanId || payment.subscriptionPlanId,
      assistanceDurationHours:
        payment.assistanceDurationHours || payment.subscriptionDurationHours,
      assistanceExpiresAt: isAssistance
        ? payment.assistanceExpiresAt || user?.assistanceExpiresAt || null
        : payment.subscriptionExpiresAt || user?.subscriptionExpiresAt || null,
      assistancePlanLabel: planLabel,
    };
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

    if (payment.status === 'confirmed') {
      this.logger.log(`Webhook: Payment ${ref} was already confirmed.`);
      return { received: true, alreadyConfirmed: true };
    }

    payment.papiRawStatus = status;
    this.applyPaymentMethodToRecord(payment, payload.paymentMethod);

    if (status === 'SUCCESS' || status === 'PAID') {
      await this.applyConfirmedPayment(payment);
    } else if (this.isPapiFailureStatus(status)) {
      payment.status = 'failed';
      payment.failureReason =
        payload.failureReason || 'Transaction annulée ou échouée chez Papi';
      await payment.save();
      this.logger.log(`Webhook: Payment ${ref} marked as failed (${status}).`);
    } else {
      await payment.save();
    }

    return { received: true, status: payment.status };
  }

  /**
   * Real-time payment verification and sync endpoint
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
      .select('username phone subscriptionExpiresAt subscriptionPlanLabel')
      .lean()
      .exec();

    if (payment.status === 'confirmed') {
      return this.buildPaymentStatusPayload(payment, user);
    }

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
        this.applyPaymentMethodToRecord(payment, pObj.paymentMethod);

        if (pStatus === 'SUCCESS' || pStatus === 'PAID') {
          const updatedUser = await this.applyConfirmedPayment(payment);
          return this.buildPaymentStatusPayload(payment, updatedUser);
        } else if (this.isPapiFailureStatus(pStatus)) {
          payment.status = 'failed';
          payment.failureReason = pObj.failureReason || 'Transaction annulée ou échouée';
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
      ...this.buildPaymentStatusPayload(payment, user),
      paymentLink: payment.papiPaymentLink,
    };
  }

  async getUserWallet(userIdOrPhone: string) {
    let user: any = null;
    const walletUserSelect =
      '_id username phone hasAllContactsUnlocked subscriptionExpiresAt subscriptionPlanLabel assistanceExpiresAt assistancePlanLabel';
    if (Types.ObjectId.isValid(userIdOrPhone)) {
      user = await this.userModel
        .findById(userIdOrPhone)
        .select(walletUserSelect)
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
        .select(walletUserSelect)
        .lean()
        .exec();
    }

    if (!user) {
      return {
        subscriptionExpiresAt: null,
        subscriptionPlanLabel: null,
        assistanceExpiresAt: null,
        assistancePlanLabel: null,
        hasAllContactsUnlocked: false,
        payments: [],
      };
    }

    const payments = await this.paymentModel
      .find({ user: user._id, status: 'confirmed' })
      .sort({ created_at: -1 })
      .limit(25)
      .lean()
      .exec();

    const latestConfirmedAssistance = payments.find(
      (p: any) => p.category === 'agency_assistance',
    );
    const assistanceExpiresAt =
      user.assistanceExpiresAt ||
      latestConfirmedAssistance?.assistanceExpiresAt ||
      user.subscriptionExpiresAt ||
      null;
    const assistancePlanLabel =
      user.assistancePlanLabel ||
      user.subscriptionPlanLabel ||
      null;

    return {
      subscriptionExpiresAt: user.subscriptionExpiresAt || null,
      subscriptionPlanLabel: user.subscriptionPlanLabel || null,
      assistanceExpiresAt,
      assistancePlanLabel,
      hasAllContactsUnlocked: Boolean(user.hasAllContactsUnlocked),
      payments,
    };
  }
}
