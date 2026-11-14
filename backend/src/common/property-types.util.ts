export const HOUSE_TYPE_VALUES = [
  'maison',
  'villa',
  'appartement',
  'bureau',
  'tsena',
] as const;

export type HouseType = (typeof HOUSE_TYPE_VALUES)[number];

export type PropertyUsageFamily = 'residential' | 'commercial';

export type PropertyMissingSpecKey = 'rooms' | 'toilet' | 'bathrooms' | 'area';

export interface HouseTypeMetadata {
  id: HouseType;
  label: string;
  usageFamily: PropertyUsageFamily;
  usesFloor: boolean;
  requiredMissingSpecs: readonly PropertyMissingSpecKey[];
}

export const HOUSE_TYPE_META: Record<HouseType, HouseTypeMetadata> = {
  maison: {
    id: 'maison',
    label: 'Maison',
    usageFamily: 'residential',
    usesFloor: false,
    requiredMissingSpecs: ['rooms', 'toilet', 'bathrooms', 'area'],
  },
  villa: {
    id: 'villa',
    label: 'Villa',
    usageFamily: 'residential',
    usesFloor: false,
    requiredMissingSpecs: ['rooms', 'toilet', 'bathrooms', 'area'],
  },
  appartement: {
    id: 'appartement',
    label: 'Appartement',
    usageFamily: 'residential',
    usesFloor: true,
    requiredMissingSpecs: ['rooms', 'toilet', 'bathrooms', 'area'],
  },
  bureau: {
    id: 'bureau',
    label: 'Bureau',
    usageFamily: 'commercial',
    usesFloor: true,
    requiredMissingSpecs: ['area'],
  },
  tsena: {
    id: 'tsena',
    label: 'Tsena',
    usageFamily: 'commercial',
    usesFloor: true,
    requiredMissingSpecs: ['area'],
  },
};

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

/**
 * Normalizes any frontend/AI/legacy property category string into a canonical HouseType.
 */
export function normalizeHouseType(raw?: string | null): HouseType | null {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (!cleaned) return null;
  if ((HOUSE_TYPE_VALUES as readonly string[]).includes(cleaned)) {
    return cleaned as HouseType;
  }
  return HOUSE_TYPE_ALIASES[cleaned] || null;
}

export function isCommercialHouseType(raw?: string | null): boolean {
  const normalized = normalizeHouseType(raw);
  return normalized ? HOUSE_TYPE_META[normalized].usageFamily === 'commercial' : false;
}

export function getRequiredMissingSpecs(
  rawHouseType?: string | null,
): readonly PropertyMissingSpecKey[] {
  const normalized = normalizeHouseType(rawHouseType);
  if (!normalized) {
    return ['rooms', 'toilet', 'bathrooms', 'area'];
  }
  return HOUSE_TYPE_META[normalized].requiredMissingSpecs;
}

/**
 * Builds a MongoDB query filter for `houseType` with backwards-compatible fallbacks
 * so legacy `maison`/`appartement` listings tagged before the 5-type taxonomy remain searchable.
 */
export function buildMongoHouseTypeFilter(rawCategory?: string | null): Record<string, any> | null {
  if (!rawCategory || rawCategory === 'all' || rawCategory === 'tous') return null;

  const target = normalizeHouseType(rawCategory);
  if (!target) {
    const escaped = String(rawCategory).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped ? { houseType: new RegExp(`^${escaped}$`, 'i') } : null;
  }

  if (target === 'villa') {
    return {
      $or: [
        { houseType: /^villa$/i },
        {
          houseType: { $in: ['maison', null, ''] },
          $or: [{ title: /\bvilla\b/i }, { description: /\bvilla\b/i }],
        },
      ],
    };
  }

  if (target === 'bureau') {
    return {
      $or: [
        { houseType: /^bureau$/i },
        {
          houseType: { $in: ['maison', 'appartement', null, ''] },
          $or: [
            { title: /\b(bureaux?|open[\s-]?space|local\s+professionnel)\b/i },
            { description: /\b(usage\s+bureau|usage\s+professionnel|pour\s+bureau)\b/i },
          ],
        },
      ],
    };
  }

  if (target === 'tsena') {
    return {
      $or: [
        { houseType: /^tsena$/i },
        {
          houseType: { $in: ['maison', 'appartement', null, ''] },
          $or: [
            {
              title:
                /\b(tsena|box(\s+(commercial|ppn|cash\s*point))?|magasin|boutique|local\s+commercial|espace\s+commercial|commerce|showroom|kiosque|stand|d[eé]p[oô]t|entrep[oô]t)\b/i,
            },
            {
              description:
                /\b(tsena\s+(ahofa|amidy|lehibe|tsara|malalaka)|box\s+(commercial|ppn|cash\s*point|ahofa)|local\s+commercial|usage\s+commercial)\b/i,
            },
          ],
        },
      ],
    };
  }

  return { houseType: new RegExp(`^${target}$`, 'i') };
}
