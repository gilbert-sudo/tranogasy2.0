import {
  Controller,
  Get,
  Post,
  Body,
  Param,
} from '@nestjs/common';
import { PaymentsService, OperatorId } from './payments.service';

@Controller('api/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

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
