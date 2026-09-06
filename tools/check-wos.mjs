import { PrismaClient } from '../packages/database/generated/client/index.js';

const prisma = new PrismaClient();

async function main() {
  const wos = await prisma.workOrder.findMany({
    include: {
      asset: true,
      customer: true,
      tenant: true,
    },
  });
  console.log('Work orders count:', wos.length);
  for (const w of wos) {
    console.log(`- ID: ${w.id} | Org: ${w.tenant.name} | Plate: ${w.asset?.plateNumber} | Cust: ${w.customer?.fullName} | Status: ${w.status}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
