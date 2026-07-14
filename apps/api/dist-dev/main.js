"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, transform: true }));
    // Separate-hosting: the browser calls the API cross-origin from the web app. Lock
    // CORS to the frontend origin(s) via CORS_ORIGIN (comma-separated); unset = allow all (dev).
    const origins = process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean);
    app.enableCors({ origin: origins && origins.length ? origins : true });
    // Pass PORT through verbatim: a number/numeric-string for standalone runs, or a
    // named pipe (e.g. \\.\pipe\...) when hosted under IIS via iisnode. Number() would
    // turn the pipe into NaN and the server would fail to bind.
    await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
