import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Property } from '../../properties/schemas/property.schema';

export type UserDocument = User & Document;

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class User {
  @Prop({ required: true })
  username: string;

  @Prop({ default: null })
  bio: string;

  @Prop()
  avatar: string;

  @Prop()
  email: string;

  @Prop()
  phone: string;

  @Prop()
  password?: string;

  @Prop()
  backUpCode?: string;

  @Prop({ enum: ['user', 'admin', 'superadmin'], default: 'user' })
  role: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Property' }] })
  favorites: Property[] | Types.ObjectId[];

  @Prop({ default: 0 })
  balance: number;

  @Prop({ default: null })
  startTime: Date;

  @Prop({ default: null })
  leftTime: number;

  @Prop({ default: null })
  planValidity: number;

  @Prop({ default: false })
  banned: boolean;

  @Prop()
  banReason: string;

  @Prop({ type: { lat: Number, lng: Number }, required: false })
  coords: { lat: number; lng: number };

  @Prop()
  lastConnectedAt: Date;

  @Prop({ default: Date.now })
  created_at: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
