import {
  Controller,
  Post,
  Body,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SmsService } from './sms.service';

@Controller(['api/sms', 'sms'])
export class SmsController {
  constructor(private readonly smsService: SmsService) {}

  @Post('send-sms')
  @HttpCode(HttpStatus.OK)
  async sendSMS(@Body() body: any) {
    const phone = body.phone_number || body.phone || body.phoneNumber;
    const message = body.message;

    if (!phone || !message) {
      throw new BadRequestException('Phone number and message are required');
    }

    return this.smsService.sendSMS(phone, message);
  }
}
