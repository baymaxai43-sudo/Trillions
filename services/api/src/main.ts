import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors({ origin: (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean) });
  app.setGlobalPrefix('v1', { exclude: ['health', 'privacy', 'terms'] });
  await app.listen(Number(process.env.PORT ?? 4000));
}
bootstrap();
