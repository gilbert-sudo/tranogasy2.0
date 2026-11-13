import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { City, CityDocument } from '../cities/schemas/city.schema';
import { normalizeTextForHash } from './fb-dedup.util';

export interface CityCandidateMatch {
  _id: string;
  label: string;
  fokontany: string;
  commune: string;
  district: string;
  coords?: { lat: number; lng: number };
  score: number;
}

interface IndexedCity {
  _id: string;
  fokontany: string;
  commune: string;
  district: string;
  region: string;
  coords?: { lat: number; lng: number };
  normFokontany: string;
  normCommune: string;
  normDistrict: string;
  label: string;
}

@Injectable()
export class FbCityMatcherService implements OnModuleInit {
  private readonly logger = new Logger(FbCityMatcherService.name);
  private indexedCities: IndexedCity[] = [];
  private loadedAt = 0;

  constructor(@InjectModel(City.name) private cityModel: Model<CityDocument>) {}

  async onModuleInit(): Promise<void> {
    await this.ensureCacheLoaded();
  }

  private async ensureCacheLoaded(): Promise<void> {
    if (this.indexedCities.length > 0 && Date.now() - this.loadedAt < 30 * 60 * 1000) {
      return;
    }

    const cities = await this.cityModel
      .find({}, { _id: 1, fokontany: 1, commune: 1, district: 1, region: 1, coords: 1 })
      .lean();

    this.indexedCities = cities.map((c: any) => ({
      _id: String(c._id),
      fokontany: c.fokontany || '',
      commune: c.commune || '',
      district: c.district || '',
      region: c.region || '',
      coords: c.coords,
      normFokontany: normalizeTextForHash(c.fokontany || ''),
      normCommune: normalizeTextForHash(c.commune || ''),
      normDistrict: normalizeTextForHash(c.district || ''),
      label: [c.fokontany, c.commune, c.district].filter(Boolean).join(' — '),
    }));

    this.loadedAt = Date.now();
    this.logger.log(`Cached ${this.indexedCities.length} Malagasy Fokontany/City records for matcher`);
  }

  /**
   * Matches location hints extracted from a Facebook post (and group context) to MongoDB City documents.
   */
  async matchLocation(
    locationHints: string[],
    rawText: string,
    groupName: string,
  ): Promise<{
    bestMatch: CityCandidateMatch | null;
    candidates: CityCandidateMatch[];
  }> {
    await this.ensureCacheLoaded();
    if (this.indexedCities.length === 0) {
      return { bestMatch: null, candidates: [] };
    }

    const normHints = locationHints
      .map((h) => normalizeTextForHash(h))
      .filter((h) => h.length >= 3);
    const normRaw = normalizeTextForHash(rawText);
    const normGroup = normalizeTextForHash(groupName);
    const isAntananarivoContext =
      normRaw.includes('tana') ||
      normRaw.includes('antananarivo') ||
      normGroup.includes('tana') ||
      normGroup.includes('antananarivo');

    const scored: CityCandidateMatch[] = [];

    for (const city of this.indexedCities) {
      let score = 0;

      // Skip overly short tokens unless they match an explicit hint
      if (city.normFokontany.length >= 3) {
        for (let idx = 0; idx < normHints.length; idx++) {
          const hint = normHints[idx];
          // Slight priority for earlier hints (primary neighborhood)
          const hintOrderBonus = idx === 0 ? 4 : 0;
          if (hint === city.normFokontany) {
            score = Math.max(score, 100 + hintOrderBonus);
          } else if (hint.includes(city.normFokontany) || city.normFokontany.includes(hint)) {
            score = Math.max(score, 78 + hintOrderBonus);
          } else {
            // Word-level overlap between hint and fokontany
            const hintWords = hint.split(' ').filter((w) => w.length >= 3);
            const matchedWords = hintWords.filter((w) => city.normFokontany.includes(w));
            if (matchedWords.length > 0) {
              score = Math.max(score, Math.round((matchedWords.length / hintWords.length) * 65));
            }
          }
        }

        // Direct substring scan in post text for distinct Fokontany names (>= 5 chars)
        if (score < 70 && city.normFokontany.length >= 5 && normRaw.includes(city.normFokontany)) {
          score = Math.max(score, 72);
        }
      }

      if (score > 0 && city.normCommune) {
        if (normHints.some((h) => h.includes(city.normCommune)) || normRaw.includes(city.normCommune)) {
          score += 12;
        }
      }

      if (score > 0 && isAntananarivoContext) {
        if (city.normDistrict.includes('antananarivo renivohitra')) {
          score += 14;
        } else if (
          city.normDistrict.includes('antananarivo') ||
          city.normCommune.includes('antananarivo') ||
          normalizeTextForHash(city.region).includes('analamanga')
        ) {
          score += 10;
        }
      }

      if (score >= 45) {
        scored.push({
          _id: city._id,
          label: city.label,
          fokontany: city.fokontany,
          commune: city.commune,
          district: city.district,
          coords: city.coords,
          score,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const candidates = scored.slice(0, 6);
    const bestMatch = candidates.length > 0 && candidates[0].score >= 65 ? candidates[0] : null;

    return { bestMatch, candidates };
  }
}
