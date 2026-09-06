import { PrismaClient } from '../packages/database/generated/client/index.js';

async function main() {
  const prisma = new PrismaClient();
  const acc = await prisma.account.findFirst({
    where: { email: 'owner@precision-motors.local' },
    include: { staff: true }
  });
  console.log('Account:', acc);
  await prisma.$disconnect();
}

main();
