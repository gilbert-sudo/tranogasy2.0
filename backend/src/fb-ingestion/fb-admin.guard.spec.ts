import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { resolveAuthSecret, signAuthToken } from '../common/phone.util';
import { UserDocument } from '../users/schemas/user.schema';
import { FbAdminGuard, verifyOptionalAdminSecretHeader } from './fb-admin.guard';

function makeContext(headers: Record<string, string | undefined>): {
  ctx: ExecutionContext;
  req: Record<string, any>;
} {
  const req: Record<string, any> = { headers };
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
  return { ctx, req };
}

describe('FbAdminGuard', () => {
  const adminId = '507f1f77bcf86cd799439011';
  const normalUserId = '507f1f77bcf86cd799439022';

  const makeConfig = (overrides: Record<string, string | undefined> = {}) =>
    ({
      get: (key: string) => {
        if (key in overrides) return overrides[key];
        if (key === 'AUTH_TOKEN_SECRET') return 'unit-test-secret';
        return undefined;
      },
    }) as unknown as ConfigService;

  const secret = resolveAuthSecret('unit-test-secret', undefined);

  const makeUserModel = (record: any) =>
    ({
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(record),
      }),
    }) as unknown as Model<UserDocument>;

  it('rejects requests that only pass spoofable x-user-id without a signed token', async () => {
    const guard = new FbAdminGuard(
      makeUserModel({ _id: adminId, role: 'admin', username: 'Admin' }),
      makeConfig(),
    );
    const { ctx } = makeContext({ 'x-user-id': adminId });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects forged or expired tokens', async () => {
    const guard = new FbAdminGuard(
      makeUserModel({ _id: adminId, role: 'admin', username: 'Admin' }),
      makeConfig(),
    );
    const { ctx: forgedCtx } = makeContext({
      authorization: 'Bearer forged.token',
    });
    await expect(guard.canActivate(forgedCtx)).rejects.toThrow(UnauthorizedException);

    const expired = signAuthToken(adminId, '0340000001', secret, -1000);
    const { ctx: expiredCtx } = makeContext({ 'x-auth-token': expired });
    await expect(guard.canActivate(expiredCtx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects valid signed token for a non-admin user', async () => {
    const guard = new FbAdminGuard(
      makeUserModel({ _id: normalUserId, role: 'user', username: 'Regular' }),
      makeConfig(),
    );
    const token = signAuthToken(normalUserId, '0341111111', secret);
    const { ctx } = makeContext({ authorization: `Bearer ${token}` });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('allows valid signed token for an admin user and attaches req.adminUser', async () => {
    const adminDoc = { _id: adminId, role: 'superadmin', username: 'Boss' };
    const guard = new FbAdminGuard(makeUserModel(adminDoc), makeConfig());
    const token = signAuthToken(adminId, '0340000001', secret);
    const { ctx, req } = makeContext({ authorization: `Bearer ${token}` });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.adminUser).toEqual(adminDoc);
  });

  it('enforces x-admin-secret when ADMIN_ACCESS_SECRET is configured', async () => {
    const adminDoc = { _id: adminId, role: 'admin', username: 'Boss' };
    const cfg = makeConfig({ ADMIN_ACCESS_SECRET: 'top-secret-key' });
    const guard = new FbAdminGuard(makeUserModel(adminDoc), cfg);
    const token = signAuthToken(adminId, '0340000001', secret);

    const { ctx: missingSecretCtx } = makeContext({
      authorization: `Bearer ${token}`,
    });
    await expect(guard.canActivate(missingSecretCtx)).rejects.toThrow(
      UnauthorizedException,
    );

    const { ctx: wrongSecretCtx } = makeContext({
      authorization: `Bearer ${token}`,
      'x-admin-secret': 'wrong-key',
    });
    await expect(guard.canActivate(wrongSecretCtx)).rejects.toThrow(
      UnauthorizedException,
    );

    const { ctx: validCtx } = makeContext({
      authorization: `Bearer ${token}`,
      'x-admin-secret': 'top-secret-key',
    });
    await expect(guard.canActivate(validCtx)).resolves.toBe(true);

    expect(() => verifyOptionalAdminSecretHeader(cfg, 'top-secret-key')).not.toThrow();
    expect(() => verifyOptionalAdminSecretHeader(cfg, 'nope')).toThrow(
      UnauthorizedException,
    );
  });
});
