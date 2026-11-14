import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HOUSE_TYPE_VALUES,
  HouseType,
  isCommercialHouseType,
  normalizeHouseType,
} from '../common/property-types.util';
import {
  FeatureVerificationMap,
  PROPERTY_FEATURE_KEYS,
  PropertyFeatureKey,
  mergeGeminiAndDeterministicFeatures,
  preserveDescriptionLayout,
} from './fb-feature-analyzer.util';

export { PROPERTY_FEATURE_KEYS, PropertyFeatureKey };
export type { FeatureVerificationMap };

export interface GeminiParsedListing {
  category: 'house_or_apartment' | 'land' | 'seeker_request' | 'spam_or_other';
  type: 'rent' | 'sale' | null;
  houseType: HouseType | null;
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
  featureVerification: FeatureVerificationMap;
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
      '- houseType: MUST be one of "maison", "villa", "appartement", "bureau", "tsena":',
      '  * "tsena": retail/commercial unit in Madagascar ("tsena", "box", "box commercial", "box PPN", "box cash point", "magasin", "boutique", "local commercial", "espace commercial", "showroom", "stand", "kiosque", "dépôt", "entrepôt", "usage commercial").',
      '  * "bureau": office / professional workspace ("bureau", "bureaux", "open space", "cabinet", "local professionnel", "usage bureau").',
      '  * "villa": standalone/modern/upscale villa ("villa", "villa basse", "villa à étage", "villa moderne", "villa contemporaine", "mini-villa").',
      '  * "appartement": apartment, studio, loft, shared-floor unit, chambre ("appartement", "appart", "studio", "chambre", "garçonnière", "étage" in shared building).',
      '  * "maison": family/individual house ("maison", "trano", "trano mitokana", "trano ahofa", "pavillon", "maison basse") when not a villa, apartment, bureau, or tsena.',
      '- rooms: number of bedrooms/chambres ("efitra", "chambres", "chambre à coucher", or "F3"/"T3" -> 2 bedrooms if salon mentioned else estimate carefully). For "tsena" or "bureau", set null unless residential bedrooms are explicitly included.',
      '- livingRoom: salon / living count (null if not mentioned, or for commercial "tsena"/"bureau").',
      '- kitchen: cuisine / lakozia count (null if not mentioned, or for commercial "tsena"/"bureau").',
      '- toilet: WC / kabone count (null if not mentioned; "douche et wc" / "sanitaire" -> toilet=1, bathrooms=1).',
      '- bathrooms: douche / salle de bain / SDB count (null if not mentioned, or for commercial "tsena"/"bureau" without shower).',
      '- area: integer m² if mentioned, otherwise null.',
      '- floor: string such as "RDC", "Rez-de-chaussée", "1er étage", "Villa basse", etc., or null.',
      '- locationHints: neighborhoods/fokontany/communes mentioned (e.g. ["Ivandry", "Alarobia", "Ambatobe", "Itaosy", "67ha"]).',
      '- features: carefully scan EVERY line in French, Malagasy, and English and set booleans ONLY when mentioned or clearly implied (never ignore Malagasy or FR synonyms; respect negations like "tsy miditra fiara" / "sans parking" / "tsisy"):',
      '  * "acces moto" / "moto miditra" / "tafiditra moto" / "2 roues" -> motoAccess=true',
      '  * "acces voiture" / "fiara miditra" / "tafiditra fiara" / "bord de route" / "bord de goudron" / "amoron-dalana" -> carAccess=true AND motoAccess=true (unless "moto ihany" / "sans acces voiture" -> carAccess=false)',
      '  * "parking" / "place de parking" / "stationnement" / "fijanonan\'ny fiara" / "mahazaka fiara" -> parkingSpaceAvailable=true, carAccess=true, motoAccess=true (unless "sans parking" / "tsisy parking")',
      '  * "garage" / "garazy" / "box fermé" -> garage=true, carAccess=true, motoAccess=true',
      '  * "toit-terrasse" / "rooftop" / "terrasse sur le toit" / "terrasse farany ambony" / "terrasse ambony" -> roofTop=true',
      '  * "balcon" / "véranda" / "lavarangana" / "terrasse" / "varangue" -> balcony=true',
      '  * "ascenseur" -> elevator=true; "piscine" -> swimmingPool=true; "baignoire" / "jacuzzi" -> bathtub=true; "cheminée" -> fireplace=true',
      '  * "tamboho" / "clôturée" / "voafefy" / "murée" -> surroundedByWalls=true',
      '  * "trano mitokana" / "maison indépendante" / "villa indépendante" -> independentHouse=true (do NOT confuse with "kaontera mitokana" / separate meter)',
      '  * "douche wc anatiny" / "salle d\'eau intérieure" / "wc visiteur" -> insideToilet=true, insideBathroom=true (if "ivelany" / "extérieur" keep false)',
      '  * "jiro sy rano" / "misy jiro sy rano" / "jirama" (both electricity & water) -> electricityJirama=true, waterPumpSupplyJirama=true, electricityPower=true',
      '  * "maka rano" / "matsaka rano" / "tsy misy rano ao an-trano" / "borne fontaine" / "paompim-pokonolona" / "akaiky paompy" / "pas de robinet" (residents must fetch water outside because there is no water tap inside) -> waterFetchExternal=true, waterPumpSupplyJirama=false, waterPumpSupply=false (if "misy jiro" / "jiro ihany" also appears, set electricityJirama=true, electricityPower=true!)',
      '  * "moto-pompe" / "motopompe" / "surpresseur" / "pompe à eau" / "rano paompy" / "citerne" / "château d\'eau" -> waterPumpSupply=true; "vovo" / "puits" / "forage" -> waterWellSupply=true; "bassin" / "lavoir" / "fantsakana" -> bassin=true',
      '  * "panneau solaire" / "énergie solaire" / "kit solaire" / "photovoltaïque" -> solarPanels=true (do NOT set electricityJirama=true unless "jirama" / "jiro" is also explicitly written)',
      '  * Rare explicit absence: bare "pas d\'eau" / "sans eau" / "tsisy rano" (without well/pump/maka rano) -> keep water booleans false; "pas d\'électricité" / "sans électricité" / "tsisy jiro" -> keep electricity booleans false',
      '  * "meublé" / "meublée" / "misy fanaka" -> furnishedProperty=true (if "non meublé" / "tsisy fanaka" / "vide" keep false)',
      '  * Do NOT guess unmentioned electricityJirama, waterPumpSupplyJirama, or furnishedProperty; leave unmentioned booleans false',
      '  * "eau chaude" / "chauffe-eau" / "rano mafana" -> hotWaterAvailable=true; "clim" / "climatisation" / "climatisée" -> airConditionerAvailable=true',
      '  * "solaire" / "panneau solaire" -> solarPanels=true; "fibre" -> fiberOpticReady=true, wifiAvailability=true; "wifi" / "internet" -> wifiAvailability=true',
      '  * "cuisine équipée" / "aménagée" -> kitchenFacilities=true; "cuisine placardée" / "cuisine avec placard" -> placardKitchen=true (NOT bedroom closets); "cuisine américaine" / "ouverte" -> openKitchen=true',
      '  * "cour" / "tokontany" / "tokotany" -> courtyard=true; "jardin" / "zaridaina" -> garden=true; "dépendance gardien" / "maison gardien" -> guardianHouse=true; "gardien" / "mpiambina" / "sécurisé" / "caméra" -> securitySystem=true',
      '  * "vue mer" -> seaView=true; "vue montagne" -> mountainView=true; "vue panoramique" / "vue dégagée" / "tsara fijery" -> panoramicView=true',
      '- Write a clean, factual French/Malagasy title (max 70 chars).',
      '- For description: STRICTLY preserve the original line breaks (\\n), blank lines (\\n\\n), spaces/indentation, and bullet structure of the post. NEVER collapse multiple lines into one single paragraph. Keep all property details.',
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
            houseType: { type: 'STRING', enum: [...HOUSE_TYPE_VALUES], nullable: true },
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

    const preservedDescription = preserveDescriptionLayout(
      params.content,
      typeof rawParsed.description === 'string' ? rawParsed.description : null,
    );
    const normalizedHouseType = normalizeHouseType(rawParsed.houseType);
    const { features: mergedFeatures, featureVerification } =
      mergeGeminiAndDeterministicFeatures(
        rawParsed.features,
        params.content,
        preservedDescription,
        { isCommercial: isCommercialHouseType(normalizedHouseType) },
      );

    const parsed: GeminiParsedListing = {
      category: ['house_or_apartment', 'land', 'seeker_request', 'spam_or_other'].includes(
        rawParsed.category,
      )
        ? rawParsed.category
        : 'spam_or_other',
      type: listingType,
      houseType: normalizedHouseType,
      title: String(rawParsed.title || 'Propriété à Antananarivo').slice(0, 120),
      description: preservedDescription,
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
      features: mergedFeatures,
      featureVerification,
      aiConfidence: ['high', 'medium', 'low'].includes(rawParsed.aiConfidence)
        ? rawParsed.aiConfidence
        : 'medium',
      aiNotes: String(rawParsed.aiNotes || ''),
    };

    return { parsed, modelUsed };
  }
}
