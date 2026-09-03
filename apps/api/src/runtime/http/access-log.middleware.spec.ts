import { Logger } from "@nestjs/common";
import { accessLogMiddleware } from "./access-log.middleware";
import { REQUEST_ID_HEADER } from "./request-id";

/** A minimal Express req/res double -- just enough surface for the middleware. */
function fakeExchange(path: string, headers: Record<string, string> = {}) {
  const finishHandlers: (() => void)[] = [];
  const req = { method: "GET", path, originalUrl: path } as unknown as Parameters<typeof accessLogMiddleware>[0];
  const res = {
    statusCode: 200,
    getHeader: (name: string) => headers[name.toLowerCase()],
    on: (event: string, handler: () => void) => {
      if (event === "finish") finishHandlers.push(handler);
    },
  } as unknown as Parameters<typeof accessLogMiddleware>[1];
  return { req, res, finish: () => finishHandlers.forEach((handler) => handler()) };
}

describe("accessLogMiddleware", () => {
  it("logs the request id, method, path and status once the response finishes", () => {
    const logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const { req, res, finish } = fakeExchange("/api/v1/technician/active", {
      [REQUEST_ID_HEADER.toLowerCase()]: "rid-123",
    });

    accessLogMiddleware(req, res, () => undefined);
    finish();

    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0]![0] as string;
    expect(line).toContain("GET /api/v1/technician/active");
    expect(line).toContain("rid=rid-123");
    logSpy.mockRestore();
  });

  it("never logs the health check -- a load balancer would drown every real line", () => {
    const logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const { req, res, finish } = fakeExchange("/api/v1/health");

    accessLogMiddleware(req, res, () => undefined);
    finish();

    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("always calls next(), whether or not the path is logged", () => {
    const next = jest.fn();
    const { req, res } = fakeExchange("/api/v1/health");

    accessLogMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
