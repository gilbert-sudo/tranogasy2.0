import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { City, CitySchema } from '../cities/schemas/city.schema';
import { PropertiesModule } from '../properties/properties.module';
import { Property, PropertySchema } from '../properties/schemas/property.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { FbAdminGuard } from './fb-admin.guard';
import { FbBrightDataService } from './fb-brightdata.service';
import { FbCityMatcherService } from './fb-city-matcher.service';
import { FbGcsService } from './fb-gcs.service';
import { FbGeminiService } from './fb-gemini.service';
import {
  FbIngestionAuthController,
  FbIngestionController,
} from './fb-ingestion.controller';
import { FbIngestionService } from './fb-ingestion.service';
import {
  FbGroupTarget,
  FbGroupTargetSchema,
} from './schemas/fb-group-target.schema';
import {
  FbIngestedCandidate,
  FbIngestedCandidateSchema,
} from './schemas/fb-ingested-candidate.schema';
import {
  FbIngestionConfig,
  FbIngestionConfigSchema,
} from './schemas/fb-ingestion-config.schema';
import { FbSeenPost, FbSeenPostSchema } from './schemas/fb-seen-post.schema';

@Module({
  imports: [
    PropertiesModule,
    MongooseModule.forFeature([
      { name: FbIngestionConfig.name, schema: FbIngestionConfigSchema },
      { name: FbGroupTarget.name, schema: FbGroupTargetSchema },
      { name: FbSeenPost.name, schema: FbSeenPostSchema },
      { name: FbIngestedCandidate.name, schema: FbIngestedCandidateSchema },
      { name: Property.name, schema: PropertySchema },
      { name: City.name, schema: CitySchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [FbIngestionAuthController, FbIngestionController],
  providers: [
    FbAdminGuard,
    FbBrightDataService,
    FbCityMatcherService,
    FbGcsService,
    FbGeminiService,
    FbIngestionService,
  ],
  exports: [FbIngestionService],
})
export class FbIngestionModule {}

