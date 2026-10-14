import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { CommentsService } from './comments.service';

@Controller('api/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get('property/:propertyId')
  async getByProperty(@Param('propertyId') propertyId: string) {
    if (!propertyId) {
      throw new BadRequestException('propertyId is required');
    }
    const comments = await this.commentsService.findByProperty(propertyId);
    const count = comments.length;
    return { comments, count };
  }

  @Post()
  async create(
    @Body()
    body: {
      propertyId: string;
      content: string;
      userId?: string;
      authorName?: string;
      authorAvatar?: string;
    },
  ) {
    if (!body.propertyId || !body.content?.trim()) {
      throw new BadRequestException('propertyId and content are required');
    }
    const comment = await this.commentsService.create(body);
    return { comment, success: true };
  }

  @Post(':id/like')
  async toggleLike(
    @Param('id') commentId: string,
    @Body('userId') userId: string,
  ) {
    const identifier = userId || 'anonymous';
    return this.commentsService.toggleLike(commentId, identifier);
  }

  @Put(':id')
  async update(
    @Param('id') commentId: string,
    @Body() body: { content: string; userId?: string },
  ) {
    if (!body.content?.trim()) {
      throw new BadRequestException('content is required');
    }
    const comment = await this.commentsService.update(commentId, body.content, body.userId);
    return { comment, success: true };
  }

  @Delete(':id')
  async delete(
    @Param('id') commentId: string,
    @Query('userId') userId?: string,
  ) {
    const success = await this.commentsService.delete(commentId, userId);
    return { success };
  }
}
