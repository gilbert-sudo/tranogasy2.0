import * as crypto from 'crypto';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { extractRequiredVerifiedToken } from '../common/auth.util';
import { User, UserDocument } from '../users/schemas/user.schema';

export function verifyOptionalAdminSecretHeader(
  configService: ConfigService,
  rawHeader?: string | string[],
): void {
  const configuredSecret = configService.get<string>('ADMIN_ACCESS_SECRET')?.trim();
  if (!configuredSecret) return;

  const provided = (Array.isArray(rawHeader) ? rawHeader[0] : rawHeader || '').trim();
  const expectedBuf = Buffer.from(configuredSecret, 'utf8');
  const providedBuf = Buffer.from(provided, 'utf8');

  if (
    providedBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(providedBuf, expectedBuf)
  ) {
    throw new UnauthorizedException('Accès administrateur refusé.');
  }
}

@Injectable()
export class FbAdminGuard implements CanActivate {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    verifyOptionalAdminSecretHeader(this.configService, req.headers['x-admin-secret']);

    const rawAuthToken = req.headers['x-auth-token'];
    const rawAuthorization = req.headers['authorization'];
    const xAuthToken = Array.isArray(rawAuthToken) ? rawAuthToken[0] : rawAuthToken;
    const authorization = Array.isArray(rawAuthorization)
      ? rawAuthorization[0]
      : rawAuthorization;

    const verified = extractRequiredVerifiedToken(
      this.configService,
      xAuthToken,
      authorization,
    );

    if (!Types.ObjectId.isValid(verified.userId)) {
      throw new UnauthorizedException('Jeton administrateur invalide.');
    }

    const user = await this.userModel
      .findById(verified.userId, {
        _id: 1,
        role: 1,
        username: 1,
        email: 1,
        phone: 1,
        avatar: 1,
      })
      .lean();

    if (!user) {
      throw new UnauthorizedException('Compte administrateur introuvable.');
    }

    if (user.role !== 'admin' && user.role !== 'superadmin') {
      throw new ForbiddenException('Privilèges administrateur requis.');
    }

    req.adminUser = user;
    return true;
  }
}

