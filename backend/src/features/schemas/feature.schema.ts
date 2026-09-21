import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FeatureDocument = Feature & Document;

@Schema()
export class Feature {
  @Prop({ default: false }) motoAccess: boolean;
  @Prop({ default: false }) carAccess: boolean;
  @Prop({ default: false }) parkingSpaceAvailable: boolean;
  @Prop({ default: false }) elevator: boolean;
  @Prop({ default: false }) garden: boolean;
  @Prop({ default: false }) courtyard: boolean;
  @Prop({ default: false }) balcony: boolean;
  @Prop({ default: false }) roofTop: boolean;
  @Prop({ default: false }) swimmingPool: boolean;
  @Prop({ default: false }) surroundedByWalls: boolean;
  @Prop({ default: false }) independentHouse: boolean;
  @Prop({ default: false }) garage: boolean;
  @Prop({ default: false }) guardianHouse: boolean;
  @Prop({ default: false }) bassin: boolean;
  @Prop({ default: false }) kitchenFacilities: boolean;
  @Prop({ default: false }) placardKitchen: boolean;
  @Prop({ default: false }) openKitchen: boolean;
  @Prop({ default: false }) insideToilet: boolean;
  @Prop({ default: false }) insideBathroom: boolean;
  @Prop({ default: false }) bathtub: boolean;
  @Prop({ default: false }) fireplace: boolean;
  @Prop({ default: false }) airConditionerAvailable: boolean;
  @Prop({ default: false }) hotWaterAvailable: boolean;
  @Prop({ default: false }) furnishedProperty: boolean;
  @Prop({ default: false }) electricityPower: boolean;
  @Prop({ default: false }) electricityJirama: boolean;
  @Prop({ default: false }) waterPumpSupply: boolean;
  @Prop({ default: false }) waterPumpSupplyJirama: boolean;
  @Prop({ default: false }) waterWellSupply: boolean;
  @Prop({ default: false }) securitySystem: boolean;
  @Prop({ default: false }) wifiAvailability: boolean;
  @Prop({ default: false }) fiberOpticReady: boolean;
  @Prop({ default: false }) seaView: boolean;
  @Prop({ default: false }) mountainView: boolean;
  @Prop({ default: false }) panoramicView: boolean;
  @Prop({ default: false }) solarPanels: boolean;
}

export const FeatureSchema = SchemaFactory.createForClass(Feature);
