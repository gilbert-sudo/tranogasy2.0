import {
  Controller,
  Delete,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Headers,
  Res,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import {
  assertVerifiedUserMatchesIdentifier,
  extractRequiredVerifiedToken,
} from '../common/auth.util';
import { UsersService } from './users.service';

@Controller('api/users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  @Get('exist/:phone')
  async checkExistence(@Param('phone') phone: string, @Res() res: Response) {
    const user = await this.usersService.getUserByPhone(phone);
    if (user) {
      return res.status(HttpStatus.OK).json({ exists: true, user });
    }
    return res.status(HttpStatus.NOT_FOUND).json({ exists: false });
  }

  @Post('otp/request')
  async requestOtp(@Body() body: { phone?: string }) {
    if (!body?.phone) {
      throw new BadRequestException('Le numéro de téléphone est requis');
    }
    return this.usersService.requestPhoneOtp(body.phone);
  }

  @Post('otp/verify')
  async verifyOtp(@Body() body: { phone?: string; code?: string }) {
    if (!body?.phone || !body?.code) {
      throw new BadRequestException('Téléphone et code de vérification requis');
    }
    return this.usersService.verifyPhoneOtp(body.phone, body.code);
  }

  @Post('phone-login')
  async phoneLogin(@Body() body: any) {
    const { phone, username } = body;
    if (!phone) {
      throw new BadRequestException('Phone is required');
    }
    return this.usersService.loginOrRegisterByPhone(phone, username);
  }

  @Get('profile/:identifier')
  async getPublicProfile(
    @Param('identifier') identifier: string,
    @Query('source') source?: string,
  ) {
    return this.usersService.getPublicProfile(identifier, source);
  }

  @Patch(':id/profile')
  async updateProfile(
    @Param('id') id: string,
    @Body() body: any,
    @Headers('x-auth-token') authToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = extractRequiredVerifiedToken(
      this.configService,
      authToken,
      authHeader,
    );
    assertVerifiedUserMatchesIdentifier(verified, id);
    return this.usersService.updateProfile(id, body);
  }

  @Delete(':id')
  async deleteAccount(
    @Param('id') id: string,
    @Headers('x-auth-token') authToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = extractRequiredVerifiedToken(
      this.configService,
      authToken,
      authHeader,
    );
    assertVerifiedUserMatchesIdentifier(verified, id);
    return this.usersService.deleteAccount(id);
  }

  @Post('login')
  async login(@Body() body: any) {
    const { phone, password, username } = body;
    if (!phone) {
      throw new BadRequestException('Phone is required');
    }
    return this.usersService.login(phone, password, username);
  }

  @Post()
  async signup(@Body() body: any) {
    return this.usersService.signup(body);
  }
}
