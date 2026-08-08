import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./common/filters/api-exception.filter";
import { validationExceptionFactory } from "./common/validation/validation-exception-factory";
import { EnvironmentValidationError, loadEnvironment } from "./config/environment";
import { REQUEST_ID_HEADER } from "./common/request-id";
import { MoneySerializationInterceptor } from "./common/money-serialization.interceptor";

async function bootstrap() {
  // Validated before the app is even constructed: a misconfiguration must
  // be a startup crash, never a silent security downgrade at runtime.
  let env;
  try {
    env = loadEnvironment();
  } catch (error) {
    if (error instanceof EnvironmentValidationError) {
      new Logger("Bootstrap").error(error.message);
      process.exit(78); // EX_CONFIG
    }
    throw error;
  }

  // Typed as the Express app so useBodyParser (an Express-adapter method,
  // not part of the base INestApplication) is available.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });

  app.setGlobalPrefix("api/v1");
  app.enableCors({ origin: env.corsOrigin, credentials: true });

  app.use(helmet());
  app.use(cookieParser());

  // Explicit, and much smaller than Express's default. Inspection payloads
  // with photos will need their own limit on their own route rather than a
  // large global one.
  app.useBodyParser("json", { limit: "256kb" });
  app.useBodyParser("urlencoded", { limit: "256kb", extended: true });

  // A correlation id on every request and response. Without one, an
  // incident report of "it failed around 3pm" is unresolvable across
  // replicas. Honours an inbound id so a trace survives a proxy hop.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const incoming = req.header(REQUEST_ID_HEADER);
    const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
    (req as Request & { requestId?: string }).requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  });

  app.useGlobalFilters(new ApiExceptionFilter());
  // Money leaves the API as strings, always -- see the interceptor for why.
  app.useGlobalInterceptors(new MoneySerializationInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  // In-flight transactions must finish before a replica dies mid-deploy.
  app.enableShutdownHooks();

  await app.listen(env.port);
  new Logger("Bootstrap").log(`MOP API listening on ${env.port} (${env.nodeEnv})`);
}

void bootstrap();
