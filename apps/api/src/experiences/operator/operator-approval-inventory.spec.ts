import { OperatorService } from './operator.service';
import { TechnicianWorkViewService } from '../technician/technician-work-view.service';
import { InventoryViewService } from '../../systems/inventory/inventory-view.service';
import type { SessionContext } from '@mop/shared';

describe('End-to-End Inspection → Operator Final Approval → Inventory Flow', () => {
  let operatorService: OperatorService;
  let technicianService: TechnicianWorkViewService;
  let lifecycle: { apply: jest.Mock };
  let stock: { record: jest.Mock };
  let inventoryViewService: InventoryViewService;
  let mockPrisma: any;

  const tenantId = 'tenant-cairo-01';
  const branchId = 'branch-maadi';
  const warehouseId = 'wh-central';
  const workOrderId = 'wo-e2e-101';
  const staffUserId = 'tech-omar';
  const operatorSession: SessionContext = {
    accountId: 'op-karim',
    tenantId,
    roles: ['OPERATOR'],
    branchScope: [branchId],
  } as any;

  // In-memory mock data stores to rigorously verify database state mutations
  let stockBalances: Map<string, { availableQty: number; reservedQty: number }>;
  let partLines: Array<any>;
  let partRequests: Array<any>;
  let tasks: Array<any>;
  let faultRows: Array<any>;

  beforeEach(() => {
    stockBalances = new Map();
    partLines = [];
    partRequests = [];
    tasks = [];
    faultRows = [];

    mockPrisma = {
      // The deposit the workshop asks for is read here on every approval.
      // A mock without it is a mock of a database that cannot exist.
      financeConfiguration: {
        findUnique: jest.fn().mockResolvedValue({ depositRequired: false, depositPercent: 0 }),
      },
      workOrder: {
        findFirst: jest.fn().mockImplementation(async ({ where }) => ({
          id: where.id,
          tenantId: where.tenantId,
          branchId,
          status: 'UNDER_INSPECTION',
          assetId: 'asset-1',
          customerId: 'cust-1',
          asset: { id: 'asset-1', plateNumber: 'EGY-9876', category: 'CARS', vinOrChassisNumber: 'VIN123456789' },
          customer: { id: 'cust-1', fullName: 'Tariq Al-Mansoor', phone: '+201001234567' },
          inspections: [
            {
              id: 'insp-101',
              startedAt: new Date('2026-09-08T10:00:00Z'),
              fields: {
                inspectionReportSubmitted: true,
                state: 'SUBMITTED',
                aggregateVersion: 2,
                pricing: { partsTotal: 150, laborTotal: 100, grandTotal: 250 },
                parts: [
                  { inventoryItemId: 'item-brake-pads', name: 'Ceramic Brake Pads', sku: 'BP-CER-01', quantity: 2, unitPrice: 75 },
                ],
                services: [
                  { name: 'Replace Front Brake Pads', laborPrice: 100 },
                ],
                findings: [
                  { description: 'Front brake pads worn below 2mm', severity: 'CRITICAL', code: 'BRAKES_FRONT' },
                ],
              },
            },
          ],
        })),
        findMany: jest.fn(),
        update: jest.fn().mockImplementation(async ({ where, data }) => ({
          id: where.id,
          status: data.status,
        })),
      },
      inspection: {
        findFirst: jest.fn().mockImplementation(async ({ where }) => ({
          id: 'insp-101',
          workOrderId: where.workOrderId,
          tenantId: where.tenantId,
          technicianId: staffUserId,
          fields: {
            inspectionReportSubmitted: true,
            state: 'SUBMITTED',
            aggregateVersion: 1,
            targets: {},
            recommendations: [],
            decisions: [],
          },
        })),
        create: jest.fn().mockImplementation(async ({ data }) => ({ id: data.id || 'insp-created', ...data })),
        update: jest.fn().mockImplementation(async ({ where, data }) => ({ id: where.id, ...data })),
        upsert: jest.fn().mockImplementation(async ({ create }) => ({ id: create.id, ...create })),
      },
      fault: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          faultRows.push(data);
          return { id: `fault-${faultRows.length}`, ...data };
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockImplementation(async () => faultRows),
      },
      task: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          tasks.push(data);
          return { id: `task-${tasks.length}`, ...data };
        }),
      },
      branchWarehouseAccess: {
        findFirst: jest.fn().mockResolvedValue({ warehouseId }),
        findMany: jest.fn().mockResolvedValue([{ branchId, warehouseId }]),
      },
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({ id: warehouseId, code: 'WH-MAIN', name: 'Main Central Warehouse' }),
      },
      inventoryItem: {
        findFirst: jest.fn().mockImplementation(async ({ where }) => {
          if (where.id === 'item-brake-pads' || where.sku === 'BP-CER-01') {
            return { id: 'item-brake-pads', sku: 'BP-CER-01', name: 'Ceramic Brake Pads' };
          }
          if (where.id === 'item-oil-filter' || where.sku === 'OF-SYNT-09') {
            return { id: 'item-oil-filter', sku: 'OF-SYNT-09', name: 'Synthetic Oil Filter' };
          }
          if (where.id === 'item-rotor' || where.sku === 'BR-VENT-02') {
            return { id: 'item-rotor', sku: 'BR-VENT-02', name: 'Ventilated Brake Rotor' };
          }
          return null;
        }),
      },
      warehouseStockBalance: {
        findUnique: jest.fn().mockImplementation(async ({ where }) => {
          const key = `${where.inventoryItemId_warehouseId.inventoryItemId}:${where.inventoryItemId_warehouseId.warehouseId}`;
          return stockBalances.get(key) || { availableQty: 0, reservedQty: 0 };
        }),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          const key = `${where.inventoryItemId_warehouseId.inventoryItemId}:${where.inventoryItemId_warehouseId.warehouseId}`;
          const current = stockBalances.get(key) || { availableQty: 0, reservedQty: 0 };
          let newAvail = current.availableQty;
          let newRes = current.reservedQty;

          if (data.availableQty?.decrement) newAvail -= data.availableQty.decrement;
          else if (typeof data.availableQty === 'number') newAvail = data.availableQty;

          if (data.reservedQty?.increment) newRes += data.reservedQty.increment;
          else if (typeof data.reservedQty === 'number') newRes = data.reservedQty;

          const updated = { availableQty: newAvail, reservedQty: newRes };
          stockBalances.set(key, updated);
          return updated;
        }),
        findMany: jest.fn().mockImplementation(async () => {
          const rows: any[] = [];
          for (const [key, bal] of stockBalances.entries()) {
            const [inventoryItemId, wId] = key.split(':');
            rows.push({
              inventoryItemId,
              warehouseId: wId,
              availableQty: bal.availableQty,
              warehouse: { code: 'WH-MAIN' },
            });
          }
          return rows;
        }),
      },
      workOrderPartLine: {
        findMany: jest.fn().mockImplementation(async ({ where }) => {
          return partLines.filter(
            (p) => p.tenantId === where.tenantId && p.workOrderId === where.workOrderId,
          );
        }),
        create: jest.fn().mockImplementation(async ({ data }) => {
          partLines.push(data);
          return { id: `line-${partLines.length}`, ...data };
        }),
      },
      partRequest: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const req = { id: `req-${partRequests.length + 1}`, createdAt: new Date(), ...data };
          partRequests.push(req);
          return req;
        }),
        findMany: jest.fn().mockImplementation(async () => {
          return partRequests.map((r) => ({
            id: r.id,
            status: r.status,
            quantity: r.quantity,
            urgency: r.urgency,
            createdAt: r.createdAt,
            workOrderId: r.workOrderId,
            inventoryItem: { id: r.inventoryItemId, sku: 'SKU-REQ', name: 'Requested Part' },
            workOrder: { branchId, asset: { plateNumber: 'EGY-9876', serialNumber: null } },
            issuedItems: [],
          }));
        }),
      },
    };

    lifecycle = { apply: jest.fn(async (workOrderId: string) => ({ workOrderId, from: 'UNDER_INSPECTION', to: 'APPROVED_FOR_WORK' })) };
    // Reservations go through StockService now -- it is the only thing allowed
    // to move a balance, and it writes the StockMovement beside it. This mock
    // moves the same two buckets the real RESERVE movement moves, so the
    // assertions below still describe what the shelf ends up holding.
    stock = {
      record: jest.fn(async ({ inventoryItemId, warehouseId: wId, type, quantity }: any) => {
        const key = `${inventoryItemId}:${wId}`;
        const current = stockBalances.get(key) || { availableQty: 0, reservedQty: 0 };
        if (type !== 'RESERVE') return current;
        if (current.availableQty < quantity) {
          throw new Error(`Not enough stock: ${current.availableQty} available, ${quantity} needed.`);
        }
        const updated = {
          availableQty: current.availableQty - quantity,
          reservedQty: current.reservedQty + quantity,
        };
        stockBalances.set(key, updated);
        return updated;
      }),
    };
    const partRequestService = {
      request: jest.fn(async (input: any) => {
        const req = {
          id: `req-${partRequests.length + 1}`,
          createdAt: new Date(),
          tenantId: input.tenantId,
          workOrderId: input.workOrderId,
          inspectionId: input.inspectionId ?? null,
          inventoryItemId: input.inventoryItemId,
          quantity: input.quantity,
          reason: input.reason,
          urgency: input.urgency ?? "normal",
          status: "REQUESTED",
        };
        partRequests.push(req);
        return { id: req.id, status: req.status };
      }),
    };

    operatorService = new OperatorService(
      mockPrisma,
      {} as any,
      lifecycle as any,
      stock as any,
      partRequestService as any,
      {} as any,
    );
    technicianService = new TechnicianWorkViewService(
      mockPrisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    inventoryViewService = new InventoryViewService(
      mockPrisma,
      {} as any,
    );
  });

  describe('1. Domain & Graph Alignment: Technician Submission to Operator Review', () => {
    it('keeps Work Order in UNDER_INSPECTION without falsely triggering AWAITING_CUSTOMER_APPROVAL', async () => {
      jest.spyOn(technicianService, 'workCard').mockResolvedValue({
        workOrderId,
        status: 'UNDER_INSPECTION',
      } as any);

      const result = await technicianService.submitInspectionReport(
        staffUserId,
        tenantId,
        workOrderId,
        {
          findings: [
            { description: 'Front brake pads worn to 1.8mm', severity: 'CRITICAL', code: 'BRAKES_FRONT' },
          ],
          parts: [
            { inventoryItemId: 'item-brake-pads', name: 'Ceramic Brake Pads', sku: 'BP-CER-01', quantity: 2, unitPrice: 75 },
          ],
          services: [
            { name: 'Replace Front Brake Pads', laborPrice: 100 },
          ],
          note: 'Technician verified wear on driver side',
        },
      );

      expect(result.success).toBe(true);
      // Explicit verification: Status MUST remain UNDER_INSPECTION awaiting Operator Review
      expect(result.status).toBe('UNDER_INSPECTION');
      // Submitting a report is not a transition, so nothing writes the status
      // here at all -- the technician's job is already UNDER_INSPECTION and stays
      // there until the operator dispatches. This asserted a redundant write that
      // only existed to satisfy this assertion.
      expect(mockPrisma.workOrder.update).not.toHaveBeenCalled();
    });
  });

  describe('2. Test A — Part In Stock: Operator Approval → Automatic Stock Reservation', () => {
    it('reserves warehouse stock, creates WorkOrderPartLine, and creates NO PartRequest', async () => {
      // Setup warehouse stock balance: 10 units available
      stockBalances.set(`item-brake-pads:${warehouseId}`, { availableQty: 10, reservedQty: 0 });

      const response = await operatorService.approveRepair(
        tenantId,
        workOrderId,
        {},
        operatorSession,
      );

      expect(response.success).toBe(true);
      expect(response.newStatus).toBe('APPROVED_FOR_WORK');
      expect(response.partsAllocated).toBe(1);
      expect(response.partsRequested).toBe(0);

      // Verify stock reservation: 10 - 2 = 8 available, 2 reserved
      const updatedBalance = stockBalances.get(`item-brake-pads:${warehouseId}`);
      expect(updatedBalance?.availableQty).toBe(8);
      expect(updatedBalance?.reservedQty).toBe(2);

      // Verify WorkOrderPartLine created with INVENTORY provenance
      expect(partLines).toHaveLength(1);
      expect(partLines[0]).toMatchObject({
        tenantId,
        workOrderId,
        inventoryItemId: 'item-brake-pads',
        provenance: 'INVENTORY',
        quantity: 2,
      });

      // Verify NO PartRequest created since stock was available
      expect(partRequests).toHaveLength(0);

      // Verify repair tasks dispatched for technician fixing stage
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Replace Front Brake Pads');
      expect(tasks[0].status).toBe('ASSIGNED');
    });
  });

  describe('3. Test B — Part Not In Stock: Operator Approval → Official Part Request Created', () => {
    it('creates official PartRequest in REQUESTED status and makes it visible to Inventory Manager', async () => {
      // Setup warehouse stock balance: 0 units available
      stockBalances.set(`item-brake-pads:${warehouseId}`, { availableQty: 0, reservedQty: 0 });

      const response = await operatorService.approveRepair(
        tenantId,
        workOrderId,
        {},
        operatorSession,
      );

      expect(response.success).toBe(true);
      expect(response.partsAllocated).toBe(0);
      expect(response.partsRequested).toBe(1);

      // Verify stock was not decremented below zero
      const balance = stockBalances.get(`item-brake-pads:${warehouseId}`);
      expect(balance?.availableQty).toBe(0);
      expect(balance?.reservedQty).toBe(0);

      // Verify official PartRequest created
      expect(partRequests).toHaveLength(1);
      expect(partRequests[0]).toMatchObject({
        tenantId,
        workOrderId,
        inventoryItemId: 'item-brake-pads',
        quantity: 2,
        status: 'REQUESTED',
        urgency: 'urgent',
      });

      // Verify WorkOrderPartLine created linked to partRequestId
      expect(partLines).toHaveLength(1);
      expect(partLines[0].partRequestId).toBe(partRequests[0].id);

      // Verify Inventory Manager queue sees the new request via waiting() API
      const queue = await inventoryViewService.waiting(tenantId);
      expect(queue).toHaveLength(1);
      expect(queue[0].status).toBe('REQUESTED');
      expect(queue[0].workOrderId).toBe(workOrderId);
      expect(queue[0].requested).toBe(2);
      expect(queue[0].outstanding).toBe(2);
    });
  });

  describe('4. Test C — Multiple Parts: Mixed Available & Unavailable Stock', () => {
    it('allocates available parts, generates PartRequest for unavailable parts, and dispatches work order', async () => {
      // Work order with 3 parts:
      // Part 1 (Brake Pads): 2 needed, 5 available in stock -> Reserve
      // Part 2 (Oil Filter): 1 needed, 0 available in stock -> PartRequest
      // Part 3 (Rotor): 2 needed, 2 available in stock -> Reserve
      mockPrisma.workOrder.findFirst.mockResolvedValueOnce({
        id: workOrderId,
        tenantId,
        branchId,
        status: 'UNDER_INSPECTION',
        asset: { id: 'asset-1', plateNumber: 'EGY-9876', category: 'CARS', vinOrChassisNumber: 'VIN123' },
        customer: { id: 'cust-1', fullName: 'Tariq', phone: '+201001234567' },
        inspections: [
          {
            id: 'insp-101',
            startedAt: new Date(),
            fields: {
              inspectionReportSubmitted: true,
              parts: [
                { inventoryItemId: 'item-brake-pads', name: 'Ceramic Brake Pads', sku: 'BP-CER-01', quantity: 2, unitPrice: 75 },
                { inventoryItemId: 'item-oil-filter', name: 'Synthetic Oil Filter', sku: 'OF-SYNT-09', quantity: 1, unitPrice: 30 },
                { inventoryItemId: 'item-rotor', name: 'Ventilated Brake Rotor', sku: 'BR-VENT-02', quantity: 2, unitPrice: 120 },
              ],
              services: [{ name: 'Comprehensive Brake & Filter Service', laborPrice: 150 }],
            },
          },
        ],
      });

      stockBalances.set(`item-brake-pads:${warehouseId}`, { availableQty: 5, reservedQty: 0 });
      stockBalances.set(`item-oil-filter:${warehouseId}`, { availableQty: 0, reservedQty: 0 });
      stockBalances.set(`item-rotor:${warehouseId}`, { availableQty: 2, reservedQty: 0 });

      const response = await operatorService.approveRepair(
        tenantId,
        workOrderId,
        {},
        operatorSession,
      );

      expect(response.success).toBe(true);
      expect(response.partsAllocated).toBe(2); // Brake Pads & Rotors
      expect(response.partsRequested).toBe(1); // Oil Filter

      // Check stock updates
      expect(stockBalances.get(`item-brake-pads:${warehouseId}`)?.availableQty).toBe(3);
      expect(stockBalances.get(`item-brake-pads:${warehouseId}`)?.reservedQty).toBe(2);

      expect(stockBalances.get(`item-rotor:${warehouseId}`)?.availableQty).toBe(0);
      expect(stockBalances.get(`item-rotor:${warehouseId}`)?.reservedQty).toBe(2);

      // Oil filter generated official PartRequest
      expect(partRequests).toHaveLength(1);
      expect(partRequests[0].inventoryItemId).toBe('item-oil-filter');
      expect(partRequests[0].quantity).toBe(1);
      expect(partRequests[0].status).toBe('REQUESTED');

      // WorkOrderPartLine rows for all 3 parts created
      expect(partLines).toHaveLength(3);
      // The operator asks for an APPROVE intent; where it lands is the graph's
      // decision, not this service's. Asserting the prisma write instead of the
      // intent is what let the service bypass the inspection_completed gate and
      // the APPROVAL_REQUIRED_SCOPE policy while this test stayed green.
      // The tenant is an argument now, not something the service reads off the
      // row it happens to load. That is the whole point of the change: the only
      // writer of WorkOrder.status verifies ownership itself.
      expect(lifecycle.apply).toHaveBeenCalledWith(workOrderId, tenantId, 'APPROVE', expect.anything());
      expect(mockPrisma.workOrder.update).not.toHaveBeenCalled();
    });
  });

  describe('5. Test D — Idempotency / Double Approval Protection', () => {
    it('prevents duplicate WorkOrderPartLine rows, duplicate stock reservations, or duplicate PartRequests on re-approval', async () => {
      stockBalances.set(`item-brake-pads:${warehouseId}`, { availableQty: 10, reservedQty: 0 });

      // First Approval
      const res1 = await operatorService.approveRepair(
        tenantId,
        workOrderId,
        {},
        operatorSession,
      );
      expect(res1.success).toBe(true);
      expect(partLines).toHaveLength(1);
      expect(stockBalances.get(`item-brake-pads:${warehouseId}`)?.reservedQty).toBe(2);

      // Second Approval (duplicate click / network retry)
      const res2 = await operatorService.approveRepair(
        tenantId,
        workOrderId,
        {},
        operatorSession,
      );
      expect(res2.success).toBe(true);

      // Idempotency check: Part lines count did NOT double
      expect(partLines).toHaveLength(1);

      // Stock was NOT decremented twice
      expect(stockBalances.get(`item-brake-pads:${warehouseId}`)?.availableQty).toBe(8);
      expect(stockBalances.get(`item-brake-pads:${warehouseId}`)?.reservedQty).toBe(2);
    });
  });

  describe('6. Test E — Inventory & Tenant Scoping', () => {
    it('strictly isolates stock by tenant and does not reserve stock from another tenant or warehouse', async () => {
      const foreignWarehouse = 'wh-alex';
      stockBalances.set(`item-brake-pads:${foreignWarehouse}`, { availableQty: 50, reservedQty: 0 });

      // Cairo order should only draw from Cairo warehouse, not Alexandria
      stockBalances.set(`item-brake-pads:${warehouseId}`, { availableQty: 3, reservedQty: 0 });

      await operatorService.approveRepair(
        tenantId,
        workOrderId,
        {},
        operatorSession,
      );

      // Cairo warehouse modified
      expect(stockBalances.get(`item-brake-pads:${warehouseId}`)?.availableQty).toBe(1);
      expect(stockBalances.get(`item-brake-pads:${warehouseId}`)?.reservedQty).toBe(2);

      // Foreign tenant / warehouse completely untouched
      expect(stockBalances.get(`item-brake-pads:${foreignWarehouse}`)?.availableQty).toBe(50);
      expect(stockBalances.get(`item-brake-pads:${foreignWarehouse}`)?.reservedQty).toBe(0);
    });
  });

  describe('7. Test C & E — Architectural Requirement: Approved Parts Only & Unapproved Shortage Isolation', () => {
    it('allocates ONLY approved parts and leaves unapproved parts (even with zero stock) completely untouched with ZERO PartRequests', async () => {
      // Setup 3 parts in the inspection report:
      // Part A: Ceramic Brake Pads (Approved, In Stock)
      // Part B: Ventilated Rotor (Approved, In Stock)
      // Part C: Premium Battery (NOT Approved, OUT OF STOCK = 0)
      mockPrisma.workOrder.findFirst.mockResolvedValue({
        id: workOrderId,
        tenantId,
        branchId,
        status: 'UNDER_INSPECTION',
        inspections: [
          {
            id: 'insp-101',
            startedAt: new Date(),
            fields: {
              inspectionReportSubmitted: true,
              state: 'SUBMITTED',
              parts: [
                { inventoryItemId: 'item-brake-pads', name: 'Ceramic Brake Pads', sku: 'BP-CER-01', quantity: 2, unitPrice: 75 },
                { inventoryItemId: 'item-rotor', name: 'Ventilated Rotor', sku: 'BR-VENT-02', quantity: 2, unitPrice: 120 },
                { inventoryItemId: 'item-battery', name: 'AGM Battery', sku: 'BAT-AGM-90', quantity: 1, unitPrice: 220 },
              ],
              services: [
                { id: 'srv-brakes', name: 'Brake Service', laborPrice: 100 },
                { id: 'srv-battery', name: 'Battery Replacement', laborPrice: 40 },
              ],
              findings: [
                { id: 'f-brakes', description: 'Front brakes worn', severity: 'CRITICAL' },
                { id: 'f-battery', description: 'Battery weak', severity: 'MEDIUM' },
              ],
            },
          },
        ],
      });

      // Stock balances:
      stockBalances.set(`item-brake-pads:${warehouseId}`, { availableQty: 10, reservedQty: 0 });
      stockBalances.set(`item-rotor:${warehouseId}`, { availableQty: 5, reservedQty: 0 });
      stockBalances.set(`item-battery:${warehouseId}`, { availableQty: 0, reservedQty: 0 }); // Shortage!

      // Operator APPROVES only Brakes (Part A & Part B), and EXCLUDES Battery (Part C):
      const approvalResult = await operatorService.approveRepair(
        tenantId,
        workOrderId,
        {
          approvedFindingIds: ['f-brakes'],
          approvedPartIds: ['item-brake-pads', 'item-rotor'],
          approvedServiceIds: ['srv-brakes'],
          operatorNote: 'Customer declined battery replacement at this time.',
        },
        operatorSession,
      );

      expect(approvalResult.success).toBe(true);
      expect(approvalResult.newStatus).toBe('APPROVED_FOR_WORK');

      // 1. Approved parts were processed:
      expect(stockBalances.get(`item-brake-pads:${warehouseId}`)?.availableQty).toBe(8);
      expect(stockBalances.get(`item-brake-pads:${warehouseId}`)?.reservedQty).toBe(2);

      expect(stockBalances.get(`item-rotor:${warehouseId}`)?.availableQty).toBe(3);
      expect(stockBalances.get(`item-rotor:${warehouseId}`)?.reservedQty).toBe(2);

      // 2. Unapproved Part C (Battery) has ZERO inventory impact:
      // Stock balance is completely untouched
      expect(stockBalances.get(`item-battery:${warehouseId}`)?.availableQty).toBe(0);
      expect(stockBalances.get(`item-battery:${warehouseId}`)?.reservedQty).toBe(0);

      // CRITICAL ARCHITECTURAL TEST E:
      // Even though Battery was out of stock, ZERO PartRequests were created for it!
      const batteryRequests = partRequests.filter((pr) => pr.inventoryItemId === 'item-battery');
      expect(batteryRequests).toHaveLength(0);
      expect(partRequests).toHaveLength(0);

      // Part lines only created for the 2 approved parts:
      expect(partLines).toHaveLength(2);
      expect(partLines.some((pl) => pl.inventoryItemId === 'item-battery')).toBe(false);

      // 3. Persisted Audit Trail verification:
      expect(approvalResult.approval).toBeDefined();
      expect(approvalResult.approval.approvedPartIds).toEqual(['item-brake-pads', 'item-rotor']);
      expect(approvalResult.approval.approvedServiceIds).toEqual(['srv-brakes']);
      expect(approvalResult.approval.operatorNote).toBe('Customer declined battery replacement at this time.');

      // Authoritative pricing recalculated by backend for approved items only:
      // 2 * 75 (150) + 2 * 120 (240) = 390 parts + 100 labor = 490 total
      expect(approvalResult.approval.pricing.partsTotal).toBe(390);
      expect(approvalResult.approval.pricing.laborTotal).toBe(100);
      expect(approvalResult.approval.pricing.grandTotal).toBe(490);
    });
  });
});

