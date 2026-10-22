/** Run after `prisma db push` (npm run db:deploy) to (re)create the indexes Prisma can't express for MongoDB. */
import { ensureIndexes, prisma } from '../config/prisma';

ensureIndexes()
  .then(() => console.log('✔ Partial unique indexes ensured'))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
