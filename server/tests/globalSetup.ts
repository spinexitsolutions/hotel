import { execSync } from 'node:child_process';

/** Applies pending migrations to the dedicated test database (non-destructive). Tests truncate their own data. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://hotel:hotel@localhost:5432/hotel_test?schema=public';
  if (!/test/i.test(url)) throw new Error('Refusing to run tests against a database whose name does not contain "test".');
  execSync('npx prisma migrate deploy', { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url } });
}
