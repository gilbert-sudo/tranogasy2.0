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
      /(?:(?<!\ben\s)(?<!\bau\s)(?<!\bdu\s)\bcour\b(?!\s+(?:de\s+recreation|d['’]?appel|penal))|\bcours?\s+(?:interieure?|pavee?|cimentee?|spacieuse?|privee?|commune?)\b|\b(?:an[\s-]?)?tokon?tany\b)/iu,
    negative: /(?:sans\s+cour\b|pas\s+de\s+cour\b|tsisy\s+(?:cour|tokon?tany))/iu,
  },
  {
    key: 'swimmingPool',
    positive: /(?:\bpiscines?\b|\bswimming\s*pool\b)/iu,
    negative: /(?:sans\s+piscine|pas\s+de\s+piscine|tsisy\s+piscine)/iu,
  },
  {
    key: 'surroundedByWalls',
    positive:
      /(?:\btamboho\b|\bvoafefy\b|\bmifefy\b|\bmisy\s+fefy\b|\bcloturee?s?\b|\bbien\s+cloturee?\b|\bmuree?s?\b|\bmur\s+de\s+cloture\b|\benceinte\s+(?:fermee?|securisee?)\b)/iu,
    negative:
      /(?:non\s+cloturee?|pas\s+cloturee?|sans\s+cloture|tsisy\s+tamboho|tsy\s+(?:misy\s+tamboho|voafefy|mifefy))/iu,
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
  /(?:\belectricite\b|\belectrifiee?\b|(?<!\btsy\s+)\bmisy\s+jiro\b|\bjiro\s+(?:ihany|uniquement|seul(?:ement)?|misy)\b|\bcompteur\s+(?:individuel|prive|separe|jirama)\b|\bkaontera(?:\s+manokana|\s+mitokana)?\b|\bgroupe\s+electrogene\b|\bconvertisseur\b|\btriphasee?\b|\banko(?:a)?tran['’]?\s*ny\s+jiro\b|\bjiro\s+anko(?:a)?trany\b)/iu;
const WATER_ONLY_RE =
  /(?:(?<!\btsy\s+)\bmisy\s+rano\b|(?<!\bsans\s+)(?<!\bpas\s+d['’]?\s*)\beau\s+courante\b|\beau\s+disponible\b|\beau\s+potable\b|\bcompteur\s+d['’]?eau\b|(?<!\b(?:tsy\s+misy|tsisy|sans)\s+)\brano\s+jirama\b|(?<!\b(?:tsy\s+misy|tsisy)\s+)\brano\s+mandeha\b|(?<!\bpas\s+de\s+)\brobinet\s+(?:ao\s+an[\s-]?trano|ao\s+anatiny|interieur|prive|personnel)\b|\beo\s+an[\s-]?tokon?tany\s+ny\s+(?:paompy|rano)\b|\b(?:paompy|rano)\s+eo\s+an[\s-]?tokon?tany\b)/iu;

const INSIDE_BOTH_RE =
  /(?:(?:\b(?:douche|dc|dch|salle\s+d['’]?eau|sdb)\b)(?:(?!(?:anatiny|ivelany|interieur|exterieur|dedans|dehors))[^\n]){0,14}\b(?:wc|toilette|kabone)\b[^\n]{0,20}(?:anatiny|interieur(?:e)?|dedans|privatif|privee?)|(?:\b(?:wc|toilette|kabone)\b)(?:(?!(?:anatiny|ivelany|interieur|exterieur|dedans|dehors))[^\n]){0,14}\b(?:douche|dc|dch|salle\s+d['’]?eau|sdb)\b[^\n]{0,20}(?:anatiny|interieur(?:e)?|dedans|privatif|privee?)|(?:\b(?:douche|dc|dch)\s*(?:&|et|sy|\/|\+)?\s*wc|\bwc\s*(?:&|et|sy|\/|\+)?\s*(?:douche|dc|dch)|\bdwc\b)\s+(?:anatiny|interieur(?:e)?|privatif|prive))/iu;
const INSIDE_TOILET_RE =
  /(?:\b(?:wc|toilettes?|kabone)\b(?:(?!(?:ivelany|exterieur|dehors|\bdc\b|\bdch\b|\bdouche\b))[^\n]){0,20}(?:anatiny|interieur(?:e)?|dedans|privatif|privee?)|(?:wc|toilettes?)\s+(?:pour\s+|des?\s+)?visiteurs?)/iu;
const INSIDE_BATH_RE =
  /(?:\b(?:douche|dc|dch|dwc|salle\s+de\s+bain|salle\s+d['’]?eau|sdb)\b(?:(?!(?:ivelany|exterieur|dehors|\bwc\b|\btoilette\b))[^\n]){0,20}(?:anatiny|interieur(?:e)?|dedans|privatif|privee?))/iu;
const OUTSIDE_TOILET_RE =
  /(?:\b(?:wc|toilette|kabone)\b(?:(?!(?:anatiny|interieur|dedans|\bdc\b|\bdch\b|\bdouche\b))[^\n]){0,22}(?:ivelany|exterieur(?:e)?|dehors|en\s+dehors|commun(?:e)?))/iu;
const OUTSIDE_BATH_RE =
  /(?:\b(?:douche|dc|dch|dwc|salle\s+d['’]?eau|sdb)\b(?:(?!(?:anatiny|interieur|dedans|\bwc\b|\btoilette\b))[^\n]){0,22}(?:ivelany|exterieur(?:e)?|dehors|en\s+dehors|commun(?:e)?))/iu;

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

  // Access (car & moto) respecting negations and physical implications:
  // - If car access is mentioned -> accessible by car ('yes') AND by moto ('yes').
  // - If ONLY moto access is mentioned without car access -> conclude moto-only ('carAccess' = 'no', 'motoAccess' = 'yes').
  // - If neither is mentioned -> both 'unknown' (to verify).
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

  // Rule: if publisher only mentioned moto access without mentioning car access, conclude moto-only
  if (features.motoAccess === true && !features.carAccess) {
    negated.carAccess = true;
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
 * keyword rules, negation overrides, and high-probability Malagasy defaults:
 * - Unmentioned furniture -> unfurnished (`furnishedProperty = false`, verification `'no'`).
 * - Unmentioned water/electricity on residential -> JIRAMA (`waterSupply = 'yes'`, `electricitySupply = 'yes'`).
 * - `carAccess => motoAccess`, and `motoAccess` alone (without `carAccess`) => `carAccess = 'no'` (moto-only).
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

  // If only moto access is present without car access (and admin did not override carAccess to 'yes'),
  // conclude the property is only accessible by moto (`carAccess = false` / `'no'`).
  if (merged.motoAccess && !merged.carAccess && existingVerif.carAccess !== 'yes') {
    merged.carAccess = false;
  }

  // Water source verification & Madagascar high-probability default (unmentioned residential -> JIRAMA 'yes')
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
  } else if (!isCommercial) {
    if (!hasKnownWaterSupply(merged)) {
      merged.waterPumpSupplyJirama = true;
    }
    waterSupply = 'yes';
  } else {
    waterSupply = 'unknown';
  }

  // Electricity source verification & Madagascar high-probability default (unmentioned residential -> JIRAMA 'yes')
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
  } else if (!isCommercial) {
    if (!hasKnownElectricitySupply(merged)) {
      merged.electricityJirama = true;
      merged.electricityPower = true;
    }
    electricitySupply = 'yes';
  } else {
    electricitySupply = 'unknown';
  }

  // Furnished verification: high-probability default is unfurnished ('no') unless explicitly stated as furnished ('yes')
  let furnishedProperty: AccessVerificationState = 'no';
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
    furnishedProperty = 'no';
  }

  const resolvedMotoAccess: AccessVerificationState = det.negated.motoAccess
    ? 'no'
    : merged.motoAccess
      ? 'yes'
      : existingVerif.motoAccess === 'no'
        ? 'no'
        : 'unknown';

  const resolvedCarAccess: AccessVerificationState = det.negated.carAccess
    ? 'no'
    : merged.carAccess
      ? 'yes'
      : resolvedMotoAccess === 'yes' && existingVerif.carAccess !== 'yes'
        ? 'no'
        : existingVerif.carAccess === 'no'
          ? 'no'
          : 'unknown';

  const featureVerification: FeatureVerificationMap = {
    carAccess: resolvedCarAccess,
    motoAccess: resolvedCarAccess === 'yes' ? 'yes' : resolvedMotoAccess,
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
    if (stored === 'no' || stored === 'yes') {
      return stored;
    }
    if (det?.accessVerification[key] === 'no') {
      return 'no';
    }
    if (stored === 'unknown') {
      return 'unknown';
    }
    return 'unknown';
  };

  const moto = resolveAccessKey('motoAccess');
  let car: AccessVerificationState;
  if (moto === 'no') {
    car = 'no';
  } else if (features?.carAccess === true) {
    car = 'yes';
  } else if (moto === 'yes' && storedVerification?.carAccess !== 'yes') {
    // Only moto access is enabled without car access -> conclude moto-only ('no' for carAccess)
    car = 'no';
  } else {
    car = resolveAccessKey('carAccess');
  }

  let waterSupply: AccessVerificationState = 'unknown';
  const storedWater = storedVerification?.waterSupply;
  if (storedWater === 'no') {
    waterSupply = 'no';
  } else if (storedWater === 'yes') {
    waterSupply = 'yes';
  } else if (det && det.waterVerification !== 'unknown') {
    waterSupply = det.waterVerification;
  } else if (hasKnownWaterSupply(features)) {
    waterSupply = 'yes';
  } else if (storedWater === 'unknown') {
    waterSupply = 'unknown';
  }

  let electricitySupply: AccessVerificationState = 'unknown';
  const storedElec = storedVerification?.electricitySupply;
  if (storedElec === 'no') {
    electricitySupply = 'no';
  } else if (storedElec === 'yes') {
    electricitySupply = 'yes';
  } else if (det && det.electricityVerification !== 'unknown') {
    electricitySupply = det.electricityVerification;
  } else if (hasKnownElectricitySupply(features)) {
    electricitySupply = 'yes';
  } else if (storedElec === 'unknown') {
    electricitySupply = 'unknown';
  }

  let furnishedProperty: AccessVerificationState = 'no';
  const storedFurnished = storedVerification?.furnishedProperty;
  if (storedFurnished === 'yes' || features?.furnishedProperty === true) {
    furnishedProperty = 'yes';
  } else if (storedFurnished === 'no') {
    furnishedProperty = 'no';
  } else if (det && det.furnishedVerification === 'yes') {
    furnishedProperty = 'yes';
  } else {
    furnishedProperty = 'no';
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

export interface ExtractedAgencyFees {
  visitFee: number | null;
  cautionPercent: number | null;
  cautionAmount: number | null;
  commissionPercent: number | null;
  commissionAmount: number | null;
}

function parseLocalizedNumber(raw: string): number | null {
  const cleaned = String(raw || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(/,(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const num = Number(cleaned);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

function parseFeeAmountToAriary(rawNum: string, unitRaw?: string | null): number | null {
  const base = parseLocalizedNumber(rawNum);
  if (base === null) return null;
  const unit = String(unitRaw || '').toLowerCase().trim();
  let val = base;
  if (
    unit === 'k' ||
    unit === 'mil' ||
    unit === 'mille' ||
    unit === 'milles' ||
    unit === 'arivo'
  ) {
    val = base * 1000;
  } else if (unit.startsWith('m') && unit !== 'mois') {
    val = base * 1_000_000;
  }
  if (unit.includes('fmg') || unit.includes('iraimbilanja')) {
    val = Math.round(val / 5);
  }
  return Math.round(val);
}

const MALAGASY_NUMBER_MAP: Record<string, number> = {
  iray: 1,
  tokana: 1,
  roa: 2,
  telo: 3,
  efatra: 4,
  dimy: 5,
  enina: 6,
  fito: 7,
  valo: 8,
  sivy: 9,
  folo: 10,
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
};

function parseWordOrDigitCount(token?: string | null): number | null {
  if (!token) return null;
  const clean = token.toLowerCase().trim();
  if (MALAGASY_NUMBER_MAP[clean] !== undefined) {
    return MALAGASY_NUMBER_MAP[clean];
  }
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/**
 * Extracts Droit de visite (`visitFee`), Caution (`cautionPercent`, `cautionAmount`),
 * and Commission (`commissionPercent`, `commissionAmount`) ONLY when explicitly mentioned
 * in the listing (combining deterministic regex parsing with optional Gemini values).
 */
export function extractAgencyFees(
  rawText: string,
  geminiFees?: Partial<ExtractedAgencyFees> | null,
  rentAriary?: number | null,
): ExtractedAgencyFees {
  const norm = normalizeForFeatureMatching(rawText);
  const validRent =
    typeof rentAriary === 'number' && Number.isFinite(rentAriary) && rentAriary > 0
      ? Math.round(rentAriary)
      : null;

  let visitFee: number | null = null;
  let cautionPercent: number | null = null;
  let cautionAmount: number | null = null;
  let commissionPercent: number | null = null;
  let commissionAmount: number | null = null;

  const optSep = String.raw`(?:[ \t]*(?:dia|est\s+de|co[uû]te|de)?[ \t]*[:=.,;\/\-~()*_]+[ \t]*|[ \t]+|[ \t]*(?=\d))`;
  const punctOrSpace = String.raw`[ \t]*(?:dia|est\s+de|co[uû]te|de)?[ \t]*[:=.,;\/\-~()*_]*[ \t]*`;
  const numPattern = String.raw`(?:\d{1,3}(?:[ \t.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;
  const fixedNumPattern = String.raw`(?:\d{1,3}(?:[ \t.,]\d{3})+|\d+(?:[.,]\d+)?[ \t]*(?:k|m|milles?|mil|arivo|fmg|iraimbilanja|ar(?:iary)?))`;
  const feeUnit = String.raw`(ar(?:iary)?|fmg|iraimbilanja|k|milles?|mil|arivo)`;
  const visitKw = String.raw`(?:droit(?:s)?\s+(?:de\s+)?visites?|frais\s+(?:de\s+)?visites?|sarany\s+fitsidihana|saran['’]?\s*(?:ny\s+)?fitsidihana|fitsidihana|visites?(?:\s+(?:de\s+)?lieu(?:x)?)?|d\.?\s*v\.?(?=[ \t:=.,;\/\-~(\d]))`;
  const cautionKw = String.raw`(?:caution(?:nement)?|antoka)`;
  const commKw = String.raw`(?:commissions?|(?<!\.)comm?\.?(?=[ \t:=.,;\/\-~(\d%])|frais\s+d['’]?agence|honoraires?(?:\s+d['’]?agence)?|komisiona|droit\s+mpanera|anjaran['’]?\s*(?:ny\s+)?mpanera)`;

  // 1. Droit de visite (visite : 5000ar, Visite.10.000 ar, dv:5000, visite gratuite, etc.)
  const freeVisitRe = new RegExp(
    String.raw`(?:(?:\b${visitKw}${punctOrSpace}(?:gratuite?|0\s*(?:ar|ariary|fmg)?|maimaim[\s-]?poana))|(?:\b(?:sans|pas\s+de|tsisy|tsy\s+misy)\s+(?:droit(?:s)?\s+de\s+|frais\s+de\s+)?visites?\b))`,
    'iu',
  );
  const visitAmountRe = new RegExp(
    String.raw`\b${visitKw}${optSep}(${numPattern})[ \t]*${feeUnit}?\b`,
    'iu',
  );
  const visitReversedRe = new RegExp(
    String.raw`\b(${numPattern})[ \t]*${feeUnit}[ \t]*(?:ny|no|de|pour|le)?[ \t]*[:=.,;\/\-~()*_]*[ \t]*${visitKw}\b`,
    'iu',
  );

  if (freeVisitRe.test(norm)) {
    visitFee = 0;
  } else {
    const mVisit = norm.match(visitAmountRe) || norm.match(visitReversedRe);
    if (mVisit) {
      const parsed = parseFeeAmountToAriary(mVisit[1], mVisit[2]);
      const hasUnit = Boolean(mVisit[2]);
      const looksLikeYearWithoutUnit = !hasUnit && parsed !== null && parsed >= 2020 && parsed <= 2035 && parsed % 100 !== 0;
      if (
        parsed !== null &&
        !looksLikeYearWithoutUnit &&
        (parsed === 0 || (parsed >= 500 && parsed <= 500_000))
      ) {
        visitFee = parsed;
      }
    } else if (
      typeof geminiFees?.visitFee === 'number' &&
      Number.isFinite(geminiFees.visitFee) &&
      geminiFees.visitFee >= 0 &&
      geminiFees.visitFee <= 500_000 &&
      /\b(?:visites?|fitsidihana|d\.?\s*v\.?(?=[ \t:=.,;\/\-~(\d]))/iu.test(norm)
    ) {
      visitFee = Math.round(geminiFees.visitFee);
    }
  }

  // 2. Combined "caution et commission : 50%" pattern
  const combinedPctRe =
    /\b(?:caution\s*(?:et|sy|&|\+|\/)\s*(?:commission|honoraire|mpanera)|(?:commission|honoraire)\s*(?:et|sy|&|\+|\/)\s*caution)[ \t]*[:=.,;\/\-()]*[ \t]*(\d{1,3})[ \t]*%/iu;
  const mCombinedPct = norm.match(combinedPctRe);
  if (mCombinedPct) {
    const pct = Number(mCombinedPct[1]);
    if (Number.isFinite(pct) && pct > 0 && pct <= 300) {
      cautionPercent = pct;
      commissionPercent = pct;
    }
  }

  // 3. Caution (percentage, months of rent, or fixed Ariary amount)
  const noCautionRe =
    /\b(?:(?:sans|pas\s+de|tsisy|tsy\s+misy|aucune)\s+(?:caution|antoka)|(?:caution|antoka)[ \t]*[:=.,;\/\-()]*[ \t]*0(?:\s*(?:ar|%|mois))?\b)/iu;
  const cautionPctAfterRe = new RegExp(
    String.raw`\b${cautionKw}${punctOrSpace}(\d{1,3})[ \t]*%`,
    'iu',
  );
  const cautionPctBeforeRe =
    /\b(\d{1,3})[ \t]*%[ \t]*(?:de[ \t]+)?(?:caution(?:nement)?|antoka)\b/iu;
  const cautionHalfMonthRe =
    /\b(?:(?:caution(?:nement)?|antoka)[ \t]*[:=.,;\/\-()]*[ \t]*(?:1\s*\/\s*2\s*(?:mois|volana)|demi[\s-]?(?:mois|loyer)|antsasa[\s-]?bolana)|(?:1\s*\/\s*2\s*mois|demi[\s-]?mois)\s+de\s+caution)\b/iu;
  const cautionMonthsAfterRe = new RegExp(
    String.raw`\b${cautionKw}${optSep}(\d+|un|une|deux|trois|iray|roa|telo)[ \t]*(?:mois(?:[ \t]+de[ \t]+loyer)?|volana)\b`,
    'iu',
  );
  const cautionMonthsBeforeRe =
    /\b(\d+|un|une|deux|trois|iray|roa|telo)[ \t]*(?:mois|volana)[ \t]+(?:de[ \t]+)?(?:caution(?:nement)?|antoka)\b/iu;
  const cautionFixedRe = new RegExp(
    String.raw`\b${cautionKw}${optSep}(${fixedNumPattern})[ \t]*(ar(?:iary)?|fmg|iraimbilanja)?\b`,
    'iu',
  );

  if (noCautionRe.test(norm)) {
    cautionPercent = 0;
    cautionAmount = 0;
  } else {
    const mPctAfter = norm.match(cautionPctAfterRe);
    const mPctBefore = norm.match(cautionPctBeforeRe);
    const mMonthsAfter = norm.match(cautionMonthsAfterRe);
    const mMonthsBefore = norm.match(cautionMonthsBeforeRe);
    if (mPctAfter || mPctBefore) {
      const pct = Number((mPctAfter || mPctBefore)![1]);
      if (Number.isFinite(pct) && pct > 0 && pct <= 500) {
        cautionPercent = pct;
      }
    } else if (cautionHalfMonthRe.test(norm)) {
      cautionPercent = 50;
    } else if (mMonthsAfter || mMonthsBefore) {
      const months = parseWordOrDigitCount((mMonthsAfter || mMonthsBefore)![1]);
      if (months && months >= 1 && months <= 6) {
        cautionPercent = months * 100;
      }
    } else {
      const mFixed = norm.match(cautionFixedRe);
      if (mFixed) {
        const amt = parseFeeAmountToAriary(mFixed[1], mFixed[2]);
        if (amt !== null && amt >= 5000) {
          cautionAmount = amt;
        }
      }
    }

    // Fallback to Gemini caution only if the post actually mentions caution/antoka
    if (
      cautionPercent === null &&
      cautionAmount === null &&
      /\b(?:caution|antoka)\b/iu.test(norm)
    ) {
      if (
        typeof geminiFees?.cautionPercent === 'number' &&
        geminiFees.cautionPercent > 0 &&
        geminiFees.cautionPercent <= 500
      ) {
        cautionPercent = Math.round(geminiFees.cautionPercent);
      } else if (
        typeof geminiFees?.cautionAmount === 'number' &&
        geminiFees.cautionAmount >= 5000
      ) {
        cautionAmount = Math.round(geminiFees.cautionAmount);
      }
    }
  }

  // 4. Commission (percentage, "1 mois de loyer" => 100%, or fixed Ariary amount)
  const noCommissionRe =
    /\b(?:(?:sans|pas\s+de|tsisy|tsy\s+misy|aucune|0)\s+(?:commission|frais\s+d['’]?agence|honoraire|komisiona)|direct\s+proprietaire\s+sans\s+(?:intermediaire|commission))\b/iu;
  const commPctAfterRe = new RegExp(
    String.raw`\b${commKw}${punctOrSpace}(\d{1,3})[ \t]*%`,
    'iu',
  );
  const commPctBeforeRe =
    /\b(\d{1,3})[ \t]*%[ \t]*(?:de[ \t]+)?(?:commissions?|frais\s+d['’]?agence|honoraires?|komisiona)\b/iu;
  const commHalfMonthRe =
    /\b(?:(?:commissions?|(?<!\.)comm?\.?|frais\s+d['’]?agence|honoraires?|komisiona)[ \t]*[:=.,;\/\-()]*[ \t]*(?:1\s*\/\s*2\s*(?:mois|volana)(?:\s+de\s+loyer)?|demi[\s-]?(?:mois|loyer)|antsasa[\s-]?bolana)|(?:1\s*\/\s*2\s*mois|demi[\s-]?mois(?:\s+de\s+loyer)?)\s+(?:de\s+)?(?:commission|frais\s+d['’]?agence|honoraire))\b/iu;
  const commMonthsAfterRe = new RegExp(
    String.raw`\b${commKw}${optSep}(\d+|un|une|deux|iray|roa)[ \t]*(?:mois(?:[ \t]+de[ \t]+loyer|[ \t]+d['’]?ofany)?|volana|ofana[ \t]+iray[ \t]+volana)\b`,
    'iu',
  );
  const commMonthsBeforeRe =
    /\b(\d+|un|une|deux|iray|roa)[ \t]*(?:mois(?:\s+de\s+loyer)?|volana)[ \t]+(?:de[ \t]+|pour[ \t]+(?:la[ \t]+)?)?(?:commissions?|frais\s+d['’]?agence|honoraires?|komisiona)\b/iu;
  const commFixedRe = new RegExp(
    String.raw`\b(?:commissions?|(?<!\.)comm?\.?(?=[ \t:=.,;\/\-~(\d])|frais\s+d['’]?agence|honoraires?(?:\s+d['’]?agence)?|komisiona)${optSep}(${fixedNumPattern})[ \t]*(ar(?:iary)?|fmg|iraimbilanja)?\b`,
    'iu',
  );

  if (noCommissionRe.test(norm)) {
    commissionPercent = 0;
    commissionAmount = 0;
  } else {
    const mCommPctAfter = norm.match(commPctAfterRe);
    const mCommPctBefore = norm.match(commPctBeforeRe);
    const mCommMonthsAfter = norm.match(commMonthsAfterRe);
    const mCommMonthsBefore = norm.match(commMonthsBeforeRe);

    if (mCommPctAfter || mCommPctBefore) {
      const pct = Number((mCommPctAfter || mCommPctBefore)![1]);
      if (Number.isFinite(pct) && pct > 0 && pct <= 500) {
        commissionPercent = pct;
      }
    } else if (commHalfMonthRe.test(norm)) {
      commissionPercent = 50;
    } else if (mCommMonthsAfter || mCommMonthsBefore) {
      const months = parseWordOrDigitCount((mCommMonthsAfter || mCommMonthsBefore)![1]);
      if (months && months >= 1 && months <= 6) {
        commissionPercent = months * 100;
      }
    } else {
      const mFixed = norm.match(commFixedRe);
      if (mFixed) {
        const amt = parseFeeAmountToAriary(mFixed[1], mFixed[2]);
        if (amt !== null && amt >= 5000) {
          commissionAmount = amt;
        }
      }
    }

    // Fallback to Gemini commission only if the post explicitly mentions commission/honoraire/frais d'agence
    if (
      commissionPercent === null &&
      commissionAmount === null &&
      /\b(?:commissions?|(?<!\.)comm?\.?(?=[ \t:=.,;\/\-~\d])|frais\s+d['’]?agence|honoraires?|komisiona|droit\s+mpanera)\b/iu.test(norm)
    ) {
      if (
        typeof geminiFees?.commissionPercent === 'number' &&
        geminiFees.commissionPercent > 0 &&
        geminiFees.commissionPercent <= 500
      ) {
        commissionPercent = Math.round(geminiFees.commissionPercent);
      } else if (
        typeof geminiFees?.commissionAmount === 'number' &&
        geminiFees.commissionAmount >= 5000
      ) {
        commissionAmount = Math.round(geminiFees.commissionAmount);
      }
    }
  }

  // Cross-calculate Ariary amount from percentage (or percentage from amount) when monthly rent is known
  if (validRent) {
    if (cautionPercent !== null && cautionPercent > 0 && cautionAmount === null) {
      cautionAmount = Math.round((validRent * cautionPercent) / 100);
    } else if (cautionAmount !== null && cautionAmount > 0 && cautionPercent === null) {
      const ratioPct = Math.round((cautionAmount / validRent) * 100);
      if (ratioPct > 0 && ratioPct <= 500) {
        cautionPercent = ratioPct;
      }
    }

    if (commissionPercent !== null && commissionPercent > 0 && commissionAmount === null) {
      commissionAmount = Math.round((validRent * commissionPercent) / 100);
    } else if (commissionAmount !== null && commissionAmount > 0 && commissionPercent === null) {
      const ratioPct = Math.round((commissionAmount / validRent) * 100);
      if (ratioPct > 0 && ratioPct <= 500) {
        commissionPercent = ratioPct;
      }
    }
  }

  return {
    visitFee,
    cautionPercent,
    cautionAmount,
    commissionPercent,
    commissionAmount,
  };
}

export interface ResolvedResidentialSpecs {
  rooms: number | null;
  livingRoom: number | null;
  kitchen: number | null;
  toilet: number | null;
  bathrooms: number | null;
}

const NO_TOILET_RE =
  /\b(?:sans|pas\s+de|tsisy|tsy\s+misy|aucun(?:e)?)\s+(?:wc|toilettes?|kabone)\b/iu;
const NO_BATHROOM_RE =
  /\b(?:sans|pas\s+de|tsisy|tsy\s+misy|aucun(?:e)?)\s+(?:douches?|salles?\s+d['’]?eau|salles?\s+de\s+bains?|sdb|dc|dch)\b/iu;
const NO_KITCHEN_RE =
  /\b(?:sans|pas\s+de|tsisy|tsy\s+misy|aucun(?:e)?)\s+(?:cuisines?|lakozia|lakosia|coin\s+cuisine)\b/iu;
const NO_LIVING_ROOM_RE =
  /\b(?:(?:sans|pas\s+de|tsisy|tsy\s+misy|aucun(?:e)?)\s+(?:salons?|livings?(?:\s*rooms?)?|sejours?|efitra\s+fandraisam[\s-]?bahiny|fandraisam[\s-]?bahiny)|chambre\s+(?:simple|seule|celibataire|etudiant)|efitra\s+tokana)\b/iu;
const DOUBLE_LIVING_ROOM_RE =
  /\b(?:double\s+(?:living|salon|sejour)|2\s*(?:salons?|livings?|sejours?)|(?:salons?|livings?|sejours?)\s*2|(?:salons?|livings?)\s+roa)\b/iu;
const EXPLICIT_LIVING_ROOM_RE =
  /\b(?:salons?|livings?(?:\s*rooms?)?|sejours?|salle\s+de\s+sejour|efitra\s+fandraisam[\s-]?bahiny|fandraisam[\s-]?bahiny)\b/iu;

/**
 * Applies Madagascar high-probability residential defaults and smart livingRoom deduction:
 * - Toilet (`toilet`): at least 1 by default on residential properties unless explicitly negated (`0`).
 * - Shower (`bathrooms`): at least 1 by default on residential properties unless explicitly negated (`0`).
 * - Kitchen (`kitchen`): at least 1 by default on residential properties unless explicitly negated (`0`).
 * - Living Room (`livingRoom`): deduced from explicit mentions, room counts, typology (`T2`/`F3`/`efitra roa`/`villa`),
 *   and rent/price standing so the user ALWAYS knows whether a property has a living room (`1+`) or not (`0`).
 */
export function resolveResidentialRoomDefaults(params: {
  rawText: string;
  isCommercial: boolean;
  houseType?: string | null;
  rooms?: number | null;
  livingRoom?: number | null;
  kitchen?: number | null;
  toilet?: number | null;
  bathrooms?: number | null;
  rentAriary?: number | null;
  priceAriary?: number | null;
}): ResolvedResidentialSpecs {
  const { rawText, isCommercial, houseType, rentAriary, priceAriary } = params;
  const norm = normalizeForFeatureMatching(rawText);

  let rooms =
    typeof params.rooms === 'number' && Number.isFinite(params.rooms) && params.rooms >= 0
      ? Math.round(params.rooms)
      : null;
  let livingRoom =
    typeof params.livingRoom === 'number' &&
      Number.isFinite(params.livingRoom) &&
      params.livingRoom >= 0
      ? Math.round(params.livingRoom)
      : null;
  let kitchen =
    typeof params.kitchen === 'number' && Number.isFinite(params.kitchen) && params.kitchen >= 0
      ? Math.round(params.kitchen)
      : null;
  let toilet =
    typeof params.toilet === 'number' && Number.isFinite(params.toilet) && params.toilet >= 0
      ? Math.round(params.toilet)
      : null;
  let bathrooms =
    typeof params.bathrooms === 'number' &&
      Number.isFinite(params.bathrooms) &&
      params.bathrooms >= 0
      ? Math.round(params.bathrooms)
      : null;

  if (isCommercial) {
    return { rooms, livingRoom, kitchen, toilet, bathrooms };
  }

  // Deterministic room extraction if rooms was left null by Gemini or regex
  if (rooms === null) {
    const tfMatch = norm.match(/\b[tf]\s*([1-9])\b/iu);
    const efitraAfterMatch = norm.match(
      /\befitra\s*(\d+|iray|tokana|roa|telo|efatra|dimy|enina|fito|valo)\b/iu,
    );
    const efitraBeforeMatch = norm.match(
      /\b(\d+|iray|roa|telo|efatra|dimy|enina)\s*efitra\b/iu,
    );
    const chambresMatch = norm.match(
      /\b(\d+|un|une|deux|trois|quatre|cinq|six)\s*chambres?\b/iu,
    );
    const piecesMatch = norm.match(
      /\b(\d+|un|une|deux|trois|quatre|cinq|six)\s*pieces?\b/iu,
    );

    if (chambresMatch) {
      rooms = parseWordOrDigitCount(chambresMatch[1]);
    } else if (efitraAfterMatch) {
      rooms = parseWordOrDigitCount(efitraAfterMatch[1]);
    } else if (efitraBeforeMatch) {
      rooms = parseWordOrDigitCount(efitraBeforeMatch[1]);
    } else if (tfMatch) {
      const tfTotal = Number(tfMatch[1]);
      if (tfTotal === 1) {
        rooms = 1;
        if (livingRoom === null) livingRoom = 0;
      } else if (tfTotal >= 2) {
        rooms = tfTotal - 1;
        if (livingRoom === null) livingRoom = 1;
      }
    } else if (piecesMatch) {
      const pCount = parseWordOrDigitCount(piecesMatch[1]);
      if (pCount !== null) {
        rooms = pCount;
      }
    }
  }

  // 1. Toilet (WC) default: at least 1 unless explicitly negated
  if (NO_TOILET_RE.test(norm)) {
    toilet = 0;
  } else if (toilet === null || toilet <= 0) {
    const doubleWc = /\b(?:double\s+wc|2\s*wc|wc\s*2|wc\s+roa)\b/iu.test(norm);
    toilet = doubleWc ? 2 : 1;
  }

  // 2. Bathroom / Douche default: at least 1 unless explicitly negated
  if (NO_BATHROOM_RE.test(norm)) {
    bathrooms = 0;
  } else if (bathrooms === null || bathrooms <= 0) {
    const doubleBath =
      /\b(?:double\s+(?:douche|sdb)|2\s*(?:douches?|salles?\s+d['’]?eau|sdb)|(?:douche|dc)\s*2|(?:douche|dc)\s+roa)\b/iu.test(
        norm,
      );
    bathrooms = doubleBath ? 2 : 1;
  }

  // 3. Kitchen / Cuisine default: at least 1 unless explicitly negated
  if (NO_KITCHEN_RE.test(norm)) {
    kitchen = 0;
  } else if (kitchen === null || kitchen <= 0) {
    kitchen = 1;
  }

  // 4. Living room (Salon) deduction system:
  // Ensure the user ALWAYS knows whether the house has a living room (1 or 2) or not (0).
  if (NO_LIVING_ROOM_RE.test(norm)) {
    livingRoom = 0;
  } else if (DOUBLE_LIVING_ROOM_RE.test(norm)) {
    livingRoom = 2;
  } else if (EXPLICIT_LIVING_ROOM_RE.test(norm)) {
    if (livingRoom === null || livingRoom <= 0) {
      livingRoom = 1;
    }
  } else if (livingRoom === null) {
    const mentionsMultiRoomTypology =
      /\b(?:[tf]\s*[2-9]|(?:2|3|4|5|6|deux|trois|quatre|cinq)\s*pieces?|efitra\s*(?:roa|telo|efatra|dimy|enina|[2-9])|(?:roa|telo|efatra|dimy|[2-9])\s*efitra)\b/iu.test(
        norm,
      );
    const mentionsSingleRoomOnly =
      /\b(?:[tf]\s*1|1\s*piece|une\s*piece|efitra\s*(?:iray|tokana|1)|1\s*efitra|\bstudio\b|\bgarconniere\b)\b/iu.test(
        norm,
      );

    if (houseType === 'villa') {
      livingRoom = rooms !== null && rooms >= 6 ? 2 : 1;
    } else if (mentionsMultiRoomTypology || (rooms !== null && rooms >= 2)) {
      livingRoom = 1;
    } else if (mentionsSingleRoomOnly) {
      livingRoom = 0;
    } else if (rooms === 1) {
      // A 1-bedroom standalone house with substantial rent/price has a living room; a simple 1-room rental does not
      if (
        houseType === 'maison' &&
        ((typeof rentAriary === 'number' && rentAriary >= 400_000) ||
          (typeof priceAriary === 'number' && priceAriary >= 40_000_000))
      ) {
        livingRoom = 1;
      } else {
        livingRoom = 0;
      }
    } else {
      // When room count is unknown, houses/apartments default to 1 living room unless described as a studio/chambre
      livingRoom = /\b(?:studio|chambre\s+a\s+louer|garconniere)\b/iu.test(norm) ? 0 : 1;
    }
  }

  return {
    rooms,
    livingRoom,
    kitchen,
    toilet,
    bathrooms,
  };
}

export type VisualCondition = 'new_or_modern' | 'good' | 'average' | 'basic_or_worn';

export interface PriceEstimationResult {
  estimatedAmount: number;
  estimatedMin: number;
  estimatedMax: number;
  minAmount: number;
  maxAmount: number;
  tier: 'tier1_premium' | 'tier2_upper_mid' | 'tier3_accessible' | 'tier4_popular';
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Server-side habitable surface (`m²`) estimator.
 * Computes a realistic surface estimate from rooms, livingRoom, kitchen, bathrooms,
 * toilet, houseType, standing features, and optional Gemini Vision visual surface estimate
 * when the listing does not state `area`.
 * This value is strictly for server-side search/ranking algorithms and is NOT shown to the public.
 */
export function estimatePropertyArea(params: {
  houseType?: string | null;
  rooms?: number | null;
  livingRoom?: number | null;
  kitchen?: number | null;
  toilet?: number | null;
  bathrooms?: number | null;
  area?: number | null;
  visualAreaEstimateSqm?: number | null;
  features?: Partial<Record<string, unknown>> | null;
}): number {
  if (typeof params.area === 'number' && Number.isFinite(params.area) && params.area > 0) {
    return Math.round(params.area);
  }

  const ht = String(params.houseType || 'maison').toLowerCase();
  const f = params.features || {};

  let ruleArea: number;
  if (ht === 'tsena') {
    const r = typeof params.rooms === 'number' && params.rooms > 0 ? params.rooms : 0;
    const t = typeof params.toilet === 'number' && params.toilet > 0 ? params.toilet : 0;
    ruleArea = Math.round(18 + r * 12 + t * 2.5);
  } else if (ht === 'bureau') {
    const r = typeof params.rooms === 'number' && params.rooms > 0 ? params.rooms : 2;
    const l = typeof params.livingRoom === 'number' && params.livingRoom > 0 ? params.livingRoom : 0;
    const t = typeof params.toilet === 'number' && params.toilet > 0 ? params.toilet : 1;
    ruleArea = Math.round(r * 16 + l * 22 + t * 3 + 8);
  } else {
    const roomsCount =
      typeof params.rooms === 'number' && params.rooms >= 0 ? params.rooms : ht === 'villa' ? 3 : 2;
    const livingCount =
      typeof params.livingRoom === 'number' && params.livingRoom >= 0 ? params.livingRoom : 1;
    const kitchenCount =
      typeof params.kitchen === 'number' && params.kitchen >= 0 ? params.kitchen : 1;
    const bathCount =
      typeof params.bathrooms === 'number' && params.bathrooms >= 0 ? params.bathrooms : 1;
    const toiletCount =
      typeof params.toilet === 'number' && params.toilet >= 0 ? params.toilet : 1;

    const bedroomSize = ht === 'villa' ? 16 : ht === 'maison' ? 13 : 12;
    const livingSize = ht === 'villa' ? 28 : ht === 'maison' ? 20 : 16;
    const kitchenSize = ht === 'villa' ? 12 : ht === 'maison' ? 8 : 6;
    const bathWeight = f.insideBathroom === false ? 2.5 : ht === 'villa' ? 5.5 : 4;
    const toiletWeight = f.insideToilet === false ? 1.5 : 2.5;
    const circulationFactor = ht === 'villa' ? 1.2 : ht === 'maison' ? 1.15 : 1.12;

    let baseArea =
      Math.max(roomsCount, livingCount === 0 ? 1 : 0) * bedroomSize +
      livingCount * livingSize +
      kitchenCount * kitchenSize +
      bathCount * bathWeight +
      toiletCount * toiletWeight;

    if (f.kitchenFacilities || f.placardKitchen) baseArea += 3;
    if (f.balcony) baseArea += 5;
    if (f.roofTop) baseArea += 10;

    ruleArea = Math.round(baseArea * circulationFactor);
  }

  const vis =
    typeof params.visualAreaEstimateSqm === 'number' &&
    Number.isFinite(params.visualAreaEstimateSqm) &&
    params.visualAreaEstimateSqm > 0
      ? Math.round(params.visualAreaEstimateSqm)
      : null;

  let finalArea = ruleArea;
  if (vis && vis >= ruleArea * 0.45 && vis <= ruleArea * 2.2) {
    finalArea = Math.round(ruleArea * 0.55 + vis * 0.45);
  }

  return Math.max(14, Math.min(600, finalArea));
}

const TIER1_PREMIUM_LOCATIONS = [
  'ivandry',
  'alarobia',
  'ambatobe',
  'ambodivoanjo',
  'ankorondrano',
  'isoraka',
  'ambohijatovo',
  'faravohitra',
  'ambatoroka',
  'ankerana',
  'ankadibevava',
  'analakely',
  'antaninarenina',
  'ambohibao',
  'talatamaty',
  'ivato aeroport',
  'amborovy',
];

const TIER2_UPPER_MID_LOCATIONS = [
  'analamahitsy',
  'androhibe',
  'nanisana',
  'ampandrianomby',
  'mahazoarivo',
  'ankadifotsy',
  'behoririka',
  'antanimena',
  'andranomena',
  'ambohidratrimo',
  'andranoro',
  'alasora',
  'bypass',
  'tanjombato',
  'ankadindramamy',
  'soavimasoandro',
  'amboditsiry',
  'ambohipo',
  'tsiadana',
  'ankatso',
  'ambolokandrina',
  'mandroseza',
  'ivato',
  'ilafy',
];

const TIER4_POPULAR_LOCATIONS = [
  'anosibe',
  'isotry',
  'manjakaray',
  'andavamamba',
  'ankazomanga',
  'anatihazo',
  'andohatapenaka',
  'antohomadinika',
  'namontana',
  'mandrangobato',
];

function resolveLocationMarketMultiplier(locationText: string): {
  multiplier: number;
  recognizedTier: boolean;
  tier: 'tier1_premium' | 'tier2_upper_mid' | 'tier3_accessible' | 'tier4_popular';
} {
  const norm = normalizeForFeatureMatching(locationText);
  if (!norm) return { multiplier: 1.0, recognizedTier: false, tier: 'tier3_accessible' };

  for (const kw of TIER1_PREMIUM_LOCATIONS) {
    if (norm.includes(kw)) return { multiplier: 1.85, recognizedTier: true, tier: 'tier1_premium' };
  }
  for (const kw of TIER2_UPPER_MID_LOCATIONS) {
    if (norm.includes(kw)) return { multiplier: 1.28, recognizedTier: true, tier: 'tier2_upper_mid' };
  }
  for (const kw of TIER4_POPULAR_LOCATIONS) {
    if (norm.includes(kw)) return { multiplier: 0.74, recognizedTier: true, tier: 'tier4_popular' };
  }
  if (
    /\b(?:itaosy|ambohimangakely|sabotsy\s+namehana|ambohimanarina|anosizato|ampitatafika|andoharanofotsy|fenoarivo|bemasoandro|mahitsy|iavoloha|67\s*ha)\b/iu.test(
      norm,
    )
  ) {
    return { multiplier: 1.0, recognizedTier: true, tier: 'tier3_accessible' };
  }
  return { multiplier: 1.0, recognizedTier: false, tier: 'tier3_accessible' };
}

function roundMalagasyPrice(amount: number, type: 'rent' | 'sale'): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (type === 'sale') {
    if (amount < 20_000_000) return Math.round(amount / 500_000) * 500_000;
    return Math.round(amount / 1_000_000) * 1_000_000;
  }
  if (amount < 200_000) return Math.round(amount / 5_000) * 5_000;
  if (amount < 600_000) return Math.round(amount / 10_000) * 10_000;
  if (amount < 2_000_000) return Math.round(amount / 25_000) * 25_000;
  return Math.round(amount / 50_000) * 50_000;
}

/**
 * Hybrid Madagascar Real Estate Price/Rent Estimator.
 * Works reliably even when the database has 0 historical comparables by combining:
 * 1) Built-in Antananarivo/Madagascar neighborhood + typology + standing calibration matrix
 * 2) Gemini Vision / AI price estimate (when available)
 * 3) Database comparable median (when available)
 */
export function estimatePropertyPriceAriary(params: {
  type?: 'rent' | 'sale' | string | null;
  houseType?: string | null;
  fokontany?: string | null;
  commune?: string | null;
  district?: string | null;
  rooms?: number | null;
  livingRoom?: number | null;
  kitchen?: number | null;
  toilet?: number | null;
  bathrooms?: number | null;
  area?: number | null;
  estimatedArea?: number | null;
  features?: Partial<Record<string, unknown>> | null;
  visualCondition?: VisualCondition | string | null;
  locationHints?: string[] | null;
  cityLabel?: string | null;
  rawText?: string | null;
  geminiEstimateAriary?: number | null;
  geminiEstimatedPriceAriary?: number | null;
  dbComparableMedianAriary?: number | null;
  dbComparableCount?: number;
}): PriceEstimationResult {
  const txType: 'rent' | 'sale' = params.type === 'sale' ? 'sale' : 'rent';
  const ht = String(params.houseType || 'maison').toLowerCase();
  const f = params.features || {};

  const effectiveArea =
    typeof params.area === 'number' && params.area > 0
      ? params.area
      : typeof params.estimatedArea === 'number' && params.estimatedArea > 0
      ? params.estimatedArea
      : estimatePropertyArea({
          houseType: ht,
          rooms: params.rooms,
          livingRoom: params.livingRoom,
          kitchen: params.kitchen,
          toilet: params.toilet,
          bathrooms: params.bathrooms,
          features: f,
        });

  const rooms = typeof params.rooms === 'number' && params.rooms >= 0 ? params.rooms : 2;
  const living = typeof params.livingRoom === 'number' && params.livingRoom >= 0 ? params.livingRoom : 1;

  const locationContext = [
    ...(Array.isArray(params.locationHints) ? params.locationHints : []),
    params.fokontany || '',
    params.commune || '',
    params.district || '',
    params.cityLabel || '',
    params.rawText || '',
  ].join(' ');
  const { multiplier: zoneMultiplier, recognizedTier, tier } =
    resolveLocationMarketMultiplier(locationContext);

  let baseAmount: number;
  if (txType === 'rent') {
    if (ht === 'tsena') {
      baseAmount = Math.max(220_000, effectiveArea * 15_000);
    } else if (ht === 'bureau') {
      baseAmount = Math.max(350_000, effectiveArea * 12_500);
    } else if (ht === 'villa') {
      baseAmount = Math.max(750_000, effectiveArea * 10_500);
    } else {
      const totalMainRooms = Math.max(1, rooms + living);
      if (totalMainRooms <= 1) {
        baseAmount = 150_000;
      } else if (totalMainRooms === 2) {
        baseAmount = 270_000;
      } else if (totalMainRooms === 3) {
        baseAmount = 410_000;
      } else if (totalMainRooms === 4) {
        baseAmount = 590_000;
      } else {
        baseAmount = 590_000 + (totalMainRooms - 4) * 150_000;
      }
      // Blend room-based anchor with surface-based anchor
      const surfaceAnchor = effectiveArea * 6_800;
      baseAmount = baseAmount * 0.65 + surfaceAnchor * 0.35;
    }
  } else {
    // Sale price in Ariary
    if (ht === 'villa') {
      baseAmount = Math.max(120_000_000, effectiveArea * 1_850_000);
    } else if (ht === 'bureau' || ht === 'tsena') {
      baseAmount = Math.max(70_000_000, effectiveArea * 1_650_000);
    } else {
      baseAmount = Math.max(45_000_000, effectiveArea * 1_400_000);
    }
  }

  let standingMultiplier = 1.0;
  if (params.visualCondition === 'new_or_modern') standingMultiplier *= 1.3;
  else if (params.visualCondition === 'good') standingMultiplier *= 1.1;
  else if (params.visualCondition === 'basic_or_worn') standingMultiplier *= 0.78;

  if (f.furnishedProperty) standingMultiplier *= txType === 'rent' ? 1.38 : 1.12;
  if (f.carAccess || f.parkingSpaceAvailable || f.garage) standingMultiplier *= 1.16;
  else if (f.motoAccess) standingMultiplier *= 0.86;

  if (f.insideToilet === false || f.insideBathroom === false) standingMultiplier *= 0.76;
  if (f.waterFetchExternal) standingMultiplier *= 0.65;
  if (f.swimmingPool) standingMultiplier *= 1.35;
  if (f.airConditionerAvailable || f.hotWaterAvailable) standingMultiplier *= 1.08;
  if (f.independentHouse && ht !== 'villa') standingMultiplier *= 1.1;

  const matrixEstimate = baseAmount * zoneMultiplier * standingMultiplier;

  const rawGeminiEst = params.geminiEstimatedPriceAriary ?? params.geminiEstimateAriary;
  const geminiEst =
    typeof rawGeminiEst === 'number' &&
    Number.isFinite(rawGeminiEst) &&
    rawGeminiEst > 0
      ? rawGeminiEst
      : null;

  const dbMedian =
    typeof params.dbComparableMedianAriary === 'number' &&
    Number.isFinite(params.dbComparableMedianAriary) &&
    params.dbComparableMedianAriary > 0
      ? params.dbComparableMedianAriary
      : null;
  const dbCount = Number(params.dbComparableCount) || 0;

  let blended = matrixEstimate;
  let confidence: 'high' | 'medium' | 'low' = recognizedTier ? 'medium' : 'low';

  const geminiPlausible =
    geminiEst !== null &&
    geminiEst >= matrixEstimate * 0.35 &&
    geminiEst <= matrixEstimate * 2.8;

  if (dbMedian && dbCount >= 2) {
    if (geminiPlausible && geminiEst) {
      blended = dbMedian * 0.5 + geminiEst * 0.3 + matrixEstimate * 0.2;
    } else {
      blended = dbMedian * 0.65 + matrixEstimate * 0.35;
    }
    confidence = 'high';
  } else if (geminiPlausible && geminiEst) {
    blended = geminiEst * 0.55 + matrixEstimate * 0.45;
    const ratio = Math.max(geminiEst, matrixEstimate) / Math.min(geminiEst, matrixEstimate);
    confidence = ratio <= 1.3 && recognizedTier ? 'high' : 'medium';
  } else if (dbMedian && dbCount === 1) {
    blended = dbMedian * 0.45 + matrixEstimate * 0.55;
    confidence = 'medium';
  }

  const estimatedAmount = Math.max(
    txType === 'sale' ? 15_000_000 : 50_000,
    roundMalagasyPrice(blended, txType),
  );
  const estimatedMin = roundMalagasyPrice(estimatedAmount * 0.85, txType);
  const estimatedMax = roundMalagasyPrice(estimatedAmount * 1.15, txType);

  return {
    estimatedAmount,
    estimatedMin,
    estimatedMax,
    minAmount: estimatedMin,
    maxAmount: estimatedMax,
    tier,
    confidence,
  };
}

/**
 * Computes a holistic 0-100 property quality score combining:
 * 1) Visual condition & photo richness (0-35 pts)
 * 2) Data completeness & property comfort/access (0-35 pts)
 * 3) Reliability & text-photo coherence (0-20 pts)
 * 4) Publication freshness (0-10 pts)
 */
export function computePropertyQualityScore(params: {
  photoCount?: number;
  visualCondition?: VisualCondition | string | null;
  hasExplicitPrice?: boolean;
  estimatedPriceConfidence?: 'high' | 'medium' | 'low' | string | null;
  hasMatchedCity?: boolean;
  hasResolvedCoords?: boolean;
  hasCoords?: boolean;
  rooms?: number | null;
  livingRoom?: number | null;
  kitchen?: number | null;
  toilet?: number | null;
  bathrooms?: number | null;
  area?: number | null;
  estimatedArea?: number | null;
  descriptionLength?: number | null;
  features?: Partial<Record<string, unknown>> | null;
  aiConfidence?: 'high' | 'medium' | 'low' | string | null;
  hasPhone?: boolean;
  hasPhones?: boolean;
  datePosted?: Date | string | null;
  publishedAt?: Date | string | null;
}): number {
  let score = 0;
  const photos = Math.max(0, Number(params.photoCount) || 0);
  const f = params.features || {};

  // 1. Visual quality & photo richness (max 35)
  if (photos >= 5) score += 18;
  else if (photos >= 3) score += 14;
  else if (photos >= 1) score += 8;

  if (params.visualCondition === 'new_or_modern') score += 17;
  else if (params.visualCondition === 'good') score += 13;
  else if (params.visualCondition === 'basic_or_worn') score += 5;
  else score += 10; // 'average' or default

  // 2. Data completeness & comfort (max 35)
  if (params.hasExplicitPrice) score += 10;
  else if (params.estimatedPriceConfidence === 'high') score += 7;
  else score += 4;

  if (params.hasMatchedCity) score += 6;
  if (params.hasResolvedCoords || params.hasCoords) score += 3;
  if (typeof params.rooms === 'number' && params.rooms > 0) score += 4;
  if (typeof params.descriptionLength === 'number' && params.descriptionLength >= 80) score += 2;

  if (f.insideToilet !== false && f.insideBathroom !== false) score += 4;
  else if (f.insideToilet || f.insideBathroom) score += 2;

  if (f.carAccess || f.parkingSpaceAvailable || f.garage) score += 4;
  else if (f.motoAccess) score += 2;

  if (
    (f.electricityJirama || f.electricityPower || f.solarPanels) &&
    (f.waterPumpSupplyJirama || f.waterPumpSupply || f.waterWellSupply)
  ) {
    score += 4;
  } else if (!f.waterFetchExternal) {
    score += 2;
  }

  // 3. Reliability & transparency (max 20)
  if (params.aiConfidence === 'high') score += 12;
  else if (params.aiConfidence === 'low') score += 3;
  else score += 8;

  const hasValidPhone =
    params.hasPhones !== undefined
      ? Boolean(params.hasPhones)
      : params.hasPhone !== false;
  if (hasValidPhone) score += 8;

  // 4. Freshness (max 10)
  const effectiveDate = params.datePosted ?? params.publishedAt;
  if (effectiveDate) {
    const postMs = new Date(effectiveDate).getTime();
    if (!Number.isNaN(postMs)) {
      const ageHours = Math.max(0, (Date.now() - postMs) / 3_600_000);
      if (ageHours <= 24) score += 10;
      else if (ageHours <= 72) score += 8;
      else if (ageHours <= 168) score += 6;
      else if (ageHours <= 720) score += 3;
      else score += 1;
    } else {
      score += 5;
    }
  } else {
    score += 6;
  }

  return Math.max(1, Math.min(100, Math.round(score)));
}
