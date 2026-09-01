import { Body, Controller, Post, Param } from "@nestjs/common";
import { TechnicianWorkService } from "./technician-work.service";
import { LifecycleActor } from "./work-order-lifecycle.service";

@Controller("technician/parts")
export class PartsController {
  constructor(private readonly work: TechnicianWorkService) {}

  @Post(":id/return")
  async requestReturn(
    @Param() param: { id: string },
    @Body() body: { qty: number; reason: string },
    @Body() actor: LifecycleActor,
  ) {
    return this.work.requestReturn(param.id, body, actor);
  }

  @Post(":id/clarification")
  async respondToClarification(
    @Param() param: { id: string },
    @Body() body: { answer: "CLARIFIED" | "REJECTED" },
    @Body() actor: LifecycleActor,
  ) {
    return this.work.respondToClarification(param.id, body.answer, actor);
  }
}