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

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.citiesService.findOne(id);
  }
}
