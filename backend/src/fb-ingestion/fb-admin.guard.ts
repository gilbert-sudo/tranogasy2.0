import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class FbAdminGuard implements CanActivate {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const rawUserId = req.headers['x-user-id'];
    const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;

    if (!userId || typeof userId !== 'string' || !Types.ObjectId.isValid(userId)) {
      throw new UnauthorizedException('Admin x-user-id header is required');
    }

    const user = await this.userModel
      .findById(userId, { _id: 1, role: 1, username: 1 })
      .lean();

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.role !== 'admin' && user.role !== 'superadmin') {
      throw new ForbiddenException('Admin or superadmin privileges required');
    }

    req.adminUser = user;
    return true;
  }
}

