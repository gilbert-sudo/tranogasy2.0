import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveAuthSecret, verifyAuthToken } from '../common/phone.util';
import { PropertiesService } from './properties.service';

@Controller('api/properties')
export class PropertiesController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly configService: ConfigService,
  ) {}

  private extractVerifiedToken(authTokenHeader?: string, authHeader?: string) {
    const rawBearer = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : undefined;
    const token = authTokenHeader || rawBearer;
    const secret = resolveAuthSecret(
      this.configService.get<string>('AUTH_TOKEN_SECRET') ||
        this.configService.get<string>('JWT_SECRET'),
      this.configService.get<string>('DATABASE_URI'),
    );
    const verified = verifyAuthToken(token, secret);
    if (!verified) {
      throw new UnauthorizedException('Jeton de session invalide ou expiré. Veuillez vous reconnecter.');
    }
    return verified;
  }

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

  @Get('claimable')
  async getClaimableProperties(
    @Headers('x-auth-token') authToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = this.extractVerifiedToken(authToken, authHeader);
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
    const verified = this.extractVerifiedToken(authToken, authHeader);
    if (!Array.isArray(body?.propertyIds) || body.propertyIds.length === 0) {
      throw new BadRequestException('Veuillez sélectionner au moins une annonce à réclamer.');
    }
    return this.propertiesService.claimProperties(verified.userId, body);
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
