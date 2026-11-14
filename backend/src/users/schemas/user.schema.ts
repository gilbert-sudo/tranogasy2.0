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

  @Prop({ default: null })
  coverImage: string;

  @Prop({ default: null })
  location: string;

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

  @Prop({ type: [String], default: [] })
  fcmTokens: string[];

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

  /**
   * Origin and shadow-profile metadata used for seamlessly displaying
   * Facebook publishers as native users until they verify their phone and claim.
   */
  @Prop({ enum: ['organic', 'facebook_scraper'], default: 'organic' })
  origin: 'organic' | 'facebook_scraper';

  @Prop({ default: false })
  isShadowAccount: boolean;

  @Prop({ type: String, default: null })
  fbUserId: string | null;

  @Prop({ type: String, default: null })
  fbProfileUrl: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  mergedIntoUserId: Types.ObjectId | null;

  @Prop({ default: Date.now })
  created_at: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ fbUserId: 1 }, { sparse: true });
UserSchema.index({ fbProfileUrl: 1 }, { sparse: true });
UserSchema.index({ phone: 1 }, { sparse: true });
