process.env.DATABASE_URL ??= 'postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_dev?schema=public';
import { PrismaClient } from '../packages/database/generated/client/index.js';

const prisma = new PrismaClient();

async function main() {
  const customers = await prisma.customer.findMany({
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      tenantId: true,
      tenant: {
        select: {
          id: true,
          name: true,
          customerRegistrationCode: true,
        },
      },
      account: {
        select: {
          email: true,
        },
      },
      ownedAssets: {
        where: { endedAt: null },
        select: {
          asset: {
            select: {
              id: true,
              plateNumber: true,
              category: true,
            },
          },
        },
      },
    },
    take: 10,
  });

  console.log('Customers in DB:', JSON.stringify(customers, null, 2));
}

main().finally(() => prisma.$disconnect());
