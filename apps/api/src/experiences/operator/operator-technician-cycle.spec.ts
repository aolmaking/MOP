import { OperatorService } from './operator.service';
import { TechnicianWorkViewService } from '../technician/technician-work-view.service';

describe('Operator-Technician Complete Inspection & Repair Cycle', () => {
  let operatorService: OperatorService;
  let technicianService: TechnicianWorkViewService;
  let mockPrisma: any;
  let mockIntake: any;
  let mockCatalog: any;
  let mockLifecycle: any;

  const tenantId = 'test-tenant';
  const workOrderId = 'wo-123';
  const staffUserId = 'tech-user-1';

  beforeEach(() => {
    mockPrisma = {
      workOrder: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      inspection: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      fault: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      task: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      staffUser: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      customerAsset: {
        findMany: jest.fn(),
      },
      branch: {
        findMany: jest.fn(),
      },
    };

    mockIntake = {
      book: jest.fn(),
    };
    mockCatalog = {};
    // The lifecycle service is the only thing allowed to move WorkOrder.status,
    // so the operator service now asks it for a transition instead of writing
    // the column. The mock records the intent and reports where it landed.
    mockLifecycle = {
      apply: jest.fn(async (workOrderId, _tenantId, intent) => ({
        workOrderId,
        from: "UNDER_INSPECTION",
        to: intent === "APPROVE" ? "APPROVED_FOR_WORK" : "UNDER_INSPECTION",
      })),
    };

    operatorService = new OperatorService(mockPrisma, mockIntake, mockLifecycle, mockCatalog);
    technicianService = new TechnicianWorkViewService(
      mockPrisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  describe('Technician: Inspection Report Submission', () => {
    it('submits inspection report with findings, parts, services, and calculates itemized totals', async () => {
      // Mock workCard internal check
      jest.spyOn(technicianService, 'workCard').mockResolvedValue({
        workOrderId,
        status: 'UNDER_INSPECTION',
      } as any);

      mockPrisma.inspection.findFirst.mockResolvedValue(null);
      mockPrisma.inspection.create.mockResolvedValue({ id: 'insp-1' });
      mockPrisma.fault.create.mockResolvedValue({ id: 'fault-1' });

      const result = await technicianService.submitInspectionReport(
        staffUserId,
        tenantId,
        workOrderId,
        {
          findings: [
            {
              description: 'Front Brake Pads 80% Worn',
              severity: 'CRITICAL',
              recommendedService: 'Front Brake Pads Replacement',
              code: 'brakes',
            },
          ],
          parts: [
            {
              sku: 'BP-001',
              name: 'Ceramic Brake Pad Set',
              quantity: 1,
              unitPrice: 95.0,
            },
          ],
          services: [
            {
              name: 'Front Brake Pads Replacement',
              laborPrice: 80.0,
            },
          ],
          note: 'Technician verified wear on driver side',
        },
      );

      expect(result.success).toBe(true);
      expect(result.workOrderId).toBe(workOrderId);
      expect(mockPrisma.inspection.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workOrderId,
            fields: expect.objectContaining({
              inspectionReportSubmitted: true,
              pricing: {
                partsTotal: 95.0,
                laborTotal: 80.0,
                grandTotal: 175.0,
              },
            }),
          }),
        }),
      );
    });
  });

  describe('Operator: Inspection Reports Hub & Review', () => {
    it('returns submitted inspection reports list with itemized counts and estimates', async () => {
      mockPrisma.workOrder.findMany.mockResolvedValue([
        {
          id: workOrderId,
          status: 'UNDER_INSPECTION',
          asset: {
            id: 'asset-1',
            plateNumber: 'ABC 1234',
            make: 'Toyota',
            model: 'Corolla 2021',
            vinOrChassisNumber: '1NXBR32E7MZ123456',
            owner: {
              id: 'cust-1',
              fullName: 'Ahmed Hassan',
              phone: '01012345678',
            },
          },
          customer: {
            id: 'cust-1',
            fullName: 'Ahmed Hassan',
            phone: '01012345678',
          },
          inspections: [
            {
              id: 'insp-1',
              fields: {
                inspectionReportSubmitted: true,
                submittedAt: '2026-09-07T14:00:00.000Z',
                findings: [{ description: 'Brake pads worn' }],
                parts: [{ sku: 'BP-1', name: 'Brake Pads', quantity: 1, unitPrice: 95 }],
                services: [{ serviceName: 'Brake service', laborPrice: 80 }],
                pricing: { grandTotal: 175.0 },
              },
            },
          ],
        },
      ]);

      const reports = await operatorService.getInspectionReports(tenantId);
      expect(reports.length).toBe(1);
      expect(reports[0].workOrderId).toBe(workOrderId);
      expect(reports[0].identifier).toBe('ABC 1234');
      expect(reports[0].customerName).toBe('Ahmed Hassan');
      expect(reports[0].findingsCount).toBe(1);
      expect(reports[0].partsCount).toBe(1);
      expect(reports[0].servicesCount).toBe(1);
      expect(reports[0].pricing.grandTotal).toBe(175.0);
    });

    it('returns inspection report detail for the quote builder', async () => {
      mockPrisma.workOrder.findFirst.mockResolvedValue({
        id: workOrderId,
        status: 'UNDER_INSPECTION',
        updatedAt: new Date(),
        asset: {
          id: 'asset-1',
          plateNumber: 'ABC 1234',
          make: 'Toyota',
          model: 'Corolla 2021',
          vinOrChassisNumber: '1NXBR32E7MZ123456',
          owner: {
            id: 'cust-1',
            fullName: 'Ahmed Hassan',
            phone: '01012345678',
          },
        },
        customer: {
          id: 'cust-1',
          fullName: 'Ahmed Hassan',
          phone: '01012345678',
        },
        inspections: [
          {
            id: 'insp-1',
            fields: {
              inspectionReportSubmitted: true,
              findings: [{ description: 'Brake pads worn', severity: 'HIGH' }],
              parts: [{ sku: 'BP-1', name: 'Brake Pads', quantity: 1, unitPrice: 95 }],
              services: [{ serviceName: 'Brake Service', laborPrice: 80 }],
              pricing: { partsTotal: 95, laborTotal: 80, grandTotal: 175 },
            },
          },
        ],
        faults: [],
      });

      const detail = await operatorService.getInspectionReportDetail(tenantId, workOrderId);
      expect(detail.workOrderId).toBe(workOrderId);
      expect(detail.pricing.grandTotal).toBe(175);
      expect(detail.findings[0].severity).toBe('HIGH');
    });

    it('updates quote and recalculates pricing breakdown', async () => {
      // The quote routes now check that the job is inside the caller's branch
      // scope before touching it, so the mock has to have a job to find.
      mockPrisma.workOrder.findFirst.mockResolvedValue({ id: workOrderId, tenantId });
      mockPrisma.inspection.findFirst.mockResolvedValue({
        id: 'insp-1',
        fields: {},
      });
      mockPrisma.inspection.update.mockResolvedValue({ id: 'insp-1' });

      const updated = await operatorService.updateQuote(tenantId, workOrderId, {
        findings: [
          { description: 'Brake pads worn', severity: 'CRITICAL', recommendedService: 'Brake Replacement' },
          { description: 'Engine Oil due', severity: 'MEDIUM', recommendedService: 'Oil Change' },
        ],
        parts: [
          { sku: 'BP-1', name: 'Brake Pads', quantity: 2, unitPrice: 50 }, // 100
          { sku: 'OIL-5W30', name: 'Synthetic Oil', quantity: 1, unitPrice: 40 }, // 40
        ],
        services: [
          { serviceName: 'Brake Pad Replacement', laborPrice: 80 },
          { serviceName: 'Oil Change Service', laborPrice: 30 },
        ],
        note: 'Customer confirmed via phone call',
      });

      expect(updated.success).toBe(true);
      expect(updated.pricing.partsTotal).toBe(140);
      expect(updated.pricing.laborTotal).toBe(110);
      expect(updated.pricing.grandTotal).toBe(250);
    });

    it('approves and dispatches repair, advancing state and creating tasks for technician stage 2', async () => {
      mockPrisma.workOrder.findFirst.mockResolvedValue({
        id: workOrderId,
        status: 'UNDER_INSPECTION',
        inspections: [
          {
            id: 'insp-1',
            fields: {
              inspectionReportSubmitted: true,
              state: 'SUBMITTED',
              services: [
                { serviceName: 'Front Brake Pads Replacement', laborPrice: 80 },
                { serviceName: 'Engine Oil & Filter Service', laborPrice: 45 },
              ],
            },
          },
        ],
      });
      mockPrisma.inspection.update.mockResolvedValue({ id: 'insp-1' });
      mockPrisma.workOrder.update.mockResolvedValue({
        id: workOrderId,
        status: 'APPROVED_FOR_WORK',
      });
      mockPrisma.task.create.mockResolvedValue({ id: 'task-1' });

      const session: any = {
        accountId: 'operator-account-1',
        actorId: 'operator-1',
        tenantId,
        roles: ['OPERATOR'],
      };

      const result = await operatorService.dispatchRepair(
        tenantId,
        workOrderId,
        {
          note: 'Quote approved by customer. Ready for repair.',
        },
        session,
      );

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('APPROVED_FOR_WORK');
      // The intent, not the column. Only WorkOrderLifecycleService writes
      // WorkOrder.status; the operator service names the move and the
      // capability-aware graph decides where it lands.
      expect(mockLifecycle.apply).toHaveBeenCalledWith(workOrderId, tenantId, 'APPROVE', expect.anything());
      expect(mockPrisma.task.create).toHaveBeenCalledTimes(2);
    });

    it('strictly excludes IN_PROGRESS or unsubmitted work orders from operator inspection queue', async () => {
      mockPrisma.workOrder.findMany.mockResolvedValue([
        {
          id: 'wo-in-progress',
          status: 'IN_PROGRESS', // Should be excluded!
          asset: { plateNumber: 'INP-100', category: 'CARS' },
          customer: { fullName: 'In Progress Customer' },
          inspections: [{ fields: { inspectionReportSubmitted: true } }],
          faults: [{ id: 'f1', description: 'Fault' }],
        },
        {
          id: 'wo-unsubmitted',
          status: 'UNDER_INSPECTION', // Status correct, but report NOT submitted -> Should be excluded!
          asset: { plateNumber: 'UNS-200', category: 'CARS' },
          customer: { fullName: 'Unsubmitted Customer' },
          inspections: [{ fields: { inspectionReportSubmitted: false } }],
          faults: [{ id: 'f2', description: 'Fault' }],
        },
        {
          id: 'wo-valid-submitted',
          status: 'UNDER_INSPECTION', // Valid: UNDER_INSPECTION + inspectionReportSubmitted
          asset: { plateNumber: 'VAL-300', category: 'CARS' },
          customer: { fullName: 'Submitted Customer' },
          inspections: [{ fields: { inspectionReportSubmitted: true, pricing: { grandTotal: 250 } } }],
          faults: [],
        },
      ]);

      const reports = await operatorService.getInspectionReports(tenantId);
      expect(reports.length).toBe(1);
      expect(reports[0].workOrderId).toBe('wo-valid-submitted');
    });

    it('dispatches only selectively approved services into repair tasks', async () => {
      mockPrisma.workOrder.findFirst.mockResolvedValue({
        id: workOrderId,
        status: 'UNDER_INSPECTION',
        inspections: [
          {
            id: 'insp-1',
            fields: {
              inspectionReportSubmitted: true,
              state: 'SUBMITTED',
              services: [
                { serviceName: 'Front Brake Pads Replacement', laborPrice: 80 },
                { serviceName: 'Engine Oil & Filter Service', laborPrice: 45 },
                { serviceName: 'Air Filter Replacement', laborPrice: 25 },
              ],
            },
          },
        ],
      });
      mockPrisma.inspection.update.mockResolvedValue({ id: 'insp-1' });
      mockPrisma.workOrder.update.mockResolvedValue({
        id: workOrderId,
        status: 'APPROVED_FOR_WORK',
      });
      mockPrisma.task.create.mockResolvedValue({ id: 'task-1' });

      const session: any = {
        accountId: 'operator-account-1',
        actorId: 'operator-1',
        tenantId,
        roles: ['OPERATOR'],
      };

      // Operator only approves 1 service out of 3:
      const result = await operatorService.dispatchRepair(
        tenantId,
        workOrderId,
        {
          approvedServices: [
            { serviceName: 'Front Brake Pads Replacement', laborPrice: 80 },
          ],
          note: 'Only brake replacement approved by customer',
        },
        session,
      );

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('APPROVED_FOR_WORK');
      // Only 1 task should be created for the selectively approved service:
      expect(mockPrisma.task.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Front Brake Pads Replacement',
          }),
        }),
      );
    });
  });
});

