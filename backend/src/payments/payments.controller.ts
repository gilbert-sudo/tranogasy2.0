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

@Controller('api/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Generates a Papi hosted payment link (all 4 payment methods: MVola, Orange, Airtel, Carte CB)
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
