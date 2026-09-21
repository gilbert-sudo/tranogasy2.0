import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FeaturesService } from './features.service';
import { FeaturesController } from './features.controller';
import { Feature, FeatureSchema } from './schemas/feature.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Feature.name, schema: FeatureSchema }])],
  controllers: [FeaturesController],
  providers: [FeaturesService],
})
export class FeaturesModule {}
