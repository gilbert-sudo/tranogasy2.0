import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const PROPERTY_FEATURE_KEYS = [
  'motoAccess',
  'carAccess',
  'parkingSpaceAvailable',
  'elevator',
  'garden',
  'courtyard',
  'balcony',
  'roofTop',
  'swimmingPool',
  'surroundedByWalls',
  'independentHouse',
  'garage',
  'guardianHouse',
  'bassin',
  'kitchenFacilities',
  'placardKitchen',
  'openKitchen',
  'insideToilet',
  'insideBathroom',
  'bathtub',
  'fireplace',
  'airConditionerAvailable',
  'hotWaterAvailable',
  'furnishedProperty',
  'electricityPower',
  'electricityJirama',
  'waterPumpSupply',
  'waterPumpSupplyJirama',
  'waterWellSupply',
  'securitySystem',
  'wifiAvailability',
  'fiberOpticReady',
  'seaView',
  'mountainView',
  'panoramicView',
  'solarPanels',
] as const;

export type PropertyFeatureKey = (typeof PROPERTY_FEATURE_KEYS)[number];

export interface GeminiParsedListing {
  category: 'house_or_apartment' | 'land' | 'seeker_request' | 'spam_or_other';
  type: 'rent' | 'sale' | null;
  houseType: 'maison' | 'appartement' | null;
  title: string;
  description: string;
  priceAriary: number | null;
  rentAriary: number | null;
  rooms: number | null;
  livingRoom: number | null;
  kitchen: number | null;
  toilet: number | null;
  bathrooms: number | null;
  area: number | null;
  floor: string | null;
  locationHints: string[];
  phones: string[];
  features: Record<PropertyFeatureKey, boolean>;
  aiConfidence: 'high' | 'medium' | 'low';
  aiNotes: string;
}

@Injectable()
export class FbGeminiService {
  private readonly logger = new Logger(FbGeminiService.name);

  constructor(private readonly configService: ConfigService) {}

  private buildFeatureSchemaProperties(): Record<string, { type: string }> {
    const props: Record<string, { type: string }> = {};
    for (const key of PROPERTY_FEATURE_KEYS) {
      props[key] = { type: 'BOOLEAN' };
    }
    return props;
  }

  private sanitizeFeatures(rawFeatures: Record<string, any> | undefined): Record<PropertyFeatureKey, boolean> {
    const out = {} as Record<PropertyFeatureKey, boolean>;
    for (const key of PROPERTY_FEATURE_KEYS) {
      out[key] = Boolean(rawFeatures?.[key]);
    }
    return out;
  }

  /**
   * Parses a Malagasy/French Facebook real-estate post into Tranogasy's structured Property + Feature schema.
   */
  async parsePost(params: {
    content: string;
    groupName: string;
    authorName: string;
    modelOverride?: string;
    regexPhones: string[];
  }): Promise<{ parsed: GeminiParsedListing; modelUsed: string }> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY')?.trim();
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in .env');
    }

    const primaryModel =
      params.modelOverride?.trim() ||
      this.configService.get<string>('GEMINI_MODEL')?.trim() ||
      'gemini-3.5-flash-lite';

    // Cycle across all verified Free Tier Flash/Flash-Lite pools when one throttles or spikes (429/503).
    const fallbackModels = Array.from(
      new Set([
        primaryModel,
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemini-3.5-flash',
        'gemini-3.6-flash',
        'gemini-3-flash-preview',
      ]),
    );

    const systemInstruction = [
      'You are an expert Malagasy & French real-estate listing extractor for Tranogasy (Madagascar).',
      'Classify and extract structured listing data from a Facebook group post into strict JSON.',
      '',
      'CLASSIFICATION RULES (category):',
      '- "land": ONLY bare land/plots/lots ("tany amidy", "tany ahofa", "terrain à vendre", "lotissement", "lot", "parcelle") WITHOUT a house/apartment/commercial building.',
      '- "seeker_request": User is LOOKING/ASKING for a property ("mitady trano", "recherche maison/appartement", "izahay mitady", "budget X mitady").',
      '- "spam_or_other": Not offering a real-estate property (electronics, cameras, solar panels alone, moving truck, furniture, loans, promos, agent ads without a property).',
      '- "house_or_apartment": Offering a real estate building/unit for rent or sale (house, villa, studio, apartment, chambre, commercial space/tsena/bureau).',
      '',
      'RENT VS SALE (type):',
      '- "rent": "ahofa", "hofaina", "à louer", "loue", "/mois", "isambolana", "par mois", monthly amounts.',
      '- "sale": "amidy", "mivarotra", "à vendre", "vend", sale amounts (especially large prices >= 15M Ar).',
      '- Use the Facebook group name as context when unclear.',
      '',
      'MADAGASCAR CURRENCY CONVERSION (CRITICAL):',
      '- ALWAYS output rentAriary and priceAriary in ARIARY (Ar), NEVER in FMG.',
      '- 1 Ariary = 5 FMG, therefore FMG / 5 = Ariary.',
      '- Example: "3 millions FMG" or "3.000.000 FMG" -> 600000 Ariary.',
      '- Example: "600.000 FMG" -> 120000 Ariary.',
      '- Example: "120.000 Ar / 600.000 FMG" -> 120000 Ariary.',
      '- Example: "1.500.000 Ar" / "1,5M Ar" -> 1500000 Ariary.',
      '- Set rentAriary ONLY when type="rent" (and priceAriary=null). Set priceAriary ONLY when type="sale" (and rentAriary=null).',
      '',
      'FIELDS & MALAGASY VOCABULARY:',
      '- houseType: "appartement" for studio/appartement/loft/étage in shared building/chambre; "maison" for villa/trano mitokana/duplex/pavillon/villa basse.',
      '- rooms: number of bedrooms/chambres ("efitra", "chambres", "chambre à coucher", or "F3"/"T3" -> 2 bedrooms if salon mentioned else estimate carefully). Set null if not mentioned.',
      '- livingRoom: salon / living count (null if not mentioned).',
      '- kitchen: cuisine / lakozia count (null if not mentioned).',
      '- toilet: WC / kabone count (null if not mentioned; "douche et wc" / "sanitaire" -> toilet=1, bathrooms=1).',
      '- bathrooms: douche / salle de bain / SDB count (null if not mentioned).',
      '- area: integer m² if mentioned, otherwise null.',
      '- floor: string such as "RDC", "1er étage", "Villa basse", etc., or null.',
      '- locationHints: neighborhoods/fokontany/communes mentioned (e.g. ["Ivandry", "Alarobia", "Ambatobe", "Itaosy", "67ha"]).',
      '- features: set booleans ONLY when explicitly mentioned or strongly implied:',
      '  * "acces moto" / "moto miditra" -> motoAccess=true',
      '  * "acces voiture" / "fiara miditra" / "garage" / "parking" -> carAccess=true',
      '  * "tamboho" / "clôturée" / "mure" -> surroundedByWalls=true',
      '  * "mitokana" / "indépendante" -> independentHouse=true',
      '  * "douche wc anatiny" / "interieur" -> insideToilet=true, insideBathroom=true',
      '  * "jirama" / "jiro sy rano jirama" -> electricityJirama=true, waterPumpSupplyJirama=true, electricityPower=true',
      '  * "rano paompy" / "pompe" -> waterPumpSupply=true; "vovo" / "puits" -> waterWellSupply=true; "bassin" / "dalle" / "fantsakana" -> bassin=true',
      '  * "meublé" / "meublée" / "misy fanaka" -> furnishedProperty=true',
      '  * "eau chaude" / "chauffe-eau" -> hotWaterAvailable=true; "clim" -> airConditionerAvailable=true',
      '  * "solaire" / "panneau solaire" -> solarPanels=true; "fibre" -> fiberOpticReady=true, wifiAvailability=true',
      '  * "cuisine équipée" -> kitchenFacilities=true; "placard" -> placardKitchen=true; "cuisine américaine/ouverte" -> openKitchen=true',
      '  * "cour" / "tokontany" -> courtyard=true; "jardin" / "zaridaina" -> garden=true; "gardien" / "mpiaro" -> guardianHouse=true',
      '- Write a clean, factual French/Malagasy title (max 70 chars) and clean readable description.',
      '- Set null instead of guessing 0 when room counts or area are not stated.',
    ].join('\n');

    const userPrompt = JSON.stringify({
      facebookGroup: params.groupName,
      authorName: params.authorName,
      detectedPhonesByRegex: params.regexPhones,
      postText: params.content,
    });

    const body = {
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            category: {
              type: 'STRING',
              enum: ['house_or_apartment', 'land', 'seeker_request', 'spam_or_other'],
            },
            type: { type: 'STRING', enum: ['rent', 'sale'], nullable: true },
            houseType: { type: 'STRING', enum: ['maison', 'appartement'], nullable: true },
            title: { type: 'STRING' },
            description: { type: 'STRING' },
            priceAriary: { type: 'INTEGER', nullable: true },
            rentAriary: { type: 'INTEGER', nullable: true },
            rooms: { type: 'INTEGER', nullable: true },
            livingRoom: { type: 'INTEGER', nullable: true },
            kitchen: { type: 'INTEGER', nullable: true },
            toilet: { type: 'INTEGER', nullable: true },
            bathrooms: { type: 'INTEGER', nullable: true },
            area: { type: 'INTEGER', nullable: true },
            floor: { type: 'STRING', nullable: true },
            locationHints: { type: 'ARRAY', items: { type: 'STRING' } },
            phones: { type: 'ARRAY', items: { type: 'STRING' } },
            features: {
              type: 'OBJECT',
              properties: this.buildFeatureSchemaProperties(),
            },
            aiConfidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
            aiNotes: { type: 'STRING' },
          },
          required: [
            'category',
            'title',
            'description',
            'locationHints',
            'phones',
            'features',
            'aiConfidence',
            'aiNotes',
          ],
        },
      },
    };

    let json: {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    } | null = null;
    let modelUsed = primaryModel;
    let lastError = 'Unknown Gemini error';

    for (const candidateModel of fallbackModels) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            candidateModel,
          )}:generateContent?key=${encodeURIComponent(apiKey)}`;

          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30000),
          });

          if (res.ok) {
            json = (await res.json()) as any;
            modelUsed = candidateModel;
            break;
          }

          const errText = await res.text();
          lastError = `Gemini ${candidateModel} (${res.status}): ${errText}`;

          // On 429 quota/rate limits, move straight to the next model pool; retry transient 503 once.
          if (res.status === 503 && attempt === 0) {
            this.logger.warn(`Transient Gemini 503 on ${candidateModel}, backing off before retry...`);
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
          if (res.status === 429 || res.status === 503) {
            this.logger.warn(`Gemini ${res.status} on ${candidateModel}, falling back to next model...`);
          }
          break;
        } catch (err) {
          lastError = `Gemini ${candidateModel} error: ${(err as Error).message}`;
        }
      }
      if (json) break;
    }

    if (!json) {
      throw new Error(lastError);
    }

    const rawText = json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || '')
      .join('')
      .trim();

    if (!rawText) {
      throw new Error(`Gemini returned empty candidate: ${JSON.stringify(json)}`);
    }

    const rawParsed = JSON.parse(rawText);

    // Merge regex-detected phones with Gemini-extracted phones for highest recall.
    const mergedPhones = Array.from(
      new Set([...params.regexPhones, ...(Array.isArray(rawParsed.phones) ? rawParsed.phones : [])]),
    )
      .map((p) => String(p).replace(/\D/g, ''))
      .filter((p) => p.length >= 9);

    const listingType =
      rawParsed.type === 'rent' || rawParsed.type === 'sale' ? rawParsed.type : null;

    const parsed: GeminiParsedListing = {
      category: ['house_or_apartment', 'land', 'seeker_request', 'spam_or_other'].includes(
        rawParsed.category,
      )
        ? rawParsed.category
        : 'spam_or_other',
      type: listingType,
      houseType:
        rawParsed.houseType === 'maison' || rawParsed.houseType === 'appartement'
          ? rawParsed.houseType
          : null,
      title: String(rawParsed.title || 'Propriété à Antananarivo').slice(0, 120),
      description: String(rawParsed.description || params.content),
      priceAriary:
        listingType === 'sale' && typeof rawParsed.priceAriary === 'number' && rawParsed.priceAriary > 0
          ? Math.round(rawParsed.priceAriary)
          : null,
      rentAriary:
        listingType === 'rent' && typeof rawParsed.rentAriary === 'number' && rawParsed.rentAriary > 0
          ? Math.round(rawParsed.rentAriary)
          : null,
      rooms: typeof rawParsed.rooms === 'number' && rawParsed.rooms >= 0 ? Math.round(rawParsed.rooms) : null,
      livingRoom:
        typeof rawParsed.livingRoom === 'number' && rawParsed.livingRoom >= 0
          ? Math.round(rawParsed.livingRoom)
          : null,
      kitchen:
        typeof rawParsed.kitchen === 'number' && rawParsed.kitchen >= 0 ? Math.round(rawParsed.kitchen) : null,
      toilet:
        typeof rawParsed.toilet === 'number' && rawParsed.toilet >= 0 ? Math.round(rawParsed.toilet) : null,
      bathrooms:
        typeof rawParsed.bathrooms === 'number' && rawParsed.bathrooms >= 0
          ? Math.round(rawParsed.bathrooms)
          : null,
      area: typeof rawParsed.area === 'number' && rawParsed.area > 0 ? Math.round(rawParsed.area) : null,
      floor: rawParsed.floor ? String(rawParsed.floor) : null,
      locationHints: Array.isArray(rawParsed.locationHints)
        ? rawParsed.locationHints.map(String).filter(Boolean)
        : [],
      phones: mergedPhones,
      features: this.sanitizeFeatures(rawParsed.features),
      aiConfidence: ['high', 'medium', 'low'].includes(rawParsed.aiConfidence)
        ? rawParsed.aiConfidence
        : 'medium',
      aiNotes: String(rawParsed.aiNotes || ''),
    };

    return { parsed, modelUsed };
  }
}
