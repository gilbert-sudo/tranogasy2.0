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
import type { Request } from 'express';
import { PaymentsService } from './payments.service';
import type {
  AssistancePlanId,
  SubscriptionPlanId,
} from './payments.service';

@Controller('api/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Generates a Papi hosted payment link for Web/Android time-based subscriptions
   */
  @Post('create-subscription-link')
  async createSubscriptionLink(
    @Body()
    body: {
      userId?: string;
      userPhone?: string;
      planId: SubscriptionPlanId;
      clientName?: string;
      payerEmail?: string;
      payerPhone?: string;
      successUrl?: string;
      failureUrl?: string;
    },
  ) {
    return this.paymentsService.createSubscriptionPaymentLink(body);
  }

  /**
   * Generates a Papi hosted payment link for iOS real-world Agency Assistance services
   */
  @Post('create-assistance-link')
  async createAssistanceLink(
    @Body()
    body: {
      userId?: string;
      userPhone?: string;
      planId: AssistancePlanId;
      clientName?: string;
      payerEmail?: string;
      payerPhone?: string;
      successUrl?: string;
      failureUrl?: string;
    },
  ) {
    return this.paymentsService.createAssistancePaymentLink(body);
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
    return this.paymentsService.handlePapiWebhook(rawBody, signature, body);
  }

  /**
   * Real-time payment verification and sync endpoint with Papi
   */
  @Get('status/:ref')
  async getPaymentStatus(@Param('ref') ref: string) {
    return this.paymentsService.verifyAndSyncPaymentStatus(ref);
  }

  @Get('wallet/:identifier')
  async getUserWallet(@Param('identifier') identifier: string) {
    return this.paymentsService.getUserWallet(identifier);
  }
}
