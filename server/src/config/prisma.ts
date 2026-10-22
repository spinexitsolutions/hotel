import { PrismaClient, Prisma } from '@prisma/client';
import { isProd, isTest } from './env';

export const prisma = new PrismaClient({ log: isTest ? [] : isProd ? ['error'] : ['error', 'warn'] });

export type Tx = Prisma.TransactionClient;
export type Db = PrismaClient | Tx;
export { Prisma };

/** MongoDB aborts the later of two transactions that write the same document; such aborts are safe to retry. */
export const isWriteConflict = (err: unknown) =>
  (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') ||
  (err instanceof Error && /WriteConflict|write conflict|TransientTransactionError/i.test(err.message));

export const isUniqueViolation = (err: unknown, index?: RegExp) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && (!index || index.test(`${JSON.stringify(err.meta ?? {})} ${err.message}`));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Interactive transaction that is retried (with jittered backoff) when MongoDB reports a write conflict. */
export async function runTransaction<T>(fn: (tx: Tx) => Promise<T>, opts: { timeout?: number; maxWait?: number } = {}, attempts = 8): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, opts);
    } catch (err) {
      if (attempt >= attempts || !isWriteConflict(err)) throw err;
      await sleep(15 * attempt + Math.random() * 40);
    }
  }
}

/**
 * Indexes Prisma cannot express for MongoDB: unique only when the field is set, so the many documents without
 * a value don't collide. `prisma db push` drops unknown indexes, so this runs after every push and on server start.
 */
const PARTIAL_UNIQUE: [collection: string, field: string][] = [
  ['payments', 'providerOrderId'],
  ['payments', 'providerPaymentId'],
  ['refunds', 'providerRefundId'],
  ['reviews', 'bookingId'],
];

export async function ensureIndexes(db: PrismaClient = prisma) {
  const existing = await db.$runCommandRaw({ listCollections: 1, nameOnly: true });
  const collections = new Set((existing as { cursor: { firstBatch: { name: string }[] } }).cursor.firstBatch.map((c) => c.name));
  for (const [collection, field] of PARTIAL_UNIQUE) {
    const name = `${collection}_${field}_unique_when_set`;
    if (collections.has(collection)) {
      // Drop any other index on the same key (e.g. a plain unique index from an older schema) so ours can be created.
      const res = (await db.$runCommandRaw({ listIndexes: collection })) as { cursor: { firstBatch: { name: string; key: Record<string, number> }[] } };
      for (const idx of res.cursor.firstBatch) {
        if (idx.name !== name && Object.keys(idx.key).join() === field) await db.$runCommandRaw({ dropIndexes: collection, index: idx.name });
      }
    }
    await db.$runCommandRaw({
      createIndexes: collection,
      // `$gt: ''` matches strings only; `$type` can't be used because Prisma reads it as an extended-JSON tag.
      indexes: [{ key: { [field]: 1 }, name, unique: true, partialFilterExpression: { [field]: { $gt: '' } } }],
    });
  }
}

/** Deletes every document in every collection (keeps collections and indexes). Used by the seed and the tests. */
export async function wipeDatabase(db: PrismaClient = prisma) {
  const res = (await db.$runCommandRaw({ listCollections: 1, nameOnly: true, filter: { type: 'collection' } })) as { cursor: { firstBatch: { name: string }[] } };
  for (const { name } of res.cursor.firstBatch) {
    if (name.startsWith('system.')) continue;
    await db.$runCommandRaw({ delete: name, deletes: [{ q: {}, limit: 0 }] });
  }
}
