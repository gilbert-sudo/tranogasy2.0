import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import {
  assertVerifiedUserMatchesIdentifier,
  extractRequiredVerifiedToken,
} from '../common/auth.util';
import { PaymentsService } from './payments.service';
import type {
  AssistancePlanId,
  CheckoutPaymentMethod,
  SubscriptionPlanId,
} from './payments.service';

@Controller('api/payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Initiates a Direct Mobile Money payment (USSD push) or generates a Papi hosted payment link (for Card iframe)
   * for Web/Android time-based subscriptions
   */
  @Post('create-subscription-link')
  async createSubscriptionLink(
    @Body()
    body: {
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
    },
    @Headers('x-auth-token') authToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = extractRequiredVerifiedToken(
      this.configService,
      authToken,
      authHeader,
    );
    return this.paymentsService.createSubscriptionPaymentLink({
      ...body,
      userId: verified.userId,
      userPhone: verified.phone || body.userPhone,
    });
  }

  /**
   * Initiates a Direct Mobile Money payment (USSD push) or generates a Papi hosted payment link (for Card iframe)
   * for iOS real-world Agency Assistance services
   */
  @Post('create-assistance-link')
  async createAssistanceLink(
    @Body()
    body: {
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
    },
    @Headers('x-auth-token') authToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = extractRequiredVerifiedToken(
      this.configService,
      authToken,
      authHeader,
    );
    return this.paymentsService.createAssistancePaymentLink({
      ...body,
      userId: verified.userId,
      userPhone: verified.phone || body.userPhone,
    });
  }

  /**
   * Webhook callback from Papi servers
   */
  @Post('papi/webhook')
  @HttpCode(HttpStatus.OK)
  async handlePapiWebhook(
    @Headers('x-papi-signature') signature: string | undefined,
    @Body() body: any,
    @Req() req: Request & { rawBody?: Buffer },
  ) {
    const rawBody = req.rawBody || JSON.stringify(body);
    const resolvedSignature =
      signature ||
      (typeof req.headers['x-signature'] === 'string'
        ? req.headers['x-signature']
        : undefined) ||
      (typeof req.headers['papi-signature'] === 'string'
        ? req.headers['papi-signature']
        : undefined);
    return this.paymentsService.handlePapiWebhook(
      rawBody,
      resolvedSignature,
      body,
    );
  }

  /**
   * Real-time payment verification and sync endpoint with Papi
   */
  @Get('status/:ref')
  async getPaymentStatus(@Param('ref') ref: string) {
    return this.paymentsService.verifyAndSyncPaymentStatus(ref);
  }

  @Get('wallet/:identifier')
  async getUserWallet(
    @Param('identifier') identifier: string,
    @Headers('x-auth-token') authToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = extractRequiredVerifiedToken(
      this.configService,
      authToken,
      authHeader,
    );
    assertVerifiedUserMatchesIdentifier(verified, identifier, true);
    return this.paymentsService.getUserWallet(verified.userId);
  }
}
