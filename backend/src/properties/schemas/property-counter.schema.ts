import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CounterDocument = Counter & Document;

@Schema()
export class Counter {
  @Prop({ required: true })
  itemId: string;

  @Prop({ default: 0 })
  itemNumber: number;
}

export const CounterSchema = SchemaFactory.createForClass(Counter);
