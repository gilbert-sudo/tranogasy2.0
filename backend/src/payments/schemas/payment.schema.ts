import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type PaymentDocument = Payment & Document;

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class Payment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: User | Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Admin', default: null })
  confirmedBy: Types.ObjectId | null;

  @Prop({ required: true })
  type: string;

  @Prop({
    enum: ['mvola', 'airtel', 'orange', 'card', 'papi', 'other'],
    default: 'papi',
  })
  operator: string;

  @Prop({ required: true })
  reason: string;

  @Prop({ default: '' })
  payload: string;

  @Prop({ required: true, min: 300 })
  amount: number;

  @Prop({ required: true, min: 1 })
  tokens: number;

  @Prop({ default: '' })
  phoneNumber: string;

  @Prop({
    enum: ['pending', 'confirmed', 'refused', 'redone', 'failed'],
    default: 'pending',
  })
  status: string;

  @Prop({
    required: true,
    index: true,
    default: () => `JP-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`,
  })
  ref: string;

  @Prop({ default: null })
  papiPaymentLink?: string;

  @Prop({ default: null })
  papiNotificationToken?: string;

  @Prop({ default: null })
  papiPaymentMethod?: string;

  @Prop({ default: null })
  papiRawStatus?: string;

  @Prop({ default: null })
  failureReason?: string;

  @Prop({ default: Date.now })
  created_at: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
