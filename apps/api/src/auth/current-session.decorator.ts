import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { RequestWithSession } from "./session.guard";

export const CurrentSession = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<RequestWithSession>().session;
});
