import type { ElementType } from 'react';
import { Building, Building2, Globe, Home, Landmark, Store } from 'lucide-react';

export const HOUSE_TYPE_VALUES = [
  'maison',
  'villa',
  'appartement',
  'bureau',
  'tsena',
] as const;

export type HouseType = (typeof HOUSE_TYPE_VALUES)[number];

export type HouseCategoryFilter = 'all' | HouseType;

export type PropertyUsageFamily = 'residential' | 'commercial';

export type PropertyMissingSpecKey = 'rooms' | 'toilet' | 'bathrooms' | 'area';

export interface PropertyTypeDef {
  id: HouseType;
  urlParam: string;
  label: string;
  shortLabel: string;
  subtitle: string;
  titlePlaceholder: string;
  usageFamily: PropertyUsageFamily;
  usesFloor: boolean;
  icon: ElementType;
  requiredMissingSpecs: readonly PropertyMissingSpecKey[];
}

export const PROPERTY_TYPE_DEFS: readonly PropertyTypeDef[] = [
  {
    id: 'maison',
    urlParam: 'home',
    label: 'Maison',
    shortLabel: 'Maison',
    subtitle: 'Maison individuelle, trano mitokana, pavillon',
    titlePlaceholder: 'Ex: Maison familiale 4 pièces avec cour à Ambohipo',
    usageFamily: 'residential',
    usesFloor: false,
    icon: Home,
    requiredMissingSpecs: ['rooms', 'toilet', 'bathrooms', 'area'],
  },
  {
    id: 'villa',
    urlParam: 'villa',
    label: 'Villa',
    shortLabel: 'Villa',
    subtitle: 'Villa basse, villa à étage, villa moderne',
    titlePlaceholder: 'Ex: Villa contemporaine 5 pièces avec piscine à Ivandry',
    usageFamily: 'residential',
    usesFloor: false,
    icon: Landmark,
    requiredMissingSpecs: ['rooms', 'toilet', 'bathrooms', 'area'],
  },
  {
    id: 'appartement',
    urlParam: 'apartment',
    label: 'Appartement',
    shortLabel: 'Appartement',
    subtitle: 'Appartement, studio, étage, chambre',
    titlePlaceholder: 'Ex: Appartement T3 lumineux au 2e étage à Ankorondrano',
    usageFamily: 'residential',
    usesFloor: true,
    icon: Building2,
    requiredMissingSpecs: ['rooms', 'toilet', 'bathrooms', 'area'],
  },
  {
    id: 'bureau',
    urlParam: 'office',
    label: 'Bureau',
    shortLabel: 'Bureau',
    subtitle: 'Espace de travail, cabinet, open-space',
    titlePlaceholder: 'Ex: Bureau open-space 80 m² avec parking à Antaninarenina',
    usageFamily: 'commercial',
    usesFloor: true,
    icon: Building,
    requiredMissingSpecs: ['area'],
  },
  {
    id: 'tsena',
    urlParam: 'tsena',
    label: 'Tsena / Commerce',
    shortLabel: 'Tsena',
    subtitle: 'Box, boutique, magasin, local commercial, dépôt',
    titlePlaceholder: 'Ex: Box commercial / Tsena bien placé au RDC à Namontana',
    usageFamily: 'commercial',
    usesFloor: true,
    icon: Store,
    requiredMissingSpecs: ['area'],
  },
] as const;

export const PROPERTY_TYPE_MAP: Record<HouseType, PropertyTypeDef> = Object.fromEntries(
  PROPERTY_TYPE_DEFS.map((def) => [def.id, def]),
) as Record<HouseType, PropertyTypeDef>;

export const SEARCH_CATEGORY_OPTIONS: ReadonlyArray<{
  id: HouseCategoryFilter;
  urlParam: string;
  label: string;
  shortLabel: string;
  icon: ElementType;
}> = [
  {
    id: 'all',
    urlParam: 'tous',
    label: 'Tous les biens',
    shortLabel: 'Tous',
    icon: Globe,
  },
  {
    id: 'appartement',
    urlParam: PROPERTY_TYPE_MAP.appartement.urlParam,
    label: PROPERTY_TYPE_MAP.appartement.shortLabel,
    shortLabel: PROPERTY_TYPE_MAP.appartement.shortLabel,
    icon: PROPERTY_TYPE_MAP.appartement.icon,
  },
  {
    id: 'maison',
    urlParam: PROPERTY_TYPE_MAP.maison.urlParam,
    label: PROPERTY_TYPE_MAP.maison.shortLabel,
    shortLabel: PROPERTY_TYPE_MAP.maison.shortLabel,
    icon: PROPERTY_TYPE_MAP.maison.icon,
  },
  {
    id: 'villa',
    urlParam: PROPERTY_TYPE_MAP.villa.urlParam,
    label: PROPERTY_TYPE_MAP.villa.shortLabel,
    shortLabel: PROPERTY_TYPE_MAP.villa.shortLabel,
    icon: PROPERTY_TYPE_MAP.villa.icon,
  },
  {
    id: 'tsena',
    urlParam: PROPERTY_TYPE_MAP.tsena.urlParam,
    label: PROPERTY_TYPE_MAP.tsena.shortLabel,
    shortLabel: PROPERTY_TYPE_MAP.tsena.shortLabel,
    icon: PROPERTY_TYPE_MAP.tsena.icon,
  },
  {
    id: 'bureau',
    urlParam: PROPERTY_TYPE_MAP.bureau.urlParam,
    label: PROPERTY_TYPE_MAP.bureau.shortLabel,
    shortLabel: PROPERTY_TYPE_MAP.bureau.shortLabel,
    icon: PROPERTY_TYPE_MAP.bureau.icon,
  },
];

export const RESIDENTIAL_FLOOR_PRESETS = [
  'RDC',
  '1er étage',
  '2e étage',
  '3e étage',
  '4e+ étage',
  'Dernier étage',
] as const;

export const COMMERCIAL_FLOOR_PRESETS = [
  'RDC',
  '1er étage',
  '2e étage',
  '3e+ étage',
  'Bord de route',
] as const;

const HOUSE_TYPE_ALIASES: Record<string, HouseType> = {
  maison: 'maison',
  home: 'maison',
  trano: 'maison',
  pavillon: 'maison',
  villa: 'villa',
  appartement: 'appartement',
  apartment: 'appartement',
  appart: 'appartement',
  studio: 'appartement',
  chambre: 'appartement',
  loft: 'appartement',
  bureau: 'bureau',
  bureaux: 'bureau',
  office: 'bureau',
  'local professionnel': 'bureau',
  tsena: 'tsena',
  'tsena / commerce': 'tsena',
  commerce: 'tsena',
  commercial: 'tsena',
  'local commercial': 'tsena',
  'espace commercial': 'tsena',
  box: 'tsena',
  'box commercial': 'tsena',
  magasin: 'tsena',
  boutique: 'tsena',
  showroom: 'tsena',
  depot: 'tsena',
  entrepot: 'tsena',
};

export function stripAccentsLower(val?: string | null): string {
  if (!val || typeof val !== 'string') return '';
  return val
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function normalizeHouseType(raw?: string | null): HouseType | null {
  const cleaned = stripAccentsLower(raw);
  if (!cleaned) return null;
  if ((HOUSE_TYPE_VALUES as readonly string[]).includes(cleaned)) {
    return cleaned as HouseType;
  }
  return HOUSE_TYPE_ALIASES[cleaned] || null;
}

export function mapCategoryQueryParam(raw?: string | null): HouseCategoryFilter {
  const cleaned = stripAccentsLower(raw);
  if (!cleaned || cleaned === 'all' || cleaned === 'tous') return 'all';
  return normalizeHouseType(cleaned) || 'all';
}

export function isCommercialHouseType(raw?: string | null): boolean {
  const normalized = normalizeHouseType(raw);
  return normalized ? PROPERTY_TYPE_MAP[normalized].usageFamily === 'commercial' : false;
}

export function usesFloorHouseType(raw?: string | null): boolean {
  const normalized = normalizeHouseType(raw);
  return normalized ? PROPERTY_TYPE_MAP[normalized].usesFloor : false;
}

export function getRequiredMissingSpecs(
  raw?: string | null,
): readonly PropertyMissingSpecKey[] {
  const normalized = normalizeHouseType(raw);
  if (!normalized) {
    return ['rooms', 'toilet', 'bathrooms', 'area'];
  }
  return PROPERTY_TYPE_MAP[normalized].requiredMissingSpecs;
}

export function getHouseTypeLabel(
  raw?: string | null,
  opts?: { compact?: boolean; floor?: string | null },
): string {
  const normalized = normalizeHouseType(raw);
  let baseLabel: string;
  if (normalized) {
    baseLabel = opts?.compact
      ? PROPERTY_TYPE_MAP[normalized].shortLabel
      : PROPERTY_TYPE_MAP[normalized].label;
  } else if (raw && raw.trim()) {
    const clean = raw.trim();
    baseLabel = clean.charAt(0).toUpperCase() + clean.slice(1);
  } else {
    baseLabel = 'Propriété';
  }

  const cleanFloor = opts?.floor?.trim();
  if (cleanFloor && usesFloorHouseType(normalized)) {
    return `${baseLabel} (${cleanFloor})`;
  }
  return baseLabel;
}

const LEGACY_VILLA_REGEX = /\bvilla\b/;
const LEGACY_BUREAU_TITLE_REGEX = /\b(bureaux?|open[\s-]?space|local\s+professionnel)\b/;
const LEGACY_BUREAU_DESC_REGEX = /\b(usage\s+bureau|usage\s+professionnel|pour\s+bureau)\b/;
const LEGACY_TSENA_TITLE_REGEX =
  /\b(tsena|box(\s+(commercial|ppn|cash\s*point))?|magasin|boutique|local\s+commercial|espace\s+commercial|commerce|showroom|kiosque|stand|depot|entrepot)\b/;
const LEGACY_TSENA_DESC_REGEX =
  /\b(tsena\s+(ahofa|amidy|lehibe|tsara|malalaka)|box\s+(commercial|ppn|cash\s*point|ahofa)|local\s+commercial|usage\s+commercial)\b/;

export interface PropertyCategoryFlags {
  houseTypeNorm: string;
  canonicalHouseType: HouseType | null;
  isVillaCandidate: boolean;
  isBureauCandidate: boolean;
  isTsenaCandidate: boolean;
}

/**
 * Computes normalized category flags using explicit `houseType` first and falling back
 * to unambiguous title/description cues only for legacy pre-taxonomy records (`maison`/`appartement`/empty).
 */
export function computePropertyCategoryFlags(
  prop: any,
  precomputedHouseTypeNorm?: string,
  precomputedTitleNorm?: string,
  precomputedDescNorm?: string,
): PropertyCategoryFlags {
  const houseTypeNorm = precomputedHouseTypeNorm ?? stripAccentsLower(prop?.houseType || '');
  const canonicalHouseType = normalizeHouseType(houseTypeNorm);
  const titleNorm = precomputedTitleNorm ?? stripAccentsLower(prop?.title || '');
  const descNorm = precomputedDescNorm ?? stripAccentsLower(prop?.description || '');

  const isLegacyUnclassified =
    !houseTypeNorm || houseTypeNorm === 'maison' || houseTypeNorm === 'appartement';

  const isVillaCandidate =
    canonicalHouseType === 'villa' ||
    ((!houseTypeNorm || houseTypeNorm === 'maison') &&
      (LEGACY_VILLA_REGEX.test(titleNorm) ||
        LEGACY_VILLA_REGEX.test(descNorm) ||
        (houseTypeNorm === 'maison' &&
          Boolean(prop?.features?.swimmingPool || prop?.features?.garden))));

  const isBureauCandidate =
    canonicalHouseType === 'bureau' ||
    (isLegacyUnclassified &&
      (LEGACY_BUREAU_TITLE_REGEX.test(titleNorm) ||
        LEGACY_BUREAU_DESC_REGEX.test(descNorm)));

  const isTsenaCandidate =
    canonicalHouseType === 'tsena' ||
    (isLegacyUnclassified &&
      (LEGACY_TSENA_TITLE_REGEX.test(titleNorm) ||
        LEGACY_TSENA_DESC_REGEX.test(descNorm)));

  return {
    houseTypeNorm,
    canonicalHouseType,
    isVillaCandidate,
    isBureauCandidate,
    isTsenaCandidate,
  };
}

export function matchesComputedCategory(
  flags: PropertyCategoryFlags,
  targetHouseType: HouseCategoryFilter,
): boolean {
  if (targetHouseType === 'all') return true;
  if (targetHouseType === 'villa') return flags.isVillaCandidate;
  if (targetHouseType === 'bureau') return flags.isBureauCandidate;
  if (targetHouseType === 'tsena') return flags.isTsenaCandidate;
  return (flags.canonicalHouseType || flags.houseTypeNorm) === targetHouseType;
}
