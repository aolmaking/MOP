import { PrismaClient } from '../packages/database/generated/client/index.js';

const prisma = new PrismaClient();

async function main() {
  console.log('==================================================');
  console.log('MOP PLATFORM SIMULATION AUDIT');
  console.log('==================================================\n');

  // 1. Organizations
  const tenants = await prisma.tenant.findMany({
    where: {
      slug: { in: ['precision-motors', 'heritage-restoration', 'rapid-fleet'] },
    },
    include: {
      branches: true,
      warehouses: true,
      staffUsers: {
        include: {
          account: true,
        },
      },
      workOrders: {
        include: {
          asset: true,
          customer: true,
          assignments: {
            include: {
              staffUser: {
                include: { account: true },
              },
            },
          },
          partRequests: true,
          inspections: true,
        },
      },
      inventoryItems: {
        include: {
          stockBalances: {
            include: { warehouse: true },
          },
          movements: true,
        },
      },
    },
  });

  console.log(`Found ${tenants.length} Target Workshops:`);

  for (const t of tenants) {
    console.log(`\n--------------------------------------------------`);
    console.log(`WORKSHOP: ${t.name} (Slug: ${t.slug}, ID: ${t.id})`);
    console.log(`Branches (${t.branches.length}): ${t.branches.map(b => `${b.code} (${b.name})`).join(', ')}`);
    console.log(`Warehouses (${t.warehouses.length}): ${t.warehouses.map(w => `${w.code} (${w.name})`).join(', ')}`);
    console.log(`Staff Members (${t.staffUsers.length}): ${t.staffUsers.map(s => `${s.fullName} [${s.role}] (${s.account?.email})`).join(', ')}`);
    console.log(`Inventory Items Count: ${t.inventoryItems.length}`);

    // Inventory items summary
    console.log(`\nInventory Highlights:`);
    for (const item of t.inventoryItems.slice(0, 5)) {
      const totalOnHand = item.stockBalances.reduce((sum, l) => sum + Number(l.quantityOnHand), 0);
      console.log(`  - [${item.sku}] ${item.name} | On Hand: ${totalOnHand} ${item.unitOfMeasure} | Movements: ${item.movements.length}`);
    }

    // Work orders summary
    console.log(`\nWork Orders (${t.workOrders.length}):`);
    for (const wo of t.workOrders) {
      const tech = wo.assignments[0]?.staffUser?.fullName || 'Unassigned';
      const partsSummary = wo.partRequests.map(p => `${p.sku || p.id} [${p.status}] (qty ${p.quantityRequested})`).join(', ') || 'None';
      console.log(`  - Plate: ${wo.asset?.plateNumber} | Status: ${wo.status} | Customer: ${wo.customer?.fullName} | Tech: ${tech} | Parts: ${partsSummary}`);
    }
  }

  // 2. Tenant Isolation Check
  console.log(`\n--------------------------------------------------`);
  console.log(`CROSS-TENANT ISOLATION CHECK:`);

  const allWos = await prisma.workOrder.findMany({
    include: { asset: true, customer: true },
  });

  const leakingWos = allWos.filter(w => w.asset && w.asset.tenantId !== w.tenantId);
  const leakingCusts = allWos.filter(w => w.customer && w.customer.tenantId !== w.tenantId);

  console.log(`Leaking Work Order to Asset: ${leakingWos.length} (Expected: 0)`);
  console.log(`Leaking Work Order to Customer: ${leakingCusts.length} (Expected: 0)`);

  // Check total stock movements
  const movementsCount = await prisma.stockMovement.count({
    where: {
      tenantId: { in: tenants.map(t => t.id) },
    },
  });
  console.log(`Total Immutable Stock Movements for Simulated Workshops: ${movementsCount}`);

  console.log('\n==================================================');
  console.log('AUDIT COMPLETE');
  console.log('==================================================');
}

main().catch(console.error).finally(() => prisma.$disconnect());
