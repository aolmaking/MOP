import { InspectionRepository, ConcurrentModificationError } from "./inspection.repository";
import { InspectionAggregate } from "./domain/inspection.aggregate";
import { PrismaService } from "../../../runtime/database/prisma.service";

describe("InspectionRepository", () => {
  let repo: InspectionRepository;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      inspection: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
      fault: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    repo = new InspectionRepository(prismaMock as unknown as PrismaService);
  });

  it("persists in-progress aggregate into inspection table without projecting faults", async () => {
    const agg = InspectionAggregate.create({
      id: "insp-1",
      tenantId: "t-1",
      workOrderId: "wo-1",
      technicianStaffId: "tech-1",
      catalogVersion: 2,
      templateCode: "CARS_V2",
    });

    agg.recordTargetResult({
      targetKey: "FRONT_AXLE_BRAKES",
      canonicalPartSlug: "brake-pads-front",
      position: "FRONT",
      status: "INSPECTED",
      condition: "CRITICAL",
      findings: [
        {
          findingKey: "CAR_PAD_THICKNESS_CRITICAL",
          severity: "CRITICAL",
          technicianObservation: "Under 1mm",
        },
      ],
    });

    await repo.save(agg);

    expect(prismaMock.inspection.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.fault.create).not.toHaveBeenCalled(); // State is IN_PROGRESS, not SUBMITTED!
  });

  it("projects critical findings into model Fault when aggregate is SUBMITTED", async () => {
    const agg = InspectionAggregate.create({
      id: "insp-2",
      tenantId: "t-1",
      workOrderId: "wo-2",
      technicianStaffId: "tech-1",
      catalogVersion: 2,
      templateCode: "CARS_V2",
    });

    agg.recordTargetResult({
      targetKey: "FRONT_AXLE_BRAKES",
      canonicalPartSlug: "brake-pads-front",
      position: "FRONT",
      status: "INSPECTED",
      condition: "CRITICAL",
      findings: [
        {
          findingKey: "CAR_PAD_THICKNESS_CRITICAL",
          severity: "CRITICAL",
          technicianObservation: "Under 1mm",
        },
      ],
    });

    agg.submit("tech-1");

    await repo.save(agg);

    expect(prismaMock.inspection.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.fault.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "t-1",
          workOrderId: "wo-2",
          inspectionId: "insp-2",
          code: "CAR_PAD_THICKNESS_CRITICAL",
          severity: "HIGH",
          customerApprovalRequired: true,
        }),
      }),
    );
  });

  it("GAP-A1: throws ConcurrentModificationError on optimistic concurrency version mismatch", async () => {
    // Database already has version 5
    prismaMock.inspection.findFirst.mockResolvedValue({
      id: "insp-concurrent",
      fields: {
        aggregateVersion: 5,
        state: "IN_PROGRESS",
      },
    });

    const agg = InspectionAggregate.create({
      id: "insp-concurrent",
      tenantId: "t-1",
      workOrderId: "wo-1",
      technicianStaffId: "tech-1",
      catalogVersion: 2,
      templateCode: "CARS_V2",
    });
    // Aggregate has version 1 (not 5)

    await expect(repo.save(agg)).rejects.toThrow(ConcurrentModificationError);
    expect(prismaMock.inspection.upsert).not.toHaveBeenCalled();
  });

  it("GAP-A2: executes fault projection idempotently without duplicate inserts on retry", async () => {
    // Existing fault row already exists from earlier run
    prismaMock.fault.findFirst.mockResolvedValue({
      id: "fault-existing-1",
      code: "CAR_PAD_THICKNESS_CRITICAL",
    });

    const agg = InspectionAggregate.create({
      id: "insp-idempotent",
      tenantId: "t-1",
      workOrderId: "wo-1",
      technicianStaffId: "tech-1",
      catalogVersion: 2,
      templateCode: "CARS_V2",
    });

    agg.recordTargetResult({
      targetKey: "FRONT_AXLE_BRAKES",
      canonicalPartSlug: "brake-pads-front",
      position: "FRONT",
      status: "INSPECTED",
      condition: "CRITICAL",
      findings: [
        {
          findingKey: "CAR_PAD_THICKNESS_CRITICAL",
          severity: "CRITICAL",
        },
      ],
    });

    agg.submit("tech-1");

    await repo.save(agg);

    // Should update existing fault rather than creating a duplicate row!
    expect(prismaMock.fault.create).not.toHaveBeenCalled();
    expect(prismaMock.fault.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "fault-existing-1" },
      }),
    );
  });

  it("GAP-A4: does NOT project informational findings with faultProjectionPolicy: NEVER", async () => {
    const agg = InspectionAggregate.create({
      id: "insp-info",
      tenantId: "t-1",
      workOrderId: "wo-1",
      technicianStaffId: "tech-1",
      catalogVersion: 2,
      templateCode: "CARS_V2",
    });

    agg.recordTargetResult({
      targetKey: "STARTING_CIRCUIT",
      canonicalPartSlug: "battery-12v-starting",
      position: "ENGINE_BAY",
      status: "INSPECTED",
      condition: "GOOD",
      findings: [
        {
          findingKey: "CAR_BATTERY_LABEL_OBSERVATION_INFO",
          severity: "INFO",
          technicianObservation: "Manufacture batch 2024-Q3 recorded",
        },
      ],
    });

    agg.submit("tech-1");

    await repo.save(agg);

    // INFO observation must NEVER be projected to model Fault
    expect(prismaMock.fault.create).not.toHaveBeenCalled();
  });

  it("reconstitutes aggregate from stored inspection record", async () => {
    const mockFields = {
      schemaVersion: 2,
      aggregateVersion: 3,
      catalogVersion: 2,
      templateCode: "CARS_V2",
      state: "IN_PROGRESS",
      targets: {
        "front_axle_brakes::brake-pads-front::front": {
          id: "front_axle_brakes::brake-pads-front::front",
          targetKey: "FRONT_AXLE_BRAKES",
          canonicalPartSlug: "brake-pads-front",
          position: "FRONT",
          status: "INSPECTED",
          condition: "GOOD",
          findings: [],
        },
      },
      recommendations: [],
      decisions: [],
      startedAt: new Date().toISOString(),
      technicianStaffId: "tech-1",
    };

    prismaMock.inspection.findFirst.mockResolvedValue({
      id: "insp-existing",
      tenantId: "t-1",
      workOrderId: "wo-100",
      technicianId: "tech-1",
      fields: mockFields,
    });

    const agg = await repo.findByWorkOrderId("t-1", "wo-100");

    expect(agg).not.toBeNull();
    expect(agg?.id).toBe("insp-existing");
    expect(agg?.aggregateVersion).toBe(3);
    expect(agg?.targets).toHaveLength(1);
    expect(agg?.targets[0].condition).toBe("GOOD");
  });
});
