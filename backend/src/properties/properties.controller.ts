import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  extractOptionalVerifiedToken,
  extractRequiredVerifiedToken,
} from '../common/auth.util';
import { PropertiesService } from './properties.service';

@Controller('api/properties')
export class PropertiesController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly configService: ConfigService,
  ) {}

  private extractOptionalViewerId(
    authTokenHeader?: string,
    authHeader?: string,
  ): string | undefined {
    const verified = extractOptionalVerifiedToken(
      this.configService,
      authTokenHeader,
      authHeader,
    );
    return verified?.userId || undefined;
  }

  @Get()
  async getPaginatedProperties(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Headers('x-auth-token') authToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const resolvedViewer = this.extractOptionalViewerId(authToken, authHeader);
    return this.propertiesService.getPaginatedProperties(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      resolvedViewer,
    );
  }

  @Get('latest')
  async getLatestProperties(
    @Query('limit') limit: string,
    @Headers('x-auth-token') authToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const resolvedViewer = this.extractOptionalViewerId(authToken, authHeader);
    return this.propertiesService.getLatestProperties(
      limit ? parseInt(limit, 10) : 10,
      resolvedViewer,
    );
  }

  @Get('search')
  async searchProperties(
    @Query() query: Record<string, any>,
    @Headers('x-auth-token') authToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const resolvedViewer = this.extractOptionalViewerId(authToken, authHeader);
    return this.propertiesService.searchProperties(query, resolvedViewer);
  }

  @Get('claimable')
  async getClaimableProperties(
    @Headers('x-auth-token') authToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = extractRequiredVerifiedToken(
      this.configService,
      authToken,
      authHeader,
    );
    return this.propertiesService.findClaimableForUser(verified.userId);
  }

  @Post('claim')
  async claimProperties(
    @Body()
    body: {
      propertyIds?: string[];
      adoptUsername?: boolean;
      adoptAvatar?: boolean;
    },
    @Headers('x-auth-token') authToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = extractRequiredVerifiedToken(
      this.configService,
      authToken,
      authHeader,
    );
    if (!Array.isArray(body?.propertyIds) || body.propertyIds.length === 0) {
      throw new BadRequestException('Veuillez sélectionner au moins une annonce à réclamer.');
    }
    return this.propertiesService.claimProperties(verified.userId, body);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Headers('x-auth-token') authToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const resolvedViewer = this.extractOptionalViewerId(authToken, authHeader);
    return this.propertiesService.findOne(id, resolvedViewer);
  }

  @Post()
  async create(
    @Body() createPropertyDto: any,
    @Headers('x-auth-token') authToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = extractRequiredVerifiedToken(
      this.configService,
      authToken,
      authHeader,
    );
    const safeDto =
      createPropertyDto && typeof createPropertyDto === 'object'
        ? { ...createPropertyDto }
        : {};
    delete safeDto.created_at;
    delete safeDto.updated_at;
    safeDto.owner = verified.userId;
    return this.propertiesService.create(safeDto);
  }
}
