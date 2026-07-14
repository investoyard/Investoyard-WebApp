import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Separate-hosting: the browser calls the API cross-origin from the web app. Lock
  // CORS to the frontend origin(s) via CORS_ORIGIN (comma-separated); unset = allow all (dev).
  const origins = process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({ origin: origins && origins.length ? origins : true });
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000);
}
bootstrap();
