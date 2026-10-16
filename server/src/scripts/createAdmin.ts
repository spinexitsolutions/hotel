/**
 * Creates (or promotes) a Super Admin. There is no public admin registration.
 *   npm run create-admin -- --email you@hotel.com --name "Your Name"
 * The password is read from ADMIN_PASSWORD or prompted for interactively; it is never hard-coded.
 */
import { createInterface } from 'node:readline/promises';
import { DEFAULT_ROLE_PERMISSIONS, ROLE_KEYS, ROLE_LABELS, password as passwordSchema } from '@aurelle/shared';
import { prisma } from '../config/prisma';
import { hashPassword } from '../services/auth.service';

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = (arg('email') ?? process.env.ADMIN_EMAIL ?? '').toLowerCase().trim();
  const name = arg('name') ?? process.env.ADMIN_NAME ?? 'Administrator';
  if (!email) throw new Error('Provide --email');
  let pw = process.env.ADMIN_PASSWORD;
  if (!pw) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    pw = await rl.question('Password (min 10 chars, upper/lower/number): ');
    rl.close();
  }
  const parsed = passwordSchema.safeParse(pw);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  for (const key of ROLE_KEYS) {
    await prisma.role.upsert({ where: { key }, create: { key, name: ROLE_LABELS[key], permissions: DEFAULT_ROLE_PERMISSIONS[key] }, update: {} });
  }
  const role = await prisma.role.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
  await prisma.user.upsert({
    where: { email },
    create: { email, name, roleId: role.id, passwordHash: await hashPassword(parsed.data) },
    update: { roleId: role.id, passwordHash: await hashPassword(parsed.data), isActive: true, failedLogins: 0, lockedUntil: null },
  });
  console.log(`✅ Super Admin ready: ${email}`);
}

main()
  .catch((e) => {
    console.error(`❌ ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
