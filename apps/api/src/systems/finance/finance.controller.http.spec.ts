import "reflect-metadata";
import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { SessionContext } from "@mop/shared";
import { ApiExceptionFilter } from "../../runtime/http/filters/api-exception.filter";
import { validationExceptionFactory } from "../../runtime/http/validation/validation-exception-factory";
import { EffectiveAccessService } from "../../identity/access/effective-access.service";
import { createSession } from "../../identity/access/test-support/session-fixture";
import { CurrentSession } from "../../identity/auth/current-session.decorator";
import { RequestWithSession, SessionGuard } from "../../identity/auth/session.guard";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";

describe("FinanceController (HTTP route wiring)", () => {
  let app: INestApplication;
  let sessionForRequest: SessionContext | null;

  const finance = {
    jobTotal: jest.fn().mockResolvedValue({ total: "125.00" }),
    addLine: jest.fn().mockResolvedValue({ id: "line-1", name: "Oil" }),
    issueInvoice: jest.fn().mockResolvedValue({ invoiceId: "invoice-1", total: "100.00" }),
    settlement: jest.fn().mockResolvedValue({ invoiceId: "invoice-1", total: "100.00" }),
    recordPayment: jest.fn().mockResolvedValue({ paymentId: "payment-1", outstanding: "0.00" }),
    requestRefund: jest.fn().mockResolvedValue({ id: "refund-1" }),
    approveRefund: jest.fn().mockResolvedValue({ id: "refund-1", status: "APPROVED" }),
    rejectRefund: jest.fn().mockResolvedValue({ id: "refund-1", status: "REJECTED" }),
    requestDiscount: jest.fn().mockResolvedValue({ id: "discount-1" }),
    approveDiscount: jest.fn().mockResolvedValue({ id: "discount-1", status: "APPROVED" }),
    rejectDiscount: jest.fn().mockResolvedValue({ id: "discount-1", status: "REJECTED" }),
  };
  const access = { can: jest.fn().mockResolvedValue(true) };

  const sessionGuard: CanActivate = {
    canActivate(context: ExecutionContext): boolean {
      if (!sessionForRequest) {
        throw new UnauthorizedException("Not authenticated");
      }
      context.switchToHttp().getRequest<RequestWithSession>().session = sessionForRequest;
      return true;
    },
  };

  const financeSession = () =>
    createSession({
      tenantId: "tenant-1",
      accountId: "finance-1",
      displayName: "Finance Manager",
      role: "TENANT_ADMIN",
    });

  const actor = { accountId: "finance-1", displayName: "Finance Manager", actorType: "TENANT_STAFF" as const };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FinanceController],
      providers: [
        { provide: FinanceService, useValue: finance },
        { provide: EffectiveAccessService, useValue: access },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue(sessionGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    sessionForRequest = financeSession();
    access.can.mockReset().mockResolvedValue(true);
    for (const mock of Object.values(finance)) {
      mock.mockClear();
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects unauthenticated payment requests before access or service calls", async () => {
    sessionForRequest = null;

    const res = await request(app.getHttpServer()).post("/api/v1/finance/invoices/invoice-1/payments").send({
      amount: "100.00",
      method: "CASH",
      idempotencyKey: "payment-12345",
    });

    expect(res.status).toBe(401);
    expect(access.can).not.toHaveBeenCalled();
    expect(finance.recordPayment).not.toHaveBeenCalled();
  });

  it("records payments with the current session tenant and actor over HTTP", async () => {
    const session = financeSession();
    sessionForRequest = session;

    const res = await request(app.getHttpServer()).post("/api/v1/finance/invoices/invoice-1/payments").send({
      amount: "100.00",
      method: "CASH",
      idempotencyKey: "payment-12345",
    });

    expect(res.status).toBe(201);
    expect(access.can).toHaveBeenCalledWith(session, "finance.payment.record");
    expect(finance.recordPayment).toHaveBeenCalledWith(
      "tenant-1",
      "invoice-1",
      { amount: "100.00", method: "CASH", idempotencyKey: "payment-12345" },
      actor,
    );
    expect(res.body).toEqual({ paymentId: "payment-1", outstanding: "0.00" });
  });

  it("refuses malformed payment money before FinanceService is reached", async () => {
    const res = await request(app.getHttpServer()).post("/api/v1/finance/invoices/invoice-1/payments").send({
      amount: "100.001",
      method: "CASH",
      idempotencyKey: "payment-12345",
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_error");
    expect(finance.recordPayment).not.toHaveBeenCalled();
  });

  it("does not call FinanceService when permission resolution denies the route", async () => {
    access.can.mockResolvedValue(false);

    const res = await request(app.getHttpServer()).post("/api/v1/finance/invoices/invoice-1/payments").send({
      amount: "100.00",
      method: "CASH",
      idempotencyKey: "payment-12345",
    });

    expect(res.status).toBe(403);
    expect(finance.recordPayment).not.toHaveBeenCalled();
  });

  it("wires invoice issuance through the Finance boundary that owns Billing downstream", async () => {
    const res = await request(app.getHttpServer()).post("/api/v1/finance/work-orders/work-1/invoice").send({
      discountPercent: 5,
      taxPercent: 14,
    });

    expect(res.status).toBe(201);
    expect(access.can).toHaveBeenCalledWith(sessionForRequest, "finance.invoice.issue");
    expect(finance.issueInvoice).toHaveBeenCalledWith("tenant-1", "work-1", actor, {
      discountPercent: 5,
      taxPercent: 14,
    });
  });
});

