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
