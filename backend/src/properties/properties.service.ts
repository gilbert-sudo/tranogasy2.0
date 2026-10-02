import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Property, PropertyDocument } from './schemas/property.schema';
import { Counter, CounterDocument } from './schemas/property-counter.schema';
import { City, CityDocument } from '../cities/schemas/city.schema';

@Injectable()
export class PropertiesService {
  constructor(
    @InjectModel(Property.name) private propertyModel: Model<PropertyDocument>,
    @InjectModel(Counter.name) private counterModel: Model<CounterDocument>,
    @InjectModel(City.name) private cityModel: Model<CityDocument>,
  ) { }

  async generatePropertyNumber(type: string, cityId: string): Promise<string> {
    const typeCode = type === 'rent' ? 'L' : 'V';
    let cityCode = 'TNY';

    try {
      const city = await this.cityModel.findById(cityId);
      if (city && city.province) {
        cityCode = city.province.substring(0, 3).toUpperCase();
      }
    } catch (e) {
      console.error('Error fetching city for property number generation:', e);
    }

    const counter = await this.counterModel.findOneAndUpdate(
      { itemId: 'propertyId' },
      { $inc: { itemNumber: 1 } },
      { new: true, upsert: true }
    );

    const seq = counter.itemNumber.toString().padStart(4, '0');
    return `${typeCode}-${cityCode}-${seq}`;
  }

  async create(createPropertyDto: any): Promise<Property> {
    const data = { ...createPropertyDto };

    if (!data.propertyNumber) {
      data.propertyNumber = await this.generatePropertyNumber(data.type, data.city);
    } else {
      data.propertyNumber = data.propertyNumber.toString();
    }

    const createdProperty = new this.propertyModel(data);
    return createdProperty.save();
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
