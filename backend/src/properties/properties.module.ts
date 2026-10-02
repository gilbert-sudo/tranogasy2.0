import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PropertiesService } from './properties.service';
import { PropertiesController } from './properties.controller';
import { Property, PropertySchema } from './schemas/property.schema';

import { Counter, CounterSchema } from './schemas/property-counter.schema';
import { City, CitySchema } from '../cities/schemas/city.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Property.name, schema: PropertySchema },
      { name: Counter.name, schema: CounterSchema },
      { name: City.name, schema: CitySchema }
    ])
  ],
  controllers: [PropertiesController],
  providers: [PropertiesService],
})
export class PropertiesModule {}
