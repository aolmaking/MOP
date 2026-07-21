import { Controller, Get } from "@nestjs/common";
import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async status() {
    return this.health.status();
  }

  @Get("db")
  async database() {
    return this.health.database();
  }
}
