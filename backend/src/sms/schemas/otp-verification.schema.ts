import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OtpVerificationDocument = OtpVerification & Document;

/**
 * Ephemeral server-side SMS OTP challenge used to verify real phone ownership
 * prior to authenticating accounts or claiming scraped Facebook listings.
 */
@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class OtpVerification {
  @Prop({ required: true, index: true })
  phone: string;

  @Prop({ required: true })
  codeHash: string;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  verifiedAt: Date | null;
}

export const OtpVerificationSchema = SchemaFactory.createForClass(OtpVerification);
OtpVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
