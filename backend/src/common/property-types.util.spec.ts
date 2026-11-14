import {
  buildMongoHouseTypeFilter,
  getRequiredMissingSpecs,
  HOUSE_TYPE_VALUES,
  isCommercialHouseType,
  normalizeHouseType,
} from './property-types.util';

describe('property-types.util', () => {
  it('normalizes canonical values, casing, English params, and Malagasy/French aliases', () => {
    expect(HOUSE_TYPE_VALUES).toEqual(['maison', 'villa', 'appartement', 'bureau', 'tsena']);

    expect(normalizeHouseType('Villa')).toBe('villa');
    expect(normalizeHouseType('home')).toBe('maison');
    expect(normalizeHouseType('apartment')).toBe('appartement');
    expect(normalizeHouseType('Studio')).toBe('appartement');
    expect(normalizeHouseType('office')).toBe('bureau');
    expect(normalizeHouseType('TSENA')).toBe('tsena');
    expect(normalizeHouseType('Box commercial')).toBe('tsena');
    expect(normalizeHouseType('magasin')).toBe('tsena');
    expect(normalizeHouseType('Dépôt')).toBe('tsena');
    expect(normalizeHouseType('unknown_value')).toBeNull();
    expect(normalizeHouseType('')).toBeNull();
  });

  it('identifies commercial types and adaptive missing specs', () => {
    expect(isCommercialHouseType('tsena')).toBe(true);
    expect(isCommercialHouseType('bureau')).toBe(true);
    expect(isCommercialHouseType('maison')).toBe(false);
    expect(isCommercialHouseType('villa')).toBe(false);
    expect(isCommercialHouseType('appartement')).toBe(false);

    expect(getRequiredMissingSpecs('tsena')).toEqual(['area']);
    expect(getRequiredMissingSpecs('bureau')).toEqual(['area']);
    expect(getRequiredMissingSpecs('maison')).toEqual(['rooms', 'toilet', 'bathrooms', 'area']);
  });

  it('builds backwards-compatible Mongo houseType filters', () => {
    expect(buildMongoHouseTypeFilter('all')).toBeNull();
    expect(buildMongoHouseTypeFilter('tous')).toBeNull();

    const tsenaFilter = buildMongoHouseTypeFilter('tsena');
    expect(tsenaFilter?.$or).toBeDefined();
    expect(tsenaFilter?.$or[0]).toEqual({ houseType: /^tsena$/i });

    const maisonFilter = buildMongoHouseTypeFilter('maison');
    expect(maisonFilter).toEqual({ houseType: /^maison$/i });
  });
});
