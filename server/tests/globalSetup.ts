import { execSync } from 'node:child_process';

/** Syncs the schema's indexes to the dedicated test database (non-destructive). Tests wipe their own data. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'mongodb://localhost:27017/hotel_test?replicaSet=rs0&directConnection=true';
  if (!/test/i.test(url)) throw new Error('Refusing to run tests against a database whose name does not contain "test".');
  execSync('npx prisma db push --skip-generate', { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url } });
}
