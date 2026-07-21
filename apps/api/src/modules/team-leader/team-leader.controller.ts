import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AccessService } from "../../access/access.service";
import { SessionGuard } from "../../auth/session.guard";
import type { RequestWithSession } from "../../tenancy/session-context";
import { TeamLeaderService } from "./team-leader.service";

@Controller("team-leader")
@UseGuards(SessionGuard)
export class TeamLeaderController {
  constructor(private readonly teamLeader: TeamLeaderService, private readonly access: AccessService) {}

  @Get("review")
  review(@Req() req: RequestWithSession) {
    this.access.assert("task.review", req.session);
    return this.teamLeader.reviewQueue(req.session);
  }

  @Post("review/:taskId/action")
  action(@Req() req: RequestWithSession, @Param("taskId") taskId: string, @Body() body: any) {
    const permission = body?.action === "return_rework" ? "task.return_for_rework" : "task.review";
    this.access.assert(permission, req.session);
    return this.teamLeader.reviewAction(req.session, taskId, body);
  }
}
