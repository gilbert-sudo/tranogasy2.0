import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Property } from '../../properties/schemas/property.schema';

export type FavoriteDocument = Favorite & Document;

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class Favorite {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: User | Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Property', required: true })
  property: Property | Types.ObjectId;
}

export const FavoriteSchema = SchemaFactory.createForClass(Favorite);
FavoriteSchema.index({ user: 1, property: 1 }, { unique: true });
