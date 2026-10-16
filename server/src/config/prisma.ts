import { PrismaClient, Prisma } from '@prisma/client';
import { isProd } from './env';

export const prisma = new PrismaClient({ log: isProd ? ['error'] : ['error', 'warn'] });

export type Tx = Prisma.TransactionClient;
export type Db = PrismaClient | Tx;
export { Prisma };
