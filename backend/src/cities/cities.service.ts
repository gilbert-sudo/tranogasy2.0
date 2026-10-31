import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { City, CityDocument } from './schemas/city.schema';

function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // meters
}

function checkTextSimilarity(textA: string = '', textB: string = ''): number {
  const normalize = (text: string) =>
    (text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[\n\r\t.,;:!?()\-–—'"“”‘’`´]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[0-9]{6,}/g, '')
      .trim()
      .split(' ')
      .filter(Boolean);

  const tokensA = normalize(textA);
  const tokensB = normalize(textB);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const intersection = tokensB.filter((word) => setA.has(word));
  return intersection.length / Math.min(setA.size, setB.size);
}

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

  async findNearby(
    lat: number,
    lng: number,
    maxDistance: number = 25000,
    placeName?: string,
  ): Promise<City | null> {
    // Latitude delta approx: 1 deg ~ 111,000m
    const latDelta = Math.max(0.2, (maxDistance / 111000) * 1.5);
    const lngDelta = Math.max(
      0.2,
      (maxDistance / (111000 * Math.cos((lat * Math.PI) / 180))) * 1.5,
    );

    let candidates = await this.cityModel
      .find({
        'coords.lat': { $gte: lat - latDelta, $lte: lat + latDelta },
        'coords.lng': { $gte: lng - lngDelta, $lte: lng + lngDelta },
      })
      .lean();

    if (candidates.length === 0) {
      candidates = await this.cityModel
        .find({
          'coords.lat': { $gte: lat - 0.8, $lte: lat + 0.8 },
          'coords.lng': { $gte: lng - 0.8, $lte: lng + 0.8 },
        })
        .limit(100)
        .lean();
    }

    if (candidates.length === 0) {
      candidates = await this.cityModel.find().limit(100).lean();
    }

    if (candidates.length === 0) return null;

    const withDist = candidates
      .filter((c) => c.coords && typeof c.coords.lat === 'number' && typeof c.coords.lng === 'number')
      .map((c) => {
        const d = calculateHaversineDistance(lat, lng, c.coords.lat, c.coords.lng);
        const name = `${c.fokontany} ${c.commune}`;
        const sim = placeName ? checkTextSimilarity(name, placeName) * 10 : 0;
        return { city: c, distance: d, simScore: sim };
      });

    if (withDist.length === 0) return null;

    const inRange = withDist.filter((item) => item.distance <= maxDistance);
    const pool = inRange.length > 0 ? inRange : withDist;

    const best = pool.reduce((bestItem, current) => {
      if (current.simScore > bestItem.simScore) return current;
      if (current.simScore === bestItem.simScore && current.distance < bestItem.distance) {
        return current;
      }
      return bestItem;
    });

    return best.city as City;
  }
}
