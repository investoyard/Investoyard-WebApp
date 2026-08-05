import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true keeps the exact request bytes on req.rawBody so the WhatsApp
  // webhook can verify Meta's X-Hub-Signature-256 HMAC (re-serialized JSON won't match).
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Separate-hosting: the browser calls the API cross-origin from the web app. The known
  // production web origins are ALWAYS allowed (so a missing/mistyped CORS_ORIGIN or an app-pool
  // restart can never break login); CORS_ORIGIN adds more (comma-separated). '*'/'true' = allow all.
  const DEFAULT_ORIGINS = ['https://newipo.finwave.co', 'https://www.newipo.finwave.co'];
  const env = process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  const wildcard = env.includes('*') || env.includes('true');
  const allow = new Set([...DEFAULT_ORIGINS, ...env.filter((o) => o !== '*' && o !== 'true')]);
  app.enableCors({
    origin: wildcard
      ? true
      : (origin, cb) => cb(null, !origin || allow.has(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400, // cache preflight 24h
  });
  // Pass PORT through verbatim: a number/numeric-string for standalone runs, or a
  // named pipe (e.g. \\.\pipe\...) when hosted under IIS via iisnode. Number() would
  // turn the pipe into NaN and the server would fail to bind.
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
