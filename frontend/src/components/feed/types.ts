export interface PropertyOwner {
  _id: string;
  username: string;
  avatar?: string;
  role?: string;
  phone?: string;
  bio?: string;
  lastConnectedAt?: string;
  created_at?: string;
}

export interface PropertyCity {
  _id?: string;
  province?: string;
  region?: string;
  district?: string;
  commune?: string;
  fokontany?: string;
  coords?: {
    lat: number;
    lng: number;
  };
}

export interface PropertyFeatures {
  _id?: string;
  motoAccess?: boolean;
  carAccess?: boolean;
  parkingSpaceAvailable?: boolean;
  elevator?: boolean;
  garden?: boolean;
  courtyard?: boolean;
  balcony?: boolean;
  roofTop?: boolean;
  swimmingPool?: boolean;
  surroundedByWalls?: boolean;
  independentHouse?: boolean;
  garage?: boolean;
  guardianHouse?: boolean;
  bassin?: boolean;
  openKitchen?: boolean;
  kitchenFacilities?: boolean;
  placardKitchen?: boolean;
  insideToilet?: boolean;
  insideBathroom?: boolean;
  bathtub?: boolean;
  fireplace?: boolean;
  airConditionerAvailable?: boolean;
  hotWaterAvailable?: boolean;
  furnishedProperty?: boolean;
  electricityPower?: boolean;
  electricityJirama?: boolean;
  waterPumpSupply?: boolean;
  waterPumpSupplyJirama?: boolean;
  waterWellSupply?: boolean;
  securitySystem?: boolean;
  wifiAvailability?: boolean;
  fiberOpticReady?: boolean;
  seaView?: boolean;
  mountainView?: boolean;
  panoramicView?: boolean;
  solarPanels?: boolean;
  [key: string]: any;
}

export interface PropertyImage {
  src: string;
  width?: number;
  height?: number;
}

export interface FeedProperty {
  _id: string;
  title: string;
  description?: string;
  price?: number | null;
  rent?: number | null;
  rooms?: number;
  toilet?: number;
  kitchen?: number;
  bathrooms?: number;
  livingRoom?: number;
  area?: number;
  propertyNumber?: string | number;
  phone1?: string | null;
  phone2?: string | null;
  phone3?: string | null;
  topProperty?: boolean;
  type: 'rent' | 'sale';
  houseType?: string;
  city?: PropertyCity;
  coords?: {
    lat: number;
    lng: number;
  };
  features?: PropertyFeatures;
  images: (string | PropertyImage)[];
  owner: PropertyOwner;
  sources?: {
    username?: string | null;
    avatar?: string | null;
    link?: string | null;
  };
  created_at: string;
  updated_at?: string;
}
