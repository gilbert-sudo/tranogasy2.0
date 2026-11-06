import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Property, PropertyDocument } from './schemas/property.schema';
import { Counter, CounterDocument } from './schemas/property-counter.schema';
import { City, CityDocument } from '../cities/schemas/city.schema';
import { Feature, FeatureDocument } from '../features/schemas/feature.schema';

@Injectable()
export class PropertiesService {
  constructor(
    @InjectModel(Property.name) private propertyModel: Model<PropertyDocument>,
    @InjectModel(Counter.name) private counterModel: Model<CounterDocument>,
    @InjectModel(City.name) private cityModel: Model<CityDocument>,
    @InjectModel(Feature.name) private featureModel: Model<FeatureDocument>,
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
        .populate('owner', '_id username avatar role phone bio lastConnectedAt created_at')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.propertyModel.countDocuments(),
    ]);

    return {
      properties,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getLatestProperties(limit: number = 10) {
    return this.propertyModel
      .find()
      .populate('city')
      .populate('features')
      .populate('owner', '_id username avatar role phone bio lastConnectedAt created_at')
      .sort({ created_at: -1 })
      .limit(limit)
      .lean();
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

    // Fetch candidate set (most recent up to 600 properties for fast in-memory feature + geo + keyword scoring)
    const candidates: any[] = await this.propertyModel
      .find(mongoFilter)
      .populate('city')
      .populate('features')
      .populate('owner', '_id username avatar role phone bio lastConnectedAt created_at')
      .sort({ created_at: -1 })
      .limit(600)
      .lean();

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
    const sortBy = query.sortBy || 'newest';
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
    const paginated = filtered.slice(start, start + limit);

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
      .populate('owner', '_id username avatar role phone bio lastConnectedAt created_at')
      .lean();

    if (!property) {
      throw new NotFoundException('Property not found');
    }
    return property;
  }
}
