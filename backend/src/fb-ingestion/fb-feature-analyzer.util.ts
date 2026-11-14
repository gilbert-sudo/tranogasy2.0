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
  'waterFetchExternal',
  'securitySystem',
  'wifiAvailability',
  'fiberOpticReady',
  'seaView',
  'mountainView',
  'panoramicView',
  'solarPanels',
] as const;

export type PropertyFeatureKey = (typeof PROPERTY_FEATURE_KEYS)[number];

export type AccessVerificationState = 'yes' | 'no' | 'unknown';

export type FeatureVerificationMap = {
  carAccess: AccessVerificationState;
  motoAccess: AccessVerificationState;
  waterSupply: AccessVerificationState;
  electricitySupply: AccessVerificationState;
  furnishedProperty: AccessVerificationState;
};

export interface AnalyzeFeatureOptions {
  isCommercial?: boolean;
  existingVerification?:
  | Partial<FeatureVerificationMap>
  | Partial<Record<string, unknown>>
  | null;
}

export interface DeterministicFeatureAnalysis {
  features: Partial<Record<PropertyFeatureKey, boolean>>;
  negated: Partial<Record<PropertyFeatureKey, boolean>>;
  accessVerification: Pick<FeatureVerificationMap, 'carAccess' | 'motoAccess'>;
  waterVerification: AccessVerificationState;
  electricityVerification: AccessVerificationState;
  furnishedVerification: AccessVerificationState;
}

/**
 * Normalizes diacritics and horizontal spacing while preserving line breaks (`\n`)
 * so clause-level and single-line feature patterns do not bleed across unrelated lines.
 */
function normalizeForFeatureMatching(text: string): string {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\S\n]+/g, ' ');
}

/**
 * Strips leading/trailing empty newlines and converts CRLF -> LF while keeping
 * all internal spaces, indentation, line breaks, and paragraph returns intact.
 */
export function normalizePreservingLayout(text: string): string {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/^\n+|\n+$/g, '');
}

/**
 * Ensures cleaned property descriptions retain the multi-line layout (spaces,
 * newlines, blank-line returns) of the original Facebook post.
 */
export function preserveDescriptionLayout(
  rawContent: string,
  geminiDescription?: string | null,
): string {
  const rawLayout = normalizePreservingLayout(rawContent);
  const geminiLayout = normalizePreservingLayout(geminiDescription || '');

  if (!geminiLayout) {
    return rawLayout;
  }
  if (!rawLayout) {
    return geminiLayout;
  }

  const rawNonEmptyLines = rawLayout
    .split('\n')
    .filter((line) => line.trim().length > 0).length;
  const geminiNonEmptyLines = geminiLayout
    .split('\n')
    .filter((line) => line.trim().length > 0).length;

  const rawBlankParagraphBreaks = (rawLayout.match(/\n\s*\n/g) || []).length;
  const geminiBlankParagraphBreaks = (geminiLayout.match(/\n\s*\n/g) || []).length;

  const collapsedLines =
    rawNonEmptyLines >= 2 &&
    (geminiNonEmptyLines <= 1 ||
      geminiNonEmptyLines < Math.ceil(rawNonEmptyLines * 0.65));

  const collapsedParagraphReturns =
    rawBlankParagraphBreaks >= 1 &&
    geminiBlankParagraphBreaks === 0 &&
    geminiNonEmptyLines < rawNonEmptyLines;

  if (collapsedLines || collapsedParagraphReturns) {
    return rawLayout;
  }

  return geminiLayout;
}

const ROOFTOP_POSITIVE_RE =
  /(?:\broof\s*top\b|\btoit[\s-]?terrasse\b|\bterrass?es?\s+sur\s+(?:le\s+)?toit\b|\bterrass?es?\s+(?:farany\s+)?ambony\b|\bterrass?es?\s+en\s+hauteur\b|\btoit\s+amenage(?:able)?\b|\bdalle\s+terrass?e\b)/iu;
const ROOFTOP_NEGATIVE_RE =
  /(?:pas\s+de\s+(?:toit[\s-]?terrasse|rooftop)|sans\s+(?:toit[\s-]?terrasse|rooftop)|tsisy\s+(?:toit[\s-]?terrasse|rooftop))/iu;

const BALCONY_DIRECT_POSITIVE_RE =
  /(?:\bbalcons?\b|\bverandas?\b|\blavarangana\b|\bloggias?\b|\bvarangues?\b)/iu;
const GENERAL_TERRACE_POSITIVE_RE = /(?:\bterrass?es?\b)/iu;
const BALCONY_NEGATIVE_RE =
  /(?:pas\s+de\s+(?:balcon|veranda|terrass?e)|sans\s+(?:balcon|veranda|terrass?e)|tsisy\s+(?:balcon|veranda|terrass?e)|tsy\s+misy\s+(?:balcon|veranda|terrass?e))/iu;

const MOTO_ACCESS_NEGATIVE_RE =
  /(?:pas\s+d['’]?\s*acces\s+moto|sans\s+acces\s+moto|aucun\s+acces\s+moto|acces\s+moto\s*(?::|=)?\s*(?:non|no|tsisy|tsy\s+misy)|tsy\s+(?:miditra|tafiditra)\b[^\n]{0,20}\b(?:moto|kodiaran-droa)|tsisy\s+(?:lalan[a']?|acces)\s+moto|acces\s+pieton(?:\s+uniquement|\s+seul(?:ement)?)?|pieton\s+uniquement|mandeha\s+tongotra\s+ihany|\btongotra\s+ihany\b|\blalan-tongotra\s+ihany\b)/iu;

const CAR_ACCESS_NEGATIVE_RE =
  /(?:pas\s+d['’]?\s*acces\s+(?:voiture|auto(?:mobile)?|4x4|fiara)|sans\s+acces\s+(?:voiture|auto(?:mobile)?|4x4|fiara)|aucun\s+acces\s+(?:voiture|auto(?:mobile)?|4x4|fiara)|acces\s+(?:voiture|auto(?:mobile)?|4x4|fiara)\s*(?::|=)?\s*(?:non|no|tsisy|tsy\s+misy)|tsy\s+(?:miditra|tafiditra)\b[^\n]{0,25}\b(?:fiara|voiture|auto|4x4)|(?:fiara|voiture)\b[^\n]{0,18}\btsy\s+(?:miditra|tafiditra)|tsisy\s+(?:lalan[a']?|acces)\s+(?:fiara|voiture)|non\s+accessible\s+(?:en\s+)?(?:voiture|4x4)|inaccessible\s+(?:en\s+)?(?:voiture|4x4)|acces\s+moto\s+(?:ihany|uniquement|seul(?:ement)?)|\bmoto\s+(?:ihany|uniquement|seul(?:ement)?)\b|\bmiditra\s+moto\s+ihany\b|accessible\s+(?:en\s+|par\s+)?moto\s+(?:uniquement|seul(?:ement)?))/iu;

const CAR_ACCESS_POSITIVE_RE =
  /(?:acces\s*(?:voiture|auto(?:mobile)?|4x4|camion|vehicule)|acc(?:es|\.)?\s*voiture|(?:fiara|voiture|auto|4x4|vehicule)\s+(?:miditra|tafiditra)|\b(?:miditra|tafiditra)\b[^\n]{0,30}\b(?:fiara|voiture|auto|4x4|vehicule)\b|accessible\s+(?:en\s+|aux?\s+|tout(?:e)?\s+)?(?:voiture|auto|4x4|vehicule)|bord\s+de\s+(?:la\s+)?route(?:\s+principal(?:e)?)?|bord\s+de\s+goudron|bord\s+du\s+goudron|en\s+bordure\s+de\s+route|sur\s+(?:la\s+)?route\s+principale|amoron['’ -]?dalana|amoron['’]ny\s+(?:arabe|lalana)|sisin['’ -]?dalana|\ban-dalambe\b)/iu;

const MOTO_ACCESS_POSITIVE_RE =
  /(?:acces\s*(?:moto|deux[\s-]?roues|2[\s-]?roues|scooter)|acc(?:es|\.)?\s*moto|moto\s+(?:miditra|tafiditra)|\b(?:miditra|tafiditra)\b[^\n]{0,25}\b(?:moto|kodiaran-droa)\b|accessible\s+(?:en\s+|par\s+)?moto|parking\s+(?:pour\s+)?moto|garage\s+(?:pour\s+)?moto|\bmoto\s+(?:ihany|uniquement|seul(?:ement)?)\b)/iu;

const PARKING_NEGATIVE_RE =
  /(?:pas\s+de\s+parking|sans\s+parking|aucun\s+parking|tsisy\s+parking|tsy\s+misy\s+parking|pas\s+de\s+stationnement)/iu;
const PARKING_POSITIVE_RE =
  /(?:\bparkings?\b|places?\s+de\s+(?:parking|stationnement)|aire\s+de\s+stationnement|cour\s+(?:pouvant\s+recevoir|pour\s+(?:garer|stationner|voiture|fiara))|fijanonan['’]?ny?\s+fiara|toerana\s+(?:fijanonan['’]?ny?\s+fiara|fiara)|mahazaka\s+fiara|azo\s+ijanonan['’]?ny?\s+fiara|afaka\s+mijanona\s+fiara)/iu;
const PARKING_MOTO_ONLY_RE =
  /\bparking\s+(?:pour\s+)?(?:moto|deux[\s-]?roues|2[\s-]?roues|scooter)s?(?:\s+(?:uniquement|ihany|seul(?:ement)?))?\b/iu;

const GARAGE_NEGATIVE_RE =
  /(?:pas\s+de\s+garage|sans\s+garage|aucun\s+garage|tsisy\s+garage|tsy\s+misy\s+garage)/iu;
const GARAGE_POSITIVE_RE =
  /\b(?:garages?|garazy|box\s+(?:ferme|voiture|auto))\b/iu;
const GARAGE_MOTO_ONLY_RE =
  /\bgarage\s+(?:pour\s+)?(?:moto|deux[\s-]?roues|2[\s-]?roues|scooter)s?\b/iu;

interface SimpleFeatureRule {
  key: PropertyFeatureKey;
  positive: RegExp;
  negative?: RegExp;
}

const SIMPLE_FEATURE_RULES: SimpleFeatureRule[] = [
  {
    key: 'elevator',
    positive: /(?:\bascenseurs?\b|\belevator\b)/iu,
    negative: /(?:sans\s+ascenseur|pas\s+d['’]?\s*ascenseur|tsisy\s+ascenseur)/iu,
  },
  {
    key: 'garden',
    positive: /(?:\bjardins?\b|\bzaridaina\b|\bespace\s+vert\b|\bpelouse\b)/iu,
    negative: /(?:sans\s+jardin|pas\s+de\s+jardin|tsisy\s+jardin|tsy\s+misy\s+jardin)/iu,
  },
  {
    key: 'courtyard',
    positive:
      /(?:(?<!\ben\s)(?<!\bau\s)(?<!\bdu\s)\bcour\b(?!\s+(?:de\s+recreation|d['’]?appel|penal))|\bcours?\s+(?:interieure?|pavee?|cimentee?|spacieuse?|privee?|commune?)\b|\btokot?any\b)/iu,
    negative: /(?:sans\s+cour\b|pas\s+de\s+cour\b|tsisy\s+(?:cour|tokot?any))/iu,
  },
  {
    key: 'swimmingPool',
    positive: /(?:\bpiscines?\b|\bswimming\s*pool\b)/iu,
    negative: /(?:sans\s+piscine|pas\s+de\s+piscine|tsisy\s+piscine)/iu,
  },
  {
    key: 'surroundedByWalls',
    positive:
      /(?:\btamboho\b|\bvoafefy\b|\bmisy\s+fefy\b|\bcloturee?s?\b|\bbien\s+cloturee?\b|\bmuree?s?\b|\bmur\s+de\s+cloture\b|\benceinte\s+(?:fermee?|securisee?)\b)/iu,
    negative:
      /(?:non\s+cloturee?|pas\s+cloturee?|sans\s+cloture|tsisy\s+tamboho|tsy\s+(?:misy\s+tamboho|voafefy))/iu,
  },
  {
    key: 'independentHouse',
    positive:
      /(?:\btrano\s+mitokana\b|\btrano\s+tokana\b|\bmitokana\s+tsara\b|(?:maison|villa|batiment|logement|pavillon|propriete)\s+independant(?:e)?\b|\btout\s+independant\b)/iu,
    negative: /(?:pas\s+independant(?:e)?|non\s+independant(?:e)?|tsy\s+mitokana)/iu,
  },
  {
    key: 'guardianHouse',
    positive:
      /(?:\bmaison\s+(?:de|du|pour)\s+gardien\b|\bloge\s+(?:de\s+)?gardien\b|\bdependance\s+(?:du\s+|pour\s+)?gardien\b|\btrano(?:n['’]?ny)?\s+mpiambina\b)/iu,
  },
  {
    key: 'securitySystem',
    positive:
      /(?:\bgardien(?:nage)?\b|\bmpiambina\b|\bvoambina\b|\bsecurisee?s?\b|\bquartier\s+securise\b|\bresidence\s+securisee?\b|\bcameras?(?:\s+de\s+surveillance)?\b|\bvideosurveillance\b|\balarmes?\b|\bdigicode\b|\binterphone\b|\bportail\s+(?:electrique|automatique|securise)\b)/iu,
    negative: /(?:sans\s+gardien|pas\s+de\s+gardien|tsy\s+securise|non\s+securise)/iu,
  },
  {
    key: 'bassin',
    positive:
      /(?:\bbassins?\b|\blavoirs?\b|\bfantsakana\b|\bfasan-damba\b|\bsasa\s+lamba\b|\btoerana\s+fanasan-damba\b)/iu,
    negative: /(?:sans\s+bassin|pas\s+de\s+bassin|tsisy\s+bassin)/iu,
  },
  {
    key: 'kitchenFacilities',
    positive:
      /(?:\bcuisine\s+equipee?\b|\bcuisine\s+amenagee?\b|\bcuisine\s+moderne\b|\bkitchen\s+equipped\b|\blakosia\s+(?:voaravaka|maoderina)\b)/iu,
    negative: /(?:pas\s+de\s+cuisine|sans\s+cuisine|tsisy\s+lakosia)/iu,
  },
  {
    key: 'placardKitchen',
    positive:
      /(?:\bcuisine\s+(?:avec\s+|en\s+|a\s+)?placards?\b|\bcuisine\s+placardee?\b|\bplacards?\s+(?:de\s+|dans\s+la\s+)?cuisine\b|\blakosia\s+(?:misy\s+)?placard\b)/iu,
  },
  {
    key: 'openKitchen',
    positive:
      /(?:\bcuisine\s+(?:ouverte|americaine)\b|\bopen\s+kitchen\b|\bcoin\s+cuisine\b|\bkitchenette\b|\blakosia\s+misokatra\b)/iu,
  },
  {
    key: 'bathtub',
    positive: /(?:\bbaignoires?\b|\bjacuzzi\b|\bbathtub\b)/iu,
    negative: /(?:sans\s+baignoire|pas\s+de\s+baignoire)/iu,
  },
  {
    key: 'fireplace',
    positive: /(?:\bcheminees?\b|\bfireplace\b)/iu,
  },
  {
    key: 'airConditionerAvailable',
    positive:
      /(?:\bclimatis(?:ee?s?|ation|eur)?\b|\bclim\b|\bair[\s-]?cond(?:ition(?:ed|ing|er))?\b)/iu,
    negative: /(?:sans\s+clim(?:atisation)?|pas\s+de\s+clim(?:atisation)?|non\s+climatisee?)/iu,
  },
  {
    key: 'hotWaterAvailable',
    positive:
      /(?:\beau\s+chaude\b|\bchauffe[\s-]?eau\b|\bcumulus\b|\brano\s+mafana\b|\bhot\s+water\b)/iu,
    negative: /(?:sans\s+eau\s+chaude|pas\s+d['’]?\s*eau\s+chaude|tsisy\s+rano\s+mafana)/iu,
  },
  {
    key: 'furnishedProperty',
    positive:
      /(?:\bmeublee?s?\b|\bsemi[\s-]?meublee?\b|\bentierement\s+meublee?\b|\bmisy\s+fanaka\b|\bavec\s+meubles\b|\btout\s+meuble\b|\bfurnished\b)/iu,
    negative:
      /(?:non[\s-]?meublee?s?|sans\s+meubles?|pas\s+meublee?s?|tsy\s+meublee?s?|tsy\s+misy\s+fanaka|tsisy\s+fanaka|tsy\s+misy\s+entana|\b(?:appartement|studio|maison|villa|logement)\s+vide\b|\bvide\s*,?\s*non\s+meuble|\bunfurnished\b)/iu,
  },
  {
    key: 'waterPumpSupply',
    positive:
      /(?:\bmoto[\s-]?pompes?\b|\bmoteur\s+(?:a\s+)?eau\b|\bsurpresseur\b|\bpompe\s+(?:a\s+eau|immergee|de\s+surface|solaire|electrique)\b|\bpompage\b|\brano\s+paompy\b|\bmisy\s+paompy\s+(?:ao\s+an[\s-]?trano|ao\s+anatiny|manokana|privee?)\b|\bforage\s+(?:avec\s+|misy\s+)?pompe\b|\bciterne\b|\bchateau\s+d['’]?eau\b|\breserve\s+d['’]?eau\b|\bcuve\b|\bwater\s+tank\b|\btank\s+d['’]?eau\b)/iu,
    negative:
      /(?:sans\s+(?:pompe\s+a\s+eau|moto[\s-]?pompe|surpresseur)|(?:tsisy|tsy\s+misy)\s+(?:surpresseur|citerne|moto[\s-]?pompe|paompy))/iu,
  },
  {
    key: 'waterWellSupply',
    positive: /(?:\bvovo\b|\bpuits?\b|\bforage\b|\bwater\s+well\b)/iu,
    negative: /(?:pas\s+de\s+(?:puits|vovo)|sans\s+(?:puits|vovo)|tsisy\s+vovo)/iu,
  },
  {
    key: 'wifiAvailability',
    positive: /(?:\bwi[\s-]?fi\b|\bwifi\b|\binternet\b|\bbox\s+internet\b)/iu,
    negative: /(?:sans\s+wifi|pas\s+de\s+wifi|tsisy\s+wifi)/iu,
  },
  {
    key: 'fiberOpticReady',
    positive: /(?:\bfibre(?:\s+optique)?\b|\bftth\b|\bcompatible\s+fibre\b)/iu,
  },
  {
    key: 'solarPanels',
    positive:
      /(?:\bpanneaux?\s+solaires?\b|\benergie\s+solaire\b|\bkit\s+solaire\b|\bsysteme\s+solaire\b|\beclairage\s+solaire\b|\belectricite\s+solaire\b|(?<!chauffe[\s-]?eau\s+)(?<!eau\s+)\bsolaire\b|\bphotovoltaique\b|\bsolar\s+panels?\b)/iu,
    negative:
      /(?:sans\s+(?:panneaux?\s+)?solaires?|pas\s+de\s+(?:panneaux?\s+)?solaires?|tsisy\s+solaire)/iu,
  },
  {
    key: 'seaView',
    positive:
      /(?:\bvue\s+(?:sur\s+la\s+)?mer\b|\bface\s+a\s+la\s+mer\b|\bpieds?\s+dans\s+l['’]?eau\b|\bsea\s+view\b|\bbord\s+de\s+mer\b)/iu,
  },
  {
    key: 'mountainView',
    positive:
      /(?:\bvue\s+(?:sur\s+(?:la|les)\s+)?montagnes?\b|\bvue\s+sur\s+(?:les\s+)?collines?\b|\bmountain\s+view\b)/iu,
  },
  {
    key: 'panoramicView',
    positive:
      /(?:\bvue\s+panoramique\b|\bvue\s+degagee?\b|\bvue\s+imprenable\b|\bbelle\s+vue\b|\btsara\s+fijery\b|\bpanoramic\s+view\b)/iu,
  },
];

const MAKA_RANO_NEGATIVE_RE =
  /(?:\btsy\s+(?:maka|matsaka)\s+rano\b|\btsisy\s+(?:fakana|fakan[\s-]?drano)\b|\beau\s+a\s+domicile\b|\brobinet\s+a\s+l['’]?interieur\b)/iu;
const MAKA_RANO_EXPLICIT_RE =
  /(?:\b(?:maka|matsaka)\s+(?:rano|(?:eny\s+|any\s+|amin['’]?\s*ny?\s+|am[\s-]?)?(?:paompy|vovo|loharano))\b|\b(?:fakana|fakan[\s-]?drano)\b|\b(?:paompim[\s-]?pokonolona|paompy\s+(?:fokonolona|iraisana|iombonana|ivelany|an[\s-]?dalana))\b|\bakaiky\s+(?:paompy|fakana\s+rano|paompim[\s-]?pokonolona)\b|\bborne[\s-]?fontaine\b|\beau\s+a\s+(?:puiser|aller\s+chercher)\b|\b(?:aller\s+)?chercher\s+de\s+l['’]?eau\b)/iu;
const WATER_NO_INDOOR_RE =
  /(?:\bsans\s+eau\s+(?:courante|a\s+la\s+maison|a\s+l['’]?interieur|interieure?)\b|\bpas\s+d['’]?\s*eau\s+(?:courante|a\s+la\s+maison|a\s+l['’]?interieur|interieure?|au\s+robinet)\b|\bpas\s+de\s+robinet\b|\b(?:tsy\s+misy|tsisy)\s+rano\s+(?:ao\s+an[\s-]?trano|ao\s+anatiny|mandeha)\b)/iu;

const JIRAMA_BOTH_RE =
  /(?:\bjiro\s*(?:sy|et|&|\+|\/)\s*rano\b|\brano\s*(?:sy|et|&|\+|\/)\s*jiro\b|\b(?:eau|electricite)\s*(?:et|&|\+|\/)\s*(?:electricite|eau)\b)/iu;
const JIRAMA_GENERAL_RE = /\bjirama\b/iu;
const UTILITIES_BOTH_NEGATIVE_RE =
  /(?:(?:tsisy|tsy\s+misy)\s+(?:(?:jiro|jirama)\s*(?:sy|na|et|&|\+)\s*rano|rano\s*(?:sy|na|et|&|\+)\s*(?:jiro|jirama))|(?:sans|pas\s+d['’]?\s*)\s*(?:(?:eau|robinet)\s*(?:et|ni|&|\+)\s*(?:d['’]?\s*)?electricite|electricite\s*(?:et|ni|&|\+)\s*(?:d['’]?\s*)?(?:eau|robinet))|\bni\s+eau\s+ni\s+electricite\b|\bni\s+electricite\s+ni\s+eau\b)/iu;
const POWER_NEGATIVE_RE = new RegExp(
  `(?:${UTILITIES_BOTH_NEGATIVE_RE.source}|(?:mbola\\s+)?(?:tsisy|tsy\\s+misy)\\s+(?:jiro|electricite|jirama)|sans\\s+(?:electricite|jirama)|pas\\s+d['’]?\\s*(?:electricite|jirama)|aucune\\s+electricite|\\bno\\s+(?:electricity|power)\\b)`,
  'iu',
);
const WATER_NEGATIVE_RE = new RegExp(
  `(?:${UTILITIES_BOTH_NEGATIVE_RE.source}|(?:mbola\\s+)?(?:tsisy|tsy\\s+misy)\\s+(?:rano(?!\\s+mafana)|jirama)|sans\\s+(?:eau(?!\\s+chaude)|jirama)|pas\\s+d['’]?\\s*(?:eau(?!\\s+chaude)|jirama)|pas\\s+de\\s+robinet|\\bjiro\\s+(?:ihany|uniquement|seul(?:ement)?)\\b|\\belectricite\\s+(?:uniquement|seul(?:e|ement)?)\\b|\\bno\\s+water\\b)`,
  'iu',
);
const POWER_PRIVATE_POSITIVE_RE =
  /(?:\bgroupe\s+electrogene\b|\bconvertisseur\b|\bonduleur\b|\bbatteries?\s+solaires?\b|\bcompteur\s+(?:individuel|prive|separe)\b|\bkaontera(?:\s+manokana|\s+mitokana)\b|\belectricite\s+privee?\b)/iu;
const POWER_ONLY_RE =
  /(?:\belectricite\b|\belectrifiee?\b|(?<!\btsy\s+)\bmisy\s+jiro\b|\bjiro\s+(?:ihany|uniquement|seul(?:ement)?|misy)\b|\bcompteur\s+(?:individuel|prive|separe|jirama)\b|\bkaontera(?:\s+manokana|\s+mitokana)?\b|\bgroupe\s+electrogene\b|\bconvertisseur\b|\btriphasee?\b)/iu;
const WATER_ONLY_RE =
  /(?:(?<!\btsy\s+)\bmisy\s+rano\b|(?<!\bsans\s+)(?<!\bpas\s+d['’]?\s*)\beau\s+courante\b|\beau\s+disponible\b|\beau\s+potable\b|\bcompteur\s+d['’]?eau\b|(?<!\b(?:tsy\s+misy|tsisy|sans)\s+)\brano\s+jirama\b|(?<!\b(?:tsy\s+misy|tsisy)\s+)\brano\s+mandeha\b|(?<!\bpas\s+de\s+)\brobinet\s+(?:ao\s+an[\s-]?trano|ao\s+anatiny|interieur|prive|personnel)\b)/iu;

const INSIDE_BOTH_RE =
  /(?:(?:douche|salle\s+d['’]?eau|sdb)[^\n]{0,18}(?:wc|toilette)[^\n]{0,20}(?:anatiny|interieur(?:e)?|dedans|privatif|privee?)|(?:wc|toilette)[^\n]{0,18}(?:douche|salle\s+d['’]?eau|sdb)[^\n]{0,20}(?:anatiny|interieur(?:e)?|dedans|privatif|privee?)|(?:douche\s*(?:&|et|sy|\/|\+)?\s*wc|wc\s*(?:&|et|sy|\/|\+)?\s*douche)\s+(?:anatiny|interieur(?:e)?|privatif|prive))/iu;
const INSIDE_TOILET_RE =
  /(?:(?:wc|toilettes?|kabone)[^\n]{0,20}(?:anatiny|interieur(?:e)?|dedans|privatif|privee?)|(?:wc|toilettes?)\s+(?:pour\s+|des?\s+)?visiteurs?)/iu;
const INSIDE_BATH_RE =
  /(?:(?:douche|salle\s+de\s+bain|salle\s+d['’]?eau|sdb)[^\n]{0,20}(?:anatiny|interieur(?:e)?|dedans|privatif|privee?))/iu;
const OUTSIDE_TOILET_RE =
  /(?:(?:wc|toilette|kabone)[^\n]{0,22}(?:ivelany|exterieur(?:e)?|dehors|en\s+dehors|commun(?:e)?))/iu;
const OUTSIDE_BATH_RE =
  /(?:(?:douche|salle\s+d['’]?eau|sdb)[^\n]{0,22}(?:ivelany|exterieur(?:e)?|dehors|en\s+dehors|commun(?:e)?))/iu;

/**
 * Extracts deterministic property features, explicit negations, and 3-state
 * access verification from multilingual (French / Malagasy / English) text.
 */
export function extractDeterministicFeatures(
  text: string,
): DeterministicFeatureAnalysis {
  const norm = normalizeForFeatureMatching(text);
  const features: Partial<Record<PropertyFeatureKey, boolean>> = {};
  const negated: Partial<Record<PropertyFeatureKey, boolean>> = {};

  if (!norm.trim()) {
    return {
      features,
      negated,
      accessVerification: { carAccess: 'unknown', motoAccess: 'unknown' },
      waterVerification: 'unknown',
      electricityVerification: 'unknown',
      furnishedVerification: 'unknown',
    };
  }

  for (const rule of SIMPLE_FEATURE_RULES) {
    if (rule.negative && rule.negative.test(norm)) {
      negated[rule.key] = true;
    } else if (rule.positive.test(norm)) {
      features[rule.key] = true;
    }
  }

  if (features.fiberOpticReady && !negated.wifiAvailability) {
    features.wifiAvailability = true;
  }

  // Terraces & balconies: detect rooftop terraces separately from general terraces/balconies
  if (ROOFTOP_NEGATIVE_RE.test(norm)) {
    negated.roofTop = true;
  } else if (ROOFTOP_POSITIVE_RE.test(norm)) {
    features.roofTop = true;
  }

  if (BALCONY_NEGATIVE_RE.test(norm)) {
    negated.balcony = true;
  } else {
    const withoutRooftopPhrases = norm.replace(
      /(?:\broof\s*top\b|\btoit[\s-]?terrasse\b|\bterrass?es?\s+sur\s+(?:le\s+)?toit\b|\bterrass?es?\s+(?:farany\s+)?ambony\b|\bterrass?es?\s+en\s+hauteur\b|\bdalle\s+terrass?e\b)/giu,
      ' ',
    );
    if (
      BALCONY_DIRECT_POSITIVE_RE.test(norm) ||
      GENERAL_TERRACE_POSITIVE_RE.test(withoutRooftopPhrases)
    ) {
      features.balcony = true;
    }
  }

  // Maka rano / external water fetch + Jirama / electricity / water / solar
  const makaRanoNegated = MAKA_RANO_NEGATIVE_RE.test(norm);
  const explicitMakaRano = MAKA_RANO_EXPLICIT_RE.test(norm);
  const noIndoorWater = WATER_NO_INDOOR_RE.test(norm);
  const powerNegated = POWER_NEGATIVE_RE.test(norm);
  const waterNegated = WATER_NEGATIVE_RE.test(norm);
  const hasSolarPower = features.solarPanels === true;
  const hasPrivatePower = POWER_PRIVATE_POSITIVE_RE.test(norm);
  const explicitPipedWater =
    JIRAMA_BOTH_RE.test(norm) ||
    WATER_ONLY_RE.test(norm) ||
    Boolean(features.waterPumpSupply);

  if (makaRanoNegated) {
    negated.waterFetchExternal = true;
  } else if (
    explicitMakaRano ||
    (noIndoorWater && !features.waterWellSupply && !explicitPipedWater)
  ) {
    features.waterFetchExternal = true;
  }

  if (hasPrivatePower) {
    features.electricityPower = true;
  }

  if (powerNegated) {
    negated.electricityJirama = true;
    if (!hasSolarPower && !hasPrivatePower) {
      negated.electricityPower = true;
    }
  } else {
    if (JIRAMA_BOTH_RE.test(norm) || JIRAMA_GENERAL_RE.test(norm)) {
      features.electricityJirama = true;
      features.electricityPower = true;
    }
    if (POWER_ONLY_RE.test(norm)) {
      features.electricityPower = true;
      if (/(?:\bjirama\b|\bjiro\b|\bkaontera\b)/iu.test(norm)) {
        features.electricityJirama = true;
      }
    }
  }

  let electricityVerification: AccessVerificationState = 'unknown';
  if (hasSolarPower || features.electricityJirama || features.electricityPower) {
    electricityVerification = 'yes';
  } else if (powerNegated) {
    electricityVerification = 'no';
  }

  const hasKnownWaterFromDet = Boolean(
    features.waterPumpSupply ||
    features.waterWellSupply ||
    features.waterFetchExternal,
  );
  if (
    waterNegated ||
    noIndoorWater ||
    (features.waterFetchExternal === true && !explicitPipedWater)
  ) {
    negated.waterPumpSupplyJirama = true;
    if (!features.waterPumpSupply) {
      negated.waterPumpSupply = true;
    }
    if (waterNegated && !hasKnownWaterFromDet && !makaRanoNegated) {
      negated.waterFetchExternal = true;
    }
  } else {
    if (JIRAMA_BOTH_RE.test(norm) || WATER_ONLY_RE.test(norm)) {
      features.waterPumpSupplyJirama = true;
    } else if (
      JIRAMA_GENERAL_RE.test(norm) &&
      !features.waterFetchExternal &&
      (makaRanoNegated || (!features.waterWellSupply && !features.waterPumpSupply))
    ) {
      features.waterPumpSupplyJirama = true;
    }
  }

  let waterVerification: AccessVerificationState = 'unknown';
  if (
    features.waterPumpSupplyJirama ||
    features.waterPumpSupply ||
    features.waterWellSupply ||
    features.waterFetchExternal
  ) {
    waterVerification = 'yes';
  } else if (waterNegated) {
    waterVerification = 'no';
  }

  // Inside / outside WC & shower
  if (OUTSIDE_TOILET_RE.test(norm)) negated.insideToilet = true;
  if (OUTSIDE_BATH_RE.test(norm)) negated.insideBathroom = true;
  if (INSIDE_BOTH_RE.test(norm)) {
    if (!negated.insideToilet) features.insideToilet = true;
    if (!negated.insideBathroom) features.insideBathroom = true;
  } else {
    if (INSIDE_TOILET_RE.test(norm) && !negated.insideToilet) {
      features.insideToilet = true;
    }
    if (INSIDE_BATH_RE.test(norm) && !negated.insideBathroom) {
      features.insideBathroom = true;
    }
  }

  // Parking & garage
  if (PARKING_NEGATIVE_RE.test(norm)) {
    negated.parkingSpaceAvailable = true;
  } else if (PARKING_POSITIVE_RE.test(norm)) {
    features.parkingSpaceAvailable = true;
  }

  if (GARAGE_NEGATIVE_RE.test(norm)) {
    negated.garage = true;
  } else if (GARAGE_POSITIVE_RE.test(norm)) {
    features.garage = true;
  }

  // Access (car & moto) respecting negations and physical implications
  const motoNegated = MOTO_ACCESS_NEGATIVE_RE.test(norm);
  const carNegated = motoNegated || CAR_ACCESS_NEGATIVE_RE.test(norm);

  if (motoNegated) {
    negated.motoAccess = true;
    negated.carAccess = true;
  } else if (carNegated) {
    negated.carAccess = true;
  }

  const hasNonMotoParking =
    features.parkingSpaceAvailable === true &&
    !PARKING_MOTO_ONLY_RE.test(norm);
  const hasNonMotoGarage =
    features.garage === true && !GARAGE_MOTO_ONLY_RE.test(norm);

  if (
    !negated.carAccess &&
    (CAR_ACCESS_POSITIVE_RE.test(norm) || hasNonMotoParking || hasNonMotoGarage)
  ) {
    features.carAccess = true;
  }

  if (
    !negated.motoAccess &&
    (features.carAccess === true || MOTO_ACCESS_POSITIVE_RE.test(norm))
  ) {
    features.motoAccess = true;
  }

  const accessVerification: Pick<FeatureVerificationMap, 'carAccess' | 'motoAccess'> = {
    carAccess: negated.carAccess
      ? 'no'
      : features.carAccess
        ? 'yes'
        : 'unknown',
    motoAccess: negated.motoAccess
      ? 'no'
      : features.motoAccess
        ? 'yes'
        : 'unknown',
  };

  const furnishedVerification: AccessVerificationState = negated.furnishedProperty
    ? 'no'
    : features.furnishedProperty
      ? 'yes'
      : 'unknown';

  return {
    features,
    negated,
    accessVerification,
    waterVerification,
    electricityVerification,
    furnishedVerification,
  };
}

/**
 * Combines Gemini's extracted boolean features with deterministic multilingual
 * keyword rules, negation overrides, Madagascar default JIRAMA assumptions
 * (flagged as `'unknown'` when silent so admins verify), and `carAccess => motoAccess`.
 */
export function mergeGeminiAndDeterministicFeatures(
  geminiFeatures: Partial<Record<PropertyFeatureKey, unknown>> | null | undefined,
  rawText: string,
  descriptionText?: string,
  options?: AnalyzeFeatureOptions,
): {
  features: Record<PropertyFeatureKey, boolean>;
  featureVerification: FeatureVerificationMap;
} {
  const combinedSource =
    descriptionText && descriptionText !== rawText
      ? `${rawText}\n${descriptionText}`
      : rawText;
  const det = extractDeterministicFeatures(combinedSource);
  const existingVerif = options?.existingVerification || {};
  const isCommercial = Boolean(options?.isCommercial);

  const merged = {} as Record<PropertyFeatureKey, boolean>;
  for (const key of PROPERTY_FEATURE_KEYS) {
    if (det.negated[key]) {
      merged[key] = false;
    } else {
      merged[key] = Boolean(geminiFeatures?.[key]) || Boolean(det.features[key]);
    }
  }

  // Physical implication: if accessible by car, also accessible by moto (unless moto was explicitly negated)
  if (merged.carAccess && !det.negated.motoAccess) {
    merged.motoAccess = true;
  }
  if (det.negated.motoAccess) {
    merged.motoAccess = false;
    merged.carAccess = false;
  }

  // Water source verification & Madagascar default (unmentioned residential -> probable JIRAMA)
  const hasExplicitNonJiramaWaterFromGemini = Boolean(
    !det.negated.waterWellSupply && geminiFeatures?.waterWellSupply,
  ) || Boolean(
    !det.negated.waterPumpSupply && geminiFeatures?.waterPumpSupply,
  ) || Boolean(
    !det.negated.waterFetchExternal && geminiFeatures?.waterFetchExternal,
  );

  let waterSupply: AccessVerificationState = 'unknown';
  if (det.waterVerification === 'no') {
    merged.waterPumpSupplyJirama = false;
    merged.waterPumpSupply = false;
    merged.waterFetchExternal = false;
    waterSupply = 'no';
  } else if (det.waterVerification === 'yes' || hasExplicitNonJiramaWaterFromGemini) {
    // If publisher only stated well/moto-pompe/maka rano without JIRAMA, do not leave a stale JIRAMA default enabled
    if (
      (merged.waterWellSupply || merged.waterPumpSupply || merged.waterFetchExternal) &&
      !det.features.waterPumpSupplyJirama &&
      existingVerif.waterSupply !== 'yes'
    ) {
      merged.waterPumpSupplyJirama = false;
    }
    waterSupply = 'yes';
  } else if (existingVerif.waterSupply === 'no') {
    merged.waterPumpSupplyJirama = false;
    merged.waterPumpSupply = false;
    merged.waterWellSupply = false;
    merged.waterFetchExternal = false;
    waterSupply = 'no';
  } else if (existingVerif.waterSupply === 'yes' && hasKnownWaterSupply(merged)) {
    waterSupply = 'yes';
  } else {
    waterSupply = 'unknown';
    if (!isCommercial && !hasKnownWaterSupply(merged)) {
      merged.waterPumpSupplyJirama = true;
    }
  }

  // Electricity source verification & Madagascar default (unmentioned residential -> probable JIRAMA)
  const hasExplicitPowerFromGemini = Boolean(
    !det.negated.solarPanels && geminiFeatures?.solarPanels,
  ) || Boolean(
    !det.negated.electricityPower &&
    geminiFeatures?.electricityPower &&
    !geminiFeatures?.electricityJirama,
  );

  let electricitySupply: AccessVerificationState = 'unknown';
  if (det.electricityVerification === 'no') {
    merged.electricityJirama = false;
    merged.electricityPower = false;
    merged.solarPanels = false;
    electricitySupply = 'no';
  } else if (det.electricityVerification === 'yes' || hasExplicitPowerFromGemini) {
    if (
      merged.solarPanels &&
      !det.features.electricityJirama &&
      existingVerif.electricitySupply !== 'yes'
    ) {
      merged.electricityJirama = false;
      if (!det.features.electricityPower) {
        merged.electricityPower = false;
      }
    }
    electricitySupply = 'yes';
  } else if (existingVerif.electricitySupply === 'no') {
    merged.electricityJirama = false;
    merged.electricityPower = false;
    merged.solarPanels = false;
    electricitySupply = 'no';
  } else if (existingVerif.electricitySupply === 'yes' && hasKnownElectricitySupply(merged)) {
    electricitySupply = 'yes';
  } else {
    electricitySupply = 'unknown';
    if (!isCommercial && !hasKnownElectricitySupply(merged)) {
      merged.electricityJirama = true;
      merged.electricityPower = true;
    }
  }

  // Furnished verification (always verify whether furnished or unfurnished for houses)
  let furnishedProperty: AccessVerificationState = 'unknown';
  if (det.furnishedVerification === 'no') {
    merged.furnishedProperty = false;
    furnishedProperty = 'no';
  } else if (det.furnishedVerification === 'yes') {
    merged.furnishedProperty = true;
    furnishedProperty = 'yes';
  } else if (existingVerif.furnishedProperty === 'no') {
    merged.furnishedProperty = false;
    furnishedProperty = 'no';
  } else if (existingVerif.furnishedProperty === 'yes' || Boolean(geminiFeatures?.furnishedProperty)) {
    merged.furnishedProperty = true;
    furnishedProperty = 'yes';
  } else {
    merged.furnishedProperty = false;
    furnishedProperty = 'unknown';
  }

  const featureVerification: FeatureVerificationMap = {
    carAccess: det.negated.carAccess
      ? 'no'
      : merged.carAccess
        ? 'yes'
        : 'unknown',
    motoAccess: det.negated.motoAccess
      ? 'no'
      : merged.motoAccess
        ? 'yes'
        : 'unknown',
    waterSupply,
    electricitySupply,
    furnishedProperty,
  };

  return { features: merged, featureVerification };
}

/**
 * Resolves the 3-state (`yes` | `no` | `unknown`) verification status across
 * access, water source, electricity source, and furnished status, supporting legacy
 * candidates that lack a stored `featureVerification` object.
 */
export function deriveFeatureVerification(
  features?: Partial<Record<string, unknown>> | null,
  rawText?: string | null,
  storedVerification?: Partial<Record<string, unknown>> | null,
): FeatureVerificationMap {
  const det = rawText ? extractDeterministicFeatures(rawText) : null;

  const resolveAccessKey = (key: 'carAccess' | 'motoAccess'): AccessVerificationState => {
    if (features?.[key] === true) {
      return 'yes';
    }
    const stored = storedVerification?.[key];
    if (stored === 'no' || stored === 'yes' || stored === 'unknown') {
      return stored;
    }
    if (det?.accessVerification[key] === 'no') {
      return 'no';
    }
    return 'unknown';
  };

  const moto = resolveAccessKey('motoAccess');
  const car = moto === 'no' ? 'no' : resolveAccessKey('carAccess');

  let waterSupply: AccessVerificationState = 'unknown';
  const storedWater = storedVerification?.waterSupply;
  if (storedWater === 'yes' || storedWater === 'no' || storedWater === 'unknown') {
    waterSupply = storedWater;
  } else if (det && det.waterVerification !== 'unknown') {
    waterSupply = det.waterVerification;
  } else if (
    Boolean(features?.waterWellSupply) ||
    Boolean(features?.waterPumpSupply) ||
    Boolean(features?.waterFetchExternal)
  ) {
    waterSupply = 'yes';
  }

  let electricitySupply: AccessVerificationState = 'unknown';
  const storedElec = storedVerification?.electricitySupply;
  if (storedElec === 'yes' || storedElec === 'no' || storedElec === 'unknown') {
    electricitySupply = storedElec;
  } else if (det && det.electricityVerification !== 'unknown') {
    electricitySupply = det.electricityVerification;
  } else if (Boolean(features?.solarPanels)) {
    electricitySupply = 'yes';
  }

  let furnishedProperty: AccessVerificationState = 'unknown';
  const storedFurnished = storedVerification?.furnishedProperty;
  if (
    storedFurnished === 'yes' ||
    storedFurnished === 'no' ||
    storedFurnished === 'unknown'
  ) {
    furnishedProperty = storedFurnished;
  } else if (features?.furnishedProperty === true) {
    furnishedProperty = 'yes';
  } else if (det && det.furnishedVerification !== 'unknown') {
    furnishedProperty = det.furnishedVerification;
  }

  return {
    carAccess: car,
    motoAccess: car === 'yes' ? 'yes' : moto,
    waterSupply,
    electricitySupply,
    furnishedProperty,
  };
}

/**
 * Backward-compatible 2-axis access verification resolver.
 */
export function deriveAccessVerification(
  features?: Partial<Record<string, unknown>> | null,
  rawText?: string | null,
  storedVerification?: Partial<Record<string, unknown>> | null,
): Pick<FeatureVerificationMap, 'carAccess' | 'motoAccess'> {
  const full = deriveFeatureVerification(features, rawText, storedVerification);
  return {
    carAccess: full.carAccess,
    motoAccess: full.motoAccess,
  };
}

/**
 * Returns true when at least one water source is configured on the property
 * (running JIRAMA tap, moto-pompe/citern, on-site well/vovo, or external Maka rano).
 */
export function hasKnownWaterSupply(
  features?: Partial<Record<string, unknown>> | null,
): boolean {
  if (!features) return false;
  return Boolean(
    features.waterPumpSupplyJirama ||
    features.waterPumpSupply ||
    features.waterWellSupply ||
    features.waterFetchExternal,
  );
}

/**
 * Returns true when at least one electricity source is configured on the property
 * (JIRAMA grid, private meter/generator power, or solar panels).
 */
export function hasKnownElectricitySupply(
  features?: Partial<Record<string, unknown>> | null,
): boolean {
  if (!features) return false;
  return Boolean(
    features.electricityJirama ||
    features.electricityPower ||
    features.solarPanels,
  );
}

/**
 * Returns the list of critical verification field keys (`carAccess`, `motoAccess`,
 * and for residential dwellings `waterSupply`, `electricitySupply`, `furnishedProperty`)
 * that still require admin investigation or explicit selection.
 */
export function getMissingFeatureVerificationFields(options: {
  isCommercial: boolean;
  features?: Partial<Record<string, unknown>> | null;
  verification: FeatureVerificationMap;
}): string[] {
  const { isCommercial, features, verification } = options;
  const missing: string[] = [];
  if (verification.carAccess === 'unknown') missing.push('carAccess');
  if (verification.motoAccess === 'unknown') missing.push('motoAccess');
  if (!isCommercial) {
    if (
      verification.waterSupply === 'unknown' ||
      (verification.waterSupply !== 'no' && !hasKnownWaterSupply(features))
    ) {
      missing.push('waterSupply');
    }
    if (
      verification.electricitySupply === 'unknown' ||
      (verification.electricitySupply !== 'no' &&
        !hasKnownElectricitySupply(features))
    ) {
      missing.push('electricitySupply');
    }
    if (verification.furnishedProperty === 'unknown') {
      missing.push('furnishedProperty');
    }
  }
  return missing;
}