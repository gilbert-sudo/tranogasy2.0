import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { PropertiesService } from './properties.service';

@Controller('api/properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Get()
  async getPaginatedProperties(
    @Query('page') page: string,
    @Query('limit') limit: string,
  ) {
    return this.propertiesService.getPaginatedProperties(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('latest')
  async getLatestProperties(@Query('limit') limit: string) {
    return this.propertiesService.getLatestProperties(
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get('search')
  async searchProperties(@Query() query: Record<string, any>) {
    return this.propertiesService.searchProperties(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.propertiesService.findOne(id);
  }

  @Post()
  async create(@Body() createPropertyDto: any) {
    return this.propertiesService.create(createPropertyDto);
  }
}
