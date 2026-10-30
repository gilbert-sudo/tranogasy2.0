import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { City, CityDocument } from './schemas/city.schema';

@Injectable()
export class CitiesService {
  constructor(
    @InjectModel(City.name) private cityModel: Model<CityDocument>,
  ) {}

  async search(query: string, limit: number = 20): Promise<City[]> {
    if (!query || query.trim().length === 0) {
      return this.getPopularCities(limit);
    }

    const cleanQuery = query.trim();
    const regex = new RegExp(cleanQuery, 'i');

    return this.cityModel
      .find({
        $or: [
          { fokontany: regex },
          { commune: regex },
          { district: regex },
          { region: regex },
        ],
      })
      .limit(limit)
      .lean();
  }

  async getPopularCities(limit: number = 20): Promise<City[]> {
    // Return cities with properties or top Madagascar areas
    const cities = await this.cityModel
      .find()
      .sort({ 'stats.propertyCount': -1, _id: 1 })
      .limit(limit)
      .lean();

    return cities;
  }

  async findOne(id: string): Promise<City> {
    const city = await this.cityModel.findById(id).lean();
    if (!city) {
      throw new NotFoundException('City not found');
    }
    return city;
  }
}
