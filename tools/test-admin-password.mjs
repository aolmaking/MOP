import { PrismaClient } from '../packages/database/generated/client/index.js';
import { verifyPassword } from '../apps/api/src/identity/auth/password.util.ts';

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.account.findFirst({
    where: { email: 'platform-admin@mop.local' }
  });
  console.log('Admin found:', admin?.email);
  if (!admin?.passwordHash) return;

  const testPasswords = [
    'ChangeMe-Platform-123',
    'ChangeMe123!',
    'PlatformAdmin123!',
    'ChangeMe-Platform',
    'admin123',
    'password123',
    'admin'
  ];

  for (const pw of testPasswords) {
    const ok = verifyPassword(pw, admin.passwordHash);
    console.log(`Password "${pw}":`, ok);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
