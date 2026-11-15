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

  private extractOptionalViewerId(
    authTokenHeader?: string,
    authHeader?: string,
    explicitViewerId?: string,
  ): string | undefined {
    const rawBearer = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : undefined;
    const token = authTokenHeader || rawBearer;
    if (token) {
      const secret = resolveAuthSecret(
        this.configService.get<string>('AUTH_TOKEN_SECRET') ||
          this.configService.get<string>('JWT_SECRET'),
        this.configService.get<string>('DATABASE_URI'),
      );
      const verified = verifyAuthToken(token, secret);
      if (verified?.userId) return verified.userId;
    }
    return explicitViewerId ? String(explicitViewerId).trim() : undefined;
  }

  @Get()
  async getPaginatedProperties(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('viewerId') viewerId?: string,
    @Headers('x-auth-token') authToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const resolvedViewer = this.extractOptionalViewerId(authToken, authHeader, viewerId);
    return this.propertiesService.getPaginatedProperties(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      resolvedViewer,
    );
  }

  @Get('latest')
  async getLatestProperties(
    @Query('limit') limit: string,
    @Query('viewerId') viewerId?: string,
    @Headers('x-auth-token') authToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const resolvedViewer = this.extractOptionalViewerId(authToken, authHeader, viewerId);
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
    const resolvedViewer = this.extractOptionalViewerId(
      authToken,
      authHeader,
      query?.viewerId,
    );
    return this.propertiesService.searchProperties(query, resolvedViewer);
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
  async findOne(
    @Param('id') id: string,
    @Query('viewerId') viewerId?: string,
    @Headers('x-auth-token') authToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const resolvedViewer = this.extractOptionalViewerId(authToken, authHeader, viewerId);
    return this.propertiesService.findOne(id, resolvedViewer);
  }

  @Post(':id/unlock-contact')
  async unlockContact(
    @Param('id') id: string,
    @Body() body?: { userId?: string },
    @Headers('x-auth-token') authToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const resolvedUserId = this.extractOptionalViewerId(
      authToken,
      authHeader,
      body?.userId,
    );
    if (!resolvedUserId) {
      throw new UnauthorizedException(
        'Veuillez vous connecter pour débloquer ce contact.',
      );
    }
    return this.propertiesService.unlockPropertyContact(id, resolvedUserId);
  }

  @Post()
  async create(@Body() createPropertyDto: any) {
    const safeDto =
      createPropertyDto && typeof createPropertyDto === 'object'
        ? { ...createPropertyDto }
        : createPropertyDto;
    if (safeDto && typeof safeDto === 'object') {
      delete safeDto.created_at;
      delete safeDto.updated_at;
    }
    return this.propertiesService.create(safeDto);
  }
}
