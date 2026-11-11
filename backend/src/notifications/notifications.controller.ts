import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { FirebaseService } from './firebase.service';

@Controller('api/notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly firebaseService: FirebaseService,
  ) {}

  @Post('register-token')
  async registerToken(@Body() body: { userId: string; token: string }) {
    if (!body.userId || !body.token) {
      throw new BadRequestException('userId and token are required');
    }
    return this.notificationsService.registerToken(body.userId, body.token);
  }

  @Post('remove-token')
  async removeToken(@Body() body: { userId: string; token: string }) {
    if (!body.userId || !body.token) {
      throw new BadRequestException('userId and token are required');
    }
    return this.notificationsService.removeToken(body.userId, body.token);
  }

  @Get()
  async getUserNotifications(
    @Query('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    if (!userId) {
      throw new BadRequestException('userId query parameter is required');
    }
    return this.notificationsService.getUserNotifications(
      userId,
      limit ? parseInt(limit, 10) : 30,
    );
  }

  @Patch('read-all')
  async markAllAsRead(@Body() body: { userId: string }) {
    if (!body.userId) {
      throw new BadRequestException('userId is required');
    }
    return this.notificationsService.markAllAsRead(body.userId);
  }

  @Patch(':id/read')
  async markAsRead(
    @Param('id') id: string,
    @Body() body: { userId: string },
  ) {
    if (!body.userId) {
      throw new BadRequestException('userId is required');
    }
    return this.notificationsService.markAsRead(id, body.userId);
  }

  @Post('test')
  async sendTestNotification(
    @Body()
    body: {
      userId?: string;
      token?: string;
      title?: string;
      body?: string;
      url?: string;
    },
  ) {
    const title = body.title || '🔔 Test Notification TranoGasy';
    const message =
      body.body || 'Félicitations, vos notifications Push Firebase fonctionnent !';

    if (body.token) {
      const res = await this.firebaseService.sendToTokens([body.token], {
        title,
        body: message,
        data: { url: body.url || '/' },
      });
      return { success: res.successCount > 0, result: res };
    }

    if (body.userId) {
      const notif = await this.notificationsService.createAndSend({
        userId: body.userId,
        title,
        body: message,
        data: { url: body.url || '/' },
      });
      return { success: true, notification: notif };
    }

    throw new BadRequestException('Either userId or token must be provided');
  }
}

