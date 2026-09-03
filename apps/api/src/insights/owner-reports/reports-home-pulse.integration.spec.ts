process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaService } from "../../runtime/database/prisma.service";
import { ActionDeckService } from "./action-deck.service";
import { ReportsLaborService } from "./reports-labor.service";
import { ReportsPipelineService } from "./reports-pipeline.service";
import { ReportsSalesConversionService } from "./reports-sales-conversion.service";

describe("Executive Reports Services Integration", () => {
  let module: TestingModule;
  let actionDeckService: ActionDeckService;
  let laborService: ReportsLaborService;
  let pipelineService: ReportsPipelineService;
  let salesConversionService: ReportsSalesConversionService;
  let prisma: PrismaService;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        PrismaService,
        ActionDeckService,
        ReportsLaborService,
        ReportsPipelineService,
        ReportsSalesConversionService,
      ],
    }).compile();

    actionDeckService = module.get(ActionDeckService);
    laborService = module.get(ReportsLaborService);
    pipelineService = module.get(ReportsPipelineService);
    salesConversionService = module.get(ReportsSalesConversionService);
    prisma = module.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await module.close();
  });

  it("builds Home Pulse DTO with vital signs and action deck alerts", async () => {
    const tenants = await prisma.tenant.findMany({ take: 1, select: { id: true } });
    if (tenants.length === 0) return;

    const pulse = await actionDeckService.buildHomePulse(tenants[0].id);
    expect(pulse).toBeDefined();
    expect(pulse.mtdRevenue).toBeDefined();
    expect(pulse.blendedGrossMarginPct).toBeGreaterThanOrEqual(0);
    expect(pulse.actionDeck).toBeInstanceOf(Array);
    expect(pulse.activeShopPulse).toBeDefined();
  });

  it("builds Labor Triad DTO with technician performance metrics", async () => {
    const tenants = await prisma.tenant.findMany({ take: 1, select: { id: true } });
    if (tenants.length === 0) return;

    const labor = await laborService.build(tenants[0].id);
    expect(labor).toBeDefined();
    expect(labor.averageProductivityPct).toBeGreaterThanOrEqual(0);
    expect(labor.averageEfficiencyPct).toBeGreaterThanOrEqual(0);
    expect(labor.technicians).toBeInstanceOf(Array);
  });

  it("builds Pipeline Sankey nodes and physical bay occupancy timeline", async () => {
    const tenants = await prisma.tenant.findMany({ take: 1, select: { id: true } });
    if (tenants.length === 0) return;

    const pipeline = await pipelineService.build(tenants[0].id);
    expect(pipeline).toBeDefined();
    expect(pipeline.nodes.length).toBeGreaterThan(0);
    expect(pipeline.bayOccupancy.length).toBeGreaterThan(0);
  });

  it("builds Sales Conversion Waterfall DTO from real customer estimates", async () => {
    const tenants = await prisma.tenant.findMany({ take: 1, select: { id: true } });
    if (tenants.length === 0) return;

    const sales = await salesConversionService.build(tenants[0].id);
    expect(sales).toBeDefined();
    expect(sales.totalEstimatesIdentified).toBeDefined();
    expect(sales.totalConversionPct).toBeGreaterThanOrEqual(0);
    expect(sales.advisorScorecards).toBeInstanceOf(Array);
  });
});
