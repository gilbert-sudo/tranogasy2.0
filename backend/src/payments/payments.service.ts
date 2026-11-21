import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
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
export type PapiDirectMobileMethod = 'MVOLA' | 'ORANGE_MONEY' | 'AIRTEL_MONEY';
export type CheckoutPaymentMethod =
  | PapiDirectMobileMethod
  | 'CARD'
  | 'PAPI_LINK'
  | 'mvola'
  | 'orange'
  | 'airtel'
  | 'card'
  | 'papi';

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

  private resolveCheckoutMethod(method?: string): {
    mode: 'direct' | 'link';
    papiMethod?: PapiDirectMobileMethod;
    operator: string;
  } {
    if (!method) {
      return { mode: 'link', operator: 'papi' };
    }
    const normalized = String(method).trim().toUpperCase();
    if (normalized === 'CARD' || normalized === 'CB' || normalized === 'VISA') {
      return { mode: 'link', operator: 'card' };
    }
    if (normalized === 'PAPI' || normalized === 'PAPI_LINK' || normalized === 'LINK') {
      return { mode: 'link', operator: 'papi' };
    }
    if (normalized === 'MVOLA') {
      return { mode: 'direct', papiMethod: 'MVOLA', operator: 'mvola' };
    }
    if (normalized === 'ORANGE_MONEY' || normalized === 'ORANGE') {
      return { mode: 'direct', papiMethod: 'ORANGE_MONEY', operator: 'orange' };
    }
    if (normalized === 'AIRTEL_MONEY' || normalized === 'AIRTEL') {
      return { mode: 'direct', papiMethod: 'AIRTEL_MONEY', operator: 'airtel' };
    }
    throw new BadRequestException(`Mode de paiement non pris en charge : ${method}`);
  }

  private validateMadagascarMobileMoneyPhone(
    rawPhone: string | undefined,
    papiMethod: PapiDirectMobileMethod,
  ): string {
    const normalized = this.normalizeMadagascarPhone(rawPhone || '');
    if (!/^03[23478]\d{7}$/.test(normalized)) {
      throw new BadRequestException(
        'Veuillez saisir un numéro Mobile Money malgache valide à 10 chiffres (ex: 034 00 000 00).',
      );
    }

    if (
      papiMethod === 'MVOLA' &&
      !normalized.startsWith('034') &&
      !normalized.startsWith('038')
    ) {
      throw new BadRequestException(
        'Le numéro MVola doit commencer par 034 ou 038.',
      );
    }

    if (
      papiMethod === 'ORANGE_MONEY' &&
      !normalized.startsWith('032') &&
      !normalized.startsWith('037')
    ) {
      throw new BadRequestException(
        'Le numéro Orange Money doit commencer par 032 ou 037.',
      );
    }

    if (papiMethod === 'AIRTEL_MONEY' && !normalized.startsWith('033')) {
      throw new BadRequestException(
        'Le numéro Airtel Money doit commencer par 033.',
      );
    }

    return normalized;
  }

  private extractPapiErrorMessage(errorText: string, fallback: string): string {
    if (!errorText) return fallback;
    try {
      const parsed = JSON.parse(errorText);
      const candidate =
        parsed?.message ||
        parsed?.error?.message ||
        parsed?.data?.message ||
        parsed?.failureReason ||
        parsed?.error;
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    } catch {
      // Not JSON, fall back to raw string if reasonable length
    }
    return errorText.length < 220 ? errorText : fallback;
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
        mode: 'link' as const,
        status: payment.status,
        operator: payment.operator,
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
   * Initiates a direct in-app Mobile Money payment (USSD push / temporaryCode) via POST /v1/payments
   */
  private async dispatchPapiDirectPayment(params: {
    payment: PaymentDocument;
    user: UserDocument;
    papiMethod: PapiDirectMobileMethod;
    operator: string;
    description: string;
    clientName?: string;
    payerEmail?: string;
    payerPhone?: string;
    temporaryCode?: string;
  }) {
    const { payment, user, papiMethod, operator } = params;
    const ref = payment.ref;
    const clientName = params.clientName || user.username || 'Client TranoGasy';
    const payerEmail = params.payerEmail || user.email || undefined;
    const rawPhone = params.payerPhone || user.phone || '';
    const phoneNumber = this.validateMadagascarMobileMoneyPhone(
      rawPhone,
      papiMethod,
    );
    const temporaryCode = params.temporaryCode?.trim();

    if (papiMethod === 'ORANGE_MONEY' && !temporaryCode) {
      throw new BadRequestException(
        'Veuillez saisir le code temporaire Orange Money obtenu en composant le #144*3*3#.',
      );
    }

    const notificationUrl = `${this.apiPublicUrl}/api/payments/papi/webhook`;

    payment.operator = operator;
    payment.papiPaymentMethod = papiMethod;
    payment.phoneNumber = phoneNumber;
    await payment.save();

    try {
      this.logger.log(
        `Initiating direct Papi Mobile Money payment (${papiMethod}) for ${ref} (${payment.amount} MGA, phone=${phoneNumber})`,
      );

      const requestBody: Record<string, any> = {
        paymentMethod: papiMethod,
        amount: payment.amount,
        currency: 'MGA',
        reference: ref,
        description: params.description,
        clientName,
        phoneNumber,
        notificationUrl,
      };

      if (payerEmail) {
        requestBody.payerEmail = payerEmail;
      }
      if (papiMethod === 'ORANGE_MONEY' && temporaryCode) {
        requestBody.temporaryCode = temporaryCode;
      }

      const papiRes = await fetch(`${this.papiBaseUrl}/v1/payments`, {
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
          `Papi direct payment error (${papiRes.status}) for ${ref}: ${errorText}`,
        );
        const friendlyMsg = this.extractPapiErrorMessage(
          errorText,
          'Impossible d’initier le paiement Mobile Money auprès de l’opérateur.',
        );
        payment.status = 'failed';
        payment.failureReason = friendlyMsg;
        await payment.save();
        throw new BadRequestException(friendlyMsg);
      }

      const papiData = await papiRes.json();
      const pObj =
        papiData?.data?.payment ||
        papiData?.payment ||
        papiData?.data ||
        papiData;
      const rawStatus = String(
        pObj?.paymentStatus ||
          papiData?.data?.status ||
          papiData?.status ||
          'PENDING',
      ).toUpperCase();

      payment.papiRawStatus = rawStatus;
      if (pObj?.notificationToken) {
        payment.papiNotificationToken = pObj.notificationToken;
      }
      this.applyPaymentMethodToRecord(
        payment,
        pObj?.paymentMethod || papiMethod,
      );

      if (rawStatus === 'SUCCESS' || rawStatus === 'PAID') {
        const updatedUser = await this.applyConfirmedPayment(payment);
        return {
          success: true,
          mode: 'direct' as const,
          ...this.buildPaymentStatusPayload(payment, updatedUser),
          paymentMethod: papiMethod,
        };
      }

      if (this.isPapiFailureStatus(rawStatus)) {
        const reason =
          pObj?.failureReason ||
          pObj?.message ||
          'La transaction Mobile Money a été refusée ou annulée.';
        payment.status = 'failed';
        payment.failureReason = reason;
        await payment.save();
        throw new BadRequestException(reason);
      }

      await payment.save();

      return {
        success: true,
        mode: 'direct' as const,
        status: 'pending' as const,
        paymentMethod: papiMethod,
        operator: payment.operator,
        ref,
        amount: payment.amount,
        phoneNumber,
        category: payment.category,
        subscriptionPlanId: payment.subscriptionPlanId,
        subscriptionDurationHours: payment.subscriptionDurationHours,
        assistancePlanId: payment.assistancePlanId,
        assistanceDurationHours: payment.assistanceDurationHours,
        notificationToken: payment.papiNotificationToken,
      };
    } catch (err: any) {
      if (
        err instanceof BadRequestException ||
        err instanceof NotFoundException
      ) {
        throw err;
      }
      this.logger.error(
        `Error connecting to Papi Direct API: ${err.message}`,
        err.stack,
      );
      throw new BadRequestException(
        `Erreur lors de la communication avec Papi : ${err.message}`,
      );
    }
  }

  /**
   * Creates or initiates a Papi payment for Web/Android time-based subscriptions (24h, 3d, 1w).
   * Supports Direct Mobile Money (MVOLA, ORANGE_MONEY, AIRTEL_MONEY) and Hosted Payment Link for Card (CARD).
   */
  async createSubscriptionPaymentLink(dto: {
    userId?: string;
    userPhone?: string;
    planId: SubscriptionPlanId;
    paymentMethod?: CheckoutPaymentMethod;
    temporaryCode?: string;
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

    const resolvedMethod = this.resolveCheckoutMethod(dto.paymentMethod);
    const user = await this.resolveUserForPayment(dto.userId, dto.userPhone);
    const ref = `TG-SUB-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const payerPhone = dto.payerPhone
      ? this.normalizeMadagascarPhone(dto.payerPhone)
      : user.phone
        ? this.normalizeMadagascarPhone(user.phone)
        : '';

    if (resolvedMethod.mode === 'direct' && resolvedMethod.papiMethod) {
      this.validateMadagascarMobileMoneyPhone(
        payerPhone,
        resolvedMethod.papiMethod,
      );
      if (
        resolvedMethod.papiMethod === 'ORANGE_MONEY' &&
        !dto.temporaryCode?.trim()
      ) {
        throw new BadRequestException(
          'Veuillez saisir le code temporaire Orange Money obtenu en composant le #144*3*3#.',
        );
      }
    }

    const payment = new this.paymentModel({
      user: user._id,
      type: 'Abonnement TranoGasy',
      operator: resolvedMethod.operator,
      papiPaymentMethod: resolvedMethod.papiMethod || (resolvedMethod.operator === 'card' ? 'CARD' : null),
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

    if (resolvedMethod.mode === 'direct' && resolvedMethod.papiMethod) {
      return this.dispatchPapiDirectPayment({
        payment,
        user,
        papiMethod: resolvedMethod.papiMethod,
        operator: resolvedMethod.operator,
        description: `Abonnement ${plan.label} — TranoGasy`,
        clientName: dto.clientName,
        payerEmail: dto.payerEmail,
        payerPhone: payerPhone,
        temporaryCode: dto.temporaryCode,
      });
    }

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
   * Creates or initiates a Papi payment for iOS real-world Agency Assistance services.
   * Supports Direct Mobile Money (MVOLA, ORANGE_MONEY, AIRTEL_MONEY) and Hosted Payment Link for Card (CARD).
   */
  async createAssistancePaymentLink(dto: {
    userId?: string;
    userPhone?: string;
    planId: AssistancePlanId;
    paymentMethod?: CheckoutPaymentMethod;
    temporaryCode?: string;
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

    const resolvedMethod = this.resolveCheckoutMethod(dto.paymentMethod);
    const user = await this.resolveUserForPayment(dto.userId, dto.userPhone);
    const ref = `TG-AST-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const payerPhone = dto.payerPhone
      ? this.normalizeMadagascarPhone(dto.payerPhone)
      : user.phone
        ? this.normalizeMadagascarPhone(user.phone)
        : '';

    if (resolvedMethod.mode === 'direct' && resolvedMethod.papiMethod) {
      this.validateMadagascarMobileMoneyPhone(
        payerPhone,
        resolvedMethod.papiMethod,
      );
      if (
        resolvedMethod.papiMethod === 'ORANGE_MONEY' &&
        !dto.temporaryCode?.trim()
      ) {
        throw new BadRequestException(
          'Veuillez saisir le code temporaire Orange Money obtenu en composant le #144*3*3#.',
        );
      }
    }

    const payment = new this.paymentModel({
      user: user._id,
      type: 'Assistance Tranogasy',
      operator: resolvedMethod.operator,
      papiPaymentMethod: resolvedMethod.papiMethod || (resolvedMethod.operator === 'card' ? 'CARD' : null),
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

    if (resolvedMethod.mode === 'direct' && resolvedMethod.papiMethod) {
      return this.dispatchPapiDirectPayment({
        payment,
        user,
        papiMethod: resolvedMethod.papiMethod,
        operator: resolvedMethod.operator,
        description: `Assistance Tranogasy ${plan.label} — TranoGasy`,
        clientName: dto.clientName,
        payerEmail: dto.payerEmail,
        payerPhone: payerPhone,
        temporaryCode: dto.temporaryCode,
      });
    }

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
    const claimed = await this.paymentModel
      .findOneAndUpdate(
        { _id: payment._id, status: { $ne: 'confirmed' } },
        {
          $set: {
            status: 'confirmed',
            ...(payment.papiRawStatus ? { papiRawStatus: payment.papiRawStatus } : {}),
            ...(payment.operator ? { operator: payment.operator } : {}),
            ...(payment.papiPaymentMethod
              ? { papiPaymentMethod: payment.papiPaymentMethod }
              : {}),
          },
        },
        { new: true },
      )
      .exec();

    if (!claimed) {
      // Another concurrent webhook or polling request already confirmed this payment.
      const existingConfirmed = await this.paymentModel
        .findById(payment._id)
        .lean()
        .exec();
      if (existingConfirmed) {
        payment.status = 'confirmed';
        if (existingConfirmed.assistanceExpiresAt) {
          payment.assistanceExpiresAt = existingConfirmed.assistanceExpiresAt;
        }
        if (existingConfirmed.subscriptionExpiresAt) {
          payment.subscriptionExpiresAt = existingConfirmed.subscriptionExpiresAt;
        }
      }
      this.logger.log(
        `Payment ${payment.ref} already confirmed concurrently; skipping duplicate extension.`,
      );
      return this.userModel.findById(payment.user).lean().exec();
    }

    payment.status = 'confirmed';
    const isAssistance = claimed.category === 'agency_assistance';
    const existingUser = await this.userModel
      .findById(claimed.user)
      .select('subscriptionExpiresAt assistanceExpiresAt')
      .lean()
      .exec();

    const nowMs = Date.now();
    const relevantExpiry = isAssistance
      ? existingUser?.assistanceExpiresAt
      : existingUser?.subscriptionExpiresAt;
    const baseTimeMs =
      relevantExpiry && new Date(relevantExpiry).getTime() > nowMs
        ? new Date(relevantExpiry).getTime()
        : nowMs;

    const durationHours =
      Number(
        isAssistance
          ? claimed.assistanceDurationHours
          : claimed.subscriptionDurationHours,
      ) || 24;
    const expiresAt = new Date(baseTimeMs + durationHours * 3600 * 1000);

    const planLabel = isAssistance
      ? AGENCY_ASSISTANCE_PLANS[claimed.assistancePlanId as AssistancePlanId]
          ?.label || `${durationHours}h`
      : TIME_SUBSCRIPTION_PLANS[claimed.subscriptionPlanId as SubscriptionPlanId]
          ?.label || `${durationHours}h`;

    if (isAssistance) {
      claimed.assistanceExpiresAt = expiresAt;
      payment.assistanceExpiresAt = expiresAt;
    } else {
      claimed.subscriptionExpiresAt = expiresAt;
      payment.subscriptionExpiresAt = expiresAt;
    }
    await claimed.save();

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
      claimed.user,
      { $set: userUpdateFields },
      { new: true },
    );

    this.logger.log(
      `Payment ${claimed.ref} confirmed (${claimed.category}). ${isAssistance ? 'Assistance' : 'Subscription'} (${planLabel}) expires: ${expiresAt.toISOString()}`,
    );

    try {
      await this.notificationsService.createAndSend({
        userId: claimed.user.toString(),
        title: isAssistance
          ? '🎉 Reçu confirmé !'
          : '🎉 Abonnement activé !',
        body: isAssistance
          ? `Votre forfait ${planLabel} (${claimed.amount.toLocaleString('fr-FR')} Ar) est validé. Réf: ${claimed.ref}.`
          : `Votre accès ${planLabel} (${claimed.amount.toLocaleString('fr-FR')} Ar) est actif sur TranoGasy.`,
        data: {
          url: '/pricing',
          type: 'payment_success',
          ref: claimed.ref,
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
      paymentMethod: payment.papiPaymentMethod || undefined,
      failureReason: payment.failureReason || undefined,
      category: payment.category || 'time_subscription',
      subscriptionPlanId: payment.subscriptionPlanId || undefined,
      subscriptionDurationHours: payment.subscriptionDurationHours || undefined,
      subscriptionExpiresAt: isAssistance
        ? user?.subscriptionExpiresAt || null
        : payment.subscriptionExpiresAt || user?.subscriptionExpiresAt || null,
      subscriptionPlanLabel: isAssistance
        ? user?.subscriptionPlanLabel || null
        : planLabel,
      assistancePlanId: payment.assistancePlanId || undefined,
      assistanceDurationHours: payment.assistanceDurationHours || undefined,
      assistanceExpiresAt: isAssistance
        ? payment.assistanceExpiresAt || user?.assistanceExpiresAt || null
        : user?.assistanceExpiresAt || null,
      assistancePlanLabel: isAssistance
        ? planLabel
        : user?.assistancePlanLabel || null,
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

    if (!this.webhookSecret) {
      this.logger.error('Papi webhook rejected: PAPI_WEBHOOK_SECRET is not configured.');
      throw new UnauthorizedException('Webhook Papi non configuré.');
    }

    if (!signatureHeader || !rawBody) {
      this.logger.warn('Papi webhook rejected: missing signature header or raw body.');
      throw new UnauthorizedException('Signature webhook Papi manquante.');
    }

    const normalizedSignature = signatureHeader
      .trim()
      .replace(/^sha256=/i, '')
      .toLowerCase();

    const computedHmac = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(
        Buffer.isBuffer(rawBody)
          ? rawBody
          : Buffer.from(rawBody, 'utf8'),
      )
      .digest('hex')
      .toLowerCase();

    const sigBuf = Buffer.from(normalizedSignature, 'utf8');
    const expectedBuf = Buffer.from(computedHmac, 'utf8');

    if (
      sigBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expectedBuf)
    ) {
      this.logger.warn(
        `Papi webhook signature mismatch! Computed length=${expectedBuf.length}, Header length=${sigBuf.length}`,
      );
      throw new UnauthorizedException('Signature webhook Papi invalide.');
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
      .select(
        'username phone subscriptionExpiresAt subscriptionPlanLabel assistanceExpiresAt assistancePlanLabel',
      )
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

      if (!papiRes.ok && (papiRes.status === 404 || !payment.papiPaymentLink)) {
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
      null;
    const assistancePlanLabel =
      user.assistancePlanLabel ||
      (latestConfirmedAssistance?.assistancePlanId
        ? AGENCY_ASSISTANCE_PLANS[
            latestConfirmedAssistance.assistancePlanId as AssistancePlanId
          ]?.label
        : null) ||
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
