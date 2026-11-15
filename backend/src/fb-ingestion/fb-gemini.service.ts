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
  VisualCondition,
  computePropertyQualityScore,
  estimatePropertyArea,
  estimatePropertyPriceAriary,
  extractAgencyFees,
  mergeGeminiAndDeterministicFeatures,
  preserveDescriptionLayout,
  resolveResidentialRoomDefaults,
} from './fb-feature-analyzer.util';
import {
  ImageContactRedactionSpec,
  VisionInlineImage,
} from './fb-gcs.service';

export { PROPERTY_FEATURE_KEYS, PropertyFeatureKey };
export type { FeatureVerificationMap, VisualCondition };

export interface GeminiParsedListing {
  category: 'house_or_apartment' | 'land' | 'seeker_request' | 'spam_or_other';
  type: 'rent' | 'sale' | null;
  houseType: HouseType | null;
  title: string;
  description: string;
  priceAriary: number | null;
  rentAriary: number | null;
  estimatedPriceAriary: number | null;
  estimatedRentAriary: number | null;
  estimatedPriceMin: number | null;
  estimatedPriceMax: number | null;
  estimatedPriceConfidence: 'high' | 'medium' | 'low';
  rooms: number | null;
  livingRoom: number | null;
  kitchen: number | null;
  toilet: number | null;
  bathrooms: number | null;
  area: number | null;
  estimatedArea: number | null;
  visualCondition: VisualCondition;
  qualityScore: number;
  recommendedCoverIndex: number | null;
  imageContactRedactions: ImageContactRedactionSpec[];
  visitFee: number | null;
  cautionPercent: number | null;
  cautionAmount: number | null;
  commissionPercent: number | null;
  commissionAmount: number | null;
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
    inlineImages?: VisionInlineImage[];
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
      '- livingRoom: salon / living count. For residential properties ("maison", "villa", "appartement"): set 1 (or 2 if double living) when salon/living is mentioned OR when the property is a villa or has >=2 rooms/pièces ("efitra roa", "T2", "T3", "2 chambres"); set 0 if it is a single-room studio/chambre without salon; set null for commercial "tsena"/"bureau".',
      '- kitchen: cuisine / lakozia count (default 1 for residential "maison"/"villa"/"appartement" unless explicitly negated like "sans cuisine"/"tsisy lakozia" -> 0; null for commercial "tsena"/"bureau").',
      '- toilet: WC / kabone count (default 1 for residential unless explicitly negated -> 0, or higher count stated; "douche et wc" / "sanitaire" -> toilet=1, bathrooms=1).',
      '- bathrooms: douche / dc / salle de bain / SDB count (default 1 for residential unless explicitly negated -> 0, or higher count stated; null for commercial without shower).',
      '- area: integer m² ONLY if explicitly stated in the post, otherwise null.',
      '- AGENCY & ENTRY FEES (extract ONLY when explicitly mentioned in the post; otherwise set null):',
      '  * visitFeeAriary: Droit de visite (even with sloppy punctuation/abbreviations: "visite : 5000ar", "Visite.10.000 ar", "droit de visite 10.000 Ar", "dv:5000", "frais de visite 25.000 fmg" -> convert FMG/5 to Ariary). Set 0 if explicitly "visite gratuite", or null if not mentioned.',
      '  * cautionPercent: Security deposit ("caution", "antoka") as percentage of monthly rent (e.g. "caution : 50%" -> 50; "1 mois de caution" / "caution 1 mois" -> 100; "2 mois de caution" -> 200; "demi-mois" -> 50). Set null if not mentioned.',
      '  * cautionAriary: Fixed security deposit in Ariary if stated as a currency amount instead of % (convert FMG/5 to Ariary), or null.',
      '  * commissionPercent: Real estate agent commission ("commission", "frais d\'agence", "honoraire", "komisiona", "mpanera") as percentage of monthly rent (e.g. "commission 50%" -> 50; "commission 1 mois de loyer" / "un mois de loyer" -> 100; "demi-mois" -> 50). Set null if not mentioned (note: bare "(mpanera)" next to phone without a commission figure means null).',
      '  * commissionAriary: Fixed agent commission in Ariary if stated as a currency amount instead of %, or null.',
      '- floor: string such as "RDC", "Rez-de-chaussée", "1er étage", "Villa basse", etc., or null.',
      '- locationHints: neighborhoods/quartiers/fokontany/landmarks/communes mentioned in the post, ordered strictly from MOST SPECIFIC quartier or landmark first to broadest city last (e.g. ["Cité Analamahitsy", "Analamahitsy", "Antananarivo"] or ["67ha Sud", "Antananarivo"]). Exclude generic non-place descriptions like "bord de route" or "quartier calme".',
      '- features: carefully scan EVERY line in French, Malagasy, and English and set booleans ONLY when mentioned or clearly implied (never ignore Malagasy or FR synonyms; respect negations like "tsy miditra fiara" / "sans parking" / "tsisy"):',
      '  * "acces moto" / "moto miditra" / "tafiditra moto" / "2 roues" -> motoAccess=true (if car access is not mentioned, carAccess=false)',
      '  * "acces voiture" / "fiara miditra" / "tafiditra fiara" / "bord de route" / "bord de goudron" / "amoron-dalana" -> carAccess=true AND motoAccess=true (unless "moto ihany" / "sans acces voiture" -> carAccess=false)',
      '  * "parking" / "place de parking" / "stationnement" / "fijanonan\'ny fiara" / "mahazaka fiara" -> parkingSpaceAvailable=true, carAccess=true, motoAccess=true (unless "sans parking" / "tsisy parking")',
      '  * "garage" / "garazy" / "box fermé" -> garage=true, carAccess=true, motoAccess=true',
      '  * "toit-terrasse" / "rooftop" / "terrasse sur le toit" / "terrasse farany ambony" / "terrasse ambony" -> roofTop=true',
      '  * "balcon" / "véranda" / "lavarangana" / "terrasse" / "varangue" -> balcony=true',
      '  * "ascenseur" -> elevator=true; "piscine" -> swimmingPool=true; "baignoire" / "jacuzzi" -> bathtub=true; "cheminée" -> fireplace=true',
      '  * "tamboho" / "clôturée" / "voafefy" / "mifefy" / "murée" -> surroundedByWalls=true',
      '  * "trano mitokana" / "maison indépendante" / "villa indépendante" -> independentHouse=true (do NOT confuse with "kaontera mitokana" / separate meter)',
      '  * "douche wc anatiny" / "dc anatiny" / "salle d\'eau intérieure" / "wc visiteur" -> insideToilet=true, insideBathroom=true (if "ivelany" / "extérieur" keep false)',
      '  * "jiro sy rano" / "misy jiro sy rano" / "jirama" (both electricity & water) -> electricityJirama=true, waterPumpSupplyJirama=true, electricityPower=true',
      '  * "maka rano" / "matsaka rano" / "tsy misy rano ao an-trano" / "borne fontaine" / "paompim-pokonolona" / "akaiky paompy" / "pas de robinet" (residents must fetch water outside because there is no water tap inside) -> waterFetchExternal=true, waterPumpSupplyJirama=false, waterPumpSupply=false (if "misy jiro" / "jiro ihany" also appears, set electricityJirama=true, electricityPower=true!)',
      '  * "moto-pompe" / "motopompe" / "surpresseur" / "pompe à eau" / "rano paompy" / "citerne" / "château d\'eau" -> waterPumpSupply=true; "vovo" / "puits" / "forage" -> waterWellSupply=true; "bassin" / "lavoir" / "fantsakana" -> bassin=true',
      '  * "panneau solaire" / "énergie solaire" / "kit solaire" / "photovoltaïque" -> solarPanels=true (do NOT set electricityJirama=true unless "jirama" / "jiro" is also explicitly written)',
      '  * Rare explicit absence: bare "pas d\'eau" / "sans eau" / "tsisy rano" (without well/pump/maka rano) -> keep water booleans false; "pas d\'électricité" / "sans électricité" / "tsisy jiro" -> keep electricity booleans false',
      '  * "meublé" / "meublée" / "misy fanaka" -> furnishedProperty=true (by default a property is always unfurnished: furnishedProperty=false unless explicitly mentioned as furnished)',
      '  * "eau chaude" / "chauffe-eau" / "rano mafana" -> hotWaterAvailable=true; "clim" / "climatisation" / "climatisée" -> airConditionerAvailable=true',
      '  * "solaire" / "panneau solaire" -> solarPanels=true; "fibre" -> fiberOpticReady=true, wifiAvailability=true; "wifi" / "internet" -> wifiAvailability=true',
      '  * "cuisine équipée" / "aménagée" -> kitchenFacilities=true; "cuisine placardée" / "cuisine avec placard" -> placardKitchen=true (NOT bedroom closets); "cuisine américaine" / "ouverte" -> openKitchen=true',
      '  * "cour" / "tokontany" / "tokotany" / "antokotany" -> courtyard=true; "jardin" / "zaridaina" -> garden=true; "dépendance gardien" / "maison gardien" -> guardianHouse=true; "gardien" / "mpiambina" / "sécurisé" / "caméra" -> securitySystem=true',
      '  * "vue mer" -> seaView=true; "vue montagne" -> mountainView=true; "vue panoramique" / "vue dégagée" / "tsara fijery" -> panoramicView=true',
      '- MULTIMODAL PHOTO OCR & VISUAL ANALYSIS (when property photos are attached in order 0, 1, 2...):',
      '  * Read any text watermarked on the photos: extract phone numbers into `phones`, explicit rent/price into `rentAriary`/`priceAriary` (converting FMG/5 to Ariary), and place names into `locationHints`.',
      '  * Inspect rooms & amenities visible in the photos to enrich `features`, `livingRoom`, `kitchen`, `toilet`, `bathrooms`, `floor` (e.g. visible beds/sofas/dining set -> furnishedProperty=true; fitted kitchen cabinets -> placardKitchen=true; tiled shower/WC indoors -> insideBathroom=true, insideToilet=true; balcony/terrace -> balcony=true; courtyard/gate/car -> courtyard=true, carAccess=true).',
      '  * visualAreaEstimateSqm: estimate the total habitable area in m² by combining room counts with the apparent visual room dimensions in the photos.',
      '  * visualCondition: rate the visual standing & condition of the property from the photos as "new_or_modern" (newly built/renovated, modern tiles/ceiling), "good" (clean, well-kept), "average" (standard), or "basic_or_worn" (modest or worn).',
      '  * recommendedCoverPhotoIndex: 0-based index among the attached photos of the best cover photo (prefer bright living room or exterior house facade; NEVER pick a toilet/bathroom close-up or a text banner as cover if another photo exists).',
      '  * imageContacts: CRITICAL FOR PRIVACY — for any attached photo that displays a phone number, WhatsApp number, email, or agency contact text on the image, add an entry with `imageIndex` (0-based), `isFullContactCard` (true only if >50% of the image is a business card/text flyer), and `boxes` containing normalized 0..1000 bounding boxes `{ ymin, xmin, ymax, xmax }` tightly covering every contact number/text on that photo.',
      '- PRICE ESTIMATION WHEN MISSING:',
      '  * Keep `rentAriary` and `priceAriary` strictly for EXPLICIT prices stated in the post text or written on the photos (otherwise null).',
      '  * Always populate `estimatedRentAriary` (when type="rent") or `estimatedPriceAriary` (when type="sale") with your best market estimate in Ariary for Antananarivo/Madagascar given the neighborhood, typology, room count, standing, and photos.',
      '- Write a clean, factual French/Malagasy title (max 70 chars).',
      '- For description: STRICTLY preserve the original line breaks (\\n), blank lines (\\n\\n), spaces/indentation, and bullet structure of the post. NEVER collapse multiple lines into one single paragraph. Keep all property details.',
      '- Set null for area when surface m² is not explicitly stated.',
    ].join('\n');

    const inlineImages = Array.isArray(params.inlineImages) ? params.inlineImages : [];
    const userPrompt = JSON.stringify({
      facebookGroup: params.groupName,
      authorName: params.authorName,
      detectedPhonesByRegex: params.regexPhones,
      attachedPhotoCount: inlineImages.length,
      postText: params.content,
    });

    const userParts: Array<Record<string, any>> = [{ text: userPrompt }];
    for (const img of inlineImages) {
      if (img?.base64Data) {
        userParts.push({
          inlineData: {
            mimeType: img.mimeType || 'image/jpeg',
            data: img.base64Data,
          },
        });
      }
    }

    const body = {
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      contents: [
        {
          role: 'user',
          parts: userParts,
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
            estimatedPriceAriary: { type: 'INTEGER', nullable: true },
            estimatedRentAriary: { type: 'INTEGER', nullable: true },
            rooms: { type: 'INTEGER', nullable: true },
            livingRoom: { type: 'INTEGER', nullable: true },
            kitchen: { type: 'INTEGER', nullable: true },
            toilet: { type: 'INTEGER', nullable: true },
            bathrooms: { type: 'INTEGER', nullable: true },
            area: { type: 'INTEGER', nullable: true },
            visualAreaEstimateSqm: { type: 'INTEGER', nullable: true },
            visualCondition: {
              type: 'STRING',
              enum: ['new_or_modern', 'good', 'average', 'basic_or_worn'],
              nullable: true,
            },
            recommendedCoverPhotoIndex: { type: 'INTEGER', nullable: true },
            imageContacts: {
              type: 'ARRAY',
              nullable: true,
              items: {
                type: 'OBJECT',
                properties: {
                  imageIndex: { type: 'INTEGER' },
                  isFullContactCard: { type: 'BOOLEAN', nullable: true },
                  boxes: {
                    type: 'ARRAY',
                    nullable: true,
                    items: {
                      type: 'OBJECT',
                      properties: {
                        ymin: { type: 'INTEGER' },
                        xmin: { type: 'INTEGER' },
                        ymax: { type: 'INTEGER' },
                        xmax: { type: 'INTEGER' },
                      },
                      required: ['ymin', 'xmin', 'ymax', 'xmax'],
                    },
                  },
                },
                required: ['imageIndex'],
              },
            },
            visitFeeAriary: { type: 'INTEGER', nullable: true },
            cautionPercent: { type: 'INTEGER', nullable: true },
            cautionAriary: { type: 'INTEGER', nullable: true },
            commissionPercent: { type: 'INTEGER', nullable: true },
            commissionAriary: { type: 'INTEGER', nullable: true },
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
    const isCommercial = isCommercialHouseType(normalizedHouseType);
    const { features: mergedFeatures, featureVerification } =
      mergeGeminiAndDeterministicFeatures(
        rawParsed.features,
        params.content,
        preservedDescription,
        { isCommercial },
      );

    // If multimodal Vision inspected actual photos and detected furniture (without text negation), honor it
    if (
      inlineImages.length > 0 &&
      rawParsed.features?.furnishedProperty === true &&
      !/\b(?:non\s+meuble|pas\s+meuble|sans\s+meuble|tsy\s+misy\s+fanaka|tsisy\s+fanaka|vide)\b/iu.test(
        params.content,
      )
    ) {
      mergedFeatures.furnishedProperty = true;
      featureVerification.furnishedProperty = 'yes';
    }

    const priceAriary =
      listingType === 'sale' && typeof rawParsed.priceAriary === 'number' && rawParsed.priceAriary > 0
        ? Math.round(rawParsed.priceAriary)
        : null;
    const rentAriary =
      listingType === 'rent' && typeof rawParsed.rentAriary === 'number' && rawParsed.rentAriary > 0
        ? Math.round(rawParsed.rentAriary)
        : null;

    const resolvedRooms = resolveResidentialRoomDefaults({
      rawText: `${params.content}\n${preservedDescription}`,
      isCommercial,
      houseType: normalizedHouseType,
      rooms: typeof rawParsed.rooms === 'number' && rawParsed.rooms >= 0 ? Math.round(rawParsed.rooms) : null,
      livingRoom:
        typeof rawParsed.livingRoom === 'number' && rawParsed.livingRoom >= 0
          ? Math.round(rawParsed.livingRoom)
          : null,
      kitchen:
        typeof rawParsed.kitchen === 'number' && rawParsed.kitchen >= 0
          ? Math.round(rawParsed.kitchen)
          : null,
      toilet:
        typeof rawParsed.toilet === 'number' && rawParsed.toilet >= 0
          ? Math.round(rawParsed.toilet)
          : null,
      bathrooms:
        typeof rawParsed.bathrooms === 'number' && rawParsed.bathrooms >= 0
          ? Math.round(rawParsed.bathrooms)
          : null,
      rentAriary,
      priceAriary,
    });

    const explicitArea =
      typeof rawParsed.area === 'number' && rawParsed.area > 0 ? Math.round(rawParsed.area) : null;
    const visualAreaEstimateSqm =
      typeof rawParsed.visualAreaEstimateSqm === 'number' && rawParsed.visualAreaEstimateSqm > 0
        ? Math.round(rawParsed.visualAreaEstimateSqm)
        : null;
    const estimatedArea = estimatePropertyArea({
      houseType: normalizedHouseType,
      rooms: resolvedRooms.rooms,
      livingRoom: resolvedRooms.livingRoom,
      kitchen: resolvedRooms.kitchen,
      toilet: resolvedRooms.toilet,
      bathrooms: resolvedRooms.bathrooms,
      area: explicitArea,
      visualAreaEstimateSqm,
      features: mergedFeatures,
    });

    const visualCondition: VisualCondition = [
      'new_or_modern',
      'good',
      'average',
      'basic_or_worn',
    ].includes(rawParsed.visualCondition)
      ? rawParsed.visualCondition
      : 'average';

    const locationHints = Array.isArray(rawParsed.locationHints)
      ? rawParsed.locationHints.map(String).filter(Boolean)
      : [];

    const geminiEstRaw =
      listingType === 'sale'
        ? typeof rawParsed.estimatedPriceAriary === 'number' && rawParsed.estimatedPriceAriary > 0
          ? Math.round(rawParsed.estimatedPriceAriary)
          : null
        : typeof rawParsed.estimatedRentAriary === 'number' && rawParsed.estimatedRentAriary > 0
        ? Math.round(rawParsed.estimatedRentAriary)
        : null;

    const priceEstimation = estimatePropertyPriceAriary({
      type: listingType || 'rent',
      houseType: normalizedHouseType,
      rooms: resolvedRooms.rooms,
      livingRoom: resolvedRooms.livingRoom,
      kitchen: resolvedRooms.kitchen,
      toilet: resolvedRooms.toilet,
      bathrooms: resolvedRooms.bathrooms,
      area: explicitArea,
      estimatedArea,
      features: mergedFeatures,
      visualCondition,
      locationHints,
      rawText: params.content,
      geminiEstimatedPriceAriary: geminiEstRaw,
    });

    const estimatedPriceAriary =
      listingType === 'sale' ? priceEstimation.estimatedAmount : null;
    const estimatedRentAriary =
      listingType !== 'sale' ? priceEstimation.estimatedAmount : null;

    const effectiveRentForFees = rentAriary || estimatedRentAriary;
    const fees = extractAgencyFees(
      params.content,
      {
        visitFee:
          typeof rawParsed.visitFeeAriary === 'number' ? rawParsed.visitFeeAriary : null,
        cautionPercent:
          typeof rawParsed.cautionPercent === 'number' ? rawParsed.cautionPercent : null,
        cautionAmount:
          typeof rawParsed.cautionAriary === 'number' ? rawParsed.cautionAriary : null,
        commissionPercent:
          typeof rawParsed.commissionPercent === 'number' ? rawParsed.commissionPercent : null,
        commissionAmount:
          typeof rawParsed.commissionAriary === 'number' ? rawParsed.commissionAriary : null,
      },
      effectiveRentForFees,
    );

    const recommendedCoverIndex =
      typeof rawParsed.recommendedCoverPhotoIndex === 'number' &&
      rawParsed.recommendedCoverPhotoIndex >= 0
        ? Math.round(rawParsed.recommendedCoverPhotoIndex)
        : null;

    const imageContactRedactions: ImageContactRedactionSpec[] = Array.isArray(
      rawParsed.imageContacts,
    )
      ? rawParsed.imageContacts
          .filter((ic: any) => typeof ic?.imageIndex === 'number' && ic.imageIndex >= 0)
          .map((ic: any) => ({
            imageIndex: Math.round(ic.imageIndex),
            isFullContactCard: Boolean(ic.isFullContactCard),
            boxes: Array.isArray(ic.boxes)
              ? ic.boxes
                  .filter(
                    (b: any) =>
                      typeof b?.ymin === 'number' &&
                      typeof b?.xmin === 'number' &&
                      typeof b?.ymax === 'number' &&
                      typeof b?.xmax === 'number',
                  )
                  .map((b: any) => ({
                    ymin: Math.round(b.ymin),
                    xmin: Math.round(b.xmin),
                    ymax: Math.round(b.ymax),
                    xmax: Math.round(b.xmax),
                  }))
              : [],
          }))
      : [];

    const aiConfidence: 'high' | 'medium' | 'low' = ['high', 'medium', 'low'].includes(
      rawParsed.aiConfidence,
    )
      ? rawParsed.aiConfidence
      : 'medium';

    const qualityScore = computePropertyQualityScore({
      photoCount: inlineImages.length || 1,
      visualCondition,
      hasExplicitPrice: Boolean(priceAriary || rentAriary),
      estimatedPriceConfidence: priceEstimation.confidence,
      hasMatchedCity: locationHints.length > 0,
      rooms: resolvedRooms.rooms,
      livingRoom: resolvedRooms.livingRoom,
      kitchen: resolvedRooms.kitchen,
      toilet: resolvedRooms.toilet,
      bathrooms: resolvedRooms.bathrooms,
      features: mergedFeatures,
      aiConfidence,
      hasPhone: mergedPhones.length > 0,
    });

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
      priceAriary,
      rentAriary,
      estimatedPriceAriary,
      estimatedRentAriary,
      estimatedPriceMin: priceEstimation.estimatedMin,
      estimatedPriceMax: priceEstimation.estimatedMax,
      estimatedPriceConfidence: priceEstimation.confidence,
      rooms: resolvedRooms.rooms,
      livingRoom: resolvedRooms.livingRoom,
      kitchen: resolvedRooms.kitchen,
      toilet: resolvedRooms.toilet,
      bathrooms: resolvedRooms.bathrooms,
      area: explicitArea,
      estimatedArea,
      visualCondition,
      qualityScore,
      recommendedCoverIndex,
      imageContactRedactions,
      visitFee: fees.visitFee,
      cautionPercent: fees.cautionPercent,
      cautionAmount: fees.cautionAmount,
      commissionPercent: fees.commissionPercent,
      commissionAmount: fees.commissionAmount,
      floor: rawParsed.floor ? String(rawParsed.floor) : null,
      locationHints,
      phones: mergedPhones,
      features: mergedFeatures,
      featureVerification,
      aiConfidence,
      aiNotes: String(rawParsed.aiNotes || ''),
    };

    return { parsed, modelUsed };
  }
}
