import * as crypto from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';

describe('PaymentsService security & iOS separation', () => {
  const webhookSecret = 'super-secret-papi-key';

  function createService(overrides?: {
    paymentModel?: any;
    userModel?: any;
    notificationsService?: any;
    webhookSecret?: string;
  }) {
    const paymentModel = overrides?.paymentModel || {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
    };
    const userModel = overrides?.userModel || {
      findById: jest.fn(),
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };
    const configService = {
      get: (key: string) => {
        if (key === 'PAPI_WEBHOOK_SECRET') {
          return overrides?.webhookSecret !== undefined
            ? overrides.webhookSecret
            : webhookSecret;
        }
        if (key === 'PAPI_API_KEY') return 'test-papi-key';
        return undefined;
      },
    } as unknown as ConfigService;
    const notificationsService = overrides?.notificationsService || {
      createAndSend: jest.fn().mockResolvedValue(undefined),
    };

    return {
      service: new PaymentsService(
        paymentModel,
        userModel,
        configService,
        notificationsService,
      ),
      paymentModel,
      userModel,
      notificationsService,
    };
  }

  it('rejects Papi webhooks with missing or invalid HMAC signatures', async () => {
    const { service } = createService();
    const rawBody = JSON.stringify({ reference: 'TG-SUB-1', paymentStatus: 'PAID' });

    await expect(
      service.handlePapiWebhook(rawBody, undefined, {
        reference: 'TG-SUB-1',
        paymentStatus: 'PAID',
      }),
    ).rejects.toThrow(UnauthorizedException);

    await expect(
      service.handlePapiWebhook(rawBody, 'deadbeef', {
        reference: 'TG-SUB-1',
        paymentStatus: 'PAID',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('accepts valid HMAC-SHA256 signature (including sha256= prefix) and prevents double-confirmation', async () => {
    const paymentDoc: any = {
      _id: 'pay-1',
      ref: 'TG-AST-1',
      user: '507f1f77bcf86cd799439011',
      amount: 3000,
      status: 'pending',
      category: 'agency_assistance',
      assistancePlanId: 'assistance_24h',
      assistanceDurationHours: 24,
      save: jest.fn().mockResolvedValue(undefined),
    };

    const paymentModel = {
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(paymentDoc),
      }),
      // Simulate concurrent confirmation: first call returns null (already claimed)
      findOneAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      }),
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            ...paymentDoc,
            status: 'confirmed',
          }),
        }),
      }),
    };

    const userModel = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439011' }),
        }),
      }),
      findByIdAndUpdate: jest.fn(),
    };

    const { service, notificationsService } = createService({
      paymentModel,
      userModel,
    });

    const payload = { reference: 'TG-AST-1', paymentStatus: 'PAID' };
    const rawBody = JSON.stringify(payload);
    const validSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody, 'utf8')
      .digest('hex');

    const res = await service.handlePapiWebhook(
      rawBody,
      `sha256=${validSig}`,
      payload,
    );

    expect(res).toEqual({ received: true, status: 'confirmed' });
    // Because findOneAndUpdate returned null (already confirmed), user expiry was NOT double-extended
    expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(notificationsService.createAndSend).not.toHaveBeenCalled();
  });

  it('keeps iOS assistance expiry strictly separate from web subscription expiry in getUserWallet', async () => {
    const subExpiry = new Date('2027-01-01T00:00:00.000Z');
    const userModel = {
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({
              _id: '507f1f77bcf86cd799439011',
              username: 'Tester',
              phone: '0341234567',
              hasAllContactsUnlocked: false,
              subscriptionExpiresAt: subExpiry,
              subscriptionPlanLabel: '3 jours',
              assistanceExpiresAt: null,
              assistancePlanLabel: null,
            }),
          }),
        }),
      }),
    };
    const paymentModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    };

    const { service } = createService({ paymentModel, userModel });
    const wallet = await service.getUserWallet('507f1f77bcf86cd799439011');

    expect(wallet.subscriptionExpiresAt).toEqual(subExpiry);
    expect(wallet.subscriptionPlanLabel).toBe('3 jours');
    expect(wallet.assistanceExpiresAt).toBeNull();
    expect(wallet.assistancePlanLabel).toBeNull();
  });
});
