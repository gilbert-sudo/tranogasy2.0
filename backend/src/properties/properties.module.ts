import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PropertiesService } from './properties.service';
import { PropertiesController } from './properties.controller';
import { Property, PropertySchema } from './schemas/property.schema';
import { Counter, CounterSchema } from './schemas/property-counter.schema';
import { City, CitySchema } from '../cities/schemas/city.schema';
import { Feature, FeatureSchema } from '../features/schemas/feature.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Property.name, schema: PropertySchema },
      { name: Counter.name, schema: CounterSchema },
      { name: City.name, schema: CitySchema },
      { name: Feature.name, schema: FeatureSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [PropertiesController],
  providers: [PropertiesService],
  exports: [PropertiesService],
})
export class PropertiesModule {}
