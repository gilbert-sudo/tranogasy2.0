import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SmsService } from './sms.service';
import { SmsController } from './sms.controller';
import {
  OtpVerification,
  OtpVerificationSchema,
} from './schemas/otp-verification.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OtpVerification.name, schema: OtpVerificationSchema },
    ]),
  ],
  controllers: [SmsController],
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
