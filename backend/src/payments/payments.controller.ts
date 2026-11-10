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
import { PaymentsService, OperatorId } from './payments.service';

@Controller('api/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Generates a Papi hosted payment link (all 4 payment methods)
   */
  @Post('create-payment-link')
  async createPaymentLink(
    @Body()
    body: {
      userId?: string;
      userPhone?: string;
      tokens: number;
      clientName?: string;
      payerEmail?: string;
      payerPhone?: string;
      successUrl?: string;
      failureUrl?: string;
    },
  ) {
    return this.paymentsService.createPapiPaymentLink(body);
  }

  /**
   * Direct Mobile Money USSD prompt initiation
   */
  @Post('initiate-direct')
  async initiateDirect(
    @Body()
    body: {
      userId?: string;
      userPhone?: string;
      tokens: number;
      operator: OperatorId;
      phoneNumber: string;
      temporaryCode?: string;
      clientName?: string;
      payerEmail?: string;
    },
  ) {
    return this.paymentsService.initiateDirectPayment(body);
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
   * Real-time payment verification and sync endpoint
   */
  @Get('status/:ref')
  async getPaymentStatus(@Param('ref') ref: string) {
    return this.paymentsService.verifyAndSyncPaymentStatus(ref);
  }

  @Post('purchase-tokens')
  async purchaseTokens(
    @Body()
    body: {
      userId?: string;
      userPhone?: string;
      tokens: number;
      operator: OperatorId;
      senderPhone: string;
    },
  ) {
    return this.paymentsService.purchaseTokens(body);
  }

  @Post('spend-tokens')
  async spendTokens(
    @Body()
    body: {
      userId: string;
      tokens: number;
      reason: string;
    },
  ) {
    return this.paymentsService.spendTokens(body);
  }

  @Get('wallet/:identifier')
  async getUserWallet(@Param('identifier') identifier: string) {
    return this.paymentsService.getUserWallet(identifier);
  }
}
