import { Controller, Post, Get, Body, Param, Query, BadRequestException } from '@nestjs/common';
import { FavoritesService } from './favorites.service';

@Controller('api/favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Post('toggle')
  async toggleFavorite(@Body() body: { userId: string; propertyId: string }) {
    if (!body.userId || !body.propertyId) {
      throw new BadRequestException('userId and propertyId are required');
    }
    return this.favoritesService.toggleFavorite(body.userId, body.propertyId);
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
  ) {
    return this.favoritesService.getUserFavorites(
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }
}
