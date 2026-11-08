import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './schemas/user.schema';
import { Property, PropertyDocument } from '../properties/schemas/property.schema';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Property.name) private propertyModel: Model<PropertyDocument>,
  ) {}

  async checkExistence(phone: string): Promise<boolean> {
    const cleanPhone = phone.replace(/\D/g, '');
    const altPhone = cleanPhone.startsWith('0') ? cleanPhone.slice(1) : `0${cleanPhone}`;
    const user = await this.userModel
      .findOne({ $or: [{ phone: cleanPhone }, { phone: altPhone }, { phone }] })
      .exec();
    return !!user;
  }

  async getUserByPhone(phone: string): Promise<any> {
    const cleanPhone = phone.replace(/\D/g, '');
    const altPhone = cleanPhone.startsWith('0') ? cleanPhone.slice(1) : `0${cleanPhone}`;
    const user = await this.userModel
      .findOne({ $or: [{ phone: cleanPhone }, { phone: altPhone }, { phone }] })
      .select('-password -backUpCode')
      .lean()
      .exec();
    return user;
  }

  async loginOrRegisterByPhone(
    rawPhone: string,
    defaultUsername?: string,
  ): Promise<{ isNew: boolean; user: any }> {
    const cleanPhone = rawPhone.replace(/\D/g, '');
    const altPhone = cleanPhone.startsWith('0') ? cleanPhone.slice(1) : `0${cleanPhone}`;
    const standardPhone = cleanPhone.startsWith('0') ? cleanPhone : `0${cleanPhone}`;

    let user = await this.userModel
      .findOne({ $or: [{ phone: cleanPhone }, { phone: altPhone }, { phone: rawPhone }] })
      .exec();

    if (user) {
      user.lastConnectedAt = new Date();
      await user.save();
      const userObj = user.toObject();
      delete userObj.password;
      delete userObj.backUpCode;
      return { isNew: false, user: userObj };
    }

    const cleanUsername = defaultUsername?.trim() || `Membre ${standardPhone.slice(-4)}`;
    const createdUser = new this.userModel({
      username: cleanUsername,
      phone: standardPhone,
      role: 'user',
      created_at: new Date(),
      lastConnectedAt: new Date(),
    });
    const saved = await createdUser.save();
    const userObj = saved.toObject();
    delete userObj.password;
    delete userObj.backUpCode;
    return { isNew: true, user: userObj };
  }

  async login(phone: string, passwordToTest: string): Promise<any> {
    const user = await this.userModel.findOne({ phone }).exec();
    if (!user || !user.password) {
      throw new UnauthorizedException('Ce numéro ne possède pas de compte.');
    }

    const match = await bcrypt.compare(passwordToTest, user.password);
    if (!match) {
      throw new UnauthorizedException('Mot de passe incorrect');
    }

    // Remove password from response
    const userObj = user.toObject();
    delete userObj.password;
    delete userObj.backUpCode;

    return {
      message: 'Connexion réussie',
      user: userObj,
    };
  }

  async signup(createUserDto: any): Promise<any> {
    const { phone } = createUserDto;

    // Validate if exists
    const exists = await this.checkExistence(phone);
    if (exists) {
      throw new BadRequestException('Ce numéro de téléphone est déjà utilisé');
    }

    // Hash the password with bcrypt (salt rounds = 5 based on old app)
    const salt = await bcrypt.genSalt(5);
    const hashedPassword = await bcrypt.hash(createUserDto.password, salt);

    const createdUser = new this.userModel({
      ...createUserDto,
      password: hashedPassword,
      lastConnectedAt: new Date(),
    });

    const user = await createdUser.save();

    const userObj = user.toObject();
    delete userObj.password;
    delete userObj.backUpCode;

    return {
      message: 'Compte créé avec succès',
      user: userObj,
    };
  }

  async getPublicProfile(identifier: string, sourceName?: string): Promise<any> {
    const cleanId = decodeURIComponent(identifier || '').trim().replace(/^@/, '');
    const cleanSource = sourceName ? decodeURIComponent(sourceName).trim() : '';

    let userDoc: any = null;
    let properties: any[] = [];

    // 1. If a curated sourceName is explicitly requested, or if identifier matches a curated source
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
        bio: `Annonceur partenaire vérifié sur TranoGasy.`,
        phone: firstProp?.phone1 || firstProp?.phone2 || firstProp?.owner?.phone || null,
        role: 'user',
        location: firstProp?.city
          ? `${firstProp.city.commune || ''}, ${firstProp.city.district || 'Madagascar'}`
          : 'Antananarivo, Madagascar',
        created_at: firstProp?.created_at || new Date(),
        lastConnectedAt: firstProp?.created_at || new Date(),
        isCuratedSource: true,
        sourceLink: firstProp?.sources?.link || null,
      };
    }

    // 2. Look up by MongoDB ObjectId if valid
    if (!userDoc && Types.ObjectId.isValid(cleanId)) {
      const foundUser = await this.userModel
        .findById(cleanId)
        .select('-password -backUpCode')
        .lean();

      if (foundUser) {
        userDoc = foundUser;
        properties = await this.propertyModel
          .find({ owner: new Types.ObjectId(cleanId) })
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

    // 2.5. Look up by phone in User collection
    if (!userDoc && cleanId) {
      const cleanPhone = cleanId.replace(/\D/g, '');
      if (cleanPhone.length >= 8) {
        const altPhone = cleanPhone.startsWith('0') ? cleanPhone.slice(1) : `0${cleanPhone}`;
        const foundByPhone = await this.userModel
          .findOne({ $or: [{ phone: cleanPhone }, { phone: altPhone }, { phone: cleanId }] })
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

    // 3. Look up by username in User collection
    if (!userDoc && cleanId) {
      const nameRegex = new RegExp(`^${escapeRegex(cleanId)}$`, 'i');
      const foundByName = await this.userModel
        .findOne({ username: nameRegex })
        .select('-password -backUpCode')
        .lean();

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

    // 4. Fallback: Look up by sources.username in Property collection
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
          bio: `Annonceur partenaire sur TranoGasy.`,
          phone: firstProp?.phone1 || firstProp?.phone2 || null,
          role: 'user',
          location: firstProp?.city
            ? `${firstProp.city.commune || ''}, ${firstProp.city.district || 'Madagascar'}`
            : 'Madagascar',
          created_at: firstProp?.created_at || new Date(),
          lastConnectedAt: firstProp?.created_at || new Date(),
          isCuratedSource: true,
          sourceLink: firstProp?.sources?.link || null,
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
        ...userDoc,
        fallbackCoverImage,
      },
      stats: {
        totalListings,
        rentCount,
        saleCount,
        activeCommunes,
      },
      properties,
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
