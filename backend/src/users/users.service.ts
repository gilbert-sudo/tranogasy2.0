import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import {
  getPhoneLookupVariants,
  normalizeMalagasyPhone,
  resolveAuthSecret,
  signAuthToken,
} from '../common/phone.util';
import {
  sanitizeOwnerForViewer,
  sanitizePropertyForViewer,
} from '../common/property-sanitizer.util';
import { User, UserDocument } from './schemas/user.schema';
import { Property, PropertyDocument } from '../properties/schemas/property.schema';
import { PropertiesService } from '../properties/properties.service';
import { SmsService } from '../sms/sms.service';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Property.name) private propertyModel: Model<PropertyDocument>,
    private readonly configService: ConfigService,
    private readonly smsService: SmsService,
    private readonly propertiesService: PropertiesService,
  ) {}

  private issueAuthToken(user: { _id?: any; phone?: string | null }): string {
    const secret = resolveAuthSecret(
      this.configService.get<string>('AUTH_TOKEN_SECRET') ||
        this.configService.get<string>('JWT_SECRET'),
      this.configService.get<string>('DATABASE_URI'),
    );
    return signAuthToken(String(user._id), String(user.phone || ''), secret);
  }

  async requestPhoneOtp(phone: string) {
    return this.smsService.requestAuthOtp(phone);
  }

  async verifyPhoneOtp(phone: string, code: string) {
    const verifiedPhone = await this.smsService.verifyAuthOtp(phone, code);
    const loginResult = await this.loginOrRegisterByPhone(verifiedPhone);
    const claimData = await this.propertiesService.findClaimableByPhone(verifiedPhone);

    return {
      verified: true,
      message: loginResult.isNew ? 'Compte créé avec succès' : 'Connexion réussie',
      isNew: loginResult.isNew,
      user: loginResult.user,
      authToken: loginResult.authToken,
      claimableListings: claimData.claimableListings,
      suggestedProfile: claimData.suggestedProfile,
    };
  }

  async checkExistence(phone: string): Promise<boolean> {
    const variants = getPhoneLookupVariants(phone);
    if (variants.length === 0) return false;
    const user = await this.userModel
      .findOne({ phone: { $in: variants }, isShadowAccount: { $ne: true } })
      .exec();
    return !!user;
  }

  async getUserByPhone(phone: string): Promise<any> {
    const variants = getPhoneLookupVariants(phone);
    if (variants.length === 0) return null;
    const user = await this.userModel
      .findOne({ phone: { $in: variants }, isShadowAccount: { $ne: true } })
      .select('-password -backUpCode')
      .lean()
      .exec();
    return user ? sanitizeOwnerForViewer(user, false) : null;
  }

  async loginOrRegisterByPhone(
    rawPhone: string,
    defaultUsername?: string,
  ): Promise<{ isNew: boolean; user: any; authToken: string }> {
    const standardPhone = normalizeMalagasyPhone(rawPhone) || rawPhone.replace(/\D/g, '');
    const variants = getPhoneLookupVariants(rawPhone);

    let user = await this.userModel
      .findOne({ phone: { $in: variants }, isShadowAccount: { $ne: true } })
      .exec();

    if (user) {
      user.lastConnectedAt = new Date();
      if (standardPhone && user.phone !== standardPhone) {
        user.phone = standardPhone;
      }
      await user.save();
      const userObj = sanitizeOwnerForViewer(user.toObject(), false);
      return {
        isNew: false,
        user: userObj,
        authToken: this.issueAuthToken(userObj),
      };
    }

    const cleanUsername = defaultUsername?.trim() || `Membre ${standardPhone.slice(-4)}`;
    const createdUser = new this.userModel({
      username: cleanUsername,
      phone: standardPhone,
      role: 'user',
      origin: 'organic',
      isShadowAccount: false,
      created_at: new Date(),
      lastConnectedAt: new Date(),
    });
    const saved = await createdUser.save();
    const userObj = sanitizeOwnerForViewer(saved.toObject(), false);
    return {
      isNew: true,
      user: userObj,
      authToken: this.issueAuthToken(userObj),
    };
  }

  async login(
    phone: string,
    passwordToTest?: string,
    defaultUsername?: string,
  ): Promise<any> {
    const variants = getPhoneLookupVariants(phone);

    // If password is provided, verify it if the existing account has a password set
    if (passwordToTest) {
      const user = await this.userModel
        .findOne({ phone: { $in: variants }, isShadowAccount: { $ne: true } })
        .exec();
      if (user && user.password) {
        const match = await bcrypt.compare(passwordToTest, user.password);
        if (!match) {
          throw new UnauthorizedException('Mot de passe incorrect');
        }
        user.lastConnectedAt = new Date();
        await user.save();
        const userObj = sanitizeOwnerForViewer(user.toObject(), false);
        return {
          message: 'Connexion réussie',
          user: userObj,
          authToken: this.issueAuthToken(userObj),
        };
      }
    }

    // Passwordless authentication (new system default)
    const result = await this.loginOrRegisterByPhone(phone, defaultUsername);
    return {
      message: result.isNew ? 'Compte créé avec succès' : 'Connexion réussie',
      user: result.user,
      authToken: result.authToken,
      isNew: result.isNew,
    };
  }

  async signup(createUserDto: any): Promise<any> {
    const { phone, username, password } = createUserDto;
    if (!phone) {
      throw new BadRequestException('Le numéro de téléphone est requis');
    }

    const standardPhone = normalizeMalagasyPhone(phone) || phone.replace(/\D/g, '');
    const variants = getPhoneLookupVariants(phone);

    let user = await this.userModel
      .findOne({ phone: { $in: variants }, isShadowAccount: { $ne: true } })
      .exec();

    if (user) {
      if (username && (!user.username || user.username.startsWith('Membre '))) {
        user.username = username.trim();
      }
      user.lastConnectedAt = new Date();
      await user.save();
      const userObj = sanitizeOwnerForViewer(user.toObject(), false);
      return {
        message: 'Connexion réussie',
        user: userObj,
        authToken: this.issueAuthToken(userObj),
        isNew: false,
      };
    }

    let hashedPassword: string | undefined = undefined;
    if (password) {
      const salt = await bcrypt.genSalt(5);
      hashedPassword = await bcrypt.hash(password, salt);
    }

    const cleanUsername = username?.trim() || `Membre ${standardPhone.slice(-4)}`;
    const createdUser = new this.userModel({
      ...createUserDto,
      username: cleanUsername,
      phone: standardPhone,
      password: hashedPassword,
      role: createUserDto.role || 'user',
      origin: 'organic',
      isShadowAccount: false,
      created_at: new Date(),
      lastConnectedAt: new Date(),
    });

    const saved = await createdUser.save();
    const userObj = sanitizeOwnerForViewer(saved.toObject(), false);

    return {
      message: 'Compte créé avec succès',
      user: userObj,
      authToken: this.issueAuthToken(userObj),
      isNew: true,
    };
  }

  async getPublicProfile(identifier: string, sourceName?: string): Promise<any> {
    const cleanId = decodeURIComponent(identifier || '').trim().replace(/^@/, '');
    const cleanSource = sourceName ? decodeURIComponent(sourceName).trim() : '';

    let userDoc: any = null;
    let properties: any[] = [];

    // 1. Legacy fallback only if an explicit sourceName query parameter is passed
    if (cleanSource) {
      const sourceRegex = new RegExp(`^${escapeRegex(cleanSource)}$`, 'i');
      properties = await this.propertyModel
        .find({ 'sources.username': sourceRegex })
        .populate('city')
        .populate('features')
        .populate(
          'owner',
          '_id username avatar coverImage location role phone email bio lastConnectedAt created_at',
        )
        .sort({ created_at: -1 })
        .lean();

      const firstProp = properties[0];
      userDoc = {
        _id: cleanId,
        username: firstProp?.sources?.username || cleanSource,
        avatar: firstProp?.sources?.avatar || null,
        coverImage: null,
        bio: null,
        phone: firstProp?.phone1 || firstProp?.phone2 || firstProp?.owner?.phone || null,
        role: 'user',
        location: firstProp?.city
          ? `${firstProp.city.commune || ''}, ${firstProp.city.district || 'Madagascar'}`
          : 'Antananarivo, Madagascar',
        created_at: firstProp?.created_at || new Date(),
        lastConnectedAt: firstProp?.created_at || new Date(),
      };
    }

    // 2. Look up by MongoDB ObjectId if valid (following shadow merge chain transparently)
    if (!userDoc && Types.ObjectId.isValid(cleanId)) {
      let foundUser: any = await this.userModel
        .findById(cleanId)
        .select('-password -backUpCode')
        .lean();

      if (foundUser?.mergedIntoUserId && Types.ObjectId.isValid(String(foundUser.mergedIntoUserId))) {
        const mergedTarget = await this.userModel
          .findById(foundUser.mergedIntoUserId)
          .select('-password -backUpCode')
          .lean();
        if (mergedTarget) {
          foundUser = mergedTarget;
        }
      }

      if (foundUser) {
        userDoc = foundUser;
        properties = await this.propertyModel
          .find({ owner: new Types.ObjectId(String(foundUser._id)) })
          .populate('city')
          .populate('features')
          .populate(
            'owner',
            '_id username avatar coverImage location role phone email bio lastConnectedAt created_at',
          )
          .sort({ created_at: -1 })
          .lean();
      }
    }

    // 2.5. Look up by phone in active User collection
    if (!userDoc && cleanId) {
      const cleanPhone = cleanId.replace(/\D/g, '');
      if (cleanPhone.length >= 8) {
        const variants = getPhoneLookupVariants(cleanId);
        const foundByPhone = await this.userModel
          .findOne({ phone: { $in: variants }, isShadowAccount: { $ne: true } })
          .select('-password -backUpCode')
          .lean();

        if (foundByPhone) {
          userDoc = foundByPhone;
          properties = await this.propertyModel
            .find({ owner: new Types.ObjectId(String(foundByPhone._id)) })
            .populate('city')
            .populate('features')
            .populate(
              'owner',
              '_id username avatar coverImage location role phone email bio lastConnectedAt created_at',
            )
            .sort({ created_at: -1 })
            .lean();
        }
      }
    }

    // 3. Look up by username in User collection (prioritize non-shadow or unmerged accounts)
    if (!userDoc && cleanId) {
      const nameRegex = new RegExp(`^${escapeRegex(cleanId)}$`, 'i');
      let foundByName: any = await this.userModel
        .findOne({ username: nameRegex, mergedIntoUserId: null })
        .sort({ isShadowAccount: 1, created_at: -1 })
        .select('-password -backUpCode')
        .lean();

      if (!foundByName) {
        foundByName = await this.userModel
          .findOne({ username: nameRegex })
          .select('-password -backUpCode')
          .lean();
      }

      if (foundByName) {
        userDoc = foundByName;
        properties = await this.propertyModel
          .find({ owner: new Types.ObjectId(String(foundByName._id)) })
          .populate('city')
          .populate('features')
          .populate(
            'owner',
            '_id username avatar coverImage location role phone email bio lastConnectedAt created_at',
          )
          .sort({ created_at: -1 })
          .lean();
      }
    }

    // 4. Fallback: Look up by sources.username in Property collection (legacy records)
    if (!userDoc && cleanId) {
      const sourceRegex = new RegExp(`^${escapeRegex(cleanId)}$`, 'i');
      properties = await this.propertyModel
        .find({ 'sources.username': sourceRegex })
        .populate('city')
        .populate('features')
        .populate(
          'owner',
          '_id username avatar coverImage location role phone email bio lastConnectedAt created_at',
        )
        .sort({ created_at: -1 })
        .lean();

      if (properties.length > 0) {
        const firstProp = properties[0];
        userDoc = {
          _id: cleanId,
          username: firstProp?.sources?.username || cleanId,
          avatar: firstProp?.sources?.avatar || null,
          coverImage: null,
          bio: null,
          phone: firstProp?.phone1 || firstProp?.phone2 || null,
          role: 'user',
          location: firstProp?.city
            ? `${firstProp.city.commune || ''}, ${firstProp.city.district || 'Madagascar'}`
            : 'Madagascar',
          created_at: firstProp?.created_at || new Date(),
          lastConnectedAt: firstProp?.created_at || new Date(),
        };
      } else {
        // Community member / commenter without published properties yet
        userDoc = {
          _id: cleanId,
          username: cleanId,
          avatar: null,
          coverImage: null,
          bio: 'Membre de la communauté TranoGasy.',
          phone: null,
          role: 'user',
          location: 'Madagascar',
          created_at: new Date(),
          lastConnectedAt: new Date(),
        };
      }
    }

    if (!userDoc) {
      throw new NotFoundException('Profil utilisateur introuvable');
    }

    // Compute core statistics from the user's properties
    const totalListings = properties.length;
    const rentCount = properties.filter((p) => p.type === 'rent').length;
    const saleCount = properties.filter((p) => p.type === 'sale').length;

    const citiesSet = new Set<string>();
    properties.forEach((p) => {
      if (p.city?.commune) {
        citiesSet.add(p.city.commune);
      } else if (p.city?.district) {
        citiesSet.add(p.city.district);
      }
    });
    const activeCommunes = Array.from(citiesSet).slice(0, 5);

    // Derive default cover image from user's coverImage or best property photo if none set
    let fallbackCoverImage: string | null = null;
    if (!userDoc.coverImage && properties.length > 0) {
      for (const prop of properties) {
        const candidate = prop?.images?.[0] || prop?.thumbnails?.[0];
        const url = typeof candidate === 'string' ? candidate : candidate?.src;
        if (url) {
          fallbackCoverImage = url;
          break;
        }
      }
    }

    return {
      user: {
        ...sanitizeOwnerForViewer(userDoc, false),
        fallbackCoverImage,
      },
      stats: {
        totalListings,
        rentCount,
        saleCount,
        activeCommunes,
      },
      properties: properties.map((p) => sanitizePropertyForViewer(p, false)),
    };
  }

  async updateProfile(
    userId: string,
    updateDto: {
      username?: string;
      bio?: string;
      avatar?: string;
      coverImage?: string;
      location?: string;
      email?: string;
    },
  ): Promise<any> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Identifiant utilisateur invalide');
    }

    const allowedFields: Record<string, any> = {};
    if (typeof updateDto.username === 'string' && updateDto.username.trim()) {
      allowedFields.username = updateDto.username.trim();
    }
    if (typeof updateDto.bio === 'string') {
      allowedFields.bio = updateDto.bio.trim();
    }
    if (typeof updateDto.avatar === 'string') {
      allowedFields.avatar = updateDto.avatar;
    }
    if (typeof updateDto.coverImage === 'string' || updateDto.coverImage === null) {
      allowedFields.coverImage = updateDto.coverImage;
    }
    if (typeof updateDto.location === 'string') {
      allowedFields.location = updateDto.location.trim();
    }
    if (typeof updateDto.email === 'string') {
      allowedFields.email = updateDto.email.trim();
    }

    const updated = await this.userModel
      .findByIdAndUpdate(userId, { $set: allowedFields }, { new: true })
      .select('-password -backUpCode')
      .lean();

    if (!updated) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    return {
      message: 'Profil mis à jour avec succès',
      user: updated,
    };
  }
}
