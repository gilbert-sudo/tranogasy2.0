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

  @Prop({ enum: ['mvola', 'airtel', 'orange'], required: true })
  operator: 'mvola' | 'airtel' | 'orange';

  @Prop({ required: true })
  reason: string;

  @Prop({ required: true })
  payload: string;

  @Prop({ required: true, min: 1000 })
  amount: number;

  @Prop({ required: true, min: 100 })
  tokens: number;

  @Prop({ required: true })
  phoneNumber: string;

  @Prop({
    enum: ['pending', 'confirmed', 'refused', 'redone'],
    default: 'confirmed',
  })
  status: string;

  @Prop({ default: () => `JP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}` })
  ref: string;

  @Prop({ default: Date.now })
  created_at: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
