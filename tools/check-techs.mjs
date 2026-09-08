import { PrismaClient } from '../packages/database/generated/client/index.js';
const p = new PrismaClient();
async function main() {
  const staff = await p.staffAccount.findMany({
    include: { tenant: true, account: true }
  });
  for (const s of staff) {
    if (s.role === 'TECHNICIAN') {
      console.log('Tech:', s.account.email, '| Tenant:', s.tenant.name, '| code:', s.tenant.code);
    }
  }
}
main().catch(console.error).finally(() => p.$disconnect());
