import { Controller, Get, Query, Param } from '@nestjs/common';
import { CitiesService } from './cities.service';

@Controller('api/cities')
export class CitiesController {
  constructor(private readonly citiesService: CitiesService) {}

  @Get('search')
  async search(@Query('q') query: string, @Query('limit') limit?: string) {
    return this.citiesService.search(query, limit ? parseInt(limit, 10) : 20);
  }

  @Get('popular')
  async getPopular(@Query('limit') limit?: string) {
    return this.citiesService.getPopularCities(limit ? parseInt(limit, 10) : 20);
  }

  @Get('nearby')
  async getNearby(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('distance') distance?: string,
    @Query('placeName') placeName?: string,
  ) {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) {
      return null;
    }
    return this.citiesService.findNearby(
      latNum,
      lngNum,
      distance ? parseFloat(distance) : 25000,
      placeName,
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.citiesService.findOne(id);
  }
}
