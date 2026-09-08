import { PrismaClient } from '../packages/database/generated/client/index.js';

async function main() {
  const prisma = new PrismaClient();
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      customerRegistrationCode: true,
      primaryCategory: true,
      configuration: {
        select: {
          theme: true,
          enabledModules: true
        }
      },
      staffUsers: {
        select: {
          role: true,
          fullName: true,
          account: {
            select: {
              email: true,
              status: true
            }
          }
        }
      }
    }
  });
  console.log(JSON.stringify(tenants, null, 2));
  await prisma.$disconnect();
}

main();
