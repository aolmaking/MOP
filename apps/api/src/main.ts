import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";

try {
  const envPath = path.resolve(process.cwd(), "../../.env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const index = trimmed.indexOf("=");
        if (index !== -1) {
          const key = trimmed.substring(0, index).trim();
          let val = trimmed.substring(index + 1).trim();
          if (val.startsWith('"') && val.endsWith('"')) {
            val = val.substring(1, val.length - 1);
          } else if (val.startsWith("'") && val.endsWith("'")) {
            val = val.substring(1, val.length - 1);
          }
          if (key && !process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    });
  }
} catch (e) {
  console.error("Failed to load root .env manually:", e);
}

import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const apiPort = Number(config.get("API_PORT") || 4000);
  app.setGlobalPrefix("api/v1");
  const configuredOrigins = String(config.get("CORS_ORIGIN") || "http://localhost:4200,http://127.0.0.1:4200")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin(origin, callback) {
      if (!origin || configuredOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS origin ${origin} is not allowed.`), false);
    },
    credentials: true
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  await app.listen(apiPort);
  console.log(`MOP API listening on http://localhost:${apiPort}/api/v1`);
}

bootstrap();
