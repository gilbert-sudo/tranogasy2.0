import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Property, PropertyDocument } from './schemas/property.schema';

@Injectable()
export class PropertiesService {
  constructor(
    @InjectModel(Property.name) private propertyModel: Model<PropertyDocument>,
  ) {}

  async getPaginatedProperties(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    
    const [properties, total] = await Promise.all([
      this.propertyModel
        .find()
        .populate('city')
        .populate('features')
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
      .sort({ created_at: -1 })
      .limit(limit)
      .lean();
  }

  async findOne(id: string) {
    const property = await this.propertyModel
      .findById(id)
      .populate('city')
      .populate('features')
      .lean();
      
    if (!property) {
      throw new NotFoundException('Property not found');
    }
    return property;
  }
}
