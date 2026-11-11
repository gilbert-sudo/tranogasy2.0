import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
} from './schemas/notification.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { FirebaseService, PushNotificationPayload } from './firebase.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private readonly firebaseService: FirebaseService,
  ) {}

  /**
   * Registers or updates an FCM token for a user.
   */
  async registerToken(userId: string, token: string) {
    if (!token || !userId) {
      throw new BadRequestException('userId and token are required');
    }

    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid userId format');
    }

    const updated = await this.userModel.findByIdAndUpdate(
      userId,
      { $addToSet: { fcmTokens: token } },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('User not found');
    }

    this.logger.log(
      `Registered FCM token for user ${userId}. Total tokens: ${updated.fcmTokens?.length || 0}`,
    );

    return {
      success: true,
      message: 'Token registered successfully',
      tokenCount: updated.fcmTokens?.length || 0,
    };
  }

  /**
   * Unregisters an FCM token when a user logs out or revokes permissions.
   */
  async removeToken(userId: string, token: string) {
    if (!token || !userId) {
      throw new BadRequestException('userId and token are required');
    }

    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid userId format');
    }

    await this.userModel.findByIdAndUpdate(userId, {
      $pull: { fcmTokens: token },
    });

    return { success: true, message: 'Token removed successfully' };
  }

  /**
   * Creates an in-app notification in MongoDB and sends an FCM push notification
   * to all active devices of the recipient.
   */
  async createAndSend(dto: {
    userId: string | Types.ObjectId;
    title: string;
    body: string;
    data?: Record<string, any>;
    imageUrl?: string;
  }) {
    const userObjectId =
      dto.userId instanceof Types.ObjectId
        ? dto.userId
        : new Types.ObjectId(dto.userId);

    // 1. Save in database
    const notification = new this.notificationModel({
      user: userObjectId,
      title: dto.title,
      body: dto.body,
      data: dto.data || {},
      read: false,
    });
    await notification.save();

    // 2. Fetch user to retrieve FCM device tokens
    const user = await this.userModel
      .findById(userObjectId)
      .select('fcmTokens username')
      .exec();

    if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
      this.logger.log(
        `In-app notification saved for user ${dto.userId}, but no FCM tokens registered.`,
      );
      return notification;
    }

    // 3. Send FCM push notification
    const payload: PushNotificationPayload = {
      title: dto.title,
      body: dto.body,
      data: dto.data,
      imageUrl: dto.imageUrl,
    };

    const pushResult = await this.firebaseService.sendToTokens(
      user.fcmTokens,
      payload,
    );

    // 4. Prune invalid/expired tokens
    if (pushResult.invalidTokens.length > 0) {
      await this.userModel.findByIdAndUpdate(userObjectId, {
        $pull: { fcmTokens: { $in: pushResult.invalidTokens } },
      });
      this.logger.log(
        `Pruned ${pushResult.invalidTokens.length} expired FCM tokens for user ${dto.userId}`,
      );
    }

    return notification;
  }

  /**
   * Retrieves all notifications for a specific user.
   */
  async getUserNotifications(userId: string, limit = 30) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid userId format');
    }

    const notifications = await this.notificationModel
      .find({ user: new Types.ObjectId(userId) })
      .sort({ created_at: -1 })
      .limit(limit)
      .lean()
      .exec();

    const unreadCount = await this.notificationModel.countDocuments({
      user: new Types.ObjectId(userId),
      read: false,
    });

    return { notifications, unreadCount };
  }

  /**
   * Marks a single notification as read.
   */
  async markAsRead(notificationId: string, userId: string) {
    if (
      !Types.ObjectId.isValid(notificationId) ||
      !Types.ObjectId.isValid(userId)
    ) {
      throw new BadRequestException('Invalid ID format');
    }

    const updated = await this.notificationModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(notificationId),
        user: new Types.ObjectId(userId),
      },
      { read: true },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('Notification not found');
    }

    return { success: true, notification: updated };
  }

  /**
   * Marks all notifications of a user as read.
   */
  async markAllAsRead(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid userId format');
    }

    await this.notificationModel.updateMany(
      { user: new Types.ObjectId(userId), read: false },
      { read: true },
    );

    return { success: true, message: 'All notifications marked as read' };
  }
}

