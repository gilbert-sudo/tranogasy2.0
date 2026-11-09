import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Payment, PaymentDocument } from './schemas/payment.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

export const MIN_JP_TOKENS = 100;
export const MAX_JP_TOKENS = 1_000_000;
export const ARIARY_PER_JP = 10; // 100 JP = 1,000 Ar

export const MOBILE_MONEY_OPERATORS = {
  mvola: {
    id: 'mvola',
    name: 'MVola',
    carrier: 'Telma',
    merchantName: 'tranogasy_telma',
    merchantNumber: '0345189896',
    prefixes: ['034', '038'],
  },
  airtel: {
    id: 'airtel',
    name: 'Airtel Money',
    carrier: 'Airtel',
    merchantName: 'tranogasy_airtel',
    merchantNumber: '0335562455',
    prefixes: ['033', '037'],
  },
  orange: {
    id: 'orange',
    name: 'Orange Money',
    carrier: 'Orange',
    merchantName: 'tranogasy_orange',
    merchantNumber: '0321902559',
    prefixes: ['032'],
  },
} as const;

export type OperatorId = keyof typeof MOBILE_MONEY_OPERATORS;

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  private normalizeMadagascarPhone(rawPhone: string): string {
    let cleaned = String(rawPhone || '').replace(/\D/g, '');
    if (cleaned.startsWith('261') && cleaned.length >= 12) {
      cleaned = cleaned.slice(3);
    }
    if (!cleaned.startsWith('0') && cleaned.length === 9) {
      cleaned = `0${cleaned}`;
    }
    return cleaned;
  }

  async purchaseTokens(dto: {
    userId?: string;
    userPhone?: string;
    tokens: number;
    operator: OperatorId;
    senderPhone: string;
  }) {
    // 1. Validate Operator
    const operatorInfo = MOBILE_MONEY_OPERATORS[dto.operator];
    if (!operatorInfo) {
      throw new BadRequestException(
        'Opérateur Mobile Money invalide. Choisissez MVola, Airtel Money ou Orange Money.',
      );
    }

    // 2. Validate Tokens amount (strict integer >= 100)
    const tokens = Number(dto.tokens);
    if (
      !Number.isFinite(tokens) ||
      !Number.isInteger(tokens) ||
      tokens < MIN_JP_TOKENS
    ) {
      throw new BadRequestException(
        `L'achat minimum est de ${MIN_JP_TOKENS} JP (${(MIN_JP_TOKENS * ARIARY_PER_JP).toLocaleString('fr-FR')} Ar).`,
      );
    }
    if (tokens > MAX_JP_TOKENS) {
      throw new BadRequestException(
        `Le montant maximum par transaction est de ${MAX_JP_TOKENS.toLocaleString('fr-FR')} JP.`,
      );
    }

    // 3. Server-side authoritative Ariary calculation (100 JP = 1,000 Ar -> 1 JP = 10 Ar)
    const amountAriary = tokens * ARIARY_PER_JP;

    // 4. Validate Sender Phone Number
    const cleanSender = this.normalizeMadagascarPhone(dto.senderPhone);
    const phoneRegex = /^03[23478]\d{7}$/;
    if (!phoneRegex.test(cleanSender)) {
      throw new BadRequestException(
        'Veuillez saisir un numéro Mobile Money malgache valide à 10 chiffres (032, 033, 034, 037 ou 038).',
      );
    }

    const merchantNumbers: string[] = Object.values(MOBILE_MONEY_OPERATORS).map(
      (op) => op.merchantNumber,
    );
    if (merchantNumbers.includes(cleanSender)) {
      throw new BadRequestException(
        "Veuillez indiquer votre propre numéro d'expéditeur, et non le numéro marchand TranoGasy.",
      );
    }

    // 5. Resolve User in Database
    let user: UserDocument | null = null;
    if (dto.userId && Types.ObjectId.isValid(dto.userId)) {
      user = await this.userModel.findById(dto.userId).exec();
    }
    if (!user && dto.userPhone) {
      const cleanUserPhone = this.normalizeMadagascarPhone(dto.userPhone);
      const altPhone = cleanUserPhone.startsWith('0')
        ? cleanUserPhone.slice(1)
        : `0${cleanUserPhone}`;
      user = await this.userModel
        .findOne({
          $or: [
            { phone: cleanUserPhone },
            { phone: altPhone },
            { phone: dto.userPhone },
          ],
        })
        .exec();
    }

    if (!user) {
      throw new NotFoundException(
        'Utilisateur introuvable. Veuillez vous reconnecter.',
      );
    }

    const ref = `JP-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 6. Create Payment Record
    const payment = new this.paymentModel({
      user: user._id,
      type: operatorInfo.name,
      operator: operatorInfo.id,
      reason: `Recharge de ${tokens} JP`,
      payload: ref,
      amount: amountAriary,
      tokens,
      phoneNumber: cleanSender,
      status: 'confirmed',
      ref,
      created_at: new Date(),
    });

    const savedPayment = await payment.save();

    // 7. Atomically increment user's JP balance
    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        user._id,
        { $inc: { balance: tokens } },
        { new: true },
      )
      .select('-password -backUpCode')
      .lean()
      .exec();

    return {
      message: `${tokens} JP ajoutés avec succès à votre solde`,
      payment: savedPayment.toObject(),
      user: updatedUser,
      balance: updatedUser?.balance ?? (user.balance || 0) + tokens,
    };
  }

  async spendTokens(dto: {
    userId: string;
    tokens: number;
    reason: string;
  }) {
    if (!dto.userId || !Types.ObjectId.isValid(dto.userId)) {
      throw new BadRequestException('Identifiant utilisateur invalide.');
    }

    const tokens = Number(dto.tokens);
    if (!Number.isFinite(tokens) || !Number.isInteger(tokens) || tokens <= 0) {
      throw new BadRequestException('Nombre de jetons JP invalide.');
    }

    // Atomic check-and-decrement to prevent negative balances or race conditions
    const updatedUser = await this.userModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(dto.userId), balance: { $gte: tokens } },
        { $inc: { balance: -tokens } },
        { new: true },
      )
      .select('-password -backUpCode')
      .lean()
      .exec();

    if (!updatedUser) {
      const existing = await this.userModel
        .findById(dto.userId)
        .select('balance')
        .lean()
        .exec();
      if (!existing) {
        throw new NotFoundException('Utilisateur introuvable.');
      }
      throw new BadRequestException(
        `Solde JP insuffisant (${existing.balance || 0} JP disponible, ${tokens} JP requis).`,
      );
    }

    return {
      message: `${tokens} JP utilisés pour : ${dto.reason || 'Action TranoGasy'}`,
      user: updatedUser,
      balance: updatedUser.balance,
    };
  }

  async getUserWallet(userIdOrPhone: string) {
    let user: any = null;
    if (Types.ObjectId.isValid(userIdOrPhone)) {
      user = await this.userModel
        .findById(userIdOrPhone)
        .select('_id username phone balance')
        .lean()
        .exec();
    }
    if (!user && userIdOrPhone) {
      const cleanPhone = this.normalizeMadagascarPhone(userIdOrPhone);
      const altPhone = cleanPhone.startsWith('0')
        ? cleanPhone.slice(1)
        : `0${cleanPhone}`;
      user = await this.userModel
        .findOne({
          $or: [
            { phone: cleanPhone },
            { phone: altPhone },
            { phone: userIdOrPhone },
          ],
        })
        .select('_id username phone balance')
        .lean()
        .exec();
    }

    if (!user) {
      return {
        balance: 0,
        payments: [],
      };
    }

    const payments = await this.paymentModel
      .find({ user: user._id })
      .sort({ created_at: -1 })
      .limit(25)
      .lean()
      .exec();

    return {
      balance: user.balance || 0,
      payments,
    };
  }
}
