import { PrismaClient } from '../packages/database/generated/client/index.js';

const prisma = new PrismaClient();

async function main() {
  const allAdmins = await prisma.account.findMany({
    where: {
      email: { contains: 'admin' }
    }
  });
  console.log('All admins with "admin" in email:', allAdmins);

  const allTypes = await prisma.account.findMany({
    take: 10,
    select: { id: true, email: true, accountType: true, status: true }
  });
  console.log('Sample accounts:', allTypes);
}

main().catch(console.error).finally(() => prisma.$disconnect());
