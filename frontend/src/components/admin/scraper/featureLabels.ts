export interface FeatureGroup {
  label: string;
  items: Array<{ key: string; label: string }>;
}

export const MISSING_FIELD_LABELS: Record<string, string> = {
  type: 'Type (Louer/Vendre)',
  price: 'Prix de vente',
  rent: 'Loyer mensuel',
  city: 'Fokontany / Ville',
  rooms: 'Chambres',
  toilet: 'WC',
  bathrooms: 'Douches / SDB',
  area: 'Surface (m²)',
  phone1: 'Téléphone',
};

export const PROPERTY_FEATURE_GROUPS: FeatureGroup[] = [
  {
    label: 'Accès & Extérieur',
    items: [
      { key: 'motoAccess', label: 'Accès moto' },
      { key: 'carAccess', label: 'Accès voiture' },
      { key: 'parkingSpaceAvailable', label: 'Parking' },
      { key: 'garage', label: 'Garage' },
      { key: 'courtyard', label: 'Cour / Tokontany' },
      { key: 'garden', label: 'Jardin' },
      { key: 'surroundedByWalls', label: 'Clôturée / Tamboho' },
      { key: 'independentHouse', label: 'Maison indépendante' },
      { key: 'guardianHouse', label: 'Maison gardien' },
      { key: 'balcony', label: 'Balcon / Véranda' },
      { key: 'roofTop', label: 'Toit-terrasse' },
      { key: 'swimmingPool', label: 'Piscine' },
      { key: 'elevator', label: 'Ascenseur' },
    ],
  },
  {
    label: 'Cuisine & Sanitaires',
    items: [
      { key: 'kitchenFacilities', label: 'Cuisine équipée' },
      { key: 'placardKitchen', label: 'Cuisine placards' },
      { key: 'openKitchen', label: 'Cuisine ouverte' },
      { key: 'insideToilet', label: 'WC intérieur' },
      { key: 'insideBathroom', label: 'Douche intérieure' },
      { key: 'bathtub', label: 'Baignoire' },
      { key: 'hotWaterAvailable', label: 'Eau chaude' },
      { key: 'bassin', label: 'Bassin / Lavoir' },
    ],
  },
  {
    label: 'Énergie, Eau & Confort',
    items: [
      { key: 'electricityJirama', label: 'Électricité Jirama' },
      { key: 'electricityPower', label: 'Compteur individuel' },
      { key: 'waterPumpSupplyJirama', label: 'Eau Jirama' },
      { key: 'waterPumpSupply', label: 'Pompe / Surpresseur' },
      { key: 'waterWellSupply', label: 'Puits / Vovo' },
      { key: 'solarPanels', label: 'Panneaux solaires' },
      { key: 'furnishedProperty', label: 'Meublé' },
      { key: 'airConditionerAvailable', label: 'Climatisation' },
      { key: 'fireplace', label: 'Cheminée' },
      { key: 'securitySystem', label: 'Sécurité / Gardiennage' },
      { key: 'wifiAvailability', label: 'Wi-Fi' },
      { key: 'fiberOpticReady', label: 'Fibre optique' },
    ],
  },
  {
    label: 'Vues',
    items: [
      { key: 'seaView', label: 'Vue mer' },
      { key: 'mountainView', label: 'Vue montagne' },
      { key: 'panoramicView', label: 'Vue panoramique' },
    ],
  },
];

export const ALL_FEATURE_LABELS: Record<string, string> = Object.fromEntries(
  PROPERTY_FEATURE_GROUPS.flatMap((g) => g.items.map((i) => [i.key, i.label])),
);

