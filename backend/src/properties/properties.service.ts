import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { getPhoneLookupVariants, normalizeMalagasyPhone } from '../common/phone.util';
import {
  sanitizeOwnerForViewer,
  sanitizePropertyForViewer,
} from '../common/property-sanitizer.util';
import { City, CityDocument } from '../cities/schemas/city.schema';
import { Feature, FeatureDocument } from '../features/schemas/feature.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Counter, CounterDocument } from './schemas/property-counter.schema';
import { Property, PropertyDocument } from './schemas/property.schema';

@Injectable()
export class PropertiesService {
  constructor(
    @InjectModel(Property.name) private propertyModel: Model<PropertyDocument>,
    @InjectModel(Counter.name) private counterModel: Model<CounterDocument>,
    @InjectModel(City.name) private cityModel: Model<CityDocument>,
    @InjectModel(Feature.name) private featureModel: Model<FeatureDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) { }

  async generatePropertyNumber(type: string, cityId?: string): Promise<string> {
    const typeCode = type === 'rent' ? 'L' : 'V';
    let cityCode = 'TNY';

    if (cityId) {
      try {
        const city = await this.cityModel.findById(cityId);
        if (city && city.province) {
          cityCode = city.province.substring(0, 3).toUpperCase();
        }
      } catch (e) {
        console.error('Error fetching city for property number generation:', e);
      }
    }

    const counter = await this.counterModel.findOneAndUpdate(
      { itemId: 'propertyId' },
      { $inc: { itemNumber: 1 } },
      { new: true, upsert: true }
    );

    const seq = (counter?.itemNumber || 1).toString().padStart(4, '0');
    return `${typeCode}-${cityCode}-${seq}`;
  }

  async create(createPropertyDto: any): Promise<Property> {
    const data = { ...createPropertyDto };

    // 1. Process and save features
    const featureFields = [
      'motoAccess', 'carAccess', 'parkingSpaceAvailable', 'elevator',
      'garden', 'courtyard', 'balcony', 'roofTop', 'swimmingPool',
      'surroundedByWalls', 'independentHouse', 'garage', 'guardianHouse',
      'bassin', 'kitchenFacilities', 'placardKitchen', 'openKitchen',
      'insideToilet', 'insideBathroom', 'bathtub', 'fireplace',
      'airConditionerAvailable', 'hotWaterAvailable', 'furnishedProperty',
      'electricityPower', 'electricityJirama', 'waterPumpSupply',
      'waterPumpSupplyJirama', 'waterWellSupply', 'securitySystem',
      'wifiAvailability', 'fiberOpticReady', 'seaView', 'mountainView',
      'panoramicView', 'solarPanels'
    ];

    const featureObj: Record<string, boolean> = {};
    const sourceFeatures = (typeof data.features === 'object' && data.features !== null && !data.features._id)
      ? data.features
      : data;

    featureFields.forEach(field => {
      featureObj[field] = Boolean(sourceFeatures[field] ?? data[field] ?? false);
    });

    const savedFeature = await new this.featureModel(featureObj).save();
    data.features = savedFeature._id;

    // 2. Generate property number
    if (!data.propertyNumber) {
      data.propertyNumber = await this.generatePropertyNumber(data.type, data.city);
    } else {
      data.propertyNumber = data.propertyNumber.toString();
    }

    // 3. Ensure valid ObjectId references
    if (data.city && Types.ObjectId.isValid(data.city)) {
      data.city = new Types.ObjectId(data.city);
    }
    if (data.owner && Types.ObjectId.isValid(data.owner)) {
      data.owner = new Types.ObjectId(data.owner);
    }

    // 4. Normalize phone numbers for reliable phone-claim matching
    for (const phoneKey of ['phone1', 'phone2', 'phone3'] as const) {
      if (data[phoneKey]) {
        const rawStr = String(data[phoneKey]).trim();
        data[phoneKey] = normalizeMalagasyPhone(rawStr) || rawStr || null;
      } else {
        data[phoneKey] = null;
      }
    }

    // 5. Explicit origin & claimStatus tracking
    if (!data.origin) {
      if (data.sources?.fbUserId || data.sources?.postId) {
        data.origin = 'facebook_scraper';
      } else if (data.sources?.username || data.sources?.link) {
        data.origin = 'admin_manual';
      } else if (data.owner) {
        const creator = await this.userModel
          .findById(data.owner, { role: 1, origin: 1 })
          .lean()
          .catch(() => null);
        data.origin =
          creator?.role === 'admin' || creator?.role === 'superadmin'
            ? 'admin_manual'
            : 'user';
      } else {
        data.origin = 'user';
      }
    }

    if (!data.claimStatus) {
      data.claimStatus =
        data.origin === 'facebook_scraper' ? 'unclaimed' : 'not_applicable';
    }

    if (!data.status) {
      data.status = 'available';
    }

    const createdProperty = new this.propertyModel(data);
    const saved = await createdProperty.save();

    return this.findOne(saved._id.toString());
  }

  async getPaginatedProperties(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [properties, total] = await Promise.all([
      this.propertyModel
        .find()
        .populate('city')
        .populate('features')
        .populate('owner', '_id username avatar coverImage location role phone bio lastConnectedAt created_at')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.propertyModel.countDocuments(),
    ]);

    return {
      properties: properties.map((p) => sanitizePropertyForViewer(p, false)),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getLatestProperties(limit: number = 10) {
    const props = await this.propertyModel
      .find()
      .populate('city')
      .populate('features')
      .populate('owner', '_id username avatar coverImage location role phone bio lastConnectedAt created_at')
      .sort({ created_at: -1 })
      .limit(limit)
      .lean();

    return props.map((p) => sanitizePropertyForViewer(p, false));
  }

  private calculateDistanceMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371e3;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  async searchProperties(query: Record<string, any>) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(query.limit, 10) || 250));

    const mongoFilter: Record<string, any> = {};

    if (query.type && query.type !== 'all') {
      mongoFilter.type = query.type;
    }

    if (query.houseType && query.houseType !== 'all') {
      mongoFilter.houseType = new RegExp(`^${query.houseType}$`, 'i');
    }

    if (query.cityId && Types.ObjectId.isValid(query.cityId)) {
      mongoFilter.city = new Types.ObjectId(query.cityId);
    }

    const budgetMin = query.budgetMin ? Number(query.budgetMin) : null;
    const budgetMax = query.budgetMax ? Number(query.budgetMax) : null;

    if (budgetMin !== null || budgetMax !== null) {
      const priceField = query.type === 'sale' ? 'price' : 'rent';
      mongoFilter[priceField] = {};
      if (budgetMin !== null && !isNaN(budgetMin)) {
        mongoFilter[priceField].$gte = budgetMin;
      }
      if (budgetMax !== null && !isNaN(budgetMax) && budgetMax > 0) {
        mongoFilter[priceField].$lte = budgetMax;
      }
    }

    if (query.minArea && Number(query.minArea) > 0) {
      mongoFilter.area = { $gte: Number(query.minArea) };
    }

    if (query.minBathrooms && Number(query.minBathrooms) > 0) {
      mongoFilter.bathrooms = { $gte: Number(query.minBathrooms) };
    }

    const minRooms = query.minRooms ? Number(query.minRooms) : 0;
    const insideToilet = query.insideToilet || 'all';
    const insideBathroom = query.insideBathroom || 'all';
    const requiredFeatures: string[] = query.features
      ? String(query.features)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const keyword = (query.q || '').trim().toLowerCase();
    const lat = query.lat !== undefined ? Number(query.lat) : null;
    const lng = query.lng !== undefined ? Number(query.lng) : null;
    const radius = query.radius !== undefined ? Number(query.radius) : 0;
    const sortBy = query.sortBy || 'newest';

    const hasGeoRadius =
      lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng) && radius > 0;
    const requiresInMemoryFiltering =
      minRooms > 0 ||
      insideToilet !== 'all' ||
      insideBathroom !== 'all' ||
      requiredFeatures.length > 0 ||
      Boolean(keyword) ||
      hasGeoRadius ||
      sortBy === 'distance';

    // Fast DB-paginated path for standard landing/tab/sort queries (avoids fetching 600 full docs)
    if (!requiresInMemoryFiltering) {
      const priceSortField = query.type === 'sale' ? 'price' : 'rent';
      const mongoSort: Record<string, 1 | -1> =
        sortBy === 'price_asc'
          ? { [priceSortField]: 1, created_at: -1 }
          : sortBy === 'price_desc'
          ? { [priceSortField]: -1, created_at: -1 }
          : { created_at: -1 };

      const skip = (page - 1) * limit;
      const [docs, total] = await Promise.all([
        this.propertyModel
          .find(mongoFilter)
          .populate('city')
          .populate('features')
          .populate('owner', '_id username avatar coverImage location role phone bio lastConnectedAt created_at')
          .sort(mongoSort)
          .skip(skip)
          .limit(limit)
          .lean(),
        this.propertyModel.countDocuments(mongoFilter),
      ]);

      return {
        properties: docs.map((p) => sanitizePropertyForViewer(p, false)),
        total,
        page,
        totalPages: Math.ceil(total / limit) || 1,
      };
    }

    // Fetch candidate set (most recent up to 600 properties for complex in-memory feature + geo + keyword scoring)
    const candidates: any[] = await this.propertyModel
      .find(mongoFilter)
      .populate('city')
      .populate('features')
      .populate('owner', '_id username avatar coverImage location role phone bio lastConnectedAt created_at')
      .sort({ created_at: -1 })
      .limit(600)
      .lean();

    let filtered = candidates.filter((prop) => {
      // Rooms check (rooms + livingRoom like old Tranogasy or rooms directly)
      if (minRooms > 0) {
        const totalRooms = (Number(prop.rooms) || 0) + (Number(prop.livingRoom) || 0);
        if (totalRooms < minRooms && (Number(prop.rooms) || 0) < minRooms) {
          return false;
        }
      }

      // Inside Toilet / Bathroom checks
      const feat = prop.features || {};
      if (insideToilet === 'inside' && !feat.insideToilet) return false;
      if (insideToilet === 'outside' && feat.insideToilet !== false) return false;
      if (insideBathroom === 'inside' && !feat.insideBathroom) return false;
      if (insideBathroom === 'outside' && feat.insideBathroom !== false) return false;

      // Feature checks
      for (const reqFeat of requiredFeatures) {
        if (reqFeat === 'electricity') {
          if (!(feat.electricityJirama || feat.electricityPower || feat.solarPanels)) {
            return false;
          }
        } else if (reqFeat === 'waterPumpSupply') {
          if (!(feat.waterPumpSupply || feat.waterPumpSupplyJirama)) {
            return false;
          }
        } else if (!feat[reqFeat]) {
          return false;
        }
      }

      // Keyword / PropertyNumber / City search
      if (keyword) {
        const title = (prop.title || '').toLowerCase();
        const desc = (prop.description || '').toLowerCase();
        const propNum = String(prop.propertyNumber || '').toLowerCase();
        const fokontany = (prop.city?.fokontany || '').toLowerCase();
        const commune = (prop.city?.commune || '').toLowerCase();
        const district = (prop.city?.district || '').toLowerCase();
        const region = (prop.city?.region || '').toLowerCase();

        const matchesKeyword =
          title.includes(keyword) ||
          desc.includes(keyword) ||
          propNum.includes(keyword) ||
          fokontany.includes(keyword) ||
          commune.includes(keyword) ||
          district.includes(keyword) ||
          region.includes(keyword);

        if (!matchesKeyword) return false;
      }

      // Geo-radius check
      if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng) && radius > 0) {
        const targetCoords = prop.coords?.lat && prop.coords?.lng ? prop.coords : prop.city?.coords;
        if (!targetCoords || typeof targetCoords.lat !== 'number' || typeof targetCoords.lng !== 'number') {
          return false;
        }
        const dist = this.calculateDistanceMeters(lat, lng, targetCoords.lat, targetCoords.lng);
        prop._distance = Math.round(dist);
        if (dist > radius) return false;
      }

      return true;
    });

    // Sorting
    if (sortBy === 'price_asc') {
      filtered.sort((a, b) => {
        const pA = (a.type === 'sale' ? a.price : a.rent) || 0;
        const pB = (b.type === 'sale' ? b.price : b.rent) || 0;
        return pA - pB;
      });
    } else if (sortBy === 'price_desc') {
      filtered.sort((a, b) => {
        const pA = (a.type === 'sale' ? a.price : a.rent) || 0;
        const pB = (b.type === 'sale' ? b.price : b.rent) || 0;
        return pB - pA;
      });
    } else if (sortBy === 'distance' && lat !== null && lng !== null) {
      filtered.sort((a, b) => (a._distance ?? Infinity) - (b._distance ?? Infinity));
    }

    const total = filtered.length;
    const start = (page - 1) * limit;
    const paginated = filtered
      .slice(start, start + limit)
      .map((p) => sanitizePropertyForViewer(p, false));

    return {
      properties: paginated,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findOne(id: string) {
    const property = await this.propertyModel
      .findById(id)
      .populate('city')
      .populate('features')
      .populate('owner', '_id username avatar coverImage location role phone bio lastConnectedAt created_at')
      .lean();

    if (!property) {
      throw new NotFoundException('Property not found');
    }
    return sanitizePropertyForViewer(property, false);
  }

  /**
   * Finds scraped Facebook listings whose contact numbers match a phone number
   * and have not yet been claimed by a verified TranoGasy user.
   */
  async findClaimableByPhone(rawPhone?: string | null) {
    const variants = getPhoneLookupVariants(rawPhone);
    if (variants.length === 0) {
      return { claimableListings: [], suggestedProfile: null };
    }

    const matches = await this.propertyModel
      .find({
        origin: 'facebook_scraper',
        claimStatus: 'unclaimed',
        $or: [
          { phone1: { $in: variants } },
          { phone2: { $in: variants } },
          { phone3: { $in: variants } },
        ],
      })
      .populate('city', 'fokontany commune district')
      .populate('owner', '_id username avatar isShadowAccount')
      .sort({ created_at: -1 })
      .limit(40)
      .lean();

    const variantSet = new Set(variants);
    const normalizedInput = normalizeMalagasyPhone(rawPhone);

    const claimableListings = matches.map((prop: any) => {
      const matchedPhone =
        [prop.phone1, prop.phone2, prop.phone3].find((p) => {
          if (!p) return false;
          const norm = normalizeMalagasyPhone(String(p));
          return variantSet.has(String(p).trim()) || (normalizedInput && norm === normalizedInput);
        }) ||
        normalizedInput ||
        rawPhone;

      const ownerObj = typeof prop.owner === 'object' ? prop.owner : null;
      return {
        _id: String(prop._id),
        title: prop.title,
        type: prop.type,
        houseType: prop.houseType || 'maison',
        price: prop.price ?? null,
        rent: prop.rent ?? null,
        rooms: prop.rooms ?? 0,
        bathrooms: prop.bathrooms ?? 0,
        area: prop.area ?? 0,
        images: Array.isArray(prop.images) ? prop.images.slice(0, 1) : [],
        city: prop.city || null,
        matchedPhone,
        publisherName: prop.sources?.username || ownerObj?.username || null,
        publisherAvatar: prop.sources?.avatar || ownerObj?.avatar || null,
        created_at: prop.created_at,
      };
    });

    const firstWithName = claimableListings.find((item) => item.publisherName);
    const firstWithAvatar = claimableListings.find((item) => item.publisherAvatar);
    const suggestedProfile =
      firstWithName || firstWithAvatar
        ? {
            username: firstWithName?.publisherName || null,
            avatar: firstWithAvatar?.publisherAvatar || null,
          }
        : null;

    return {
      claimableListings,
      suggestedProfile,
    };
  }

  async findClaimableForUser(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Identifiant utilisateur invalide');
    }
    const user = await this.userModel.findById(userId, { phone: 1 }).lean();
    if (!user?.phone) {
      return { claimableListings: [], suggestedProfile: null };
    }
    return this.findClaimableByPhone(user.phone);
  }

  /**
   * Transfers ownership of verified-phone FB listings to the real signed-in user
   * while preserving `origin` and `sources.*` for admin audit history.
   */
  async claimProperties(
    userId: string,
    dto: { propertyIds?: string[]; adoptUsername?: boolean; adoptAvatar?: boolean },
  ) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Identifiant utilisateur invalide');
    }

    const realUser = await this.userModel.findById(userId);
    if (!realUser || realUser.isShadowAccount) {
      throw new NotFoundException('Compte utilisateur introuvable');
    }
    if (!realUser.phone) {
      throw new BadRequestException('Un numéro de téléphone vérifié est requis pour réclamer des annonces.');
    }

    const validIds = (dto.propertyIds || [])
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    if (validIds.length === 0) {
      throw new BadRequestException('Aucune annonce valide sélectionnée.');
    }

    const variants = getPhoneLookupVariants(realUser.phone);
    const eligible = await this.propertyModel
      .find({
        _id: { $in: validIds },
        origin: 'facebook_scraper',
        claimStatus: 'unclaimed',
        $or: [
          { phone1: { $in: variants } },
          { phone2: { $in: variants } },
          { phone3: { $in: variants } },
        ],
      })
      .populate('owner', '_id username avatar isShadowAccount')
      .lean();

    if (eligible.length === 0) {
      return {
        claimedCount: 0,
        claimedIds: [],
        user: sanitizeOwnerForViewer(realUser.toObject(), false),
      };
    }

    const eligibleIds = eligible.map((p: any) => p._id);
    const previousOwnerIds = Array.from(
      new Set(
        eligible
          .map((p: any) => (p.owner?._id ? String(p.owner._id) : p.owner ? String(p.owner) : ''))
          .filter(Boolean),
      ),
    );

    const now = new Date();
    await this.propertyModel.updateMany(
      { _id: { $in: eligibleIds } },
      {
        $set: {
          owner: realUser._id,
          claimStatus: 'claimed',
          claimedBy: realUser._id,
          claimedAt: now,
        },
      },
    );

    // Optional profile initialization from scraped publisher identity
    let userUpdated = false;
    if (dto.adoptUsername && (!realUser.username || realUser.username.startsWith('Membre '))) {
      const candidateName = eligible
        .map((p: any) => p.sources?.username || p.owner?.username)
        .find((name) => Boolean(name && name !== 'Membre TranoGasy' && name !== 'Annonceur'));
      if (candidateName) {
        realUser.username = String(candidateName).trim();
        userUpdated = true;
      }
    }

    if (dto.adoptAvatar && !realUser.avatar) {
      const candidateAvatar = eligible
        .map((p: any) => p.sources?.avatar || p.owner?.avatar)
        .find(Boolean);
      if (candidateAvatar) {
        realUser.avatar = candidateAvatar;
        userUpdated = true;
      }
    }

    if (userUpdated) {
      await realUser.save();
    }

    // Retire empty shadow profiles cleanly so legacy profile URLs forward to the real account
    for (const prevId of previousOwnerIds) {
      if (prevId === String(realUser._id) || !Types.ObjectId.isValid(prevId)) continue;
      const shadowDoc = await this.userModel
        .findById(prevId, { isShadowAccount: 1 })
        .lean();
      if (!shadowDoc?.isShadowAccount) continue;
      const remaining = await this.propertyModel.countDocuments({
        owner: new Types.ObjectId(prevId),
      });
      if (remaining === 0) {
        await this.userModel.updateOne(
          { _id: new Types.ObjectId(prevId) },
          { $set: { mergedIntoUserId: realUser._id } },
        );
      }
    }

    return {
      claimedCount: eligibleIds.length,
      claimedIds: eligibleIds.map((id) => String(id)),
      user: sanitizeOwnerForViewer(realUser.toObject(), false),
    };
  }
}
