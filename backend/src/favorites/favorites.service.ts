import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { sanitizePropertyForViewer } from '../common/property-sanitizer.util';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Favorite, FavoriteDocument } from './schemas/favorite.schema';

@Injectable()
export class FavoritesService {
  constructor(
    @InjectModel(Favorite.name) private favoriteModel: Model<FavoriteDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  private async hasFullContactAccess(viewerUserId?: string): Promise<boolean> {
    if (!viewerUserId || !Types.ObjectId.isValid(viewerUserId)) {
      return false;
    }
    const viewer = await this.userModel
      .findById(viewerUserId)
      .select('hasAllContactsUnlocked subscriptionExpiresAt')
      .lean()
      .catch(() => null);
    if (!viewer) return false;
    if (viewer.hasAllContactsUnlocked) return true;
    if (viewer.subscriptionExpiresAt) {
      return new Date(viewer.subscriptionExpiresAt).getTime() > Date.now();
    }
    return false;
  }

  async toggleFavorite(userId: string, propertyId: string) {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(propertyId)) {
      throw new BadRequestException('Invalid userId or propertyId');
    }

    const existingFavorite = await this.favoriteModel.findOne({
      user: userId,
      property: propertyId,
    });

    if (existingFavorite) {
      await existingFavorite.deleteOne();
      return { message: 'Removed from favorites', isFavorite: false };
    } else {
      const newFavorite = new this.favoriteModel({
        user: userId,
        property: propertyId,
      });
      await newFavorite.save();
      return { message: 'Added to favorites', isFavorite: true };
    }
  }

  async checkFavorite(userId: string, propertyId: string) {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(propertyId)) {
      return { isFavorite: false };
    }
    const favorite = await this.favoriteModel.findOne({
      user: userId,
      property: propertyId,
    });
    return { isFavorite: !!favorite };
  }

  async getUserFavorites(userId: string, page: number = 1, limit: number = 20) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid userId');
    }

    const skip = (page - 1) * limit;

    const [favorites, total, viewerHasFullAccess] = await Promise.all([
      this.favoriteModel
        .find({ user: userId })
        .populate({
          path: 'property',
          populate: [
            { path: 'city' },
            { path: 'features' },
            { path: 'owner', select: '_id username avatar role phone bio lastConnectedAt created_at' }
          ]
        })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.favoriteModel.countDocuments({ user: userId }),
      this.hasFullContactAccess(userId),
    ]);

    // Extract the properties, filtering out any nulls if property was deleted,
    // and enforce contact paywall sanitization for the viewer.
    const properties = favorites
      .map((f) => f.property)
      .filter((p) => p !== null)
      .map((p) =>
        sanitizePropertyForViewer(p, false, userId, viewerHasFullAccess),
      );

    return {
      properties,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }
}
