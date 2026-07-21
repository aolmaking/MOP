import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async status() {
    const database = await this.database();
    return {
      status: database.status === "ok" ? "ok" : "degraded",
      api: "ok",
      database,
      timestamp: new Date().toISOString()
    };
  }

  async database() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok" };
    } catch (error) {
      return {
        status: "down",
        message: error instanceof Error ? error.message : "Database connection failed."
      };
    }
  }
}
