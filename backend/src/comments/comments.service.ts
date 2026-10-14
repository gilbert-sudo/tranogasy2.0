import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Comment, CommentDocument } from './schemas/comment.schema';

@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
  ) {}

  async findByProperty(propertyId: string): Promise<Comment[]> {
    if (!Types.ObjectId.isValid(propertyId)) {
      return [];
    }
    return this.commentModel
      .find({ property: new Types.ObjectId(propertyId) })
      .sort({ created_at: -1 })
      .exec();
  }

  async countByProperty(propertyId: string): Promise<number> {
    if (!Types.ObjectId.isValid(propertyId)) {
      return 0;
    }
    return this.commentModel.countDocuments({ property: new Types.ObjectId(propertyId) }).exec();
  }

  async create(data: {
    propertyId: string;
    content: string;
    userId?: string;
    authorName?: string;
    authorAvatar?: string;
  }): Promise<Comment> {
    const comment = new this.commentModel({
      property: new Types.ObjectId(data.propertyId),
      content: data.content,
      user: data.userId && Types.ObjectId.isValid(data.userId) ? new Types.ObjectId(data.userId) : undefined,
      authorName: data.authorName || 'Utilisateur TranoGasy',
      authorAvatar: data.authorAvatar || null,
      likes: 0,
      likedBy: [],
    });

    return comment.save();
  }

  async toggleLike(commentId: string, identifier: string): Promise<{ liked: boolean; likes: number }> {
    const comment = await this.commentModel.findById(commentId);
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    const hasLiked = comment.likedBy.includes(identifier);
    if (hasLiked) {
      comment.likedBy = comment.likedBy.filter((id) => id !== identifier);
      comment.likes = Math.max(0, comment.likes - 1);
    } else {
      comment.likedBy.push(identifier);
      comment.likes += 1;
    }

    await comment.save();
    return { liked: !hasLiked, likes: comment.likes };
  }

  async update(
    commentId: string,
    content: string,
    userId?: string,
  ): Promise<Comment> {
    const comment = await this.commentModel.findById(commentId);
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    if (userId && comment.user && comment.user.toString() !== userId) {
      throw new NotFoundException('Not authorized to edit this comment');
    }

    comment.content = content.trim();
    comment.isEdited = true;
    return comment.save();
  }

  async delete(commentId: string, userId?: string): Promise<boolean> {
    const comment = await this.commentModel.findById(commentId);
    if (!comment) {
      return false;
    }

    if (userId && comment.user && comment.user.toString() !== userId) {
      return false;
    }

    await this.commentModel.findByIdAndDelete(commentId);
    return true;
  }
}
