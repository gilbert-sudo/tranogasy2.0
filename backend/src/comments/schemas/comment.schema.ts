import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Property } from '../../properties/schemas/property.schema';

export type CommentDocument = Comment & Document;

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class Comment {
  @Prop({ type: Types.ObjectId, ref: 'Property', required: true, index: true })
  property: Property | Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  user?: User | Types.ObjectId;

  @Prop({ required: true, trim: true })
  content: string;

  @Prop({ required: true, default: 'Utilisateur TranoGasy' })
  authorName: string;

  @Prop({ required: false, default: null })
  authorAvatar?: string;

  @Prop({ default: 0 })
  likes: number;

  @Prop({ type: [String], default: [] })
  likedBy: string[];

  @Prop({ default: false })
  isEdited: boolean;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);
CommentSchema.index({ property: 1, created_at: -1 });
