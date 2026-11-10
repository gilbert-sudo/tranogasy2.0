import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors(); // Allow frontend to fetch data
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
