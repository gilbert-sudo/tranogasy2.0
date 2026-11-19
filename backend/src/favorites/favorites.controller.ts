import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  assertVerifiedUserMatchesIdentifier,
  extractRequiredVerifiedToken,
} from '../common/auth.util';
import { FavoritesService } from './favorites.service';

@Controller('api/favorites')
export class FavoritesController {
  constructor(
    private readonly favoritesService: FavoritesService,
    private readonly configService: ConfigService,
  ) {}

  @Post('toggle')
  async toggleFavorite(
    @Body() body: { userId?: string; propertyId: string },
    @Headers('x-auth-token') authToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = extractRequiredVerifiedToken(
      this.configService,
      authToken,
      authHeader,
    );
    if (!body?.propertyId) {
      throw new BadRequestException('propertyId is required');
    }
    if (body.userId) {
      assertVerifiedUserMatchesIdentifier(verified, body.userId);
    }
    return this.favoritesService.toggleFavorite(verified.userId, body.propertyId);
  }

  @Get('check')
  async checkFavorite(
    @Query('userId') userId: string,
    @Query('propertyId') propertyId: string,
  ) {
    if (!userId || !propertyId) {
      throw new BadRequestException('userId and propertyId are required');
    }
    return this.favoritesService.checkFavorite(userId, propertyId);
  }

  @Get('user/:userId')
  async getUserFavorites(
    @Param('userId') userId: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Headers('x-auth-token') authToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = extractRequiredVerifiedToken(
      this.configService,
      authToken,
      authHeader,
    );
    assertVerifiedUserMatchesIdentifier(verified, userId);
    return this.favoritesService.getUserFavorites(
      verified.userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }
}
