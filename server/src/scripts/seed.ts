/** CLI for the demo data: `npm run db:seed`. See demoData.ts. */
import { prisma } from '../config/prisma';
import { seedDemo } from './demoData';

seedDemo()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
