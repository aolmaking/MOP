import { Controller, Get, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard";
import { PlatformGuard } from "../auth/platform.guard";
import { LiveViewService } from "./live-view.service";

@Controller("platform/live-view")
@UseGuards(SessionGuard, PlatformGuard)
export class LiveViewController {
  constructor(private readonly liveView: LiveViewService) {}

  @Get()
  build() {
    return this.liveView.build();
  }
}
